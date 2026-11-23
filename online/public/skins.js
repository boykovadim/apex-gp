'use strict';
/* =====================================================================
   APEX GP · collectible liveries
   Every skin is the team's own car repainted pixel by pixel, so it works
   for all eleven cars. Skins are earned by driving: kilometres, finishes,
   wins, passes. Progress is kept on this device (S.st).
   Loaded before game.js; nothing here runs until the game calls it.
   ===================================================================== */
window.SKINS = (() => {
  const LIST = [
    { id: 0, n: 'Заводская', how: 'Родная ливрея команды', need: () => [1, 1] },
    { id: 1, n: 'Карбон', how: 'Финишируй в 3 гонках', need: st => [st.races, 3] },
    { id: 2, n: 'Хром', how: 'Проедь 100 км в гонках', need: st => [Math.floor(st.km), 100] },
    { id: 3, n: 'Золото', how: 'Выиграй 3 гонки', need: st => [st.wins, 3] },
    { id: 4, n: 'Неон', how: 'Соверши 25 обгонов', need: st => [st.passes, 25] },
    { id: 5, n: 'Ретро', how: 'Поднимись на подиум 5 раз', need: st => [st.pods, 5] },
    { id: 6, n: 'Кубики', how: 'Победи на сложности «Профи»', need: st => [st.pro, 1] },
    { id: 7, n: 'Шторм', how: 'Выиграй гонку в дождь', need: st => [st.wet, 1] },
  ];
  const cache = new Map(), sprC = new Map();
  const stats = () => S.st || (S.st = { km: 0, races: 0, wins: 0, pods: 0, passes: 0, pro: 0, wet: 0 });
  const has = id => { const s = LIST[id]; if (!s) return false; const [a, b] = s.need(stats()); return a >= b; };
  const mix = (a, b, t) => a + (b - a) * t, ramp = (stops, v) => { v = Math.max(0, Math.min(1, v)) * (stops.length - 1); const i = Math.min(stops.length - 2, v | 0), t = v - i; return [mix(stops[i][0], stops[i + 1][0], t), mix(stops[i][1], stops[i + 1][1], t), mix(stops[i][2], stops[i + 1][2], t)]; };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; };
  /* the team's car image, repainted */
  function pic(team, id) {
    const key = team + ':' + id; if (cache.has(key)) return cache.get(key);
    const t = TEAMS[team], src = t.pic; if (!src || !id) return null; let out = null;
    try {
      const W = src.width || src.naturalWidth, H = src.height || src.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(src, 0, 0);
      const d = g.getImageData(0, 0, W, H), p = d.data, ui = hex(t.ui), L = new Float32Array(W * H);
      for (let i = 0, q = 0; i < p.length; i += 4, q++) L[q] = (p[i] * .3 + p[i + 1] * .59 + p[i + 2] * .11) / 255;
      const GOLD = [[40, 26, 6], [150, 104, 18], [232, 184, 60], [255, 240, 190]], CHROME = [[18, 22, 30], [96, 108, 124], [196, 208, 222], [255, 255, 255]], STORM = [[10, 16, 30], [28, 60, 110], [80, 150, 220], [220, 240, 255]];
      if (id === 6) { // bricks: the car rebuilt from studded blocks
        const b = Math.max(6, Math.round(W / 13)), g2 = c.getContext('2d'); g2.clearRect(0, 0, W, H);
        for (let y = 0; y < H; y += b) for (let x = 0; x < W; x += b) { let r = 0, gg = 0, bl = 0, a = 0, n = 0; for (let v = y; v < Math.min(H, y + b); v += 2) for (let u = x; u < Math.min(W, x + b); u += 2) { const o = (v * W + u) * 4; if (p[o + 3] > 60) { r += p[o]; gg += p[o + 1]; bl += p[o + 2]; a++; } n++; }
          if (a < n * .45) continue; r /= a; gg /= a; bl /= a; const q = v => Math.round(v / 64) * 64, col = `rgb(${Math.min(255, q(r) + 10)},${Math.min(255, q(gg) + 10)},${Math.min(255, q(bl) + 10)})`;
          g2.fillStyle = col; g2.fillRect(x, y, b, b); g2.fillStyle = 'rgba(255,255,255,.28)'; g2.fillRect(x, y, b, 1.5); g2.fillRect(x, y, 1.5, b); g2.fillStyle = 'rgba(0,0,0,.3)'; g2.fillRect(x, y + b - 1.5, b, 1.5); g2.fillRect(x + b - 1.5, y, 1.5, b);
          g2.fillStyle = 'rgba(0,0,0,.22)'; g2.beginPath(); g2.arc(x + b / 2 + 1, y + b / 2 + 1, b * .28, 0, 7); g2.fill(); g2.fillStyle = col; g2.beginPath(); g2.arc(x + b / 2, y + b / 2, b * .28, 0, 7); g2.fill(); g2.fillStyle = 'rgba(255,255,255,.4)'; g2.beginPath(); g2.arc(x + b / 2 - b * .08, y + b / 2 - b * .08, b * .12, 0, 7); g2.fill(); }
        out = c;
      } else {
        for (let y = 0, q = 0; y < H; y++) for (let x = 0; x < W; x++, q++) { const i = q * 4; if (p[i + 3] < 8) continue; const l = L[q], sat = Math.max(p[i], p[i + 1], p[i + 2]) - Math.min(p[i], p[i + 1], p[i + 2]); let r, gg, b;
          const tyre = l < .13 && sat < 30; // leave the tyres and the shadows in the bodywork alone
          if (id === 1) { const w = ((x >> 1) + (y >> 1)) & 1 ? 7 : -5, v = 16 + l * 96 + w; r = v + ui[0] * .07; gg = v + ui[1] * .07; b = v + ui[2] * .07 + 4; if (sat > 110 && l > .35) { r = mix(r, ui[0], .55); gg = mix(gg, ui[1], .55); b = mix(b, ui[2], .55); } }
          else if (id === 2) { const s = .5 + .5 * Math.sin((y / H) * 9 + (x / W) * 3); [r, gg, b] = ramp(CHROME, Math.pow(l, .8) * .8 + s * .22); }
          else if (id === 3) { const s = .5 + .5 * Math.sin((y / H) * 7 - (x / W) * 4); [r, gg, b] = ramp(GOLD, Math.pow(l, .75) * .78 + s * .2); }
          else if (id === 4) { const e = Math.abs(l - (L[q + 2] || l)) + Math.abs(l - (L[q + W * 2] || l)); r = 10 + l * 26; gg = 12 + l * 30; b = 26 + l * 54; if (e > .1) { const k = Math.min(1, e * 4); r = mix(r, ui[0] * 1.15, k); gg = mix(gg, ui[1] * 1.15, k); b = mix(b, ui[2] * 1.15, k); } }
          else if (id === 5) { const mid = Math.abs(x / W - .5) < .1, v = 96 + l * 150; r = v; gg = v * .96; b = v * .82; if (mid) { r = mix(r, ui[0], .85); gg = mix(gg, ui[1], .85); b = mix(b, ui[2], .85); } else if (Math.abs(x / W - .5) < .135) { r = gg = b = 245; } }
          else { const s = .5 + .5 * Math.sin((x + y) / W * 10); [r, gg, b] = ramp(STORM, Math.pow(l, .8) * .75 + s * .2); if (((x * 3 + y) % 23) < 2) { r += 50; gg += 60; b += 60; } }
          if (tyre) { r = p[i]; gg = p[i + 1]; b = p[i + 2]; }
          p[i] = Math.max(0, Math.min(255, r)); p[i + 1] = Math.max(0, Math.min(255, gg)); p[i + 2] = Math.max(0, Math.min(255, b)); }
        g.putImageData(d, 0, 0); out = c;
      }
    } catch (e) { out = null; } // a picture opened straight from disk cannot be read back: the skin simply stays off
    cache.set(key, out); return out;
  }
  function art(g, team, id) { const im = pic(team, id); if (!im) return drawCarArt(g, team); const w = 52 * im.width / im.height; g.drawImage(im, -w / 2, -26, w, 52); }
  function spr(team, id) { // the in-race sprite, built the same way as the stock one
    if (!id) return SPR[team]; const key = team + ':' + id; if (sprC.has(key)) return sprC.get(key) || SPR[team];
    const im = pic(team, id); let s = null; if (im && SPR[team]) { const t = TEAMS[team], keep = t.pic, old = SPR[team]; try { t.pic = im; buildSprite(team); s = SPR[team]; } catch (e) { s = null; } t.pic = keep; SPR[team] = old; }
    if (TEAMS[team].pic) sprC.set(key, s); return s || SPR[team];
  }
  /* the garage row */
  function ui() {
    const box = document.getElementById('gSkins'); if (!box) return;
    box.innerHTML = LIST.map(s => `<button class="g-skin${s.id === GA.skin ? ' on' : ''}${has(s.id) ? '' : ' lock'}" data-s="${s.id}" title="${s.n}"><canvas width="52" height="76"></canvas></button>`).join('');
    box.querySelectorAll('canvas').forEach((cv, k) => { const g = cv.getContext('2d'); g.translate(26, 38); g.scale(1.3, 1.3); art(g, GA.i, k); });
    const note = id => { const s = LIST[id], [a, b] = s.need(stats()); document.getElementById('gSkinNote').textContent = s.n + ' · ' + s.how + (id && a < b ? ' · сейчас ' + Math.min(a, b) + ' из ' + b : id ? ' · открыта' : ''); };
    note(GA.skin);
    box.onclick = e => { const b = e.target.closest('button'); if (!b) return; const id = +b.dataset.s; note(id); GA.skin = id; ui(); note(id); if (!has(id)) toast('Предпросмотр · откроется: ' + LIST[id].how.toLowerCase()); };
  }
  /* after a race: count what was done, announce what it unlocked */
  function raceDone() {
    const me = G.cars[G.me]; if (!me || G.sess !== 'race' || G.statDone || !me.fin) return; G.statDone = true;
    const st = stats(), was = LIST.map(s => has(s.id)), pos = standings().indexOf(me) + 1, field = G.cars.length >= 6;
    st.races++; st.km += (parseFloat(G.track.def.km) || 5) * G.laps; st.passes += RP.moves.length;
    if (field && pos <= 3) st.pods++; if (field && pos === 1) { st.wins++; if (!G.net && S.diff === 2) st.pro++; if (G.h > 30 || G.wetRace) st.wet++; }
    saveS(); const got = LIST.filter(s => !was[s.id] && has(s.id)); if (got.length) setTimeout(() => toast('Открыта ливрея: ' + got.map(s => s.n).join(', ') + ' — загляни в гараж'), 1800);
  }
  return { LIST, has, art, spr, ui, raceDone, pick: () => has(GA.skin) ? GA.skin : 0, drop: () => { cache.clear(); sprC.clear(); } };
})();
