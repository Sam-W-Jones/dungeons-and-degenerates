/* Dungeons and Degenerates — js/ui/screens/gameover.js
 * Two end-of-chapter screens (the manifest has no separate victory file):
 *  - 'gameover': TOTAL PARTY KILL — comedic title (narrate gameover_title), tombstones with epitaphs, run stats and
 *    hero unlock progress. Params: { summary } (else the live run, else the newest DD.Meta history entry).
 *  - 'victory': act-clear interstitial (unlock notices, Continue → DD.Run.completeAct) or, with { final: true }, the
 *    campaign victory screen. Params: { act, final, unlocked: [heroIds], summary }.
 * V3 (plan §2.1, §2.4; V §4.3, §9.6, §13.1): with { twist: true } the act-3 clear is the TWIST PANEL (Svammiel crashes
 * the act-clear screen: the user's line, his cast card built from the gauntlet's lanes, "Descend to Act IV"; a click or
 * Space completes every animation, a second press goes on; headless it mounts fully drawn). A won four-act campaign
 * (summary.acts ≥ 4) gets "The Campaign Is Over (For Real This Time)", campaign_won and Svammiel's last word from below;
 * a run that reached the gauntlet shows its floor bosses beaten (N / M: M = that run's own lane count) and the order.
 * Game over in act IV names the killer by shortName, the floor boss by name "(he cheated)".
 */
(function () {
  'use strict';
  const DD = window.DD;

  const EPITAPHS = [
    'Checked for traps. Once.',
    'Rolled a natural 1 at the worst possible moment.',
    'Lived loudly. Died louder.',
    'Gone, but not forgotten. Mostly forgotten.',
    'Should have taken the Shield spell.',
    'Split the party. Paid the price.',
    'Said "how bad could it be?"',
    'Character sheet: now a coaster.',
    'Asked the DM "are you sure?" The DM was sure.',
    'Went first. Should have gone last.',
  ];
  const GAMEOVER_FALLBACK = ['The Party That Tripped Over Its Own Ambition', 'Rocks Fell. Everyone Died.', 'A Cautionary Tale, Probably'];
  const DEFEAT_FALLBACK = ['The DM closes his notebook gently. "Well. That happened."', 'Rocks did not even need to fall.'];
  const VICTORY_TITLE_FALLBACK = ['Legends (Allegedly)', 'The Party That Somehow Won', 'Certified Dungeon Degenerates'];
  const ACT_CLEAR_FALLBACK = ['The DM flips to a fresh page and cracks his knuckles.', 'One act down. The DM is visibly sweating.'];
  // V3: the twist (exactly the user's words, plan §5.1) and the Twist panel's lines (V §4.3) when no pool has landed
  const TWIST_LINE = 'You thought this was over? I, SVAMMIEL, CONTROL ALL.';
  const TWIST_PANEL_FALLBACK = ['Did you think HE ran this game? Adorable. He\'s my player.', 'That was the tutorial. This is my floor. Wipe your feet.',
    'Session\'s not over until I say it\'s over. I never say it.'];
  const TWIST_DM_FALLBACK = ['The DM, from under his screen: "He\'s my DM. He has never once let me win. ...Good luck."'];
  const CAMPAIGN_WON_FALLBACK = ['The DM picks up his screen, dusts it off and grins. "So. Who wants to play again?"'];
  const VICTORY_FINAL_FALLBACK = ['Svammiel, from somewhere far below: "Fine. FINE. ...Same time next week?"'];
  // the Twist panel's reveal (seconds, V §4.3); the headline types at 35 ms a letter
  const TW = { crack: 0.9, headline: 1.3, rise: 2.4, control: 2.9, cast: 3.4, svam: 3.8, dm: 4.4, heal: 4.8, go: 5.1 };
  let tw = null;   // the Twist panel's live state: { done, timers, finish() }

  function num(v) { v = +v; return isFinite(v) ? v : 0; }

  function newestHistory() {
    const meta = DD.UI.meta();
    const h = meta && Array.isArray(meta.history) ? meta.history : [];
    if (!h.length) return null;
    let best = h[h.length - 1];
    const ts = function (e) { return num(e && (e.endedAt || e.date || e.time || e.at)); };
    h.forEach(function (e) { if (ts(e) > ts(best)) best = e; });
    return best;
  }

  /** { act, party: [RunHero-ish], stats, difficulty, startedAt, endedAt } from params / live run / history. */
  function summary(params) {
    const p = params || {};
    const run = DD.UI.run();
    // a finished run keeps its summary (DD.Run endRun): prefer it to a rebuild from the live state
    let s = p.summary || (run && run.over && run.summary) || null;
    if (!s && run) {
      // the live run (debug / a screen opened without a summary): V3 counts from its gauntlet map, if it reached one
      const fc = DD.UI.floorCounts(run);
      s = { act: run.act, party: run.party, stats: run.stats, difficulty: run.difficulty, startedAt: run.stats && run.stats.startedAt, seed: run.seed,
        acts: typeof DD.finalAct === 'function' ? DD.finalAct() : 3, gauntlet: fc.order, gauntletLanes: fc.m, floorBoss: !!(run.flags && run.flags.floorBoss),
        killedBy: p.killedBy || null, killedByEncounter: p.killedByEncounter || null };
    }
    if (!s) s = newestHistory() || {};
    const party = (s.party || s.heroes || []).map(function (h) { return typeof h === 'string' ? { id: h, level: 1 } : h; }).filter(Boolean);
    const stats = Object.assign({}, s, s.stats || {});
    const started = num(stats.startedAt || s.startedAt);
    const ended = num(s.endedAt || s.date) || Date.now();
    const duration = num(stats.durationMs) || (started ? Math.max(0, ended - started) : 0);
    return {
      act: num(s.act) || num(p.act) || 1, party: party, stats: stats, difficulty: s.difficulty || 'normal', duration: duration,
      seed: s.seed !== undefined ? s.seed : run ? run.seed : '', killedBy: s.killedBy || null, unlocked: Array.isArray(s.unlocked) ? s.unlocked : null, result: s.result || null,
      // V3 (no field on a v2 summary: a classic 3-act run)
      acts: num(s.acts), gauntlet: Array.isArray(s.gauntlet) ? s.gauntlet.slice() : [], gauntletLanes: num(s.gauntletLanes),
      floorBoss: !!s.floorBoss, killedByEncounter: s.killedByEncounter || null,
    };
  }

  /** V3: the run's lanes in the order beaten, as icons (tooltips name them); the floor boss last when he fell. */
  function laneOrder(sm, withBoss) {
    const UI = DD.UI, el = UI.el;
    if (!sm.gauntlet.length && !withBoss) return null;
    const chips = sm.gauntlet.map(function (id) {
      const li = UI.laneInfo(id);
      return el('span.lo-lane', { title: li.shortName }, li.icon);
    });
    if (withBoss) {
      const fin = DD.RunMap && DD.RunMap.finaleOf ? DD.RunMap.finaleOf(Math.max(sm.act, 4)) : null;
      const li = fin ? UI.laneInfo(fin.id) : null;
      chips.push(el('span.lo-lane.boss', { title: li ? li.shortName : 'The floor boss' }, li ? li.icon : '😈'));
    }
    const out = [];
    chips.forEach(function (c, i) { if (i) out.push(el('span.lo-arrow', null, '→')); out.push(c); });
    return el('div.end-order', null, el('span.lo-h', null, 'The order:'), out);
  }

  function statGrid(sm, tpk) {
    const UI = DD.UI, el = UI.el;
    const st = sm.stats;
    const items = [
      ['🗺️', 'Act reached', DD.util.roman(sm.act)],
      ['⚔️', 'Fights won', num(st.combats)],
      ['💀', 'Kills', num(st.kills)],
      ['💥', 'Damage dealt', num(st.damage)],
      ['🪙', 'Gold earned', num(st.goldEarned)],
      // [playtest first-hour-3] downs and write-offs count when a fight ends with someone standing, so a TPK's last fight
      // adds none: under TOTAL PARTY KILL the labels say so ("Times downed 0" read oddly there)
      ['🤕', tpk ? 'Downs before the wipe' : 'Times downed', num(st.downs)],
      ['⚰️', tpk ? 'Heroes lost before the wipe' : 'Heroes lost', num(st.deaths)],
      ['👑', 'Elites / Bosses', num(st.elites) + ' / ' + num(st.bosses)],
    ];
    // V3: a run that reached Svammiel's floor: its floor bosses beaten of its own lane count (never a literal)
    if (sm.gauntletLanes > 0) items.push(['😈', 'Floor bosses', sm.gauntlet.length + ' / ' + sm.gauntletLanes]);
    if (sm.duration) items.push(['⏱️', 'Time played', UI.duration(sm.duration)]);
    return el('div.end-stats', null, items.map(function (i) { return el('div.end-stat', null, el('div.es-icon', null, i[0]), el('div.es-val', null, String(i[2])), el('div.es-label', null, i[1])); }));
  }

  function unlockProgress() {
    const UI = DD.UI, el = UI.el;
    const ids = UI.heroIds();
    // v2 (integrator): every hero is available from the start, so there is no unlock progress to show (an empty
    // fragment keeps the callers' appendChild working); it comes back if a hero def ever gets an unlock condition
    if (!ids.some(function (id) { const d = DD.getHero(id); return d && d.unlock; })) return document.createDocumentFragment();
    const unlocked = ids.filter(function (id) { return UI.isUnlocked(id); });
    const nextLocked = ids.filter(function (id) { return !UI.isUnlocked(id); })[0];
    const box = el('div.unlock-progress', null,
      el('div.up-h', null, 'Heroes unlocked: ' + unlocked.length + ' / ' + ids.length),
      el('div.up-bar', null, el('div.up-fill', { style: { width: (ids.length ? unlocked.length / ids.length * 100 : 0).toFixed(1) + '%' } })),
      el('div.up-row', null, ids.map(function (id) {
        const locked = !UI.isUnlocked(id);
        const p = UI.portrait(id, 36, { locked: locked });
        UI.tooltip(p, function () { return UI.heroTooltipHtml(id, { locked: locked }); });
        return p;
      })));
    if (nextLocked) box.appendChild(el('div.up-next', null, '🔒 Next: ', el('b', null, DD.getHero(nextLocked).name), ' — ' + UI.unlockHint(DD.getHero(nextLocked))));
    return box;
  }

  // [playtest first-hour-5 / text-tone-4] epitaphs carry no pronoun (every hero is he or she), vary with the run's seed
  // and never repeat inside one party
  function tombstones(party, dead, seed) {
    const UI = DD.UI, el = UI.el;
    const used = {};
    return el('div.tombs', null, party.map(function (rh) {
      let i = DD.util.hash(String(rh.id) + ':ep:' + String(seed === undefined ? '' : seed)) % EPITAPHS.length;
      for (let n = 0; n < EPITAPHS.length && used[i]; n++) i = (i + 1) % EPITAPHS.length;
      used[i] = 1;
      const ep = EPITAPHS[i];
      return el('div.tomb' + (dead ? '.dead' : '.alive'), { style: { '--hc': (UI.heroDef(rh) || {}).color || '#c9a24f' } },
        UI.portrait(rh.id, 64, { dead: dead || rh.dead }),
        el('div.tomb-name', null, UI.heroName(rh)),
        el('div.tomb-lvl', null, 'Level ' + num(rh.level || 1)),
        dead ? el('div.tomb-ep', null, ep) : null);
    }));
  }

  /** Close the act-clear step and go on (pending level-ups, then the new act's map): the act-clear Continue's path. */
  function continueAfterClear(act) {
    const UI = DD.UI;
    const r = UI.run();
    // The run layer advances the act when the boss falls; only advance here if that has not happened yet.
    if (r && r.act === act && !(r.map && r.map.cleared) && DD.Run && typeof DD.Run.completeAct === 'function') {
      DD.safe('Run.completeAct', DD.Run.completeAct, DD.Run);
    }
    // Close the boss rewards step and continue (pending level-ups, then the new act's map).
    if (UI.current === 'victory' && DD.Run && typeof DD.Run.next === 'function') DD.safe('Run.next', DD.Run.next, DD.Run);
    if (UI.current === 'victory') {
      const rr = UI.run();
      if (rr && !rr.over) UI.show('map', { act: rr.act, intro: true });
      else UI.show('title');
    }
  }

  /** The twist line split for the panel: ['YOU THOUGHT THIS WAS OVER?', 'I, SVAMMIEL, CONTROL ALL.'] (svam_twist, else the plan's). */
  function twistParts() {
    const pool = DD.defs.narration && DD.defs.narration.svam_twist;
    const line = String((pool && pool[0]) || TWIST_LINE);
    const cut = line.indexOf('? ');
    return cut > 0 ? [line.slice(0, cut + 1).toUpperCase(), line.slice(cut + 2)] : [line.toUpperCase(), ''];
  }

  /**
   * The Twist panel (V §4.3): the act-3 clear, then Svammiel crashes it. Steps fade in on a timeline (TW); a click or
   * Space completes every step at once, a second press (or Enter on the button) descends. Headless / static captures
   * mount it fully drawn.
   */
  function twistPanel(root, wrap, params) {
    const UI = DD.UI, el = UI.el;
    const act = num(params.act) || 3;
    const info = UI.ACTS[act] || { roman: DD.util.roman(act), name: '' };
    const nextAct = num(params.nextAct) || act + 1;
    const next = UI.ACTS[nextAct] || { roman: DD.util.roman(nextAct), name: 'Act ' + DD.util.roman(nextAct), sub: '' };
    const cam = typeof DD.getCameo === 'function' ? DD.getCameo('svammiel') : null;
    const svName = cam ? cam.name : 'Svammiel';
    const parts = twistParts();
    const lanes = UI.gauntletLanes();
    const step = function (node, at) { node.classList.add('tw-step'); node.style.setProperty('--d', at + 's'); return node; };
    root.classList.add('twist');
    tw = { done: false, timers: [] };

    root.appendChild(el('div.tw-vignette', { style: { '--d': TW.crack + 's' } }));
    root.appendChild(el('div.tw-crack', { style: { '--d': TW.crack + 's' }, html: '<svg viewBox="0 0 1000 60" preserveAspectRatio="none"><polyline points="0,32 70,24 130,40 210,18 270,36 350,22 420,44 500,20 560,38 640,16 720,40 790,24 860,42 930,20 1000,30" fill="none" stroke="#ff3a2a" stroke-width="5" stroke-linejoin="bevel"/><polyline points="0,32 70,24 130,40 210,18 270,36 350,22 420,44 500,20 560,38 640,16 720,40 790,24 860,42 930,20 1000,30" fill="none" stroke="#2a0204" stroke-width="1.6" stroke-linejoin="bevel"/></svg>' }));
    wrap.classList.add('tw-wrap');
    // 1. the act clear as it would have been
    wrap.appendChild(el('div.tw-clear', null,
      el('span.end-icon.tw-trophy', { style: { '--d': TW.crack + 's' } }, '🏆'),
      el('div.tw-clear-text', null, el('div.end-kicker', null, 'Act ' + info.roman + ' Cleared'), el('div.tw-clear-title', null, info.name))));
    wrap.appendChild(UI.narration('Fine. FINE. You win. Same time next week?', { cls: 'center tw-dm-yield' }));
    // 3. the headline, typed
    const head = el('div.tw-headline', { 'aria-label': parts[0] }, '');
    wrap.appendChild(step(head, TW.headline));
    // 4-6. his portrait rising, the gold line, the cast card (every lane of his floor, read from the map / registry)
    const portrait = cam && cam.enemy ? UI.portrait(cam.enemy, 160, { frame: false, fallback: cam.icon || '😈' }) : UI.portrait({ base: 'humanoid' }, 160, { frame: false, fallback: '😈' });
    const castLanes = lanes.map(function (l) {
      const li = UI.laneInfo(l);
      const chip = el('span.twc-lane', null, el('span.twc-icon', null, li.icon), el('span.twc-lname', null, li.shortName), li.castNote ? el('span.twc-note', null, ' ' + li.castNote) : null);
      UI.tooltip(chip, '<div class="tt"><div class="tt-title">' + UI.esc(li.name) + '</div>' + (li.hint ? '<div class="tt-desc">' + UI.esc(li.hint) + '</div>' : '') + '</div>', { pos: 'top' });
      return chip;
    });
    const cast = el('div.tw-cast', null,
      el('div.twc-name', null, svName.toUpperCase()),
      el('div.twc-title', null, (cam && cam.title) || 'The Floor Boss'),
      el('div.twc-epithet', null, 'Dungeon Master of Dungeon Masters'),
      castLanes.length ? el('div.twc-h', null, 'His floor bosses, in any order you like:') : null,
      castLanes.length ? el('div.twc-lanes', null, castLanes) : null);
    wrap.appendChild(el('div.tw-reveal', null,
      step(el('div.tw-rise', null, portrait), TW.rise),
      el('div.tw-right', null, step(el('div.tw-control', null, parts[1]), TW.control), step(cast, TW.cast))));
    // 7-8. his line, then the DM's from under the screen
    const svLine = UI.narrate('svam_twist_panel', {}, TWIST_PANEL_FALLBACK);
    if (svLine) wrap.appendChild(step(UI.narration(svLine, { cls: 'center tw-svam-line', speaker: cam ? cam.id : 'svammiel' }), TW.svam));
    const dmLine = params.text || UI.narrate('act_clear_twist', {}, TWIST_DM_FALLBACK);
    if (dmLine) wrap.appendChild(step(UI.narration(dmLine, { cls: 'center' }), TW.dm));
    // 9. the act-clear heal, with his blessing
    if (params.healed) {
      wrap.appendChild(step(el('div.end-heal.tw-heal', null, '💚 The party patches itself up between acts: everyone heals ' + Math.round(num(params.healed) * 100) + '% of their max HP. ',
        el('i', null, '(' + svName + ' allowed it. Healthy players last longer.)')), TW.heal));
    }
    // 10. down we go
    const n = lanes.length;
    const nextLine = 'Next: ' + next.name + ' — ' + svName + '\'s floor. ' + (n ? DD.util.capitalize(UI.numberWord(n)) + ' mini-boss' + (n === 1 ? '' : 'es') + ' in any order, then him.' : 'Then him.');
    const finish = function () {
      if (!tw || tw.done) return false;
      tw.done = true;
      tw.timers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
      tw.timers = [];
      head.textContent = parts[0];
      root.classList.add('tw-done');
      return true;
    };
    tw.finish = finish;
    const go = UI.button('Descend to Act ' + next.roman, function () {
      if (finish()) return;   // a first press completes the reveal
      continueAfterClear(act);
    }, { cls: 'primary big tw-go', icon: '😈', hotkey: 'Enter' });
    wrap.appendChild(step(el('div.end-actions', null, go), TW.go));
    wrap.appendChild(step(el('div.end-next', null, nextLine), TW.go));
    root.addEventListener('click', function (e) { if (!tw || tw.done || (e.target && e.target.closest && e.target.closest('.tw-go'))) return; finish(); });
    // the timeline: typed headline + the sting (sound only off the debug pages, never headless)
    const instant = DD.headless || document.documentElement.classList.contains('static-ui');
    if (instant) { finish(); return; }
    tw.timers.push(setTimeout(function () { UI.sound('svam_sting'); }, TW.crack * 1000));
    tw.timers.push(setTimeout(function () {
      let i = 0;
      const typer = setInterval(function () {
        i++;
        head.textContent = parts[0].slice(0, i);
        if (i >= parts[0].length) clearInterval(typer);
      }, 35);
      if (tw) tw.timers.push(typer);
    }, TW.headline * 1000));
    tw.timers.push(setTimeout(function () { if (tw && !tw.done) { tw.done = true; root.classList.add('tw-done'); head.textContent = parts[0]; } }, (TW.go + 0.8) * 1000));
  }

  function endButtons(extra) {
    const UI = DD.UI, el = UI.el;
    return el('div.end-actions', null, extra || null,
      UI.button('New Campaign', function () { UI.show('partySelect'); }, { cls: 'primary big', icon: '🎲', hotkey: 'Enter' }),
      UI.button('Hall of Fame', function () { UI.show('hall', { back: 'title' }); }, { icon: '🏛️' }),
      UI.button('Title Screen', function () { UI.show('title'); }, { cls: 'ghost' }));
  }

  DD.afterLoad(function () {
    if (!DD.UI) return;
    const UI = DD.UI;

    UI.screen('gameover', {
      cls: 'full end-screen tpk',
      history: false,
      mount: function (root, params) {
        const el = UI.el;
        const sm = summary(params);
        const title = UI.narrate('gameover_title', {}, GAMEOVER_FALLBACK);
        const wrap = el('div.end-wrap');
        wrap.appendChild(el('div.end-icon', null, '💀'));
        wrap.appendChild(el('div.end-title', null, 'Total Party Kill'));
        if (title) wrap.appendChild(el('div.end-sub', null, '“' + title + '”'));
        const line = UI.narrate('defeat', {}, DEFEAT_FALLBACK);
        if (line) wrap.appendChild(UI.narration(line, { cls: 'center' }));
        // V3: the killer by shortName; the floor boss's fight by his name, and he cheated
        const killer = UI.killerOf(sm);
        if (killer) wrap.appendChild(el('div.end-killer', null, 'Felled by ', el('b', null, killer.name), ' in Act ' + DD.util.roman(sm.act) + UI.cheatedText(killer) + '.'));
        if (sm.gauntletLanes > 0) {
          const names = sm.gauntlet.map(function (id) { return UI.laneShort(id); });
          wrap.appendChild(el('div.end-floor', null, '😈 Floor bosses beaten: ', el('b', null, sm.gauntlet.length + ' / ' + sm.gauntletLanes), names.length ? ' (' + names.join(', ') + ')' : ''));
        }
        if (sm.party.length) wrap.appendChild(tombstones(sm.party, true, sm.seed));
        wrap.appendChild(statGrid(sm, true));
        wrap.appendChild(unlockProgress());
        wrap.appendChild(endButtons());
        root.appendChild(el('div.end-scroll.scroll', null, wrap));
        if (!DD.headless) UI.sound('defeat');
      },
    });

    UI.screen('victory', {
      cls: 'full end-screen win',
      history: false,
      mount: function (root, params) {
        const el = UI.el;
        params = params || {};
        const run = UI.run();
        const sumP = params.summary || null;
        const final = !!params.final || !!(sumP && sumP.result === 'victory') || !!(run && run.over === 'victory');
        const act = num(params.act) || (sumP && num(sumP.act)) || (run ? run.act : 1) || 1;
        const wrap = el('div.end-wrap');
        const given = Array.isArray(params.unlocked) ? params.unlocked : sumP && Array.isArray(sumP.unlocked) ? sumP.unlocked : null;
        const unlockedNow = (given || []).filter(function (id) { return DD.getHero(id); });
        if (!given) {
          UI.heroIds().forEach(function (id) {
            const d = DD.getHero(id);
            if (d.unlock && d.unlock.act === act && UI.isUnlocked(id)) unlockedNow.push(id);
          });
        }
        if (!final && params.twist) {
          twistPanel(root, wrap, params);
        } else if (!final) {
          const info = UI.ACTS[act] || { roman: DD.util.roman(act), name: '' };
          // V3: act IV is named only when the campaign really has it (no spoiler with a 3-act knob)
          const nextInfo = act + 1 <= (typeof DD.finalAct === 'function' ? DD.finalAct() : 3) ? UI.ACTS[act + 1] || null : null;
          wrap.appendChild(el('div.end-icon', null, '🏆'));
          wrap.appendChild(el('div.end-kicker', null, 'Act ' + info.roman + ' Cleared'));
          wrap.appendChild(el('div.end-title', null, info.name));
          const line = params.text || UI.narrate('act_clear', {}, ACT_CLEAR_FALLBACK);
          if (line) wrap.appendChild(UI.narration(line, { cls: 'center' }));
          if (params.healed) wrap.appendChild(el('div.end-heal', null, '💚 The party patches itself up between acts: everyone heals ' + Math.round(num(params.healed) * 100) + '% of their max HP.'));
          if (unlockedNow.length) wrap.appendChild(el('div.unlock-banner', null, unlockedNow.map(function (id) {
            const d = DD.getHero(id);
            return el('div.ub-hero', { style: { '--hc': d.color || '#c9a24f' } }, UI.portrait(id, 72), el('div.ub-text', null, el('div.ub-kicker', null, 'New hero unlocked!'), el('div.ub-name', null, d.name + (d.epithet ? ' ' + d.epithet : '')), el('div.ub-role', null, 'Now on the menu at every tavern, and in the lineup for your next campaign.')));
          })));
          if (run && run.party) wrap.appendChild(tombstones(run.party.filter(function (h) { return !h.dead; }), false));
          const cont = UI.button(nextInfo ? 'Onward to Act ' + nextInfo.roman : 'Continue', function () { continueAfterClear(act); }, { cls: 'primary big', icon: '▶', hotkey: 'Enter' });
          wrap.appendChild(el('div.end-actions', null, cont));
          if (nextInfo) wrap.appendChild(el('div.end-next', null, 'Next: ' + nextInfo.name + ' — ' + nextInfo.sub));
        } else {
          const sm = summary(sumP ? { summary: sumP } : params);
          // V3: a four-act campaign (Svammiel beaten) vs a classic three-act win (v2 summaries carry no `acts`)
          const fourAct = sm.acts >= 4 || (!sumP && act >= 4);
          if (fourAct) root.classList.add('four-act');
          wrap.appendChild(el('div.end-icon', null, '👑'));
          wrap.appendChild(el('div.end-kicker', null, fourAct ? 'The Campaign Is Over (For Real This Time)' : 'The Campaign Is Over'));
          wrap.appendChild(el('div.end-title', null, 'Victory!'));
          const title = UI.narrate('victory_title', {}, VICTORY_TITLE_FALLBACK);
          if (title) wrap.appendChild(el('div.end-sub', null, '“' + title + '”'));
          if (fourAct) {
            wrap.appendChild(UI.narration(UI.narrate('campaign_won', {}, CAMPAIGN_WON_FALLBACK), { cls: 'center' }));
            const last = UI.narrate('victory_final', {}, VICTORY_FINAL_FALLBACK);
            if (last) wrap.appendChild(UI.narration(last, { cls: 'center small from-below', speaker: 'svammiel' }));
          } else wrap.appendChild(UI.narration('Fine. FINE. You win. Same time next week?', { cls: 'center' }));
          if (unlockedNow.length) wrap.appendChild(el('div.unlock-banner', null, unlockedNow.map(function (id) {
            const d = DD.getHero(id);
            return el('div.ub-hero', { style: { '--hc': d.color || '#c9a24f' } }, UI.portrait(id, 72), el('div.ub-text', null, el('div.ub-kicker', null, 'New hero unlocked!'), el('div.ub-name', null, d.name + (d.epithet ? ' ' + d.epithet : ''))));
          })));
          if (sm.party.length) wrap.appendChild(tombstones(sm.party, false));
          wrap.appendChild(statGrid(sm));
          if (sm.gauntletLanes > 0) {
            const order = laneOrder(sm, fourAct);
            if (order) wrap.appendChild(order);
          }
          wrap.appendChild(unlockProgress());
          wrap.appendChild(endButtons());
        }
        // (the Twist panel gets no confetti: the party is not celebrating for long)
        if (final || !params.twist) {
          root.appendChild(el('div.confetti', null, Array.from({ length: final ? 40 : 22 }, function (_, i) {
            const r = Math.random;
            return el('span.cf', { style: { left: (r() * 100).toFixed(1) + '%', animationDelay: (-r() * 6).toFixed(2) + 's', animationDuration: (4 + r() * 4).toFixed(2) + 's', '--cf': ['#f3d38a', '#e25822', '#5aa9ff', '#6cc76a', '#c06cff', '#ff5fa2'][i % 6], '--rot': Math.round(r() * 360) + 'deg' } });
          })));
        }
        root.appendChild(el('div.end-scroll.scroll', null, wrap));
        if (!DD.headless) UI.sound('victory');
      },
      /** The Twist panel: Space completes the reveal (Enter is the button's: complete first, then descend). */
      onKey: function (e) {
        if (!tw || tw.done || e.key !== ' ') return false;
        e.preventDefault();
        if (tw.finish) tw.finish();
        return true;
      },
      unmount: function () {
        if (tw) tw.timers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
        tw = null;
      },
    });
  });
})();
