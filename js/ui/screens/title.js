/* Dungeons and Degenerates — js/ui/screens/title.js
 * Title screen: animated logo (gold shimmer + d20 emblem + floating embers), rotating comedic tagline, main menu
 * (Continue / New Campaign / Hall of Fame / Settings / Credits) and a loading-screen tip. Uses the DD.Render "title"
 * scene behind it when the renderer provides one, otherwise a CSS tavern backdrop.
 */
(function () {
  'use strict';
  const DD = window.DD;

  const TAGLINES = [
    'A tactical roguelike for people who should be doing their homework.',
    'Now with 40% more rules lawyering.',
    'Roll for initiative. Then roll for snacks.',
    'Legally distinct from that other game with the dragons.',
    'No miniatures were harmed. Several were licked.',
    'The DM is fine. The DM has had four energy drinks.',
    'Based on a true campaign. Names unchanged to embarrass the guilty.',
    'Featuring a bard who will flirt with the final boss. Probably.',
    // v2 (integrator): no telegraphs any more, only boss wind-ups; fallback tips follow the v2 rules (narrator tips)
    'Nobody telegraphs anything. Except the bosses. You will still stand in it.',
  ];

  const TIP_FALLBACK = [
    'Every fight opens with a roll for initiative: d20 plus each unit\'s modifier. The order holds for the whole fight.',
    'Walking away from a melee foe gives it a free attack of opportunity. Pushes, leaps and teleports never provoke.',
    'Unused AP is lost when a turn ends. Spend it or lose it.',
    'Environmental kills give +20 Hype. Gravity is the best party member.',
    'A hero downed three times in one run is written out of the campaign. Permanently. The DM is not kidding.',
  ];

  // The logo's ampersand is a d20 with "&" on its top face.
  const D20_SVG = '<svg class="d20" viewBox="0 0 100 100" aria-hidden="true">' +
    '<defs><linearGradient id="d20g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1bf"/><stop offset=".5" stop-color="#e2b65a"/><stop offset="1" stop-color="#8a5d1e"/></linearGradient>' +
    '<radialGradient id="d20f" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#6b2a1a"/><stop offset="1" stop-color="#2a0e08"/></radialGradient></defs>' +
    '<polygon points="50,3 93,27 93,73 50,97 7,73 7,27" fill="url(#d20f)" stroke="url(#d20g)" stroke-width="3.2" stroke-linejoin="round"/>' +
    '<polygon points="50,22 77,68 23,68" fill="rgba(255,215,130,.12)" stroke="url(#d20g)" stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M50,3 L50,22 M7,27 L50,22 M93,27 L50,22 M7,27 L23,68 M7,73 L23,68 M50,97 L23,68 M93,27 L77,68 M93,73 L77,68 M50,97 L77,68" stroke="url(#d20g)" stroke-width="1.6" fill="none" opacity=".8"/>' +
    '<text x="50" y="61" text-anchor="middle" font-family="Cinzel Decorative, Cinzel, Georgia, serif" font-weight="900" font-size="25" fill="url(#d20g)">&amp;</text>' +
    '</svg>';

  let timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function every(fn, ms) { timers.push(setInterval(fn, ms)); }

  /** The run still in memory (after Quit to Title / Save & Quit), if it is not over. */
  function liveRun() {
    const r = DD.UI.run();
    return r && !r.over && Array.isArray(r.party) && r.party.length ? r : null;
  }
  /** A campaign to continue: the live one, or a save (a fresh page). Works even when storage is unavailable. */
  function hasRun() {
    return !!liveRun() || !!(DD.Run && typeof DD.Run.hasSave === 'function' && DD.Run.hasSave());
  }

  function runSummary() {
    const UI = DD.UI;
    if (!hasRun()) return null;
    const info = { text: 'Pick up where you blacked out.' };
    const peek = liveRun() ? null : (DD.Storage ? DD.Storage.get(DD.Run.SAVE_KEY || 'run', null) : null);
    const st = liveRun() || (peek && peek.party ? peek : null);
    if (st && st.party) {
      const names = st.party.map(function (h) { return UI.heroName(h); }).join(', ');
      info.text = 'Act ' + DD.util.roman(st.act || 1) + ' · ' + names;
    }
    return info;
  }

  function startNew() {
    const UI = DD.UI;
    if (!hasRun()) { UI.show('partySelect'); return; }
    UI.confirm('Start a new campaign? Your current one will be <b>abandoned</b> and the party will be found, years later, in a mimic.', { title: 'Abandon Campaign?', yes: 'Abandon it', no: 'Keep playing', danger: true, icon: '📜' })
      .then(function (ok) {
        if (!ok) return;
        if (DD.Run && typeof DD.Run.abandon === 'function') DD.safe('Run.abandon', DD.Run.abandon, DD.Run);
        else if (DD.Run && typeof DD.Run.clear === 'function') DD.safe('Run.clear', DD.Run.clear, DD.Run);
        UI.show('partySelect');
      });
  }

  function continueRun() {
    const UI = DD.UI;
    // The run still in memory (Quit to Title) is the live one: resuming it keeps a fight in progress where it was.
    // Only a fresh page needs the save (a fight interrupted by closing the game then restarts from its start).
    let ok = !!UI.run() && !UI.run().over;
    if (!ok && DD.Run && typeof DD.Run.load === 'function') ok = DD.safe('Run.load', DD.Run.load, DD.Run) !== false && !!UI.run();
    if (!ok) { UI.toast('That save file has been eaten by a gelatinous cube.', { cls: 'bad', icon: '🧊' }); UI.refresh(); return; }
    UI.resumeRun();
  }

  function showCredits() {
    const UI = DD.UI, el = UI.el;
    const rows = [
      ['Dungeon Master', 'The DM (unpaid, under-slept)'],
      ['Players', 'Eight degenerates and their questionable choices'],
      ['Game Design', 'Mostly made up, lovingly'],
      ['Rules Lawyer', 'Retained on a strict snack-based basis'],
      ['Catering', 'Cheetos. Regrettably.'],
      ['Dice', 'Cursed. All of them.'],
      ['Corgi Wrangling', 'Ellaria, who is not sorry'],
      ['Technology', 'Vanilla JavaScript, one canvas and spite'],
      ['Special Thanks', 'Everyone who showed up to Session Zero'],
    ];
    const body = el('div.credits',
      el('div.credits-studio', null, 'A Session That Ran Long Production'),
      el('dl.credits-list', null, rows.map(function (r) { return [el('dt', null, r[0]), el('dd', null, r[1])]; })),
      el('div.credits-foot', null, 'No d20s were rolled in the making of this game. They were thrown.'));
    UI.modal({ title: 'Credits', icon: '📜', body: body, size: 'md', buttons: [{ label: 'Roll Credits Again Never', primary: true }] });
  }

  DD.afterLoad(function () {
    if (!DD.UI) return;
    DD.UI.screen('title', {
      scene: 'title',
      cls: 'full',
      history: false,
      mount: function (root) {
        const UI = DD.UI, el = UI.el;
        timers = [];
        const hasScene = !DD.headless && !!DD.Render && typeof DD.Render.getScene === 'function' && DD.Render.getScene() === 'title' &&
          (typeof DD.Render.isRunning !== 'function' || DD.Render.isRunning());
        root.classList.toggle('with-scene', !!hasScene);
        root.appendChild(el('div.title-backdrop', null, el('div.tb-glow'), el('div.tb-beams'), el('div.tb-vignette')));
        const embers = el('div.embers');
        for (let i = 0; i < 26; i++) {
          const r = Math.random;
          embers.appendChild(el('span.ember', { style: {
            left: (r() * 100).toFixed(1) + '%', animationDuration: (7 + r() * 9).toFixed(1) + 's', animationDelay: (-r() * 12).toFixed(1) + 's',
            width: (2 + r() * 3.5).toFixed(1) + 'px', height: (2 + r() * 3.5).toFixed(1) + 'px', '--drift': ((r() - 0.5) * 160).toFixed(0) + 'px',
          } }));
        }
        root.appendChild(embers);

        const wrap = el('div.title-wrap');
        const logo = el('div.logo', null,
          el('div.logo-glow'),
          el('div.logo-line.logo-top', null, 'Dungeons'),
          el('div.logo-amp', { html: D20_SVG, title: 'Natural 20' }),
          el('div.logo-line.logo-bottom', null, 'Degenerates'));
        wrap.appendChild(logo);
        const tagline = el('div.tagline', null, '“' + TAGLINES[0] + '”');
        wrap.appendChild(tagline);
        let ti = Math.floor(Math.random() * TAGLINES.length);
        tagline.textContent = '“' + TAGLINES[ti] + '”';
        every(function () {
          tagline.classList.add('swap');
          later(function () {
            ti = (ti + 1) % TAGLINES.length;
            tagline.textContent = '“' + TAGLINES[ti] + '”';
            tagline.classList.remove('swap');
          }, 420);
        }, 6500);

        const menu = el('nav.title-menu');
        function item(label, sub, fn, cls, key) {
          const b = UI.button(label, fn, { cls: 'menu-item ' + (cls || ''), sub: sub, hoverSound: true, hotkey: key, showKey: false });
          menu.appendChild(b);
          return b;
        }
        const cont = runSummary();
        if (cont) item('Continue Campaign', cont.text, continueRun, 'primary', 'c');
        item('New Campaign', 'Session Zero awaits. Bring snacks.', startNew, cont ? '' : 'primary', 'n');
        item('Hall of Fame', 'Your many glorious failures, archived.', function () { UI.show('hall', { back: 'title' }); }, '', 'h');
        item('Settings', 'Knobs, sliders and one very special toggle.', function () { UI.show('settings', { back: 'title' }); }, '', 's');
        item('Credits', 'Blame these people.', showCredits, '', null);
        wrap.appendChild(menu);
        root.appendChild(wrap);

        const tip = UI.narrate('tips', {}, TIP_FALLBACK);
        if (tip) root.appendChild(el('div.title-tip', null, el('span.tip-label', null, 'Tip'), el('span', null, tip)));
        const meta = UI.meta();
        const runs = meta && meta.stats ? meta.stats.runs || 0 : 0;
        root.appendChild(el('div.title-foot', null,
          el('span', null, 'v' + DD.VERSION),
          el('span', null, runs ? 'Campaigns attempted: ' + runs : 'Not affiliated with any actual dragons.')));
      },
      unmount: function () {
        timers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
        timers = [];
      },
    });
  });
})();
