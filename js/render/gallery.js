/* Dungeons and Degenerates — js/render/gallery.js
 * Debug sprite gallery (UI screen 'gallery'): every registered hero / summon / enemy sprite in a labelled grid with
 * animated poses and portraits, a single sprite in detail, or the SpriteSpec option sheets (DD.Sprites.samples).
 * Draws on its own canvas so content authors can screenshot sprites:
 *   tools/shot.sh "debug=1&screen=gallery&gallery=<filter>" .tmp/x.png 1600x900
 *   filter: heroes | summons | enemies | bosses | act1 | act2 | act3 | all | objects | specs | specs:<group> | <id>[,<id>...]
 * DD.Gallery.draw(view) also renders into the world renderer's 'gallery' scene when the screen isn't mounted.
 */
(function () {
  'use strict';
  const DD = window.DD;
  const TAU = Math.PI * 2;

  const G = (DD.Gallery = {
    which: 'all',
    scroll: 0,
    mounted: null,    // { wrap, canvas, raf, onWheel, onClick, onMove }
    hits: [],         // clickable regions from the last frame: { x, y, w, h, fn }
    hover: null,
  });

  const BG = '#140d12', PANEL = '#221722', PANEL2 = '#2b1d2b', GOLD = '#d4af37', INK = '#f1e3c4', DIM = '#a8968f';
  const TABS = [['heroes', 'Heroes'], ['summons', 'Summons'], ['enemies', 'Enemies'], ['bosses', 'Bosses'], ['objects', 'Objects'], ['specs', 'Spec options'], ['all', 'All']];
  const STATUS_DEMO = ['frozen', 'poison', 'burn', 'stealth', 'sheep', 'stun', 'sleep', 'charmed'];

  function num(v, fb) { return typeof v === 'number' && isFinite(v) ? v : fb; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function list(bag) { const out = []; for (const k in bag) out.push(bag[k]); return out; }

  // ---- what to show -----------------------------------------------------------------------------------------------
  function defItem(def, kind) {
    const sub = kind === 'hero' ? (def.race || '') + ' ' + (def.cls || '') :
      kind === 'summon' ? 'summon' : 'act ' + def.act + ' · ' + def.tier;
    return { id: def.id, label: def.name || def.id, sub: sub.trim(), spec: def.sprite, def: def, kind: kind,
      flying: !!(def.flags && def.flags.flying), color: def.color || null };
  }
  function enemySort(a, b) {
    const tiers = { minion: 0, normal: 1, elite: 2, boss: 3 };
    return (num(a.act, 9) - num(b.act, 9)) || ((tiers[a.tier] || 0) - (tiers[b.tier] || 0)) || String(a.id).localeCompare(String(b.id));
  }
  function heroes() { return list(DD.defs.heroes).map(function (d) { return defItem(d, 'hero'); }); }
  function summons() { return list(DD.defs.summons).map(function (d) { return defItem(d, 'summon'); }); }
  function enemies(filter) { return list(DD.defs.enemies).filter(filter || function () { return true; }).sort(enemySort).map(function (d) { return defItem(d, 'enemy'); }); }
  function sampleItems(group) {
    const S = DD.Sprites;
    return (S && S.samples ? S.samples : []).filter(function (s) { return !group || s.group === group; })
      .map(function (s) { return { id: s.id, label: s.label, sub: s.group, spec: s.spec, kind: 'sample', flying: !!s.spec.hover }; });
  }
  function objectItems() {
    return list(DD.defs.objects).map(function (d) { return { id: d.id, label: d.name || d.id, sub: 'object', obj: d, kind: 'object' }; });
  }
  function findDef(id) {
    if (DD.defs.heroes[id]) return defItem(DD.defs.heroes[id], 'hero');
    if (DD.defs.summons[id]) return defItem(DD.defs.summons[id], 'summon');
    if (DD.defs.enemies[id]) return defItem(DD.defs.enemies[id], 'enemy');
    const S = DD.Sprites, sm = S && S.samples ? S.samples.filter(function (s) { return s.id === id; })[0] : null;
    return sm ? { id: sm.id, label: sm.label, sub: sm.group, spec: sm.spec, kind: 'sample', flying: !!sm.spec.hover } : null;
  }

  /** { title, mode: 'grid'|'detail'|'empty', sections: [{ title, items }] } for a filter string (comma lists merge). */
  function resolve(which) {
    which = String(which || 'all').trim() || 'all';
    const parts = which.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length < 2) return resolveOne(which);
    const res = parts.map(resolveOne), sections = [], picked = [];
    let compact = true;
    res.forEach(function (r) {
      if (r.mode === 'detail') { picked.push(r.item); compact = false; }
      else if (r.mode === 'grid') { Array.prototype.push.apply(sections, r.sections); compact = compact && !!r.compact; }
    });
    if (picked.length) sections.unshift({ title: 'Selection', items: picked });
    if (!sections.length) return { title: 'Nothing matches "' + which + '"', mode: 'empty', sections: [] };
    return { title: parts.join(' + '), mode: 'grid', compact: compact, sections: sections };
  }

  function resolveOne(which) {
    const low = which.toLowerCase();
    const sec = function (title, items) { return items.length ? [{ title: title, items: items }] : []; };
    switch (low) {
      case 'heroes': return { title: 'Heroes', mode: 'grid', sections: sec('Heroes', heroes()) };
      case 'summons': return { title: 'Summons', mode: 'grid', sections: sec('Summons', summons()) };
      case 'enemies': return { title: 'Enemies', mode: 'grid', sections: [1, 2, 3].reduce(function (acc, a) {
        return acc.concat(sec('Act ' + a, enemies(function (d) { return d.act === a; })));
      }, []).concat(sec('Other', enemies(function (d) { return d.act !== 1 && d.act !== 2 && d.act !== 3; }))) };
      case 'bosses': return { title: 'Bosses', mode: 'grid', sections: sec('Bosses', enemies(function (d) { return d.tier === 'boss'; })) };
      case 'act1': case 'act2': case 'act3': {
        const a = +low.slice(3);
        return { title: 'Act ' + a, mode: 'grid', sections: sec('Act ' + a + ' enemies', enemies(function (d) { return d.act === a; })) };
      }
      case 'objects': return { title: 'Objects', mode: 'grid', sections: sec('Objects', objectItems()) };
      case 'specs': {
        const S = DD.Sprites, groups = S && S.sampleGroups ? S.sampleGroups : [];
        return { title: 'Spec options', mode: 'grid', compact: true, sections: groups.reduce(function (acc, g) { return acc.concat(sec(g, sampleItems(g))); }, []) };
      }
      case 'all': return { title: 'All sprites', mode: 'grid', sections: sec('Heroes', heroes()).concat(sec('Summons', summons()))
        .concat(sec('Enemies', enemies(function (d) { return d.tier !== 'boss'; }))).concat(sec('Bosses', enemies(function (d) { return d.tier === 'boss'; }))) };
      default: break;
    }
    if (low.indexOf('specs:') === 0) {
      const g = which.slice(6);
      return { title: 'Spec options — ' + g, mode: 'grid', compact: true, sections: sec(g, sampleItems(g)) };
    }
    const ids = which.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    const items = ids.map(findDef).filter(Boolean);
    if (items.length === 1) return { title: items[0].label, mode: 'detail', item: items[0], sections: [] };
    if (items.length) return { title: ids.join(', '), mode: 'grid', sections: [{ title: 'Selection', items: items }] };
    return { title: 'Nothing matches "' + which + '"', mode: 'empty', sections: [] };
  }

  // ---- painting helpers --------------------------------------------------------------------------------------------
  function pedestal(c, x, y, z, tint) {
    const hw = 30 * z, hh = 15 * z, d = 5 * z;
    c.beginPath(); c.moveTo(x - hw, y); c.lineTo(x, y + hh); c.lineTo(x, y + hh + d); c.lineTo(x - hw, y + d); c.closePath();
    c.fillStyle = '#2c2330'; c.fill();
    c.beginPath(); c.moveTo(x + hw, y); c.lineTo(x, y + hh); c.lineTo(x, y + hh + d); c.lineTo(x + hw, y + d); c.closePath();
    c.fillStyle = '#211a25'; c.fill();
    c.beginPath(); c.moveTo(x, y - hh); c.lineTo(x + hw, y); c.lineTo(x, y + hh); c.lineTo(x - hw, y); c.closePath();
    c.fillStyle = tint || '#4a3d50'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1; c.stroke();
  }
  function text(c, s, x, y, size, color, align, weight) {
    c.font = (weight || 'bold') + ' ' + size + 'px "Trebuchet MS", Verdana, sans-serif';
    c.textAlign = align || 'left'; c.textBaseline = 'middle';
    c.fillStyle = color || INK;
    c.fillText(String(s), x, y);
  }
  function fitText(c, s, maxW) {
    s = String(s);
    if (c.measureText(s).width <= maxW) return s;
    while (s.length > 1 && c.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  function panel(c, x, y, w, h, hot) {
    c.beginPath();
    const r = 8;
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
    c.fillStyle = hot ? PANEL2 : PANEL; c.fill();
    c.strokeStyle = hot ? GOLD : 'rgba(212,175,55,0.25)'; c.lineWidth = hot ? 2 : 1; c.stroke();
  }
  /** Loop: idle -> attack swing -> idle; returns { pose, poseT } for time t. */
  function attackLoop(t, phase) {
    const k = ((t + phase) % 1.6) / 1.6;
    return k < 0.45 ? { pose: 'attack', poseT: k / 0.45 } : { pose: 'idle' };
  }
  function sprite(c, item, x, y, z, t, o) {
    const S = DD.Sprites;
    if (!S) return;
    o = o || {};
    if (o.shadow !== false) S.drawShadow(c, item.spec || S.PLACEHOLDER, x, y, z, 0.3);
    S.draw(c, item.spec || S.PLACEHOLDER, x, y, z, Object.assign({ t: t, id: item.id, hover: item.flying ? true : undefined, phase: o.phase || 0 }, o));
  }
  function objectThumb(c, item, x, y, z, t) {
    const d = item.obj, S = DD.Sprites;
    // the world renderer's own object painters when available (real in-game art), else a simple block / def.draw
    if (DD.Render && typeof DD.Render.drawTileAt === 'function' && !G.renderObjectsBroken) {
      let ok = false;
      DD.safe('Render.drawTileAt (gallery)', function () { DD.Render.drawTileAt(c, 'stone', x, y, z, { h: 0.2, obj: d.id, t: t }); ok = true; });
      if (ok) return;
      G.renderObjectsBroken = true;
    }
    pedestal(c, x, y, z);
    if (d && typeof d.draw === 'function' && S && S.paint) {
      const inst = { id: d.id, hp: d.hp, maxHp: d.hp, data: {} };
      S.paint(c, x, y, z, function (g) { d.draw(g, inst, t); }, d.palette || null, t);
      return;
    }
    const h = num(d && d.height, 0.8) * 32 * z, hw = 20 * z, hh = 10 * z;
    const cols = d && d.colors ? d.colors : null;
    const top = (cols && cols.top) || (d && d.color) || '#8a7a68';
    const left = (cols && cols.left) || DD.util.shade(top, -0.25), right = (cols && cols.right) || DD.util.shade(top, -0.4);
    c.beginPath(); c.moveTo(x - hw, y - h); c.lineTo(x, y + hh - h); c.lineTo(x, y + hh); c.lineTo(x - hw, y); c.closePath(); c.fillStyle = left; c.fill();
    c.beginPath(); c.moveTo(x + hw, y - h); c.lineTo(x, y + hh - h); c.lineTo(x, y + hh); c.lineTo(x + hw, y); c.closePath(); c.fillStyle = right; c.fill();
    c.beginPath(); c.moveTo(x, y - hh - h); c.lineTo(x + hw, y - h); c.lineTo(x, y + hh - h); c.lineTo(x - hw, y - h); c.closePath(); c.fillStyle = top; c.fill();
    c.strokeStyle = 'rgba(26,16,20,0.9)'; c.lineWidth = 1.5; c.stroke();
  }

  // ---- header ---------------------------------------------------------------------------------------------------
  function drawHeader(c, W, info, t, interactive) {
    c.fillStyle = 'rgba(20,13,18,0.97)'; c.fillRect(0, 0, W, 66);
    c.fillStyle = 'rgba(212,175,55,0.5)'; c.fillRect(0, 65, W, 1);
    text(c, 'Sprite Gallery', 16, 20, 19, GOLD);
    let n = 0;
    for (let i = 0; i < info.sections.length; i++) n += info.sections[i].items.length;
    c.font = 'bold 13px "Trebuchet MS", Verdana, sans-serif';
    text(c, fitText(c, info.title + (info.mode === 'grid' ? ' (' + n + ')' : ''), 190), 16, 45, 13, INK);
    let x = 220;
    for (let i = 0; i < TABS.length; i++) {
      const key = TABS[i][0], label = TABS[i][1];
      c.font = 'bold 13px "Trebuchet MS", Verdana, sans-serif';
      const w = c.measureText(label).width + 22;
      if (x + w > W - 110) break;
      const active = G.which.toLowerCase() === key || (key === 'specs' && G.which.toLowerCase().indexOf('specs') === 0);
      const hot = interactive && G.hover && G.hover.x >= x && G.hover.x <= x + w && G.hover.y >= 10 && G.hover.y <= 36;
      panel(c, x, 10, w, 26, active || hot);
      text(c, label, x + w / 2, 23, 13, active ? GOLD : INK, 'center');
      if (interactive) G.hits.push({ x: x, y: 10, w: w, h: 26, fn: setWhich.bind(null, key) });
      x += w + 6;
    }
    text(c, 'gallery=heroes|summons|enemies|bosses|act1-3|objects|specs|specs:<group>|<id> · click a sprite for details · wheel scrolls · Esc back',
      220, 51, 11, DIM, 'left', 'normal');
    if (interactive && DD.UI && DD.UI.show) {
      const bx = W - 96;
      panel(c, bx, 10, 82, 26, G.hover && G.hover.x >= bx && G.hover.y <= 36 && G.hover.y >= 10);
      text(c, '✕ Title', bx + 41, 23, 13, INK, 'center');
      G.hits.push({ x: bx, y: 10, w: 82, h: 26, fn: function () { DD.UI.show('title'); } });
    }
  }

  // ---- grid ----------------------------------------------------------------------------------------------------
  function layoutGrid(info, W, H) {
    const compact = !!info.compact;
    const cw0 = compact ? 128 : 206, ch0 = compact ? 148 : 236, sh0 = 30;
    const measure = function (k) {
      const cols = Math.max(1, Math.floor((W - 24) / (cw0 * k)));
      let h = 0;
      for (let i = 0; i < info.sections.length; i++) h += sh0 + Math.ceil(info.sections[i].items.length / cols) * ch0 * k;
      return { k: k, cols: cols, h: h };
    };
    // the biggest cards that fit one screen (handy for screenshots): grow on big windows, shrink a little on small
    // ones; if nothing fits, keep full size and scroll
    let m = null;
    for (let k = 1.4; k >= 0.7 && !m; k -= 0.04) {
      const t = measure(k);
      if (t.h <= H - 80) m = t;
    }
    if (!m) m = measure(1);
    return { k: m.k, cols: m.cols, cw: cw0 * m.k, ch: ch0 * m.k, sh: sh0, compact: compact, contentH: m.h };
  }

  function drawGrid(c, W, H, info, t, interactive) {
    const L = layoutGrid(info, W, H);
    G.maxScroll = Math.max(0, L.contentH - (H - 80));
    G.scroll = clamp(G.scroll, 0, G.maxScroll);
    let y = 74 - G.scroll;
    const x0 = Math.max(12, (W - L.cols * L.cw) / 2);
    for (let s = 0; s < info.sections.length; s++) {
      const sec = info.sections[s];
      if (y + L.sh > 66 && y < H) {
        text(c, sec.title, x0 + 4, y + 13, 15, GOLD);
        c.fillStyle = 'rgba(212,175,55,0.25)'; c.fillRect(x0 + 4, y + 24, L.cols * L.cw - 8, 1);
      }
      y += L.sh;
      for (let i = 0; i < sec.items.length; i++) {
        const cx = x0 + (i % L.cols) * L.cw, cy = y + Math.floor(i / L.cols) * L.ch;
        if (cy + L.ch < 66 || cy > H) continue;
        drawCell(c, sec.items[i], cx + 3, cy + 3, L.cw - 6, L.ch - 6, L, t, interactive, i);
      }
      y += Math.ceil(sec.items.length / L.cols) * L.ch;
    }
  }

  function portraitOf(item, size) {
    const S = DD.Sprites;
    if (!S || !S.portrait) return null;
    return S.portrait(item.def || item.spec || S.PLACEHOLDER, size);
  }

  function drawCell(c, item, x, y, w, h, L, t, interactive, idx) {
    const k = L.k;
    const hot = interactive && G.hover && G.hover.x >= x && G.hover.x <= x + w && G.hover.y >= y && G.hover.y <= y + h;
    panel(c, x, y, w, h, hot);
    if (interactive && item.kind !== 'object') G.hits.push({ x: x, y: y, w: w, h: h, fn: setWhich.bind(null, item.id) });
    const ph = idx * 0.77;
    c.save();
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.font = 'bold ' + Math.round(13 * Math.max(0.85, k)) + 'px "Trebuchet MS", Verdana, sans-serif';
    const ps = Math.round((L.compact ? 36 : 54) * Math.max(0.8, k));
    text(c, fitText(c, item.label, w - ps - 14), x + 8, y + 13 * Math.max(0.85, k), Math.round(13 * Math.max(0.85, k)), INK);
    c.font = 'normal ' + Math.round(11 * Math.max(0.85, k)) + 'px "Trebuchet MS", Verdana, sans-serif';
    text(c, fitText(c, item.sub || item.id, w - ps - 14), x + 8, y + 29 * Math.max(0.85, k), Math.round(11 * Math.max(0.85, k)), DIM, 'left', 'normal');
    if (item.kind === 'object') {
      objectThumb(c, item, x + w / 2, y + h * 0.66, 2 * k, t);
      c.restore();
      return;
    }
    const pc = portraitOf(item, ps);
    if (pc) c.drawImage(pc, x + w - ps - 5, y + 5, ps, ps);
    const S = DD.Sprites;
    const bd = spriteBounds(item);
    // the big sprite fits between the name rows and its feet (horns, hats, boss crowns and wide piles included)
    const fx = x + w / 2, fy = y + h * (L.compact ? 0.8 : 0.62);
    const roomUp = fy - (y + (L.compact ? 34 : 40) * Math.max(0.85, k)), roomX = w / 2 - 8;
    const big = clamp(Math.min((L.compact ? 2 : 2.25) * k, roomUp / Math.max(8, -bd.t), roomX / Math.max(6, -bd.l, bd.r)), 0.45, 4);
    pedestal(c, fx, fy, Math.min(big * 0.95, (w / 2 - 6) / 30));
    sprite(c, item, fx, fy, big, t, { phase: ph });
    if (L.compact) {
      const tz = clamp(Math.min(1, 30 / Math.max(8, -bd.t), 13 / Math.max(6, -bd.l, bd.r)), 0.35, 1);
      sprite(c, item, x + 16, y + h - 8, tz, t, { phase: ph, shadow: false });
    } else {
      // in-game sized pose strip, shrunk to its row for big monsters so the four poses never pile up
      const my = y + h - 10 * k, step = w / 5;
      const mz = clamp(Math.min(Math.max(1, k), (my - fy - 8 * big) / Math.max(8, -bd.t), step * 0.92 / Math.max(10, bd.w, -bd.t * 0.85)), 0.3, 1.5);
      const a = attackLoop(t, ph);
      sprite(c, item, x + step * 0.7, my, mz, t, { pose: a.pose, poseT: a.poseT, phase: ph });
      sprite(c, item, x + step * 1.85, my, mz, t, { pose: 'cast', phase: ph });
      sprite(c, item, x + step * 3.0, my, mz, t, { pose: 'hurt', phase: ph });
      sprite(c, item, x + step * 4.25, my, mz, t, { pose: 'downed', phase: ph, dizzy: true });
    }
    c.restore();
  }

  /** Painted extent { l, r, t, b, w, h } at zoom 1 (DD.Sprites.bounds), falling back to metrics. */
  function spriteBounds(item) {
    const S = DD.Sprites, spec = item.spec || S.PLACEHOLDER;
    if (typeof S.bounds === 'function') {
      const b = S.bounds(spec, !!item.flying);
      if (b && isFinite(b.t) && b.h > 0) return b;
    }
    const m = S.metrics(spec);
    return { l: -m.width * 0.6, r: m.width * 0.6, t: -m.height, b: 2, w: m.width * 1.2, h: m.height + 2 };
  }

  // ---- detail ----------------------------------------------------------------------------------------------------
  function drawDetail(c, W, H, item, t, interactive) {
    const S = DD.Sprites;
    const m = S.metrics(item.spec || S.PLACEHOLDER), bd = spriteBounds(item);
    const leftW = Math.min(420, W * 0.34);
    panel(c, 12, 76, leftW, H - 88, false);
    const bz = clamp(Math.min((H - 260) / Math.max(20, -bd.t + 10), (leftW / 2 - 14) / Math.max(10, -bd.l, bd.r)), 1.2, 6);
    const bx = 12 + leftW / 2, by = 76 + (H - 88) * 0.7;
    pedestal(c, bx, by, bz);
    sprite(c, item, bx, by, bz, t, {});
    text(c, item.label, 28, 100, 20, GOLD);
    text(c, item.id + ' · ' + item.kind + (item.sub ? ' · ' + item.sub : ''), 28, 124, 12, DIM, 'left', 'normal');
    const n = S._normalize(item.spec || S.PLACEHOLDER);
    text(c, 'base ' + n.base + ' · scale ' + n.scale + ' · ' + Math.round(m.height) + 'px tall at zoom 1', 28, 142, 12, DIM, 'left', 'normal');
    let sx = 28;
    for (const key in n.pal) {
      c.fillStyle = n.pal[key]; c.fillRect(sx, 156, 16, 16);
      c.strokeStyle = 'rgba(255,255,255,0.3)'; c.strokeRect(sx + 0.5, 156.5, 15, 15);
      sx += 20;
      if (sx > leftW - 10) break;
    }
    const rx = leftW + 28, rw = W - rx - 14;
    // pose / status rows: big sprites shrink so neighbours (and the lying "downed" pose) don't overlap
    const zp = clamp(Math.min(78 / Math.max(20, -bd.t), Math.min(rw / 7, 150) * 0.9 / Math.max(10, bd.w, -bd.t * 0.85)), 0.5, 2.6);
    let y = 84;
    const row = function (title, entries, z, rh) {
      panel(c, rx - 8, y, rw + 8, rh, false);
      text(c, title, rx + 4, y + 14, 13, GOLD);
      const step = Math.min(rw / entries.length, 150);
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i], ex = rx + step * (i + 0.5), ey = y + rh - 18;
        pedestal(c, ex, ey, Math.min(z * 0.85, step / 64));
        sprite(c, item, ex, ey, z, t, e.o);
        text(c, e.label, ex, y + rh - 4, 11, DIM, 'center', 'normal');
      }
      y += rh + 8;
    };
    const a = attackLoop(t, 0);
    const rh = Math.max(110, (Math.max(m.height, -bd.t) + 14) * zp + 46);
    row('Poses', [
      { label: 'idle', o: {} }, { label: 'attack', o: { pose: a.pose, poseT: a.poseT } }, { label: 'cast', o: { pose: 'cast' } },
      { label: 'hurt', o: { pose: 'hurt', flash: (t % 1.2) < 0.12 ? 1 : 0 } }, { label: 'downed', o: { pose: 'downed', dizzy: true } },
      { label: 'walk', o: { walk: t * 1.8 } }, { label: 'facing left', o: { facing: -1 } },
    ], zp, rh);
    row('Statuses', STATUS_DEMO.map(function (s) { return { label: s, o: { statuses: new Set([s]) } }; }), zp * 0.9, rh * 0.95);
    panel(c, rx - 8, y, rw + 8, 176, false);
    text(c, 'Portraits', rx + 4, y + 14, 13, GOLD);
    let px = rx + 4;
    const sizes = [128, 64, 40];
    for (let i = 0; i < sizes.length; i++) {
      const pc = portraitOf(item, sizes[i]);
      if (pc) c.drawImage(pc, px, y + 30, sizes[i], sizes[i]);
      text(c, sizes[i] + 'px', px + sizes[i] / 2, y + 30 + sizes[i] + 10, 11, DIM, 'center', 'normal');
      px += sizes[i] + 16;
    }
    const gp = S.portrait(item.def || item.spec, 64, { gray: true });
    if (gp) { c.drawImage(gp, px, y + 30, 64, 64); text(c, 'gray', px + 32, y + 104, 11, DIM, 'center', 'normal'); px += 80; }
    const ix = px + 30, iy = y + 120;
    text(c, 'In game (zoom 1)', ix + 40, y + 14, 13, GOLD, 'left');
    for (let gx = 0; gx < 3; gx++) for (let gy = 0; gy < 2; gy++) pedestal(c, ix + (gx - gy) * 32, iy + (gx + gy) * 16 - 16, 1, (gx + gy) % 2 ? '#4a3d50' : '#54465a');
    const ref = S.samples && S.samples.filter(function (s) { return s.id === 'builds:normal'; })[0];
    if (ref) sprite(c, { id: 'ref', spec: ref.spec, kind: 'sample' }, ix + 32, iy + 16 - 16, 1, t, { phase: 1.3 });
    sprite(c, item, ix + 64, iy + 32 - 16, 1, t, {});
    if (interactive) text(c, '◀ back (Esc)', W - 20, H - 16, 12, DIM, 'right', 'normal');
  }

  // ---- whole frame ------------------------------------------------------------------------------------------------
  function drawAll(c, W, H, t, interactive) {
    G.hits = [];
    c.fillStyle = BG; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W / 2, H * 0.4, 50, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(70,40,60,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (!DD.Sprites) {
      text(c, 'DD.Sprites is not loaded.', W / 2, H / 2, 18, INK, 'center');
      return;
    }
    const info = resolve(G.which);
    if (info.mode === 'detail') drawDetail(c, W, H, info.item, t, interactive);
    else if (info.mode === 'grid' && info.sections.length) drawGrid(c, W, H, info, t, interactive);
    else {
      text(c, info.mode === 'grid' ? 'No ' + info.title.toLowerCase() + ' registered yet.' : info.title, W / 2, H / 2 - 12, 18, INK, 'center');
      text(c, 'Try heroes, summons, enemies, bosses, act1-3, objects, specs, specs:<group> or a sprite id (add &fixtures=1 for test content).',
        W / 2, H / 2 + 16, 13, DIM, 'center', 'normal');
    }
    drawHeader(c, W, info, t, interactive);
  }

  function setWhich(w) {
    if (!w || w === G.which) return;
    G.prev = G.which;
    G.which = String(w);
    G.scroll = 0;
  }

  /** Render into an external view (the world renderer's 'gallery' scene) when the screen isn't mounted. */
  G.draw = function (view) {
    if (G.mounted || !view || !view.ctx) return;
    drawAll(view.ctx, num(view.width, 800), num(view.height, 600), num(view.t, 0), false);
  };
  G.resolve = resolve;
  /** Choose what to show (main.js calls this before showing the screen). */
  G.show = function (which) {
    if (which) { G.which = String(which); G.scroll = 0; }
    if (!(DD.UI && DD.UI.show) && !G.mounted && document.body) G.mount(document.body, { which: G.which });
  };

  // ---- screen (own canvas) ----------------------------------------------------------------------------------------
  // Headless Chrome (tools/shot.sh) runs on virtual time, which cannot advance while heavy canvas frames are back to
  // back; there a slow timer redraws instead of requestAnimationFrame. Browsers get rAF capped at ~30 fps.
  const HEADLESS = /HeadlessChrome/.test((window.navigator && navigator.userAgent) || '');
  function schedule(M) {
    if (HEADLESS) M.timer = window.setTimeout(frame, 250);
    else M.raf = window.requestAnimationFrame(frame);
  }
  function frame() {
    const M = G.mounted;
    if (!M) return;
    const now = window.performance ? performance.now() : Date.now();
    if (!HEADLESS && M.lastDraw && now - M.lastDraw < 30) { schedule(M); return; }
    M.lastDraw = now;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const W = Math.max(1, M.wrap.clientWidth || window.innerWidth), H = Math.max(1, M.wrap.clientHeight || window.innerHeight);
    if (M.canvas.width !== Math.round(W * dpr) || M.canvas.height !== Math.round(H * dpr)) {
      M.canvas.width = Math.round(W * dpr); M.canvas.height = Math.round(H * dpr);
    }
    const c = M.canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    let ok = false;
    DD.safe('Gallery frame', function () { drawAll(c, W, H, (window.performance ? performance.now() : Date.now()) / 1000, true); ok = true; });
    if (!ok) { G.broken = true; return; }
    schedule(M);
  }

  function localPoint(M, e) {
    const r = M.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  G.mount = function (root, params) {
    G.unmount();
    const p = params || {};
    G.which = String(p.which || p.gallery || (DD.params && DD.params.gallery) || G.which || 'all');
    G.scroll = 0;
    G.broken = false;
    const wrap = document.createElement('div');
    wrap.className = 'dd-gallery';
    Object.assign(wrap.style, { position: 'fixed', left: '0', top: '0', right: '0', bottom: '0', background: BG, zIndex: '5', pointerEvents: 'auto', overflow: 'hidden' });
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' });
    wrap.appendChild(canvas);
    (root || document.body).appendChild(wrap);
    const M = { wrap: wrap, canvas: canvas, raf: 0 };
    M.onWheel = function (e) { e.preventDefault(); G.scroll = clamp(G.scroll + e.deltaY, 0, G.maxScroll || 0); };
    M.onMove = function (e) { G.hover = localPoint(M, e); };
    M.onLeave = function () { G.hover = null; };
    M.onClick = function (e) {
      const pt = localPoint(M, e);
      for (let i = G.hits.length - 1; i >= 0; i--) {
        const h = G.hits[i];
        if (pt.x >= h.x && pt.x <= h.x + h.w && pt.y >= h.y && pt.y <= h.y + h.h) { DD.safe('Gallery click', h.fn); return; }
      }
    };
    canvas.addEventListener('wheel', M.onWheel, { passive: false });
    canvas.addEventListener('mousemove', M.onMove);
    canvas.addEventListener('mouseleave', M.onLeave);
    canvas.addEventListener('click', M.onClick);
    G.mounted = M;
    frame();
  };

  G.unmount = function () {
    const M = G.mounted;
    if (!M) return;
    if (M.raf) window.cancelAnimationFrame(M.raf);
    if (M.timer) window.clearTimeout(M.timer);
    M.canvas.removeEventListener('wheel', M.onWheel);
    M.canvas.removeEventListener('mousemove', M.onMove);
    M.canvas.removeEventListener('mouseleave', M.onLeave);
    M.canvas.removeEventListener('click', M.onClick);
    if (M.wrap.parentNode) M.wrap.parentNode.removeChild(M.wrap);
    G.mounted = null;
    G.hits = [];
  };

  /** Esc: from a single sprite go back to the previous grid, otherwise to the title screen. */
  function onKey(e) {
    const key = e && e.key;
    if (key === 'Escape' || key === 'Backspace') {
      const info = resolve(G.which);
      if (info.mode === 'detail') { G.which = G.prev && G.prev !== G.which ? G.prev : 'all'; G.scroll = 0; }
      else if (DD.UI && DD.UI.show) DD.UI.show('title');
      return true;
    }
    if (key === 'ArrowDown' || key === 'PageDown') { G.scroll = clamp(G.scroll + (key === 'PageDown' ? 400 : 80), 0, G.maxScroll || 0); return true; }
    if (key === 'ArrowUp' || key === 'PageUp') { G.scroll = clamp(G.scroll - (key === 'PageUp' ? 400 : 80), 0, G.maxScroll || 0); return true; }
    return false;
  }

  DD.afterLoad(function () {
    if (!DD.UI || typeof DD.UI.screen !== 'function') return;
    DD.UI.screen('gallery', { mount: G.mount, unmount: G.unmount, onKey: onKey, scene: 'none', history: false });
  });
})();
