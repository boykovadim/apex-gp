'use strict';
/* =====================================================================
   APEX GP · the cars, drawn in the game's own style
   Every car is painted from shapes (no photos): a 2026-shape chassis, then
   the team's livery on top, cel-shaded with a thin ink line so the cars sit
   in the same illustrated world as the circuits. The result is a picture
   used exactly like the old photo, so skins, menus and sprites all work.
   Loaded before game.js; nothing runs until the game calls it.
   ===================================================================== */
window.CARART = (() => {
  const PX = 20; // pixels per unit: the picture is about 520 × 1120 px
  /* livery: b body · sd sidepod top · sp spine and engine cover · n nose · nt nose tip · fw front wing · rw rear wing · ep end plates · fl floor edge
     ac: accent stripes [colour, kind…] · h helmet */
  const LV = {
    mercedes:    { b: '#17191c', sd: '#17191c', sp: '#c9cfd5', n: '#c9cfd5', nt: '#00d2be', fw: '#17191c', rw: '#17191c', ep: '#00d2be', h: '#c9cfd5', ac: [['#00d2be', 'pod'], ['#c9cfd5', 'cover']] },
    ferrari:     { b: '#d40000', sd: '#d40000', sp: '#d40000', n: '#d40000', nt: '#ffd400', fw: '#d40000', rw: '#b80000', ep: '#f4f4f4', h: '#ffd400', ac: [['#f4f4f4', 'line'], ['#111', 'inlet']] },
    redbull:     { b: '#1e2b5c', sd: '#1e2b5c', sp: '#1e2b5c', n: '#1e2b5c', nt: '#ffc906', fw: '#1e2b5c', rw: '#1e2b5c', ep: '#db0a40', h: '#1e2b5c', ac: [['#db0a40', 'bull'], ['#ffc906', 'sun']] },
    mclaren:     { b: '#ff8000', sd: '#1a1b1f', sp: '#ff8000', n: '#ff8000', nt: '#1a1b1f', fw: '#1a1b1f', rw: '#ff8000', ep: '#47c7fc', h: '#ff8000', ac: [['#47c7fc', 'tip'], ['#1a1b1f', 'pod']] },
    alpine:      { b: '#0a6be8', sd: '#0a2d6e', sp: '#0a6be8', n: '#0a6be8', nt: '#ff69b4', fw: '#0a6be8', rw: '#0a2d6e', ep: '#ff69b4', h: '#ff69b4', ac: [['#ff69b4', 'pod'], ['#ff69b4', 'line']] },
    racingbulls: { b: '#f2f2f2', sd: '#f2f2f2', sp: '#f2f2f2', n: '#f2f2f2', nt: '#e4002b', fw: '#1634cc', rw: '#f2f2f2', ep: '#1634cc', h: '#1634cc', ac: [['#1634cc', 'sweep'], ['#e4002b', 'inlet']] },
    audi:        { b: '#b9bec4', sd: '#141414', sp: '#b9bec4', n: '#b9bec4', nt: '#ff3b1f', fw: '#141414', rw: '#141414', ep: '#ff3b1f', h: '#ff3b1f', ac: [['#ff3b1f', 'band'], ['#141414', 'rear']] },
    haas:        { b: '#ededed', sd: '#1c1c1c', sp: '#ededed', n: '#ededed', nt: '#e6002b', fw: '#1c1c1c', rw: '#1c1c1c', ep: '#e6002b', h: '#ededed', ac: [['#e6002b', 'line'], ['#e6002b', 'tip']] },
    williams:    { b: '#1f5fd6', sd: '#0b1a3a', sp: '#1f5fd6', n: '#1f5fd6', nt: '#00a3e0', fw: '#0b1a3a', rw: '#0b1a3a', ep: '#00a3e0', h: '#1f5fd6', ac: [['#00a3e0', 'pod']] },
    astonmartin: { b: '#00594f', sd: '#00594f', sp: '#00594f', n: '#00594f', nt: '#cedc00', fw: '#00594f', rw: '#00473f', ep: '#cedc00', h: '#cedc00', ac: [['#cedc00', 'line'], ['#cedc00', 'tip']] },
    cadillac:    { b: '#121212', sd: '#121212', sp: '#f2f2f2', n: '#f2f2f2', nt: '#c9a24a', fw: '#121212', rw: '#121212', ep: '#c9a24a', h: '#f2f2f2', ac: [['#f2f2f2', 'split'], ['#c9a24a', 'line']] },
  };
  const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255; if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; } return `rgb(${r | 0},${g | 0},${b | 0})`; };
  const INK = 'rgba(8,9,12,.85)';
  // cel shading across the car: a lit left side, a flat middle, a shaded right side
  const cel = (g, col, x0, x1) => { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, shade(col, -.35)); gr.addColorStop(.12, shade(col, .2)); gr.addColorStop(.3, shade(col, .2)); gr.addColorStop(.31, col); gr.addColorStop(.7, col); gr.addColorStop(.71, shade(col, -.22)); gr.addColorStop(1, shade(col, -.42)); return gr; };
  const P = (g, pts, close = true) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); if (close) g.closePath(); };
  const mirrorX = pts => [...pts, ...pts.slice().reverse().map(p => [-p[0], p[1]])];
  const ink = (g, w) => { g.strokeStyle = INK; g.lineWidth = w || .32; g.lineJoin = 'round'; g.stroke(); };

  function tyre(g, x, y, w, h) {
    const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#0b0b0d'); gr.addColorStop(.35, '#34363b'); gr.addColorStop(.5, '#3f4147'); gr.addColorStop(.65, '#2a2c30'); gr.addColorStop(1, '#09090b');
    g.fillStyle = gr; rr(g, x, y, w, h, 1.4); g.fill(); ink(g, .28);
    g.fillStyle = 'rgba(255,255,255,.06)'; for (let k = 1; k < 6; k++) g.fillRect(x + .5, y + h * k / 6, w - 1, .22);
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  const BODY = 'M0,-12.4 C2.3,-12.4 3.3,-9.6 3.7,-6.6 C7.4,-6 8.5,-2.4 8.5,2.2 C8.5,8.2 6.4,12.4 3.9,16.4 L2.1,19.8 L-2.1,19.8 L-3.9,16.4 C-6.4,12.4 -8.5,8.2 -8.5,2.2 C-8.5,-2.4 -7.4,-6 -3.7,-6.6 C-3.3,-9.6 -2.3,-12.4 0,-12.4 Z';
  function paint(g, id) {
    const L = LV[id] || LV.mercedes, body = new Path2D(BODY);
    // suspension
    g.strokeStyle = '#141519'; g.lineWidth = .75; g.lineCap = 'round'; g.beginPath();
    for (const s of [-1, 1]) { g.moveTo(2.6 * s, -17.2); g.lineTo(9 * s, -15.6); g.moveTo(2.9 * s, -12.6); g.lineTo(9 * s, -14.3); g.moveTo(4.6 * s, 12.2); g.lineTo(8.6 * s, 14.4); g.moveTo(4.2 * s, 17.4); g.lineTo(8.6 * s, 16.6); }
    g.stroke();
    tyre(g, -13.5, -21.2, 4.8, 10); tyre(g, 8.7, -21.2, 4.8, 10); tyre(g, -14.4, 9.9, 6, 11.6); tyre(g, 8.4, 9.9, 6, 11.6);
    // floor and its edge
    P(g, mirrorX([[-3.6, -9.6], [-9.7, -3.4], [-9.9, 11.8], [-7.9, 19.4]])); g.fillStyle = '#121316'; g.fill(); ink(g, .3);
    g.strokeStyle = L.ep; g.globalAlpha = .55; g.lineWidth = .45; P(g, [[-9.5, -2.6], [-9.7, 11.6]], false); g.stroke(); P(g, [[9.5, -2.6], [9.7, 11.6]], false); g.stroke(); g.globalAlpha = 1;
    // rear wing: two elements, end plates
    g.fillStyle = cel(g, L.rw, -9.6, 9.6); rr(g, -9.6, 20, 19.2, 2.6, .8); g.fill(); ink(g);
    g.fillStyle = shade(L.rw, -.3); rr(g, -9.6, 22.9, 19.2, 1.7, .6); g.fill(); ink(g);
    g.fillStyle = L.ep; rr(g, -10.6, 19.2, 1.4, 6.2, .5); g.fill(); ink(g, .25); rr(g, 9.2, 19.2, 1.4, 6.2, .5); g.fill(); ink(g, .25);
    // nose
    P(g, [[-1.15, -26.4], [1.15, -26.4], [3.1, -10.4], [-3.1, -10.4]]); g.fillStyle = cel(g, L.n, -3.1, 3.1); g.fill(); ink(g);
    g.fillStyle = L.nt; P(g, [[-1.15, -26.5], [1.15, -26.5], [1.45, -23.6], [-1.45, -23.6]]); g.fill();
    // front wing: a wide main plane with a flap and end plates
    P(g, mirrorX([[-12.9, -23.6], [-12.7, -26.9], [-4, -27.7]])); g.fillStyle = cel(g, L.fw, -12.9, 12.9); g.fill(); ink(g);
    g.fillStyle = shade(L.fw, -.28); P(g, mirrorX([[-12.6, -23.8], [-12.4, -22.2], [-3.5, -21.6]])); g.fill(); ink(g, .25);
    g.fillStyle = L.ep; rr(g, -13.7, -27.4, 1.3, 4.6, .5); g.fill(); ink(g, .25); rr(g, 12.4, -27.4, 1.3, 4.6, .5); g.fill(); ink(g, .25);
    // body and sidepods
    g.fillStyle = cel(g, L.b, -8.5, 8.5); g.fill(body);
    g.save(); g.clip(body);
    if (L.sd !== L.b) { const pod = new Path2D('M8.6,-1 C6.8,-4.6 5,-6 3.4,-6.6 L3,4 C3.6,10 4.2,14 4.6,17 L8.6,9 Z M-8.6,-1 C-6.8,-4.6 -5,-6 -3.4,-6.6 L-3,4 C-3.6,10 -4.2,14 -4.6,17 L-8.6,9 Z'); g.fillStyle = cel(g, L.sd, -8.5, 8.5); g.fill(pod); }
    for (const [col, kind] of L.ac) { g.fillStyle = col; g.strokeStyle = col;
      for (const s of [-1, 1]) {
        if (kind === 'pod') { P(g, [[7.9 * s, .4], [5.4 * s, -5.4], [4.4 * s, -5.6], [6.6 * s, 1.2], [6.9 * s, 8], [7.9 * s, 6]]); g.fill(); }
        else if (kind === 'line') { g.lineWidth = .7; g.beginPath(); g.moveTo(3.4 * s, -6.2); g.bezierCurveTo(7.2 * s, -4.2, 8 * s, 2, 6.2 * s, 11.5); g.stroke(); }
        else if (kind === 'inlet') { P(g, [[3.6 * s, -6.6], [6.4 * s, -5.6], [5.4 * s, -4.2], [3.4 * s, -4.9]]); g.fill(); }
        else if (kind === 'bull') { g.beginPath(); g.ellipse(6 * s, 3.6, 1.9, 3.6, .15 * s, 0, 7); g.fill(); }
        else if (kind === 'sun' && s > 0) { g.beginPath(); g.arc(0, 9.5, 1.3, 0, 7); g.fill(); }
        else if (kind === 'sweep') { P(g, [[3.4 * s, -6.4], [8.4 * s, -1.8], [8.6 * s, 4], [5.4 * s, 13.4], [4.4 * s, 12.6], [6.6 * s, 3.6], [6 * s, -1.6]]); g.fill(); }
        else if (kind === 'band') { g.fillRect(s > 0 ? 3.6 : -8.8, -3.6, 5.2, 1.6); }
        else if (kind === 'rear' && s > 0) { g.fillRect(-9, 9.6, 18, 11); }
        else if (kind === 'split' && s > 0) { g.fillRect(-1.9, -13, 3.8, 34); }
      }
      if (kind === 'cover') { g.globalAlpha = .9; g.fillRect(-2.3, -1, 4.6, 19); g.globalAlpha = 1; }
    }
    // a soft sheen down the middle and a darker trailing edge: volume without photo-realism
    const sh = g.createLinearGradient(0, -12, 0, 20); sh.addColorStop(0, 'rgba(255,255,255,.1)'); sh.addColorStop(.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.18)'); g.fillStyle = sh; g.fillRect(-9, -13, 18, 34);
    g.restore(); g.strokeStyle = INK; g.lineWidth = .36; g.stroke(body);
    // spine, airbox, cockpit, helmet, halo, mirrors
    g.fillStyle = cel(g, L.sp, -2, 2); rr(g, -1.95, -1.6, 3.9, 18.6, 1.8); g.fill(); ink(g, .26);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.ellipse(0, -.3, 1.1, 1.5, 0, 0, 7); g.fill();
    g.fillStyle = '#08090b'; g.beginPath(); g.ellipse(0, -4.5, 2.55, 4.2, 0, 0, 7); g.fill();
    g.fillStyle = L.h; g.beginPath(); g.arc(0, -3.8, 1.95, 0, 7); g.fill(); ink(g, .22);
    g.fillStyle = '#101216'; g.beginPath(); g.ellipse(0, -4.9, 1.45, .62, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(-.45, -5.05, .5, .18, 0, 0, 7); g.fill();
    g.strokeStyle = '#1c1e23'; g.lineWidth = 1.05; g.lineCap = 'round'; g.beginPath(); g.moveTo(-2.75, -.9); g.quadraticCurveTo(-3, -9, 0, -9.6); g.quadraticCurveTo(3, -9, 2.75, -.9); g.moveTo(0, -9.6); g.lineTo(0, -7.3); g.stroke();
    g.fillStyle = shade(L.b, -.25); rr(g, -5.9, -7, 1.9, 1, .3); g.fill(); ink(g, .2); rr(g, 4, -7, 1.9, 1, .3); g.fill(); ink(g, .2);
  }
  const cache = {};
  function render(team) { // → a transparent canvas of the whole car, nose up, like the cut-out photos used to be
    const id = TEAMS[team].id; if (cache[id]) return cache[id];
    const SX = .8, W = 29.6, H = 54.2, c = document.createElement('canvas'); c.width = Math.round(W * PX * SX); c.height = Math.round(H * PX); // a touch narrower than the shapes: the car reads long and low
    const g = c.getContext('2d'); g.setTransform(PX * SX, 0, 0, PX, W / 2 * PX * SX, 27.9 * PX); paint(g, id); return cache[id] = c;
  }
  return { render, paint, LV };
})();
