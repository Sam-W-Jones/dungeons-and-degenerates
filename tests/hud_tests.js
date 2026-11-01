/* Dungeons and Degenerates — tests/hud_tests.js
 * HUD suites (prefix "hud:"): the combat screen (js/ui/combat_hud.js) mounted headlessly on real DD.Combat sandbox
 * fights built from tests/fixtures.js. v2 (initiative, no telegraphs, no Guard): panels, the initiative tracker,
 * deployment + "Roll for Initiative!" + the dice moment, turn flow (only the acting hero's turn group is selectable,
 * End Turn names who acts next, AI turns played back in step with the 'turn' markers), selection, move preview +
 * hazard warning, skill targeting with damage previews, consumables, interactions, Help Up, the inspect panel (enemy
 * move / reach / initiative / abilities, hero initiative / stats / Blessings), boss wind-ups, threat shading (hold Alt,
 * T, the button), log reveal + turn headers, keyboard map, autoplay lock, broken content, and the end-of-fight hand-off.
 * Every action goes through DD.HUD (the same code paths as mouse and keyboard input).
 */
(function () {
  'use strict';
  const T = window.DD_TEST;
  const DD = window.DD;
  if (!T) return;

  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }
  function root() { return DD.HUD.root(); }
  function q(sel) { const r = root(); return r ? r.querySelector(sel) : null; }
  function qa(sel) { const r = root(); return r ? Array.prototype.slice.call(r.querySelectorAll(sel)) : []; }
  function ov() { return DD.Render.overlay; }
  function has(list, p) { return (list || []).some(function (t) { return t.x === p.x && t.y === p.y; }); }
  function byDef(id) { return DD.Combat.state.units.filter(function (u) { return u.defId === id && !u.dead; })[0]; }
  function text(sel) { const n = q(sel); return n ? n.textContent : ''; }
  function chips() { return DD.HUD.tracker().filter(function (x) { return !x.divider; }); }

  function ready(t) {
    if (!DD.UI || !DD.UI.screens || !DD.UI.screens.combat || !DD.HUD) { t.fail('combat screen (DD.HUD) is not registered'); return false; }
    if (!DD.Combat || !DD.Render || !DD.Render.overlay) { t.skip('engine or renderer missing'); return false; }
    if (!DD.getHero('test_knight') || !DD.getEnemy('test_grunt')) { t.skip('tests/fixtures.js not loaded'); return false; }
    return true;
  }

  /** Start a sandbox fight and show the HUD on it (sandbox default: heroes first, in the listed order, no dice). */
  function fight(cfg) {
    DD.UI.closeAllModals('test');
    const s = DD.Combat.sandbox(Object.assign({ w: 8, h: 8, seed: 11, theme: 'cellar' }, cfg));
    DD.UI.show('combat');
    if (DD.HUD.threat()) DD.HUD.threat(false);
    return s;
  }
  function leave() {
    if (!DD.UI) return;
    DD.UI.closeAllModals('test');
    DD.UI.hideTooltip();
    if (DD.UI.current === 'combat') DD.UI.show('title');
  }
  /** Run with DD.FX animating (not instant) and restore afterwards. */
  function withAnimatedFx(fn) {
    const F = DD.FX;
    const inst = F.instant;
    F.instant = false;
    try { return fn(F); } finally { F.reset(); F.instant = inst; }
  }

  // ---- mounting & panels ---------------------------------------------------------------------------------------------
  T.suite('hud: combat screen mounts with every panel on a sandbox fight', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 3 }, { id: 'test_mage', x: 1, y: 5 }], enemies: [{ id: 'test_grunt', x: 6, y: 3 }, { id: 'test_archer', x: 6, y: 6 }] });
      t.ok(DD.HUD.mounted(), 'HUD mounted');
      t.eq(DD.UI.current, 'combat', 'combat screen is current');
      t.eq(qa('.hud-card').length, 2, 'one party card per hero');
      t.eq(text('.hud-round .hr-num'), '1', 'round 1 shown');
      t.ok(/^Defeat all enemies/.test(text('.hud-obj .ho-text')), 'objective text from state.objective.text');
      const sel = DD.HUD.selected();
      t.ok(sel && sel.defId === 'test_knight', 'the acting hero (first in the order) is selected');
      t.eq(ov().selectedId, sel && sel.id, 'overlay.selectedId follows the selection');
      t.eq(ov().turnUnitId, sel && sel.id, 'overlay.turnUnitId marks whose turn it is');
      t.ok(ov().moveTiles.length > 0, 'reachable tiles shown for the selected hero');
      t.eq(qa('.hud-bar .hud-skill').length, 6, 'six action positions for a hero');
      t.eq(qa('.hud-bar .hud-skill.empty').length, 2, 'two empty sockets for a hero with 2 skills');
      t.eq(qa('.hud-bar .hud-skill .hs-key').map(function (k) { return k.textContent; }).join(''), '123456', 'hotkeys 1-6 in order');
      t.ok(q('.hud-skill.role-signature.is-disabled'), 'signature disabled below 100 Hype');
      t.ok(/Next: Wizzy McTest/.test(text('.hud-endbtn .btn-sub')), 'End Turn names who acts next: ' + text('.hud-endbtn .btn-sub'));
      t.ok(!/Guard|Block/.test(text('.hud-endbtn')), 'no Guard / Block preview on End Turn (v2)');
      t.ok(q('.hud-hype .meter'), 'Hype meter present');
      t.ok(q('.hud-threat'), 'threat shading toggle present');
      t.eq(qa('.hud-cons').length, 3, 'three consumable pockets (sandbox default)');
      t.ok(q('.hud-log .hl-list'), 'combat log present');
      t.ok(q('.hud-inspect').classList.contains('hud-hidden'), 'inspect panel hidden until something is hovered');
      t.ok(/Your Turn/.test(text('.hud-phase')), 'phase pill says Your Turn');
      t.ok(/Sir Testsalot/.test(text('.hud-round .hr-who')), 'the round box names who acts');
      // the initiative tracker
      t.ok(q('.hud-init') && !q('.hud-init').classList.contains('hud-hidden'), 'initiative tracker shown');
      t.eq(qa('.hud-init .tk-chip').length, 4, 'one portrait per initiative entry');
      t.ok(q('.hud-init .tk-chip.cur') && q('.hud-init .tk-chip.cur').dataset.unit === sel.id, 'the acting hero\'s portrait is highlighted');
      // party card details
      const card = qa('.hud-card')[0];
      t.ok(card.querySelector('.hud-hp .hh-text').textContent.indexOf('/') > 0, 'party card shows HP numbers');
      t.eq(card.querySelectorAll('.ap-pip.on').length, 3, 'the acting hero shows 3 AP pips');
      t.ok(card.classList.contains('cur') && /Your turn/i.test(card.querySelector('.hc-tag').textContent), 'its card glows and says "Your turn"');
      const other = qa('.hud-card')[1];
      t.eq(other.querySelectorAll('.ap-pip').length, 0, 'a hero outside its turn shows no AP pips');
      t.ok(/Acts next/.test(other.querySelector('.hc-when').textContent), 'it says when it acts: ' + other.querySelector('.hc-when').textContent);
      t.eq(other.querySelector('.hc-init').textContent, '2', 'and its initiative position');
    } finally { leave(); }
  });

  // ---- v2 turn flow: selection limited to the acting turn group -----------------------------------------------------------
  T.suite('hud: only the acting hero (and its summons) can be selected; Tab, cards and End Turn follow the order', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 2 }, { id: 'test_mage', x: 1, y: 4 }, { id: 'test_cleric', x: 1, y: 6 }], enemies: [{ id: 'test_grunt', x: 6, y: 3 }], enemyAi: false });
      const hs = DD.Combat.heroes();
      t.eq(DD.HUD.selected().id, hs[0].id, 'the knight acts first and is selected');
      t.ok(!DD.HUD.select(hs[1].id), 'select() refuses a hero whose turn it isn\'t');
      t.eq(DD.HUD.selected().id, hs[0].id, 'selection unchanged');
      qa('.hud-card')[1].click();
      t.eq(DD.HUD.selected().id, hs[0].id, 'clicking another hero\'s card does not select it');
      t.ok(/Wizzy McTest acts next/.test(DD.HUD.hint()) && /Sir Testsalot's turn/.test(DD.HUD.hint()), 'it says when that hero acts: ' + DD.HUD.hint());
      t.ok(!q('.hud-inspect').classList.contains('hud-hidden') && /Wizzy McTest/.test(text('.hud-inspect')), 'and pins its inspect panel');
      DD.HUD.rightClick();
      DD.HUD.click(hs[2].x, hs[2].y);
      t.eq(DD.HUD.selected().id, hs[0].id, 'clicking another hero on the board does not select it either');
      t.ok(DD.HUD.key('Tab'), 'Tab is consumed');
      t.ok(/Only Sir Testsalot acts this turn/.test(DD.HUD.hint()), 'Tab with a one-unit turn explains it: ' + DD.HUD.hint());
      // a summon acts on its owner's turn: Tab cycles hero <-> summon
      DD.Act.summon(hs[0], 'test_hound', 2, 2, { noFx: true, silent: true, ready: true });
      DD.HUD.refresh();
      const hound = byDef('test_hound');
      DD.HUD.key('Tab');
      t.eq(DD.HUD.selected() && DD.HUD.selected().id, hound && hound.id, 'Tab selects the knight\'s summon (same turn)');
      DD.HUD.key('Tab', { shiftKey: true });
      t.eq(DD.HUD.selected().id, hs[0].id, 'Shift+Tab goes back to the knight');
      // End Turn hands the dice to the next hero
      t.ok(DD.HUD.endTurn(), 'End Turn');
      t.eq(DD.Combat.current().id, hs[1].id, 'the engine moved to the mage\'s turn');
      t.eq(DD.HUD.selected().id, hs[1].id, 'the HUD selected the mage');
      t.ok(qa('.hud-card')[0].classList.contains('wait') && !qa('.hud-card')[0].classList.contains('cur'), 'the knight\'s card stops glowing');
      t.ok(qa('.hud-card').filter(function (c) { return c.classList.contains('cur'); }).length === 1, 'exactly one card glows');
      t.ok(/acts in|Acted/.test(qa('.hud-card')[0].querySelector('.hc-when').textContent), 'the knight says when it acts again: ' + qa('.hud-card')[0].querySelector('.hc-when').textContent);
      t.ok(DD.HUD.tracker()[0].unitId === hs[1].id && DD.HUD.tracker()[0].cur, 'the tracker starts with the mage now');
    } finally { leave(); }
  });

  // ---- movement --------------------------------------------------------------------------------------------------
  T.suite('hud: move preview, hazard warning, move and undo', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], surfaces: [{ x: 2, y: 1, id: 'fire', turns: 3 }], noPlan: true });
      const k = byDef('test_knight');
      DD.HUD.hover(3, 1);
      t.ok(ov().path.length === 2 && ov().path[1].x === 3, 'path preview to the hovered tile (start excluded)');
      t.ok(ov().pathHazard, 'path through fire is flagged as a hazard');
      t.ok(/Fire/.test(DD.HUD.hint()), 'hint names the hazard: ' + DD.HUD.hint());
      DD.HUD.hover(1, 3);
      t.ok(!ov().pathHazard && ov().path.length === 2, 'safe path is not flagged');
      t.ok(/Move here/.test(DD.HUD.hint()), 'hint explains the move cost: ' + DD.HUD.hint());
      DD.HUD.click(1, 3);
      t.ok(k.x === 1 && k.y === 3, 'click moved the knight');
      t.eq(k.ap, 2, 'the move cost 1 AP');
      t.ok(!q('.hud-undo').classList.contains('is-disabled'), 'Undo enabled after a move');
      t.ok(DD.HUD.key('z'), 'Z is consumed');
      t.ok(k.x === 1 && k.y === 1 && k.ap === 3, 'Z undid the move and refunded the AP');
      t.ok(q('.hud-undo').classList.contains('is-disabled'), 'Undo disabled again');
      DD.HUD.click(7, 1);
      t.ok(k.x === 1 && k.y === 1, 'clicking an unreachable tile does not move');
      t.ok(/Too far|Can't/.test(DD.HUD.hint()), 'and explains why: ' + DD.HUD.hint());
    } finally { leave(); }
  });

  // ---- skills -------------------------------------------------------------------------------------------------------
  T.suite('hud: skill targeting, damage previews, cast, self and directional skills', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2, skills: ['test_war_shout', 'test_shield_bash'] }, { id: 'test_mage', x: 2, y: 5 }],
        enemies: [{ id: 'test_grunt', x: 3, y: 2 }, { id: 'test_archer', x: 6, y: 5 }], noPlan: true });
      const k = byDef('test_knight'), g = byDef('test_grunt');
      DD.HUD.select(k.id);
      t.ok(DD.HUD.key('1'), 'key 1 consumed');
      t.eq(DD.HUD.mode().kind, 'skill', 'key 1 arms the basic attack');
      t.ok(q('.hud-skill.armed'), 'armed button highlighted');
      t.ok(has(ov().targetTiles, g), 'the adjacent grunt is a valid target');
      t.eq(ov().moveTiles.length, 0, 'move tiles hidden while targeting');
      DD.HUD.hover(g.x, g.y);
      const p = DD.Combat.preview(k, k.basic, g.x, g.y);
      const e = p.perUnit[g.id];
      t.ok(e && e.dmg > 0, 'engine preview damages the grunt');
      t.eq(ov().previews[g.id] && ov().previews[g.id].dmg, e.dmg + (e.blocked || 0), 'overlay preview carries the full hit');
      t.ok(has(ov().areaTiles, g), 'area tiles under the cursor');
      t.ok(/Hits 1 foe/.test(DD.HUD.hint()), 'hint summarizes the preview: ' + DD.HUD.hint());
      const archer = byDef('test_archer');
      DD.HUD.click(archer.x, archer.y);
      t.ok(/Out of range/.test(DD.HUD.hint()), 'invalid target explains itself: ' + DD.HUD.hint());
      t.eq(DD.HUD.mode().kind, 'skill', 'still targeting after an invalid click');
      DD.HUD.rightClick();
      t.eq(DD.HUD.mode().kind, 'move', 'right-click cancels targeting');
      t.eq(Object.keys(ov().previews).length, 0, 'previews cleared');
      const hp0 = g.hp;
      DD.HUD.key('1');
      DD.HUD.click(g.x, g.y);
      t.eq(g.hp, hp0 - e.dmg, 'cast dealt exactly the previewed damage');
      t.eq(k.ap, 2, 'basic attack cost 1 AP');
      t.eq(DD.HUD.mode().kind, 'move', 'back to move mode after casting');
      // self skill: preview without aiming, second key press casts
      DD.HUD.key('2');
      t.ok(ov().areaTiles.length > 1, 'self skill shows its area immediately');
      const b0 = k.block;
      DD.HUD.key('2');
      t.ok(k.block > b0, 'pressing the key again casts the self skill');
      // directional skill: aim snaps toward the cursor
      DD.HUD.key('3');
      DD.HUD.hover(6, 2);
      t.ok(ov().areaTiles.length === 1 && ov().areaTiles[0].x === 3 && ov().areaTiles[0].y === 2, 'dir skill aims at the adjacent tile toward the cursor');
      t.ok(ov().previews[g.id] && /↷/.test(ov().previews[g.id].text), 'preview badge marks the push');
      const gx = g.x;
      DD.HUD.click(6, 2);
      t.ok(g.dead || g.x > gx, 'shield bash pushed the grunt east');
      t.eq(k.ap, 0, 'all AP spent');
      t.ok(q('.hud-endbtn').classList.contains('cta'), 'End Turn glows once the acting hero is out of AP (the mage acts on its own turn)');
      DD.HUD.clearHint();
      t.ok(/out of AP/.test(DD.HUD.hint()) && /next: Wizzy McTest/.test(DD.HUD.hint()), 'the hint says so and who is next: ' + DD.HUD.hint());
    } finally { leave(); }
  });

  // ---- consumables, interactions, Help Up --------------------------------------------------------------------------
  T.suite('hud: consumables, object interactions and Help Up', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2, hp: 10 }, { id: 'test_cleric', x: 2, y: 3 }, { id: 'test_rogue', x: 4, y: 2 }],
        enemies: [{ id: 'test_grunt', x: 7, y: 7 }], consumables: ['test_potion'], objects: [{ x: 3, y: 2, id: 'chest' }], enemyAi: false });
      const k = byDef('test_knight'), c = byDef('test_cleric'), r = byDef('test_rogue');
      t.eq(DD.HUD.selected().id, k.id, 'the knight\'s turn');
      const pot = qa('.hud-cons')[0];
      t.ok(pot && !pot.classList.contains('empty') && pot.querySelector('.kbd').textContent === '7', 'potion in pocket 7');
      DD.HUD.key('7');
      t.eq(DD.HUD.mode().kind, 'cons', 'key 7 arms the consumable');
      t.ok(has(ov().targetTiles, k), 'the knight can target himself');
      DD.HUD.hover(k.x, k.y);
      t.ok(ov().previews[k.id] && ov().previews[k.id].heal > 0, 'heal preview on the knight');
      DD.HUD.click(k.x, k.y);
      t.eq(k.hp, 20, 'potion healed 10');
      t.eq(DD.Combat.consumables().length, 0, 'potion used up');
      t.ok(qa('.hud-cons')[0].classList.contains('empty'), 'pocket shows empty');
      // Help Up (an adjacent downed ally)
      DD.Act.kill(c, null);
      DD.HUD.refresh();
      t.ok(c.downed, 'cleric is downed');
      t.ok(/Downed/.test(qa('.hud-card')[1].textContent), 'party card tags the downed hero');
      const tr = chips().filter(function (x) { return x.unitId === c.id; })[0];
      t.ok(tr && tr.mark === '💀', 'the tracker marks the downed hero (its turn is skipped)');
      const help = qa('.hud-skill.act').filter(function (b) { return /Help Up/.test(b.textContent); })[0];
      t.ok(help, 'Help Up button offered to the adjacent knight');
      if (help) help.click();
      t.ok(!c.downed && c.hp > 0, 'Help Up revived the cleric');
      t.eq(k.ap, 0, 'Help Up cost 2 AP');
      // object interaction via E on the rogue's own turn
      DD.HUD.endTurn();
      t.eq(DD.Combat.current().id, c.id, 'the revived cleric gets its own turn');
      DD.HUD.endTurn();
      t.eq(DD.HUD.selected().id, r.id, 'then the rogue\'s turn: selected');
      t.ok(qa('.hud-skill.act').some(function (b) { return /Open/.test(b.textContent); }), 'rogue next to the chest gets an Open button');
      DD.HUD.hover(3, 2);
      t.ok(!q('.hud-inspect').classList.contains('hud-hidden') && /Chest/.test(text('.hud-inspect')), 'hovering the chest describes it');
      t.ok(DD.HUD.key('e'), 'E is consumed');
      t.eq(r.ap, 2, 'interaction cost 1 AP');
    } finally { leave(); }
  });

  // ---- deployment + roll for initiative --------------------------------------------------------------------------------
  T.suite('hud: deployment — free swaps in the zone, then Roll for Initiative (button or Space)', function (t) {
    if (!ready(t)) return;
    try {
      const zone = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }];
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }, { id: 'test_mage', x: 1, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }],
        deploy: true, deployTiles: zone, initiative: 'roll', enemyAi: false });
      const k = byDef('test_knight'), m = byDef('test_mage');
      const s = DD.Combat.state;
      t.ok(DD.Combat.isDeploying() && s.round === 0 && !s.order, 'deployment open (round 0, no initiative yet)');
      t.ok(DD.HUD.select(k.id), 'any hero in the zone can be picked while deploying');
      t.eq(ov().deployTiles.length, zone.length, 'deploy tiles in the overlay');
      t.ok(/Deployment/.test(text('.hud-phase')), 'phase pill says Deployment');
      t.ok(/Deployment/.test(DD.HUD.hint()) && /Roll for Initiative/.test(DD.HUD.hint()), 'deployment hint shown: ' + DD.HUD.hint());
      t.ok(!q('.hud-rollcta').classList.contains('hud-hidden'), 'the big Roll for Initiative button is shown');
      t.ok(/Roll/.test(text('.hud-endbtn .btn-label')), 'End Turn reads Roll! while deploying');
      t.ok(chips().length === 3 && chips().every(function (x) { return x.total === null; }), 'the tracker lists everyone, unrolled');
      DD.HUD.click(2, 3);
      t.ok(k.x === 2 && k.y === 3, 'free reposition inside the zone');
      DD.HUD.click(m.x, m.y, { shift: true });
      t.ok(k.x === 1 && k.y === 2 && m.x === 2 && m.y === 3, 'shift-click swaps with an ally');
      DD.HUD.click(1, 5);
      t.ok(k.x === 1 && k.y === 2 && DD.Combat.isDeploying(), 'a tile outside the zone does nothing (no accidental start)');
      t.ok(/green tiles/.test(DD.HUD.hint()), 'and says why: ' + DD.HUD.hint());
      DD.HUD.key('2');
      t.ok(/roll for initiative/i.test(DD.HUD.hint()) && DD.Combat.isDeploying(), 'skill keys wait for the roll: ' + DD.HUD.hint());
      q('.hud-rollcta').click();
      t.ok(!DD.Combat.isDeploying() && !!s.order && s.round === 1, 'the button rolled initiative: round 1');
      t.eq(ov().deployTiles.length, 0, 'deploy tiles cleared');
      t.ok(q('.hud-rollcta').classList.contains('hud-hidden'), 'the roll button is gone');
      t.ok(chips().length === 3 && chips().every(function (x) { return x.total !== null; }), 'the tracker shows everybody\'s total');
      // the strip starts with the acting unit (the enemies before it already acted) and wraps into round 2
      const order = DD.Combat.order().map(function (e) { return e.unitId; });
      const at = order.indexOf(DD.Combat.current().id);
      const cycle = order.slice(at).concat(order.slice(0, at));
      t.eq(chips().map(function (x) { return x.unitId; }).join(','), cycle.join(','), 'in the rolled order, from the acting unit');
      t.ok(at === 0 || DD.HUD.tracker().some(function (x) { return x.divider && x.round === 2; }), 'with the round 2 divider when it wraps');
      t.ok(s.log.some(function (l) { return /^Roll for initiative!/.test(l.text); }), 'the roll is logged');
      // Space in deployment rolls too
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }], deploy: true, deployTiles: zone, initiative: 'roll', enemyAi: false });
      t.ok(DD.Combat.isDeploying(), 'second fight deploying');
      t.ok(DD.HUD.key(' '), 'Space is consumed');
      t.ok(!DD.Combat.isDeploying() && DD.Combat.state.round === 1, 'Space rolled initiative');
    } finally { leave(); }
  });

  // ---- the dice moment ---------------------------------------------------------------------------------------------------
  T.suite('hud: the initiative dice moment — hosted for the FX marker, sorted, skippable, log held back', function (t) {
    if (!ready(t)) return;
    if (!DD.FXRender || !DD.FXRender.moments) { t.skip('fx_render moments missing'); return; }
    try {
      const zone = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 1 }];
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }, { id: 'test_mage', x: 1, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }, { id: 'test_archer', x: 6, y: 2 }],
        deploy: true, deployTiles: zone, initiative: 'roll', enemyAi: false });
      const host = DD.FXRender.moments.initiative;
      t.ok(host && typeof host.start === 'function', 'the mounted HUD hosts the initiative moment');
      t.ok(!host.wants({ order: [{ unitId: 'x', roll: 0, total: 3 }] }), 'never for a fixed order (no dice)');
      DD.HUD.forceMoments(true);
      withAnimatedFx(function (F) {
        const s = DD.Combat.state;
        const lines0 = qa('.hud-log .log-line').length;
        DD.HUD.rollInitiative();
        t.ok(F.busy(), 'the roll queued its FX');
        for (let i = 0; i < 40 && !DD.HUD.moment(); i++) { F.update(40); DD.HUD.tick(); }
        const mo = DD.HUD.moment();
        t.ok(mo && mo.active, 'the dice moment is showing');
        if (!mo) return;
        const marker = F.active.filter(function (e) { return e.type === 'initiative'; })[0];
        t.ok(marker && marker.ms > 1000, 'the marker holds playback for the moment (' + (marker && marker.ms) + ' ms)');
        t.eq(mo.cards.length, s.order.length, 'one card per initiative entry');
        t.ok(!q('.hud-rolltray').classList.contains('hud-hidden') && !q('.hud-rollscrim').classList.contains('hud-hidden'), 'tray and scrim visible');
        t.ok(/Roll for Initiative/i.test(text('.hud-rolltray .rt-title')) && text('.hud-rolltray .rt-dm').length > 10, 'a title and a DM line');
        t.ok(q('.hud-init').classList.contains('hud-hidden'), 'the tracker waits for the moment');
        t.ok(/Initiative/.test(text('.hud-phase')), 'phase pill: Initiative!');
        t.eq(DD.HUD.lock(), 'busy', 'input locked while it plays');
        t.eq(qa('.hud-log .log-line').filter(function (l) { return /^Roll for initiative!/.test(l.textContent); }).length, 0, 'the log does not spoil the result during the moment');
        // halfway: dice landed; later: sorted into initiative order
        F.update(marker.ms * 0.5); DD.HUD.tick();
        t.ok(DD.HUD.moment().cards.some(function (c) { return c.landed; }), 'dice land one after another');
        F.update(marker.ms * 0.3); DD.HUD.tick();
        const first = DD.HUD.moment().cards.filter(function (c) { return c.rank === 1; })[0];
        t.eq(first && first.unitId, s.order[0].unitId, 'rank 1 = first in the order');
        t.ok(qa('.hud-rolltray .rt-card.ranked').length === s.order.length, 'every card shows its rank after sorting');
        // skip
        t.ok(DD.HUD.key(' '), 'Space is consumed');
        t.eq(DD.HUD.moment(), null, 'Space skipped the moment');
        t.ok(q('.hud-rolltray').classList.contains('hud-hidden'), 'tray hidden');
        F.flush();
        DD.HUD.tick();
        t.ok(!q('.hud-init').classList.contains('hud-hidden') && qa('.hud-init .tk-chip').length === s.order.length, 'the tracker takes over');
        t.ok(qa('.hud-log .log-line').length > lines0 && qa('.hud-log .log-line').some(function (l) { return /^Roll for initiative!/.test(l.textContent); }), 'the roll reached the log afterwards');
      });
      // instant mode (tests, headless): no moment at all
      DD.HUD.forceMoments(false);
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }], deploy: true, deployTiles: zone, initiative: 'roll', enemyAi: false });
      DD.HUD.rollInitiative();
      t.ok(!DD.HUD.moment() && !DD.FX.busy(), 'instant FX: no moment, straight to the tracker');
      t.eq(chips().length, 2, 'tracker filled');
    } finally { leave(); }
  });

  // ---- the initiative tracker --------------------------------------------------------------------------------------------
  T.suite('hud: initiative tracker — order from the acting unit, next-round divider, joiners, marks, hover and click', function (t) {
    if (!ready(t)) return;
    try {
      fight({ w: 9, h: 9, heroes: [{ id: 'test_knight', x: 1, y: 2 }, { id: 'test_mage', x: 1, y: 5 }], enemies: [{ id: 'test_grunt', x: 6, y: 2 }, { id: 'test_archer', x: 7, y: 6 }], enemyAi: false });
      const k = byDef('test_knight'), m = byDef('test_mage'), g = byDef('test_grunt'), a = byDef('test_archer');
      t.eq(chips().map(function (x) { return x.name; }).join(','), 'Sir Testsalot,Wizzy McTest,Test Grunt,Test Archer', 'heroes first (sandbox order), the acting knight leads');
      t.ok(chips()[0].cur && !chips()[1].cur, 'only the acting unit is current');
      t.ok(!DD.HUD.tracker().some(function (x) { return x.divider; }), 'round 1 from the top: no divider yet');
      DD.HUD.endTurn();
      const tr = DD.HUD.tracker();
      t.eq(tr[0].unitId, m.id, 'the mage\'s turn leads now');
      const dv = tr.filter(function (x) { return x.divider; })[0];
      t.ok(dv && dv.round === 2, 'a divider marks round 2');
      t.eq(tr[tr.length - 1].unitId, k.id, 'the knight is back after the divider (one full cycle)');
      t.ok(q('.hud-init .tk-div'), 'divider drawn');
      t.ok(qa('.hud-init .tk-chip')[1].style.opacity === '' || +qa('.hud-init .tk-chip')[1].style.opacity >= 0.99, 'the next unit stays crisp');
      t.ok(+qa('.hud-init .tk-chip')[3].style.opacity < 1, 'later ones fade with distance');
      // a unit arriving mid-round rolls (here: fixed order) and joins next round
      const minion = DD.Act.spawn('test_minion', 7, 7, { noFx: true, silent: true });
      DD.HUD.refresh();
      const j = chips().filter(function (x) { return x.joiner; })[0];
      t.ok(minion && j && j.unitId === minion.id, 'a mid-round arrival is listed after the divider as a joiner');
      t.ok(q('.hud-init .tk-chip.joiner'), 'its portrait is dashed');
      // marks: stunned, wind-up
      DD.Act.addStatus(g, 'stun', { turns: 1 }, m);
      DD.HUD.refresh();
      t.eq(chips().filter(function (x) { return x.unitId === g.id; })[0].mark, '💫', 'a stunned unit is marked (it loses its turn)');
      // hover = board highlight + inspect; click = pin
      DD.HUD.hoverTracker(a.id);
      t.ok(ov().hover && ov().hover.x === a.x && ov().hover.y === a.y, 'hovering a portrait highlights the unit on the board');
      t.ok(!q('.hud-inspect').classList.contains('hud-hidden') && /Test Archer/.test(text('.hud-inspect')), 'and opens its inspect panel');
      t.ok(q('.hud-init .tk-chip.hl') && q('.hud-init .tk-chip.hl').dataset.unit === a.id, 'its portrait lights up');
      DD.HUD.hoverTracker(null);
      DD.HUD.clickTracker(a.id);
      t.ok(/pinned/.test(text('.hud-inspect')), 'clicking a portrait pins its inspect panel');
      DD.HUD.rightClick();
      DD.HUD.clickTracker(m.id);
      t.eq(DD.HUD.selected().id, m.id, 'clicking the acting hero\'s portrait selects it');
      // the board highlight works the other way round too
      DD.HUD.hover(g.x, g.y);
      t.ok(q('.hud-init .tk-chip.hl') && q('.hud-init .tk-chip.hl').dataset.unit === g.id, 'hovering a unit on the board lights up its portrait');
      // dead units leave the tracker
      DD.Act.kill(a, k);
      DD.HUD.refresh();
      t.ok(!chips().some(function (x) { return x.unitId === a.id; }), 'a dead unit leaves the tracker');
    } finally { leave(); }
  });

  // ---- AI turns follow the playback ------------------------------------------------------------------------------------
  T.suite('hud: AI turns play out after End Turn — the HUD follows the turn markers, input locked, Space skips', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 4, y: 2 }] });
      const k = byDef('test_knight'), g = byDef('test_grunt');
      withAnimatedFx(function (F) {
        DD.HUD.endTurn();
        t.ok(F.busy(), 'the grunt\'s turn was queued for playback');
        t.eq(DD.Combat.current().id, k.id, 'logically it is already the knight\'s next turn');
        t.eq(DD.Combat.state.round, 2, 'round 2 (logic)');
        DD.HUD.tick();
        t.eq(DD.HUD.lock(), 'busy', 'input locked during playback');
        // play up to the grunt's turn marker
        for (let i = 0; i < 20 && !(DD.HUD.shownTurnUnit() && DD.HUD.shownTurnUnit().id === g.id); i++) { F.update(16); DD.HUD.tick(); }
        t.eq(DD.HUD.shownTurnUnit() && DD.HUD.shownTurnUnit().id, g.id, 'the HUD shows the grunt\'s turn while it animates');
        t.ok(/Enemy Turn/.test(text('.hud-phase')) && /Test Grunt/.test(text('.hud-round .hr-who')), 'phase pill + round box name the acting enemy');
        t.eq(text('.hud-round .hr-num'), '1', 'the round shown is the playback\'s (round 1)');
        t.ok(q('.hud-init .tk-chip.cur.foe') && q('.hud-init .tk-chip.cur').dataset.unit === g.id, 'the tracker highlights the grunt');
        t.eq(ov().turnUnitId, g.id, 'the board ring follows');
        t.ok(/Test Grunt/.test(DD.HUD.hint()) && /Space/.test(DD.HUD.hint()), 'hint: whose turn + Space skips: ' + DD.HUD.hint());
        const kx = k.x, ky = k.y;
        DD.HUD.click(1, 4);
        t.ok(k.x === kx && k.y === ky, 'clicks are ignored during AI turns');
        DD.HUD.key(' ');
        t.ok(!F.busy(), 'Space skipped the animations');
        DD.HUD.tick();
        t.eq(DD.HUD.shownTurnUnit() && DD.HUD.shownTurnUnit().id, k.id, 'back to the knight\'s turn');
        t.eq(text('.hud-round .hr-num'), '2', 'round 2 shown');
        t.eq(DD.HUD.lock(), null, 'input unlocked');
        t.eq(DD.HUD.selected().id, k.id, 'the knight is selected for his turn');
      });
    } finally { leave(); }
  });

  // ---- inspect panel ----------------------------------------------------------------------------------------------------
  T.suite('hud: inspect panel — enemy move, reach, initiative and abilities; hero initiative, stats and Blessings', function (t) {
    if (!ready(t)) return;
    const pid = DD.defs.passives ? Object.keys(DD.defs.passives).filter(function (id) { const d = DD.defs.passives[id]; return d && d.rarity !== 'cursed' && !d.requires; })[0] : null;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2, passives: pid ? [{ id: pid, level: 1 }] : [] }, { id: 'test_mage', x: 2, y: 5 }], enemies: [{ id: 'test_grunt', x: 5, y: 2 }], enemyAi: false });
      const k = byDef('test_knight'), m = byDef('test_mage'), g = byDef('test_grunt');
      DD.HUD.hover(g.x, g.y);
      const insp = q('.hud-inspect');
      const txt = insp.textContent;
      t.ok(!insp.classList.contains('hud-hidden') && /Test Grunt/.test(txt), 'hovering an enemy opens its panel');
      t.ok(/👣 3 Move/.test(txt), 'move: ' + txt.slice(0, 120));
      t.ok(/Init \+0/.test(txt) && insp.querySelector('.hi-order') && /#3/.test(insp.querySelector('.hi-order').textContent), 'initiative modifier and position (#3)');
      t.ok(/it can reach: Sir Testsalot \d+/.test(txt), 'reach: who it can hit on its next turn: ' + txt);
      t.ok(/Abilities/.test(txt) && insp.querySelector('.hi-abil'), 'an Abilities section');
      const stab = DD.getSkill('test_grunt_stab');
      t.ok(stab && txt.indexOf(stab.name) >= 0 && txt.indexOf(DD.skillDesc(stab, 1, g)) >= 0, 'each ability: name + its exact desc');
      t.ok(/Melee|Range/.test(insp.querySelector('.hi-abil .ha-meta').textContent), 'and its range');
      t.ok(!/Next turn: nothing planned/.test(txt), 'no telegraph section for a normal enemy');
      t.eq(ov().reach && ov().reach.unitId, g.id, 'its reach is shaded on the board');
      t.ok(ov().reach.tiles.some(function (p) { return p.x === k.x && p.y === k.y; }), 'covering the knight it can hit');
      // resistances
      DD.HUD.hover(null);
      g.resist = { fire: 0.5, frost: 1.5 };
      DD.HUD.refresh();
      DD.HUD.hover(g.x, g.y);
      t.ok(/Resists fire/.test(text('.hud-inspect')) && /Weak to frost/.test(text('.hud-inspect')), 'resistance pills');
      // a stunned enemy loses its next turn
      DD.Act.addStatus(g, 'stun', { turns: 1 }, k);
      DD.HUD.refresh();
      DD.HUD.hover(g.x, g.y);
      t.ok(/loses its next turn/.test(text('.hud-inspect')), 'stunned: the panel says it loses its next turn');
      t.ok(!ov().reach, 'and no reach is shaded');
      // heroes: initiative, stats, Blessings
      DD.HUD.hover(m.x, m.y);
      const ht = text('.hud-inspect');
      t.ok(/Init \+1/.test(ht), 'hero initiative modifier (stats.init): ' + ht.slice(0, 160));
      t.ok(/Acts next \(#2 of 3\)/.test(ht), 'when it acts: ' + ht.slice(0, 200));
      t.ok(/👣 4 Move/.test(ht), 'hero stats');
      DD.HUD.hover(k.x, k.y);
      t.ok(/3\/3 AP/.test(text('.hud-inspect')), 'the acting hero shows its AP');
      if (pid) t.ok(q('.hud-inspect .hi-bless') && q('.hud-inspect .hi-bless').children.length >= 1, 'Blessings as chips');
      t.ok(/✓ No enemy can reach this tile|Enemies that can reach this tile/.test(text('.hud-inspect')), 'and what can reach its tile');
    } finally { leave(); }
  });

  // ---- boss wind-ups ---------------------------------------------------------------------------------------------------------
  T.suite('hud: boss wind-ups — the panel, the bubble data, the move hint; a stun interrupts', function (t) {
    if (!ready(t)) return;
    if (!DD.getEnemy('test_boss') || !DD.AI || typeof DD.AI.windUp !== 'function') { t.skip('test boss or AI.windUp missing'); return; }
    try {
      fight({ w: 11, h: 9, heroes: [{ id: 'test_knight', x: 2, y: 4 }, { id: 'test_mage', x: 2, y: 7 }], enemies: [{ id: 'test_boss', x: 8, y: 4 }], enemyAi: false });
      const k = byDef('test_knight'), b = byDef('test_boss');
      const w = DD.AI.windUp(b, 'test_boss_meteor', { x: 3, y: 4 }, { label: 'Meteor of Regression' });
      DD.HUD.refresh();
      t.ok(w && b.intents.length === 1, 'the boss winds up');
      t.eq(chips().filter(function (x) { return x.unitId === b.id; })[0].mark, '⏳', 'its tracker portrait shows ⏳');
      DD.HUD.hover(b.x, b.y);
      const txt = text('.hud-inspect');
      t.ok(/Winding up/.test(txt) && /Meteor of Regression/.test(txt), 'the inspect panel lists the wind-up: ' + txt.slice(0, 220));
      t.ok(/\d+ dmg/.test(txt) && /next turn/.test(txt), 'with its damage and when it lands');
      t.ok(/Stun, sleep, freeze or polymorph/.test(txt), 'and how to stop it (DD.AI.describe)');
      t.eq(ov().focusIntentUnitId, b.id, 'hovering the boss focuses its wind-up on the board');
      const tiles = DD.AI.intentTiles(b, w);
      const spot = tiles.filter(function (p) { return DD.Combat.reachable(k).has(p.x + ',' + p.y); })[0];
      if (spot) {
        DD.HUD.hover(spot.x, spot.y);
        t.ok(/⏳ Meteor of Regression \d+ lands here at the start of its next turn/.test(DD.HUD.hint()), 'moving into it warns: ' + DD.HUD.hint());
      }
      DD.HUD.hover(tiles[0].x, tiles[0].y);
      t.ok(/Wind-up lands here/.test(text('.hud-inspect')) || /lands here/.test(DD.HUD.hint()), 'the tile names the wind-up');
      // the knight stands in it (target 3,4 radius 1 covers 2,4)
      DD.HUD.hover(k.x, k.y);
      t.ok(/A wind-up lands here/.test(text('.hud-inspect')), 'the hero panel warns about the wind-up on its tile');
      // interrupted by a stun
      DD.Act.addStatus(b, 'stun', { turns: 1 }, k);
      DD.HUD.refresh();
      t.eq(b.intents.length, 0, 'a stun interrupts the wind-up');
      DD.HUD.hover(b.x, b.y);
      t.ok(!/Winding up/.test(text('.hud-inspect')), 'the panel no longer lists it');
    } finally { leave(); }
  });

  // ---- threat shading -------------------------------------------------------------------------------------------------------
  T.suite('hud: threat shading — hold Alt, T or the button; enemy reach + auras; lethal tiles', function (t) {
    if (!ready(t)) return;
    try {
      fight({ w: 10, h: 8, heroes: [{ id: 'test_knight', x: 1, y: 3 }], enemies: [{ id: 'test_grunt', x: 6, y: 3 }, { id: 'test_archer', x: 9, y: 7 }], enemyAi: false });
      const k = byDef('test_knight'), g = byDef('test_grunt'), a = byDef('test_archer');
      t.ok(!DD.HUD.threat() && !ov().threat, 'off by default');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true, bubbles: true, cancelable: true }));
      t.ok(DD.HUD.threat(), 'holding Alt turns it on');
      const th = ov().threat;
      t.ok(th && th.tiles.length > 0 && th.ref > 0, 'overlay.threat lists tiles (' + (th ? th.tiles.length : 0) + ')');
      const map = DD.AI.threatMap('hero');
      let missing = 0;
      map.forEach(function (v, key) { const p = key.split(','); if (!th.tiles.some(function (x) { return x.x === +p[0] && x.y === +p[1] && x.dmg >= v.dmg; })) missing++; });
      t.eq(missing, 0, 'every tile of DD.AI.threatMap is shaded with at least its damage');
      t.ok(q('.hud-threat').classList.contains('on'), 'the button shows it is on');
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true, cancelable: true }));
      t.ok(!DD.HUD.threat() && !ov().threat, 'releasing Alt hides it');
      // T toggles (sticky)
      t.ok(DD.HUD.key('t'), 'T is consumed');
      t.ok(DD.HUD.threat() && !!ov().threat, 'T toggles it on');
      // hint over a tile in reach
      const inReach = DD.HUD.threatData().tiles.filter(function (x) { return x.reach > 0 && DD.Combat.reachable(k).has(x.x + ',' + x.y); })[0];
      if (inReach) {
        DD.HUD.hover(inReach.x, inReach.y);
        t.ok(/can reach this tile/.test(DD.HUD.hint()) && /Test Grunt|Test Archer/.test(DD.HUD.hint()), 'the hint names who can reach the hovered tile: ' + DD.HUD.hint());
      }
      const safe = DD.Combat.reachable(k);
      let safeTile = null;
      safe.forEach(function (e) { if (!safeTile && !DD.HUD.threatData().tiles.some(function (x) { return x.x === e.x && x.y === e.y; })) safeTile = e; });
      if (safeTile) { DD.HUD.hover(safeTile.x, safeTile.y); t.ok(/Out of every enemy's reach/.test(DD.HUD.hint()), 'a safe tile says so: ' + DD.HUD.hint()); }
      // auras are included (threatAt)
      a.hooks = Object.assign({}, a.hooks || {}, { threatAt: function (e, u, tile) { return tile.x === 0 && tile.y === 0 ? { dmg: 9, label: 'Test Aura' } : 0; } });
      DD.HUD.refresh();
      const corner = DD.HUD.threatData().tiles.filter(function (x) { return x.x === 0 && x.y === 0; })[0];
      t.ok(corner && corner.aura === 9 && corner.dmg >= 9, 'aura damage (threatAt) is part of the shading');
      // lethal tiles for the selected hero
      k.hp = 3; k.block = 0;
      DD.HUD.refresh();
      t.ok(DD.HUD.threatData().tiles.some(function (x) { return x.lethal; }) && ov().threat.tiles.some(function (x) { return x.lethal; }), 'tiles that would drop the hero are flagged lethal');
      // card line while it is on (the knight stands in the grunt's reach after a walk up)
      g.x = 3; g.y = 3;
      DD.HUD.refresh();
      t.ok(/can reach: up to \d+/.test(qa('.hud-card')[0].querySelector('.hc-threat').textContent), 'party cards show the reach on their tile: ' + qa('.hud-card')[0].querySelector('.hc-threat').textContent);
      q('.hud-threat').click();
      t.ok(!DD.HUD.threat() && !ov().threat, 'the button toggles it off');
    } finally { leave(); }
  });

  // ---- log ---------------------------------------------------------------------------------------------------------------
  T.suite('hud: log lines are revealed in step with FX playback', function (t) {
    if (!ready(t)) return;
    const F = DD.FX;
    const inst = F.instant;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }], noPlan: true });
      F.instant = false;
      F.push({ type: 'wait', ms: 400 });
      F.push({ type: 'wait', ms: 400 });
      DD.Act.log('HUD sync line', 'system');
      const shown = function () { return qa('.hud-log .log-line').some(function (l) { return l.textContent === 'HUD sync line'; }); };
      DD.HUD.tick();
      t.ok(!shown(), 'hidden while the FX before it are still queued');
      t.eq(DD.HUD.lock(), 'busy', 'input locked while FX play');
      F.update(16);
      DD.HUD.tick();
      t.ok(!shown(), 'still hidden while its FX have not started');
      F.flush();
      DD.HUD.tick();
      t.ok(shown(), 'revealed once playback reaches it');
      t.eq(DD.HUD.lock(), null, 'input unlocked when FX are idle');
    } finally {
      F.reset();
      F.instant = inst;
      leave();
    }
  });

  T.suite('hud: the log gets "X\'s turn" headers for turns that did something (empty turns skipped)', function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }, { id: 'test_mage', x: 2, y: 6 }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }] });
      const k = byDef('test_knight'), g = byDef('test_grunt');
      DD.HUD.key('1');
      DD.HUD.click(g.x, g.y);
      DD.HUD.endTurn();   // knight → mage
      DD.HUD.endTurn();   // mage (did nothing) → the grunt acts → knight, round 2
      const heads = qa('.hud-log .hl-turn').map(function (h) { return h.textContent; });
      t.ok(heads.some(function (h) { return /Sir Testsalot's turn/.test(h); }), 'the knight\'s attack got a header: ' + heads.join(' | '));
      t.ok(heads.some(function (h) { return /Test Grunt's turn/.test(h); }), 'the grunt\'s turn got a header');
      t.ok(!heads.some(function (h) { return /Wizzy McTest's turn/.test(h); }), 'the mage\'s empty turn got none');
      const gh = qa('.hud-log .hl-turn').filter(function (h) { return /Test Grunt/.test(h.textContent); })[0];
      t.ok(gh && gh.classList.contains('foe') && gh.nextElementSibling && gh.nextElementSibling.classList.contains('log-line'), 'enemy headers are red and lead their lines');
      t.ok(gh && /Test Grunt|Sir Testsalot/.test(gh.nextElementSibling.textContent), 'the line under it is the grunt\'s action: ' + (gh && gh.nextElementSibling.textContent));
      t.ok(k && !k.dead, 'the knight survived to read it');
      // noise: a pack of arrivals rolling initiative becomes one line
      const n0 = qa('.hud-log .log-line').length;
      DD.Act.log('Test Minion rolls initiative: 12 (joins next round).', 'system');
      DD.Act.log('Test Minion rolls initiative: 7 (joins next round).', 'system');
      DD.Act.log('Test Minion rolls initiative: 15 (joins next round).', 'system');
      DD.HUD.tick();
      const joins = qa('.hud-log .log-line.join');
      t.eq(qa('.hud-log .log-line').length, n0 + 1, 'three arrivals = one log line');
      t.ok(joins.length === 1 && /Joining next round: Test Minion \(12\), Test Minion \(7\), Test Minion \(15\)/.test(joins[0].textContent), 'listing each roll: ' + (joins[0] && joins[0].textContent));
    } finally { leave(); }
  });

  // ---- keyboard, menu, autoplay -------------------------------------------------------------------------------------------
  T.suite('hud: keyboard map, menu and autoplay lock', function (t) {
    if (!ready(t)) return;
    const hadMain = Object.prototype.hasOwnProperty.call(DD, 'Main');
    const oldMain = DD.Main;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 1, y: 1 }], enemies: [{ id: 'test_grunt', x: 7, y: 7 }], noPlan: true });
      const k = byDef('test_knight');
      t.ok(!DD.HUD.key('w'), 'W is left to the camera');
      t.ok(!DD.HUD.key('f'), 'F is left to the camera');
      t.ok(DD.HUD.key('4'), 'number keys are consumed');
      t.ok(/empty/i.test(DD.HUD.hint()), 'empty socket key explains itself: ' + DD.HUD.hint());
      t.ok(DD.HUD.key('6'), 'signature key consumed');
      t.ok(/Hype/.test(DD.HUD.hint()), 'signature without Hype explains itself: ' + DD.HUD.hint());
      t.ok(DD.HUD.key('Escape'), 'Esc consumed');
      const m = DD.UI.topModal();
      t.ok(m && /Paused/.test(m.el.textContent), 'Esc with nothing to cancel opens the menu');
      t.ok(m && /Restart Fight/.test(m.el.textContent) && /Resume/.test(m.el.textContent), 'debug fight menu offers Restart and Resume');
      t.ok(m && /Threat shading/.test(m.el.textContent) && !/Guard/.test(m.el.textContent), 'the controls list the threat shading (and no Guard)');
      DD.UI.closeAllModals('test');
      DD.Main = { autoplay: true };
      DD.HUD.refresh();
      t.eq(DD.HUD.lock(), 'autoplay', 'autoplay locks input');
      DD.HUD.click(1, 2);
      t.ok(k.x === 1 && k.y === 1, 'clicks are ignored under autoplay');
      t.ok(/Autoplay/.test(text('.hud-phase')), 'phase pill shows Autoplay');
    } finally {
      if (hadMain) DD.Main = oldMain; else delete DD.Main;
      leave();
    }
  });

  // ---- robustness ---------------------------------------------------------------------------------------------------------
  T.suite('hud: broken content does not break the HUD', function (t) {
    if (!ready(t)) return;
    const before = DD.problems.length;
    try {
      DD.registerSkill({
        id: 'hudtest_broken', name: 'Broken Skill', owner: 'test_knight', icon: '💥', ap: 1, levels: [{ dmg: 3 }],
        target: { type: 'unit', range: [1, 3], filter: 'enemy' },
        desc: function () { throw new Error('boom desc'); },
        canUse: function () { throw new Error('boom canUse'); },
        execute: function () { throw new Error('boom execute'); },
      });
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2, skills: ['hudtest_broken'] }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }], noPlan: true });
      t.ok(DD.HUD.mounted() && qa('.hud-bar .hud-skill').length === 6, 'HUD renders with a broken skill socketed');
      DD.HUD.key('2');
      const g = byDef('test_grunt');
      DD.HUD.hover(g.x, g.y);
      DD.HUD.click(g.x, g.y);
      t.ok(DD.HUD.mounted(), 'still mounted after using it');
      DD.HUD.hover(null);
      DD.HUD.key(' ');
      t.ok(DD.Combat.state.round >= 2, 'the fight goes on');
      const errs = DD.problems.slice(before).filter(function (w) { return /^Error in /.test(w); });
      t.ok(errs.length > 0, 'broken callbacks were contained and reported (' + errs.length + ')');
      t.ok(errs.every(function (w) { return /boom/.test(w); }), 'only the expected content errors were reported');
    } finally {
      delete DD.defs.skills.hudtest_broken;
      DD.problems.splice(before); // the expected content errors above must not fail this suite
      leave();
    }
  });

  // ---- end of the fight ---------------------------------------------------------------------------------------------------------
  T.suite('hud: victory without a run shows the result modal', async function (t) {
    if (!ready(t)) return;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 3, y: 2 }], noPlan: true });
      const g = byDef('test_grunt');
      g.hp = 1;
      DD.HUD.key('1');
      DD.HUD.click(g.x, g.y);
      t.ok(g.dead && DD.Combat.state.result === 'victory', 'killing the last enemy wins');
      await tick(5);
      await tick(5);
      const m = DD.UI.topModal();
      t.ok(m && /Victory/.test(m.el.textContent), 'result modal says Victory');
      t.ok(m && /Restart Fight/.test(m.el.textContent) && /Title/.test(m.el.textContent), 'with Restart and Title');
      t.eq(DD.HUD.lock(), 'over', 'input locked after the fight');
      t.ok(q('.hud-init').classList.contains('hud-hidden'), 'the tracker steps aside after the fight');
    } finally { leave(); }
  });

  /** Run fights: the HUD must hand the result to DD.Run.finishCombat (the run layer waits for it with the UI on). */
  async function runFight(t, result, expectScreen) {
    if (!DD.Run || typeof DD.Run.newRun !== 'function' || !DD.Meta) { t.skip('run layer not available'); return; }
    const ids = ['test_knight', 'test_mage', 'test_cleric', 'test_rogue'];
    const useUi = DD.Run.useUi;
    const meta = DD.util.deepClone(DD.Meta.data);
    const s = DD.UI.settings();
    const unlock = s.unlockAll;
    try {
      DD.Run.useUi = true;
      s.unlockAll = true;
      DD.Run.newRun(ids, 'normal', 777);
      s.unlockAll = unlock;
      t.ok(DD.Run.state && DD.Run.state.party.length === 4, 'run created');
      DD.Run.startCombat('test_a1_normal', 'normal');
      t.eq(DD.UI.current, 'combat', 'startCombat shows the HUD');
      t.ok(DD.Combat.state && DD.Combat.state.run === DD.Run.state, 'combat belongs to the run');
      t.ok(DD.HUD.mounted(), 'HUD mounted');
      t.ok(DD.Combat.isDeploying() && !q('.hud-rollcta').classList.contains('hud-hidden'), 'a run fight opens in deployment with the roll button');
      // [integration] a TPK: a defeat with heroes standing is a lost objective now (rewards, the run goes on)
      if (result === 'defeat') DD.Combat.heroes().forEach(function (u) { u.downed = true; u.hp = 0; });
      DD.Combat.finish(result);
      for (let i = 0; i < 4 && DD.UI.current === 'combat'; i++) await tick(5);
      t.eq(DD.UI.current, expectScreen, result + ' hands off to ' + expectScreen);
      t.ok(!DD.HUD.mounted(), 'HUD unmounted');
      t.eq(DD.Render.overlay.moveTiles.length, 0, 'overlay reset on unmount');
      t.ok(!DD.FXRender || !DD.FXRender.moments || !DD.FXRender.moments.initiative, 'the dice moment host is released on unmount');
    } finally {
      s.unlockAll = unlock;
      DD.Run.useUi = useUi;
      DD.Run.state = null;
      DD.Storage.remove(DD.Run.SAVE_KEY || 'run');
      DD.Meta.data = meta;
      if (DD.Meta.save) DD.Meta.save();
      leave();
    }
  }
  T.suite('hud: run victory goes to the rewards screen', function (t) { if (ready(t)) return runFight(t, 'victory', 'rewards'); });
  T.suite('hud: run defeat goes to the game over screen', function (t) { if (ready(t)) return runFight(t, 'defeat', 'gameover'); });

  // ---- UI polish: aura threats, enemy passives, Blood Price donors, gold pills, summon packs, the DM caption ----------
  /** threatAt as an instance hook on an enemy unit (the shared definition: def hooks or a status on it; instance
   *  hooks are another hook source of the same unit). */
  function aura(u, fn) { u.hooks = Object.assign({}, u.hooks || {}, { threatAt: fn }); }
  function tipOf(node) { const c = node && node._ddTip ? node._ddTip.content : null; return typeof c === 'function' ? c(node) : c || ''; }

  T.suite('hud: aura threats (enemy threatAt) on party cards, the move hint and the inspect panel', function (t) {
    if (!ready(t)) return;
    const gdef = DD.getEnemy('test_grunt');
    const hadPassive = Object.prototype.hasOwnProperty.call(gdef, 'passive');
    const oldPassive = gdef.passive;
    try {
      gdef.passive = { name: 'Union Rules', icon: '📢', desc: function (u) { return u.name + ' takes a break every 3 turns.'; } };
      fight({ w: 10, h: 8, heroes: [{ id: 'test_knight', x: 2, y: 3 }, { id: 'test_mage', x: 0, y: 7 }], enemies: [{ id: 'test_grunt', x: 4, y: 3 }, { id: 'test_archer', x: 9, y: 0 }],
        surfaces: [{ x: 3, y: 4, id: 'fire', turns: 3 }], noPlan: true });
      const k = byDef('test_knight'), m = byDef('test_mage'), g = byDef('test_grunt'), a = byDef('test_archer');
      const calls = [];
      aura(g, function (e, u, tile, extra) { calls.push([e, u, tile, extra]); return DD.Grid.dist(e, tile) <= 3 ? { dmg: 7, label: 'Stink Aura' } : 0; });
      aura(a, function () { return undefined; });
      DD.HUD.refresh();
      t.ok(calls.length > 0 && calls[0][0] === g && calls[0][2] && typeof calls[0][2].x === 'number', 'threatAt(enemy, unit, tile, extra) is called with the enemy, the unit and a tile');
      const cards = qa('.hud-card');
      const kc = cards.filter(function (c) { return c.textContent.indexOf(k.name) >= 0; })[0];
      const mc = cards.filter(function (c) { return c.textContent.indexOf(m.name) >= 0; })[0];
      t.ok(kc && /⚠ Stink Aura: 7 next turn/.test(kc.querySelector('.hc-threat').textContent) && !kc.querySelector('.hc-threat').classList.contains('hud-hidden'), 'card: "⚠ Stink Aura: 7 next turn" (' + (kc && kc.querySelector('.hc-threat').textContent) + ')');
      t.ok(mc && mc.querySelector('.hc-threat').classList.contains('hud-hidden'), 'out of reach: no aura line (undefined from another enemy counts as 0)');
      t.ok(/Stink Aura/.test(tipOf(kc)), 'the card tooltip names the aura');
      const list = DD.HUD.auraThreats(k);
      t.ok(list.length === 1 && list[0].dmg === 7 && list[0].unit === g && list[0].label === 'Stink Aura', 'DD.HUD.auraThreats lists { unit, dmg, label }');
      // move preview: a tile still inside the aura, and one that escapes it
      DD.HUD.select(k.id);
      DD.HUD.hover(1, 3);
      t.ok(/Ending the turn here: Stink Aura 7 before its next turn/.test(DD.HUD.hint()), 'move hint warns for the tile it would end on: ' + DD.HUD.hint());
      DD.HUD.hover(0, 2);
      t.ok(/Out of Stink Aura here \(7 where/.test(DD.HUD.hint()) && q('.hud-hint').classList.contains('good'), 'move hint: escaping the aura reads as good news: ' + DD.HUD.hint());
      // inspect: the hero, the tile, the enemy (its passive line too)
      DD.HUD.hover(k.x, k.y);
      let txt = text('.hud-inspect');
      t.ok(/Auras: 7 before its next turn/.test(txt) && /Stink Aura \(Test Grunt\): 7/.test(txt), 'hero inspect lists the aura: ' + txt.slice(0, 220));
      t.ok(!/No enemy can reach this tile/.test(txt), 'and does not claim the tile is safe');
      DD.HUD.hover(3, 4);
      txt = q('.hud-inspect').classList.contains('hud-hidden') ? '' : text('.hud-inspect');
      t.ok(/If Sir Testsalot ends the turn here\s*Stink Aura \(Test Grunt\): 7/.test(txt), 'tile inspect: what the selected hero would take there: ' + txt.slice(0, 220));
      DD.HUD.hover(g.x, g.y);
      txt = text('.hud-inspect');
      t.ok(/📢 Union Rules:\s*Test Grunt takes a break every 3 turns\./.test(txt), 'enemy inspect shows its def passive (desc may be a function of the unit)');
      t.ok(/Stink Aura \(aura\) → Sir Testsalot 7/.test(txt), 'enemy inspect lists whom its aura hits: ' + txt.slice(0, 220));
      // a plain number is labelled with the enemy's name; two auras add up
      aura(a, function (e, u) { return u.kind === 'hero' ? 5 : 0; });
      DD.HUD.refresh();
      t.ok(/⚠ 2 auras: 12 next turn/.test(kc.querySelector('.hc-threat').textContent), 'two auras: "⚠ 2 auras: 12 next turn" (' + kc.querySelector('.hc-threat').textContent + ')');
      t.ok(DD.HUD.auraThreats(m).some(function (x) { return x.label === 'Test Archer' && x.dmg === 5; }), 'a number result is labelled with the enemy name');
      // lethal auras are flagged; Block soaks the ones it can, not { ignoreBlock: true } ones
      k.hp = 6; k.block = 0;
      DD.HUD.refresh();
      t.ok(kc.querySelector('.hc-threat').classList.contains('lethal') && /💀/.test(kc.querySelector('.hc-threat').textContent), 'an aura that would drop the hero is marked lethal');
      k.block = 20;
      DD.HUD.refresh();
      t.ok(!kc.querySelector('.hc-threat').classList.contains('lethal'), 'enough Block: not lethal');
      aura(a, function (e, u) { return u.kind === 'hero' ? { dmg: 6, label: 'Late Fees', ignoreBlock: true } : 0; });
      DD.HUD.refresh();
      t.ok(kc.querySelector('.hc-threat').classList.contains('lethal'), 'an aura that ignores Block is lethal through it');
      DD.HUD.hover(k.x, k.y);
      t.ok(/Late Fees \(Test Archer\): 6, ignores Block/.test(text('.hud-inspect')), 'the inspect line says it ignores Block');
      // a dead enemy's aura is gone
      g.dead = true;
      DD.HUD.refresh();
      t.ok(!DD.HUD.auraThreats(k).some(function (x) { return x.unit === g; }), 'dead enemies threaten nothing');
    } finally {
      if (hadPassive) gdef.passive = oldPassive; else delete gdef.passive;
      leave();
    }
  });

  T.suite('hud: Blood Price donor — "paid by" on the HP pill, the tooltip and the aim hint', function (t) {
    if (!ready(t)) return;
    if (!DD.getHero('sparrow') || !DD.getSkill('spa_hemoglob')) { t.skip('Sparrow not registered'); return; }
    try {
      fight({ heroes: [{ id: 'sparrow', x: 2, y: 3, skills: ['spa_hemoglob'] }], enemies: [{ id: 'test_grunt', x: 3, y: 3 }, { id: 'test_archer', x: 6, y: 6 }], noPlan: true });
      const sp = byDef('sparrow'), g = byDef('test_grunt');
      DD.HUD.select(sp.id);
      const listed = DD.resolve(DD.getSkill('spa_hemoglob').hpCost, DD.skillLevel(DD.getSkill('spa_hemoglob'), 1), sp, 0);
      t.ok(listed > 0, 'Hemo-Glob has an HP cost (' + listed + ')');
      let btn = qa('.hud-bar .hud-skill')[1];
      t.ok(btn.querySelector('.hs-hp') && !btn.querySelector('.hs-hp.paid'), 'no donor: the plain HP pill');
      t.eq(DD.HUD.hpPayer(sp, 'spa_hemoglob', 1), null, 'no donor without a Bleeding foe');
      DD.Act.addStatus(g, 'bleed', { stacks: 2, turns: 3 });
      DD.HUD.refresh();
      t.eq(DD.Combat.costOf(sp, DD.getSkill('spa_hemoglob'), 1).hp, 0, 'the engine waives her cost with a Bleeding foe adjacent');
      const payer = DD.HUD.hpPayer(sp, 'spa_hemoglob', 1);
      t.ok(payer && payer.id === g.id, 'the HUD names the Bleeding grunt as the payer');
      btn = qa('.hud-bar .hud-skill')[1];
      t.ok(btn.querySelector('.hs-hp.paid') && btn.querySelector('.hs-hp.paid').textContent.indexOf(String(listed)) >= 0, 'the button pill turns into a 🩸 paid pill');
      const tip = tipOf(btn);
      t.ok(tip.indexOf('paid by Test Grunt') >= 0 && tip.indexOf('pays the ' + listed + ' HP instead') >= 0, 'tooltip: "paid by Test Grunt" on the HP pill + who pays');
      DD.HUD.pressSlot(1);
      DD.HUD.hover(g.x, g.y);
      t.ok(/Test Grunt pays the \d+ HP/.test(DD.HUD.hint()), 'aim hint: who pays (' + DD.HUD.hint() + ')');
      DD.HUD.rightClick();
      // a foe that makes it free some other way is not "paying": only a waived cost names a payer
      DD.Act.removeStatus(g, 'bleed');
      DD.HUD.refresh();
      t.eq(DD.HUD.hpPayer(sp, 'spa_hemoglob', 1), null, 'bleed gone: Sparrow pays again');
    } finally { leave(); }
  });

  T.suite('hud: gold pills on gold-cost skills (party gold, red when short)', function (t) {
    if (!ready(t)) return;
    if (!DD.getHero('zarathor') || !DD.getSkill('zar_bling_throw')) { t.skip('Zarathor not registered'); return; }
    try {
      const g = DD.UI.skillGold('zar_bling_throw', 1);
      t.ok(g && g.cost > 0, 'UI.skillGold reads the cost from the exact desc (' + JSON.stringify(g) + ')');
      fight({ heroes: [{ id: 'zarathor', x: 2, y: 3, skills: ['zar_bling_throw'] }], enemies: [{ id: 'test_grunt', x: 5, y: 3 }], noPlan: true, gold: 2 });
      const z = byDef('zarathor');
      DD.HUD.select(z.id);
      let pill = qa('.hud-bar .hud-skill')[1].querySelector('.hs-gold');
      t.ok(pill && pill.textContent.indexOf(String(g.cost)) >= 0, 'the button shows 🪙' + g.cost);
      t.ok(pill && pill.classList.contains('poor'), 'red while the party holds less (2 gold)');
      DD.Combat.state.sandboxGold = 100;
      DD.HUD.refresh();
      pill = qa('.hud-bar .hud-skill')[1].querySelector('.hs-gold');
      t.eq(DD.Act.gold(), 100, 'party gold raised');
      t.ok(pill && !pill.classList.contains('poor'), 'normal once the party can pay');
      t.ok(/🪙 \d+ gold/.test(tipOf(qa('.hud-bar .hud-skill')[1])), 'tooltip carries the gold pill');
    } finally { leave(); }
  });

  T.suite('hud: summon packs collapse into one row of mini cards (no hidden scrollbar)', function (t) {
    if (!ready(t)) return;
    try {
      fight({ w: 10, h: 10, heroes: [{ id: 'test_knight', x: 1, y: 1 }, { id: 'test_mage', x: 1, y: 8 }], enemies: [{ id: 'test_grunt', x: 9, y: 9 }], noPlan: true });
      const k = byDef('test_knight'), m = byDef('test_mage');
      DD.Act.summon(k, 'test_hound', 2, 1, { noFx: true, silent: true });
      DD.Act.summon(k, 'test_hound', 3, 1, { noFx: true, silent: true });
      DD.HUD.refresh();
      t.eq(qa('.hud-card.summon').length, 2, 'two summons: regular indented cards');
      t.eq(qa('.hud-minis').length, 0, 'no mini row yet');
      for (let i = 0; i < 5; i++) DD.Act.summon(k, 'test_hound', 2 + i, 2, { noFx: true, silent: true, ready: true });
      DD.Act.summon(m, 'test_turret', 2, 8, { noFx: true, silent: true });
      DD.HUD.refresh();
      t.eq(qa('.hud-minis').length, 1, 'seven summons: one mini row');
      t.eq(qa('.hud-minis .hud-mini').length, 7, 'every summon has a mini card');
      t.ok(/Sir Testsalot's entourage ×7/.test(q('.hud-minis .hm-count').textContent), 'the row is labelled with the owner and the count');
      t.eq(qa('.hud-card.summon').length, 1, 'the other hero\'s lone summon keeps its full card');
      const order = Array.prototype.map.call(DD.HUD.els().party.children, function (n) { return n.className.split(' ')[0]; }).join(',');
      t.eq(order, 'hud-card,hud-minis,hud-card,hud-card', 'the row sits under its owner (' + order + ')');
      // a mini selects its summon like a card does (the knight's summons act on the knight's turn)
      const hound = DD.Combat.state.units.filter(function (u) { return u.defId === 'test_hound' && u.ap > 0; })[0];
      const mini = qa('.hud-mini')[2];
      mini.click();
      const sel = DD.HUD.selected();
      t.ok(sel && sel.kind === 'summon', 'clicking a mini selects that summon');
      t.ok(qa('.hud-mini.sel').length === 1, 'the selected mini is highlighted');
      if (hound) t.ok(qa('.hud-mini .hm-ap').some(function (n) { return n.textContent === String(hound.ap); }), 'ready summons show their AP');
      // HP slivers follow the unit
      const h0 = DD.Combat.state.units.filter(function (u) { return u.defId === 'test_hound'; })[0];
      h0.hp = Math.max(1, Math.floor(h0.maxHp / 4));
      if (h0.vis) h0.vis.hp = h0.hp; // bars follow the animated value (unit.vis), as the party cards do
      DD.HUD.refresh();
      t.ok(qa('.hud-mini .hm-hp.low').length >= 1, 'a hurt summon shows a low HP sliver');
      // still taller than the panel: every summon group goes compact
      DD.HUD.els().party.style.maxHeight = '150px';
      DD.HUD.els().party.style.overflowY = 'auto';
      DD.HUD.refresh();
      t.eq(qa('.hud-card.summon').length, 0, 'overflowing panel: all summons compact (' + qa('.hud-card.summon').length + ' full summon cards left)');
      t.eq(qa('.hud-minis').length, 2, 'one mini row per owner');
      // summons dying back to a short list restores the normal cards
      DD.HUD.els().party.style.maxHeight = '';
      DD.Combat.state.units.forEach(function (u) { if (u.kind === 'summon' && u.ownerId === k.id) u.dead = true; });
      DD.HUD.refresh();
      t.eq(qa('.hud-minis').length, 0, 'pack gone: no mini rows');
      t.eq(qa('.hud-card.summon').length, 1, 'the lone turret is a full card again');
    } finally { leave(); }
  });

  T.suite('hud: the idle DM speaks after 30 s of quiet in the player phase', function (t) {
    if (!ready(t)) return;
    const had = DD.defs.narration && DD.defs.narration.idle_dm;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 6, y: 6 }], noPlan: true });
      const since = DD.HUD.idleSince();
      t.ok(!DD.HUD.idleCheck(since + 29000), 'quiet for 29 s: nothing yet');
      const lines0 = qa('.hud-log .log-line.narrator').length;
      t.ok(DD.HUD.idleCheck(since + 30500), 'after 30 s the DM gets bored');
      const shown = DD.HUD.els().dmText.textContent;
      const pool = (had || []).concat(['The DM drums his fingers on the table. Loudly.', 'The DM checks his phone. Then checks it again.']);
      t.ok(pool.indexOf(shown) >= 0, 'an idle_dm line in the caption: ' + shown);
      t.ok(DD.HUD.els().dm.classList.contains('show'), 'caption shown');
      t.eq(qa('.hud-log .log-line.narrator').length, lines0 + 1, 'and in the log');
      t.ok(!DD.HUD.idleCheck(since + 31000), 'not again right away');
      t.ok(DD.HUD.idleCheck(since + 30500 + 61000), 'again after another minute of silence');
      DD.HUD.hover(3, 3);
      t.ok(!DD.HUD.idleCheck(DD.HUD.idleSince() + 1000), 'input restarts the idle clock (1 s after it: quiet)');
      t.ok(DD.HUD.idleCheck(DD.HUD.idleSince() + 30001), 'and 30 s after the last input the DM may speak again');
      DD.Combat.state.phase = 'enemy';
      t.ok(!DD.HUD.idleCheck(DD.HUD.idleSince() + 99999), 'never during AI turns');
      DD.Combat.state.phase = 'player';
    } finally { leave(); }
  });

  T.suite('hud: the DM caption moves off a back-row boss\'s wind-up bubble', function (t) {
    if (!ready(t)) return;
    const R = DD.Render;
    const w2s = R.worldToScreen;
    try {
      fight({ heroes: [{ id: 'test_knight', x: 2, y: 2 }], enemies: [{ id: 'test_grunt', x: 4, y: 2 }], enemyAi: false });
      const g = byDef('test_grunt');
      DD.AI.windUp(g, 'test_grunt_stab', { x: 3, y: 2 }, { label: 'Big Stab' });
      DD.HUD.refresh();
      t.ok(g.intents.length > 0, 'the enemy winds up (it gets a bubble)');
      DD.Events.emit('combat:log', { text: 'The DM clears his throat. Dramatically.', cls: 'narrator', round: 1 });
      const E = DD.HUD.els();
      t.ok(E.dm.classList.contains('show'), 'a narrator line shows the caption');
      t.eq(DD.HUD.dmPlace(), 'top', 'it starts under the objective');
      const r = E.dm.getBoundingClientRect();
      // the enemy (with a wind-up) projects right under the caption: its bubble would hide behind it
      R.worldToScreen = function (x, y) { return x === g.x && y === g.y ? { x: (r.left + r.right) / 2, y: r.bottom + 40 } : { x: -500, y: -500 }; };
      DD.HUD.placeDm();
      t.eq(DD.HUD.dmPlace(), 'low', 'over a wind-up bubble it moves low, above the hint bar');
      t.ok(E.dm.parentNode === E.barWrap && E.dm.nextSibling === E.hint, 'low = right above the hint line');
      R.worldToScreen = function () { return { x: -500, y: -500 }; };
      DD.HUD.placeDm();
      t.eq(DD.HUD.dmPlace(), 'top', 'nothing underneath: back under the objective');
    } finally {
      R.worldToScreen = w2s;
      leave();
    }
  });
})();
