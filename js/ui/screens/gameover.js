/* Dungeons and Degenerates — js/ui/screens/gameover.js
 * Two end-of-chapter screens (the manifest has no separate victory file):
 *  - 'gameover': TOTAL PARTY KILL — comedic title (narrate gameover_title), tombstones with epitaphs, run stats and
 *    hero unlock progress. Params: { summary } (else the live run, else the newest DD.Meta history entry).
 *  - 'victory': act-clear interstitial (unlock notices, Continue → DD.Run.completeAct) or, with { final: true }, the
 *    campaign victory screen. Params: { act, final, unlocked: [heroIds], summary }.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const EPITAPHS = [
    'Checked for traps. Once.',
    'Rolled a natural 1 at the worst possible moment.',
    'Died as they lived: loudly.',
    'Gone, but not forgotten. Mostly forgotten.',
    'Should have taken the Shield spell.',
    'Split the party. Paid the price.',
    'Said "how bad could it be?"',
    'Their character sheet is now a coaster.',
  ];
  const GAMEOVER_FALLBACK = ['The Party That Tripped Over Its Own Ambition', 'Rocks Fell. Everyone Died.', 'A Cautionary Tale, Probably'];
  const DEFEAT_FALLBACK = ['The DM closes his notebook gently. "Well. That happened."', 'Rocks did not even need to fall.'];
  const VICTORY_TITLE_FALLBACK = ['Legends (Allegedly)', 'The Party That Somehow Won', 'Certified Dungeon Degenerates'];
  const ACT_CLEAR_FALLBACK = ['The DM flips to a fresh page and cracks his knuckles.', 'One act down. The DM is visibly sweating.'];

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
    let s = p.summary || null;
    if (!s && run) s = { act: run.act, party: run.party, stats: run.stats, difficulty: run.difficulty, startedAt: run.stats && run.stats.startedAt };
    if (!s) s = newestHistory() || {};
    const party = (s.party || s.heroes || []).map(function (h) { return typeof h === 'string' ? { id: h, level: 1 } : h; }).filter(Boolean);
    const stats = Object.assign({}, s, s.stats || {});
    const started = num(stats.startedAt || s.startedAt);
    const ended = num(s.endedAt || s.date) || Date.now();
    const duration = num(stats.durationMs) || (started ? Math.max(0, ended - started) : 0);
    return {
      act: num(s.act) || num(p.act) || 1, party: party, stats: stats, difficulty: s.difficulty || 'normal', duration: duration,
      killedBy: s.killedBy || null, unlocked: Array.isArray(s.unlocked) ? s.unlocked : null, result: s.result || null,
    };
  }

  function statGrid(sm) {
    const UI = DD.UI, el = UI.el;
    const st = sm.stats;
    const items = [
      ['🗺️', 'Act reached', DD.util.roman(sm.act)],
      ['⚔️', 'Fights won', num(st.combats)],
      ['💀', 'Kills', num(st.kills)],
      ['💥', 'Damage dealt', num(st.damage)],
      ['🪙', 'Gold earned', num(st.goldEarned)],
      ['🤕', 'Times downed', num(st.downs)],
      ['⚰️', 'Heroes lost', num(st.deaths)],
      ['👑', 'Elites / Bosses', num(st.elites) + ' / ' + num(st.bosses)],
    ];
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

  function tombstones(party, dead) {
    const UI = DD.UI, el = UI.el;
    return el('div.tombs', null, party.map(function (rh) {
      const ep = EPITAPHS[DD.util.hash(String(rh.id) + ':ep') % EPITAPHS.length];
      return el('div.tomb' + (dead ? '.dead' : '.alive'), { style: { '--hc': (UI.heroDef(rh) || {}).color || '#c9a24f' } },
        UI.portrait(rh.id, 64, { dead: dead || rh.dead }),
        el('div.tomb-name', null, UI.heroName(rh)),
        el('div.tomb-lvl', null, 'Level ' + num(rh.level || 1)),
        dead ? el('div.tomb-ep', null, ep) : null);
    }));
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
        if (sm.killedBy) wrap.appendChild(el('div.end-killer', null, 'Felled by ', el('b', null, sm.killedBy), ' in Act ' + DD.util.roman(sm.act) + '.'));
        if (sm.party.length) wrap.appendChild(tombstones(sm.party, true));
        wrap.appendChild(statGrid(sm));
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
        if (!final) {
          const info = UI.ACTS[act] || { roman: DD.util.roman(act), name: '' };
          const nextInfo = UI.ACTS[act + 1] || null;
          wrap.appendChild(el('div.end-icon', null, '🏆'));
          wrap.appendChild(el('div.end-kicker', null, 'Act ' + info.roman + ' Cleared'));
          wrap.appendChild(el('div.end-title', null, info.name));
          const line = params.text || UI.narrate('act_clear', {}, ACT_CLEAR_FALLBACK);
          if (line) wrap.appendChild(UI.narration(line, { cls: 'center' }));
          if (params.healed) wrap.appendChild(el('div.end-heal', null, '💚 The party patches itself up between acts: everyone heals ' + Math.round(num(params.healed) * 100) + '% of their max HP.'));
          if (unlockedNow.length) wrap.appendChild(el('div.unlock-banner', null, unlockedNow.map(function (id) {
            const d = DD.getHero(id);
            return el('div.ub-hero', { style: { '--hc': d.color || '#c9a24f' } }, UI.portrait(id, 72), el('div.ub-text', null, el('div.ub-kicker', null, 'New hero unlocked!'), el('div.ub-name', null, d.name + (d.epithet ? ' ' + d.epithet : '')), el('div.ub-role', null, 'Recruit them at a tavern or pick them in your next campaign.')));
          })));
          if (run && run.party) wrap.appendChild(tombstones(run.party.filter(function (h) { return !h.dead; }), false));
          const cont = UI.button(nextInfo ? 'Onward to Act ' + nextInfo.roman : 'Continue', function () {
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
          }, { cls: 'primary big', icon: '▶', hotkey: 'Enter' });
          wrap.appendChild(el('div.end-actions', null, cont));
          if (nextInfo) wrap.appendChild(el('div.end-next', null, 'Next: ' + nextInfo.name + ' — ' + nextInfo.sub));
        } else {
          const sm = summary(sumP ? { summary: sumP } : params);
          wrap.appendChild(el('div.end-icon', null, '👑'));
          wrap.appendChild(el('div.end-kicker', null, 'The Campaign Is Over'));
          wrap.appendChild(el('div.end-title', null, 'Victory!'));
          const title = UI.narrate('victory_title', {}, VICTORY_TITLE_FALLBACK);
          if (title) wrap.appendChild(el('div.end-sub', null, '“' + title + '”'));
          wrap.appendChild(UI.narration('Fine. FINE. You win. Same time next week?', { cls: 'center' }));
          if (unlockedNow.length) wrap.appendChild(el('div.unlock-banner', null, unlockedNow.map(function (id) {
            const d = DD.getHero(id);
            return el('div.ub-hero', { style: { '--hc': d.color || '#c9a24f' } }, UI.portrait(id, 72), el('div.ub-text', null, el('div.ub-kicker', null, 'New hero unlocked!'), el('div.ub-name', null, d.name + (d.epithet ? ' ' + d.epithet : ''))));
          })));
          if (sm.party.length) wrap.appendChild(tombstones(sm.party, false));
          wrap.appendChild(statGrid(sm));
          wrap.appendChild(unlockProgress());
          wrap.appendChild(endButtons());
        }
        root.appendChild(el('div.confetti', null, Array.from({ length: final ? 40 : 22 }, function (_, i) {
          const r = Math.random;
          return el('span.cf', { style: { left: (r() * 100).toFixed(1) + '%', animationDelay: (-r() * 6).toFixed(2) + 's', animationDuration: (4 + r() * 4).toFixed(2) + 's', '--cf': ['#f3d38a', '#e25822', '#5aa9ff', '#6cc76a', '#c06cff', '#ff5fa2'][i % 6], '--rot': Math.round(r() * 360) + 'deg' } });
        })));
        root.appendChild(el('div.end-scroll.scroll', null, wrap));
        if (!DD.headless) UI.sound('victory');
      },
    });
  });
})();
