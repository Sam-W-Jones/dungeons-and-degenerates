/* Dungeons and Degenerates — tests/docs_tests.js (docs + tools owner)
 * The docs quote the game: DESIGN / ARCHITECTURE / v2-digest lines that the playtests caught drifting are checked
 * against the registered defs and DD.Balance, and the campaign sim's stall accounting (tests/sim/sim.js) is tested.
 * Docs are read with a synchronous file:// request (tools/test.sh runs Chrome with --allow-file-access-from-files);
 * a page that can't read them skips those suites. The checks only test what the docs CLAIM, so a content owner who
 * adds a skill or a key never fails here; one who changes a number the docs quote does (update the doc line).
 * Also the v2-digest §2 kit generator: tools/test.sh "suite=docs: v2-digest&kits=1&verbose=1" prints every kit line.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const T = window.DD_TEST;
  if (!T || !T.suite) return;

  // ---- reading the docs -------------------------------------------------------------------------------------------
  const cache = {};
  /** A project file's text, or null when this page can't read files. */
  function readFile(path) {
    if (Object.prototype.hasOwnProperty.call(cache, path)) return cache[path];
    let text = null;
    try {
      const x = new XMLHttpRequest();
      x.open('GET', (window.DD_BASE || '../') + path, false);
      if (x.overrideMimeType) x.overrideMimeType('text/plain; charset=utf-8');
      x.send();
      if ((x.status === 0 || x.status === 200) && x.responseText) text = x.responseText;
    } catch (e) { text = null; }
    cache[path] = text;
    return text;
  }
  /** The section that starts with the heading line `head` ('## 5.' / '### 4.2'), up to the next heading of its level. */
  function section(text, head) {
    const lines = String(text || '').split(/\r?\n/);
    const i = lines.findIndex(function (l) { return l.indexOf(head) === 0; });
    if (i < 0) return '';
    const level = /^#+/.exec(head)[0].length;
    let j = i + 1;
    for (; j < lines.length; j++) { const m = /^(#+) /.exec(lines[j]); if (m && m[1].length <= level) break; }
    return lines.slice(i, j).join('\n');
  }
  /** Whitespace folded to single spaces (doc lines wrap at 120 columns). */
  function flat(s) { return String(s || '').replace(/\s+/g, ' '); }
  /** The docs, or null (and the suite skips) when they can't be read here. */
  function docs(t, paths) {
    const out = {};
    for (let i = 0; i < paths.length; i++) {
      const s = readFile(paths[i]);
      if (!s) { t.skip('this page can\'t read ' + paths[i] + ' (run it through tools/test.sh)'); return null; }
      out[paths[i]] = s;
    }
    return out;
  }
  /** "1.15" / "0.9" / "1": a multiplier the way the docs print it after "×". */
  function mult(n) { return String(Math.round(n * 1000) / 1000); }
  /** A hero-side skill def by its display name (heroes, generic, summons; never an enemy's). */
  function heroSkillNamed(name) {
    const defs = DD.defs.skills || {};
    const ids = Object.keys(defs);
    for (let i = 0; i < ids.length; i++) {
      const d = defs[ids[i]];
      if (d && d.name === name && d.owner !== 'enemy' && !/^test_/.test(d.id)) return d;
    }
    return null;
  }

  // ---- the v2-digest §2 kit generator (it was .tmp/docs/kits.js; heroes-10: the cost reads the skill's own AP) -------
  const ORDER = ['zarathor', 'syllamin', 'marbles', 'marwyn', 'ellaria', 'josiah', 'sparrow', 'corelos', 'slate', 'buga',
    'kiri', 'betty', 'basanos', 'valdris', 'hjalmar', 'pebbles'];
  const SHE = { ellaria: 1, sparrow: 1, kiri: 1 };
  /** The three level descs merged: numbers that differ become a/b/c when the wording is the same. */
  function mergedDesc(def) {
    const n = Math.max(1, (def.levels || []).length);
    const d = [1, Math.min(2, n), Math.min(3, n)].map(function (lv) { return DD.skillDesc(def, lv, null); });
    if (d[0] === d[1] && d[1] === d[2]) return d[0];
    const skel = d.map(function (s) { return s.replace(/\d+(\.\d+)?/g, '#'); });
    if (skel[0] === skel[1] && skel[1] === skel[2]) {
      const nums = d.map(function (s) { return s.match(/\d+(\.\d+)?/g) || []; });
      let i = 0;
      return d[0].replace(/\d+(\.\d+)?/g, function () {
        const a = nums[0][i], b = nums[1][i], c = nums[2][i];
        i++;
        return a === b && b === c ? a : a + '/' + b + '/' + c;
      });
    }
    return d[0] + ' **III:** ' + d[2];
  }
  /**
   * The cost the engine charges, level I→III: the def's own `ap` / `hpCost` / `cooldown` / `charges` (numbers or
   * (L, user) => n, read the way DD.Combat.costOf / cooldownOf do). Never `levels[i].ap`: a level's `ap` is a number
   * the skill uses (Campaign Promise's AP granted), not what it costs.
   */
  function kitCost(def) {
    const n = Math.max(1, (def.levels || []).length);
    const L1 = DD.skillLevel(def, 1), L3 = DD.skillLevel(def, Math.min(3, n));
    function v(key, fb) {
      const a = DD.resolve(def[key], L1, null, fb), c = DD.resolve(def[key], L3, null, fb);
      if (a === undefined || a === null) return null;
      return a === c ? String(a) : a + '→' + c;
    }
    const parts = [];
    const ap = v('ap', def.owner === 'enemy' ? 0 : 1); if (ap !== null) parts.push(ap + ' AP');
    const hp = v('hpCost', 0); if (hp !== null && hp !== '0') parts.push(hp + ' HP');
    if (def.hype) parts.push(def.hype + ' Hype');
    const cd = v('cooldown', 0); if (cd !== null && cd !== '0') parts.push('cd ' + cd);
    const ch = v('charges', 0); if (ch !== null && ch !== '0') parts.push(ch + (ch === '1' ? ' charge' : ' charges'));
    return parts.join(', ');
  }
  function kitLine(def, tag) {
    if (!def) return '- (missing)';
    return '- **' + def.name + '** `' + def.id + '`' + (tag ? ' ' + tag : '') + ' (' + kitCost(def) + '): ' + mergedDesc(def).replace(/\s+/g, ' ');
  }
  /** Every hero's kit in the digest §2 format (the generator; print it with kits=1). */
  function kits() {
    const out = [];
    ORDER.forEach(function (id) {
      const h = DD.getHero(id);
      if (!h) { out.push('### ' + id + ' MISSING'); return; }
      const st = h.stats;
      out.push('### ' + h.name + (h.epithet ? ' ' + h.epithet : '') + ' (`' + id + '`, ' + (SHE[id] ? 'she/her' : 'he/him') + ')');
      out.push('*' + (h.role || '') + '* · ' + st.hp + ' HP (+' + ((h.growth && h.growth.hp) || 0) + '/lvl) · move ' + st.mov + ' · armor ' + (st.armor || 0) +
        ' · init ' + (st.init >= 0 ? '+' : '') + st.init +
        (h.flags && Object.keys(h.flags).length ? ' · flags ' + Object.keys(h.flags).filter(function (k) { return h.flags[k]; }).join(', ') : ''));
      if (h.passive) out.push('- *Passive* **' + h.passive.name + '**: ' + String(typeof h.passive.desc === 'function' ? DD.safe('kits passive desc', h.passive.desc, h.passive, [{}]) : h.passive.desc).replace(/\s+/g, ' '));
      out.push(kitLine(DD.getSkill(h.basic), '*(basic)*'));
      out.push(kitLine(DD.getSkill(h.signature), '*(signature)*'));
      h.skillPool.forEach(function (sid) { out.push(kitLine(DD.getSkill(sid), h.startingSkills.indexOf(sid) >= 0 ? '*(starter)*' : '')); });
      const items = Object.keys(DD.defs.items).map(function (k) { return DD.defs.items[k]; }).filter(function (it) { return it.hero === id; });
      out.push('- *Items*: ' + items.map(function (it) {
        return '**' + it.name + '** (' + it.rarity + ' ' + it.slot + '): ' + String(typeof it.desc === 'function' ? DD.safe('kits item desc', it.desc, it, [null]) : it.desc).replace(/\s+/g, ' ');
      }).join(' · '));
      out.push('');
    });
    return out;
  }
  /** The cost in parentheses on a skill's digest §2 line ("(0 AP, cd 3→2)" → "0 AP, cd 3→2"), or null. */
  function digestCost(digest, id) {
    const m = new RegExp('`' + id + '`(?: \\*\\([a-z]+\\)\\*)? \\(([^)]*)\\):').exec(digest);
    return m ? m[1] : null;
  }
  /** A skill's whole digest §2 line, or ''. */
  function digestLine(digest, id) {
    const lines = String(digest).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) if (lines[i].indexOf('`' + id + '`') >= 0 && /^- \*\*/.test(lines[i])) return lines[i];
    return '';
  }

  // ---- DESIGN §4: the lead decisions D1-D4, wind-ups, flyers and loot ----------------------------------------------
  T.suite('docs: DESIGN §4 states lead decisions D1-D4 in the game\'s words (objects, swaps, Stealth, riders)', function (t) {
    const d = docs(t, ['docs/DESIGN.md', 'js/ui/combat_hud.js', 'js/engine/combat.js']);
    if (!d) return;
    const design = d['docs/DESIGN.md'], s42 = flat(section(design, '### 4.2')), s44 = flat(section(design, '### 4.4'));
    const hud = d['js/ui/combat_hud.js'], combat = d['js/engine/combat.js'];
    // D1: the game's rule words ("any single-target damage skill can break it": the HUD's 🔨 line)
    t.ok(hud.indexOf('any single-target damage skill can break it') >= 0, 'the HUD still says "any single-target damage skill can break it" (the words the docs quote)');
    t.ok(s42.toLowerCase().indexOf('any single-target damage skill can break it') >= 0, 'D1: DESIGN §4.2 says "any single-target damage skill can break it"');
    t.ok(/attack or spell/.test(s42), 'D1: DESIGN §4.2 says spells break things too, not only attacks');
    t.ok(!/same single-target attacks can be aimed/.test(s42), 'D1: the old attacks-only wording is gone');
    // D1 opt-outs: every skill DESIGN names as an opt-out really opts out (target.objects: false)
    const m = /their tooltips have no 🔨 line\): ([^.]+)\./.exec(s42);
    t.ok(!!m, 'D1: DESIGN §4.2 lists the opt-outs ("…their tooltips have no 🔨 line): A, B and C.")');
    if (m) {
      const names = m[1].replace(/\band Slate's\b/g, ',').replace(/\bSlate's\b/g, '').replace(/\band\b/g, ',').split(',')
        .map(function (s) { return s.trim(); }).filter(Boolean);
      t.ok(names.length >= 5, 'D1: ' + names.length + ' opt-outs named (' + names.join(' · ') + ')');
      names.forEach(function (n) {
        const def = heroSkillNamed(n);
        t.ok(!!def && def.target && def.target.objects === false, 'D1: "' + n + '" is a hero-side skill with target.objects: false');
      });
      const listed = {};
      names.forEach(function (n) { listed[n] = 1; });
      const unlisted = Object.keys(DD.defs.skills).map(function (k) { return DD.defs.skills[k]; }).filter(function (sd) {
        return sd.owner !== 'enemy' && !/^test_/.test(sd.id) && !/^test_/.test(sd.owner || '') && sd.target && sd.target.objects === false && !listed[sd.name];
      }).map(function (sd) { return sd.name; });
      // release gate (Nov 14): DESIGN names every opt-out the game has (Head Over Heels was missing)
      t.ok(!unlisted.length, 'D1: DESIGN §4.2 names every hero-side opt-out' + (unlisted.length ? ' (missing: ' + unlisted.join(', ') + ')' : ''));
    }
    // D2: immovable units start swaps, can't be swapped (the engine's refusal words)
    t.ok(combat.indexOf('can start a swap, you can\\\'t move') >= 0, 'the engine\'s refusal still reads "<name> is immovable: he can start a swap, you can\'t move him."');
    t.ok(s42.indexOf('Immovable units can start a swap but can\'t be swapped') >= 0, 'D2: DESIGN §4.2 says "Immovable units can start a swap but can\'t be swapped"');
    t.ok(s42.indexOf('Slate is immovable: he can start a swap, you can\'t move him.') >= 0, 'D2: DESIGN quotes the refusal');
    t.ok(s42.indexOf('swaps with nobody') < 0 && !/when the mover is [^.]*immovable/.test(s42), 'D2: no "Slate swaps with nobody" / "an immovable mover can\'t swap" left');
    // D3: attacking an object ends Stealth
    t.ok(s42.indexOf('Attacking an object ends Stealth exactly as attacking a unit does') >= 0, 'D3: DESIGN §4.2 says "Attacking an object ends Stealth exactly as attacking a unit does"');
    t.ok(/\| stealth \|[^|]*object/.test(s44), 'D3: the §4.4 stealth row says attacking an object breaks it too');
    // D4: no riders on objects; the use itself still counts
    t.ok(s42.indexOf('No riders on objects') >= 0 && /item, status or passive riders/.test(s42), 'D4: DESIGN §4.2 says item, status and passive riders don\'t fire on an object hit');
    t.ok(s42.indexOf('AP, cooldowns, charges and Hype for using a skill still count') >= 0, 'D4: …and that AP, cooldowns, charges and Hype for using a skill still count');
  });

  T.suite('docs: DESIGN wind-ups, Hoard Piles and Wet match the game (only bosses and a few elites wind up; flyers pocket loot)', function (t) {
    const d = docs(t, ['docs/DESIGN.md', 'js/ui/combat_hud.js']);
    if (!d) return;
    const design = d['docs/DESIGN.md'], all = flat(design);
    // text-tone-17: five elites wind up too (the HUD's Round tooltip words)
    const elites = Object.keys(DD.defs.enemies || {}).map(function (k) { return DD.defs.enemies[k]; }).filter(function (e) { return e.tier === 'elite'; });
    t.ok(elites.length > 0, 'elites are registered');
    t.ok(d['js/ui/combat_hud.js'].indexOf('Only bosses and a few elites wind up their biggest attacks') >= 0, 'the HUD says "Only bosses and a few elites wind up their biggest attacks"');
    t.ok(!/only bosses wind up/i.test(all) && !/only bosses' wind-ups/i.test(all), 'DESIGN never says "only bosses wind up" (the Mimic, Mama Owlbear, the dragon, the Death Knight and the Pit Fiend do too)');
    t.ok(all.indexOf('only bosses and a few elites wind up their biggest attacks') >= 0, 'DESIGN §1 uses the game\'s words');
    // review-open-14: the wind-up skew rule as built (AI.lastsToLanding)
    t.ok(typeof DD.AI.lastsToLanding === 'function' && typeof DD.AI.rollSkew === 'function', 'the engine rolls a wind-up\'s skew once and checks it lasts to the landing');
    t.ok(flat(section(design, '### 4.1')).indexOf('only if the Dazzle or Confuse lasts until the wind-up lands') >= 0, 'DESIGN §4.1 states the skew rule: the marked tiles move only if the Dazzle or Confuse lasts until the wind-up lands');
    // text-tone-1 / robustness-2: the Hoard Pile is loot now
    const hoard = DD.getObject('a3_hoard_pile');
    t.ok(!!hoard && hoard.loot === true, 'the Hoard Pile is flagged loot (flyers pocket it)');
    const s43 = flat(section(design, '### 4.3'));
    t.ok(s43.indexOf('still lacks') < 0 && s43.indexOf('Hoard Pile') >= 0, 'DESIGN §4.3 no longer calls the Hoard Pile an open request');
    // heroes-5: no hero kit cashes in Wet, so DESIGN names the payoffs that exist (items and consumables)
    t.ok(all.indexOf('soaks foes for lightning') < 0 && all.indexOf('Wet for lightning') < 0, 'DESIGN no longer promises a kit-side lightning payoff for Keg Stand / Healing Spring');
    [['con_thunder_jar', DD.getConsumable], ['con_frost_flask', DD.getConsumable], ['syl_electric_lute', DD.getItem]].forEach(function (p) {
      const def = p[1](p[0]);
      t.ok(!!def && all.indexOf(def.name.replace(/^The /, '')) >= 0, 'DESIGN names the Wet payoff ' + (def ? def.name : p[0]) + ' (it exists in the game)');
    });
    t.ok(!/Wet → lightning, oil/.test(all), 'the §6 combo list names the Wet payoffs instead of a bare "Wet → lightning"');
  });

  T.suite('docs: DESIGN quotes the shipped numbers (§5 balance rows, Rat King, gold; §6 Juice Box, Transform, Forge Armor)', function (t) {
    const d = docs(t, ['docs/DESIGN.md']);
    if (!d) return;
    const design = d['docs/DESIGN.md'], s5 = flat(section(design, '## 5.')), all = flat(design);
    const B = DD.Balance;
    t.ok(!!B, 'DD.Balance loaded');
    if (!B) return;
    // desc-sweep-8: the gold line
    const g = B.gold.fight;
    t.ok(s5.indexOf('Normal fight ' + g.normal[0] + '–' + g.normal[1]) >= 0 && s5.indexOf('elite ' + g.elite[0] + '–' + g.elite[1]) >= 0 &&
      s5.indexOf('boss ' + g.boss[0] + '–' + g.boss[1]) >= 0, '§5 gold: normal ' + g.normal.join('–') + ', elite ' + g.elite.join('–') + ', boss ' + g.boss.join('–'));
    if (!B.gold.fightPerAct.normal) t.ok(s5.indexOf('/act)') < 0 && s5.indexOf('no per-act growth') >= 0, '§5 gold: no per-act growth (fightPerAct 0)');
    t.ok(s5.indexOf('Gold: start ' + B.gold.start + '.') >= 0, '§5 gold: start ' + B.gold.start);
    // audit-6: act rows, encounter rows, difficulty rows
    const a1 = B.act[1];
    t.ok(s5.indexOf('regular fights ×' + mult(a1.normal.hp) + ' HP / ×' + mult(a1.normal.dmg) + ' damage') >= 0 &&
      s5.indexOf('elites ×' + mult(a1.elite.hp) + ' HP / ×' + mult(a1.elite.dmg) + ' damage') >= 0 &&
      s5.indexOf('bosses ×' + mult(a1.boss.hp) + ' HP / ×' + mult(a1.boss.dmg) + ' damage') >= 0, '§5 states act 1\'s rows as DD.Balance.act[1] has them');
    const enc = B.encounters;
    [['boss_lichtenstein', 'Lich-tenstein'], ['boss_dr_iris', 'Dr. Iris'], ['boss_dm', 'the Dungeon Master']].forEach(function (p) {
      const e = enc[p[0]];
      t.ok(!!e && s5.indexOf(p[1] + ' ×' + mult(e.hp) + ' HP / ×' + mult(e.dmg) + ' damage') >= 0, '§5: ' + p[1] + ' ×' + (e && mult(e.hp)) + ' HP / ×' + (e && mult(e.dmg)) + ' damage');
    });
    const rk = enc.boss_rat_king, king = DD.getEnemy('rat_king');
    t.ok(!!rk && !rk.dmg && s5.indexOf('the Rat King ×' + mult(rk.hp) + ' HP, damage unchanged') >= 0, '§5: the Rat King ×' + (rk && mult(rk.hp)) + ' HP, damage unchanged');
    if (king && rk) {
      const sc = B.scale('normal', 1, 'boss', { encounter: 'boss_rat_king' });
      const hp = Math.max(1, Math.round(king.hp * sc.hp * B.tierHpOf('boss')));
      t.ok(s5.indexOf('he has ' + hp + ' HP in a campaign') >= 0, '§5: the Rat King has ' + hp + ' HP in a campaign (' + king.hp + ' × ' + sc.hp + ')');
      t.ok(flat(section(design, '## 9.')).indexOf(hp + ' in a campaign') >= 0, '§9: the Rat King\'s brief gives the campaign HP too');
    }
    const cas = B.difficulty.casual, bru = B.difficulty.brutal;
    t.ok(s5.indexOf('Casual ×' + mult(cas.hp) + ' HP / ×' + mult(cas.dmg) + ' damage') >= 0, '§5: Casual ×' + mult(cas.hp) + ' / ×' + mult(cas.dmg));
    t.ok(s5.indexOf('Brutal ×' + mult(bru.hp) + ' HP / ×' + mult(bru.dmg) + ' damage') >= 0, '§5: Brutal ×' + mult(bru.hp) + ' / ×' + mult(bru.dmg));
    if (B.extraEnemies.brutal.normal === 1) t.ok(s5.indexOf('plus one extra enemy in every regular fight') >= 0, '§5: brutal adds one extra enemy to every regular fight');
    t.ok(!/HP ×1\.25/.test(all) && !/80–100/.test(all), 'no stale brutal ×1.25 row or 80–100 boss gold left in DESIGN');
    // desc-sweep-8: §6 briefs
    const jb = DD.getSkill('spa_juicebox');
    if (jb) t.ok(all.indexOf('Box* (drain a foe within ' + jb.target.range[1] + ':') >= 0, '§6 Sparrow: Juice Box drains a foe within ' + jb.target.range[1]);
    const tf = DD.getSkill('bas_transform');
    if (tf) {
      const mend = tf.levels.map(function (L) { return L.mend; });
      t.ok(all.indexOf('heals him ' + mend[0] + '–' + mend[mend.length - 1] + ' HP') >= 0, '§6 Basanos: Transform heals him ' + mend[0] + '–' + mend[mend.length - 1] + ' HP');
    }
    // text-tone-25: the skill is spelled the way the game spells it
    const fa = DD.getSkill('val_forge_armour');
    if (fa) t.ok(all.indexOf('*' + fa.name + '*') >= 0 && all.indexOf('Forge Armour') < 0, '§6 Valdris: *' + fa.name + '* (no "Forge Armour")');
    // release gate (Nov 14): the finish run's Slate move and Short Fuse wording, and the DM's mercy rule
    const slate = DD.getHero && DD.getHero('slate');
    if (slate) {
      const sl = flat(section(design, '### Slate the Unamused'));
      t.ok(sl.indexOf('move ' + slate.stats.mov) >= 0, '§6 Slate: move ' + slate.stats.mov + ' as registered');
      t.ok(sl.indexOf('gives him a buff status (Block doesn\'t count)') >= 0 && /gives him a buff status \(Block doesn't count\)/.test(slate.passive.desc),
        '§6 Slate: Short Fuse says Block doesn\'t count, as his passive does');
    }
    const dmFile = readFile('js/data/bosses/dm.js');
    if (dmFile && dmFile.indexOf('Fudged in Your Favour') >= 0) {
      t.ok(flat(section(design, '## 9.')).indexOf('*Fudged in Your Favour*') >= 0 && flat(section(design, '## 9.')).indexOf('75%+ of their HP straight to 0') >= 0,
        '§9 the DM: his mercy rule "Fudged in Your Favour" (75%+ HP never goes straight to 0)');
    }
  });

  // ---- v2-digest §2: the kit lines the playtests caught ------------------------------------------------------------
  T.suite('docs: v2-digest §2 kit lines quote the registered costs and numbers (the generator reads a skill\'s own AP)', function (t) {
    const d = docs(t, ['docs/notes/v2-digest.md']);
    if (!d) return;
    const digest = section(d['docs/notes/v2-digest.md'], '## 2.');
    t.ok(digest.length > 1000, 'the digest has its §2');
    // heroes-10: the generator read levels[].ap (AP granted) as the cost
    const promise = DD.getSkill('buga_promise');
    if (promise) {
      t.ok(promise.levels.some(function (L) { return L.ap > 0; }), 'Campaign Promise\'s levels carry the AP it grants');
      t.eq(kitCost(promise), '0 AP, cd 3→2', 'the generator prices Campaign Promise at its own AP (0), not the AP it grants');
    }
    // every skill whose levels carry an `ap` (the bug's class): the digest's cost is the generator's
    Object.keys(DD.defs.skills).map(function (k) { return DD.defs.skills[k]; }).filter(function (sd) {
      return sd.owner !== 'enemy' && !/^test_/.test(sd.id) && (sd.levels || []).some(function (L) { return L && L.ap !== undefined; });
    }).forEach(function (sd) {
      const c = digestCost(digest, sd.id);
      if (c === null) { t.log(sd.id + ' has no digest §2 line'); return; }
      t.eq(c, kitCost(sd), 'digest §2 ' + sd.name + ' costs what the engine charges');
    });
    // desc-sweep-8: Juice Box's reach, Transform's mend
    const jb = DD.getSkill('spa_juicebox');
    if (jb) t.ok(digestLine(digest, 'spa_juicebox').indexOf('Drain a foe within ' + jb.target.range[1] + ':') >= 0, 'digest §2 Juice Box: within ' + jb.target.range[1]);
    const tf = DD.getSkill('bas_transform');
    if (tf) {
      const mend = tf.levels.map(function (L) { return L.mend; }).join('/');
      t.ok(digestLine(digest, 'bas_transform').indexOf('heals you ' + mend + ' HP') >= 0, 'digest §2 Transform heals you ' + mend + ' HP');
    }
    const fa = DD.getSkill('val_forge_armour');
    if (fa) t.ok(digestLine(digest, 'val_forge_armour').indexOf('**' + fa.name + '**') >= 0 && digest.indexOf('Forge Armour') < 0, 'digest §2 spells ' + fa.name);
    // the generator itself (kits=1 prints it: tools/test.sh "suite=docs: v2-digest&kits=1&verbose=1")
    const lines = t.tryRun('kit generator', kits) || [];
    t.ok(lines.filter(function (l) { return /^### /.test(l); }).length === ORDER.length, 'the generator writes all ' + ORDER.length + ' kits');
    // one log entry per hero (the harness prints at most 60 entries)
    if (t.param('kits') === '1') lines.join('\n').split(/\n(?=### )/).forEach(function (block) { t.log(block); });
  });

  // ---- ARCHITECTURE §1-4: what changed in the finish run ------------------------------------------------------------
  T.suite('docs: ARCHITECTURE §1-4 match the code (ownership, D1 aiming, objects, narration keys, wind-up skew)', function (t) {
    const d = docs(t, ['docs/ARCHITECTURE.md', 'js/data/narrator.js']);
    if (!d) return;
    const arch = d['docs/ARCHITECTURE.md'];
    const s1 = flat(section(arch, '## 1.')), s32 = flat(section(arch, '### 3.2')), s37 = flat(section(arch, '### 3.7'));
    const s310 = flat(section(arch, '### 3.10')), s45 = flat(section(arch, '### 4.5'));
    t.ok(s1.indexOf('tests/docs_tests.js') >= 0, '§1 lists tests/docs_tests.js and its owner');
    t.ok(s1.indexOf('reserved in the manifest') < 0, '§1 no longer calls tests/balance_tests.js reserved (it ships)');
    // D1 as built (DD.Targeting.aimsAtObjects)
    t.ok(s32.indexOf('any single-target damage skill') >= 0 && s32.indexOf('objectDmg') >= 0 && s32.indexOf('ctx.objectDmg') >= 0, '§3.2 describes D1: any single-target damage skill, objectDmg, ctx.objectDmg');
    t.ok(s32.indexOf('forgetWarning') >= 0, '§3.2 documents forgetWarning (the level-up forget picker reads it)');
    t.ok(s37.indexOf('targetable: false') >= 0, '§3.7 documents an object\'s targetable: false');
    // narration keys the engine fires (actions.js) and their tokens (DD.Narrator.TOKENS)
    ['hero_downed_self', 'hero_downed_friendly', 'swap', 'opportunity', 'objective_failed'].forEach(function (k) {
      t.ok(s310.indexOf('`' + k + '`') >= 0 || s310.indexOf(k + ',') >= 0, '§3.10 lists the ' + k + ' key');
    });
    t.ok(/\{ally\}/.test(s310), '§3.10 lists the {ally} token (the swap key)');
    const tokens = (DD.Narrator && DD.Narrator.TOKENS) || {};
    if (tokens.swap) t.ok(tokens.swap.indexOf('ally') >= 0, 'the swap key fills {ally}');
    // the wind-up skew (AI.rollSkew)
    t.ok(s45.indexOf('skew') >= 0, '§4.5 documents intent.skew');
  });

  // ---- tools: the campaign sim (audit-4) -------------------------------------------------------------------------
  T.suite('tools: the campaign sim counts a round-cap fight as a stall, not a win (audit-4)', function (t) {
    const S = window.DD_SIM;
    t.ok(!!S && typeof S.recordFight === 'function', 'tests/sim/sim.js exposes its tallies (DD_SIM)');
    if (!S) return;
    t.eq(S.fightOutcome('victory', true), 'stall', 'a capped fight called a victory is a stall');
    t.eq(S.fightOutcome('defeat', true), 'stall', 'a capped fight called a defeat is a stall');
    t.eq(S.fightOutcome('victory', false), 'win', 'a real win is a win');
    t.eq(S.runOutcome(true, 1, false), 'stall', 'a run won after a stall hangs on the stall\'s call');
    t.eq(S.runOutcome(false, 1, false), 'loss', 'a run lost to a real fight after a stall is still a loss');
    t.eq(S.runOutcome(false, 1, true), 'stall', 'a run that ended on a stall (timeout=defeat) is a stall');
    const G = S.reset();
    const base = { act: 1, lost: 0.2, taken: 0.3, start: 1, lvl: 2, downs: 0, sigs: 0, hypeMax: 30, hype: {}, round: 5, healer: false };
    function fight(o) { return S.recordFight(Object.assign({}, base, o)); }
    // run 1: a regular win, then a boss fight that hits the cap and is called a victory, then the run "wins"
    S.startRun(['zarathor', 'slate', 'kiri', 'betty']);
    fight({ seed: 1, kind: 'normal', encId: 'enc_a', result: 'victory', timeout: false });
    t.eq(fight({ seed: 1, kind: 'boss', encId: 'boss_x', result: 'victory', timeout: true, round: 30, left: 'Syllamin 3/20, The Rat King 80/122' }), 'stall', 'recordFight returns stall');
    t.eq(S.finishRun({ seed: 1, party: ['zarathor', 'slate', 'kiri', 'betty'], won: true, stalls: 1, endedOnStall: false, act: 1, cleared: 1, lastEnc: 'boss_x' }), 'stall', 'run 1 is a stalled run');
    // run 2: a real loss to the same boss
    S.startRun(['zarathor', 'josiah', 'kiri', 'betty']);
    fight({ seed: 2, kind: 'normal', encId: 'enc_a', result: 'victory', timeout: false });
    fight({ seed: 2, kind: 'boss', encId: 'boss_x', result: 'defeat', timeout: false, healer: true });
    S.finishRun({ seed: 2, party: ['zarathor', 'josiah', 'kiri', 'betty'], won: false, stalls: 0, act: 1, lastEnc: 'boss_x' });
    // run 3: a clean win
    S.startRun(['zarathor', 'josiah', 'pebbles', 'betty']);
    fight({ seed: 3, kind: 'boss', encId: 'boss_x', result: 'victory', timeout: false, healer: true });
    S.finishRun({ seed: 3, party: ['zarathor', 'josiah', 'pebbles', 'betty'], won: true, stalls: 0, act: 1, cleared: 1, lastEnc: 'boss_x' });
    t.eq(G.enc.boss_x.wins, 1, 'the stalled boss fight is no win (1 real win of 3 fights)');
    t.eq(G.enc.boss_x.timeouts, 1, '…it is counted as a stall');
    t.eq(G.bossFights.boss_x.wins, 1, 'boss tally: 1 win');
    t.eq(G.kinds.boss.wins, 1, 'fight-kind tally: 1 win');
    t.eq(G.wins, 1, 'the campaign counts 1 win (run 3), not 2');
    t.eq(G.stalledRuns, 1, '1 stalled run');
    t.eq(G.lossTo.boss_x, 1, 'run 2 is a loss to boss_x');
    t.eq(G.heroes.slate.runs, 0, 'a stalled run counts in no hero\'s run-win share');
    t.eq(G.heroes.zarathor.runs, 2, '…the decided runs do');
    const txt = S.reportText([]);
    t.ok(/ · wins 1 \(50%,/.test(txt), 'header: 1 win of 2 decided runs (50%) — got: ' + txt.split('\n')[0]);
    t.ok(/stalled runs 1 \(in no win rate\)/.test(txt), 'header: stalled runs 1');
    t.ok(/boss fights: boss_x 1\/2 \(\+1 stalled\)/.test(txt), 'boss fights: boss_x 1/2 (+1 stalled)');
    t.ok(/without 0\/0 \(\+1 stalled\) \(-\)/.test(txt), 'healer split: the stalled fight is on neither side');
    t.ok(/a1 boss {3}boss_x {23}n {3}3 · win {2}50%/.test(txt), 'encounter line: n 3, win 50% (1 of 2 decided)');
    t.ok(/\n {2}boss {7}n {4}3 · win {2}50%/.test(txt), 'fight-kind line: n 3, win 50%');
    t.ok(/== stalls \(1 fights hit the round cap \d+/.test(txt) && txt.indexOf('seed 1 · a1 boss boss_x · round 30 · called a victory · standing: Syllamin 3/20, The Rat King 80/122') >= 0,
      'the stalls section lists the capped fight (seed, encounter, round, who was standing)');
    S.reset();
  });
})();
