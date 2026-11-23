'use strict';
/* =====================================================================
   APEX GP · race replay
   Records every car during the race and keeps a diary of what happened to
   the player: the start, every pass made and lost, wheel-to-wheel fights,
   contacts, trips over the gravel, pit stops, the top speed, the finish.
   After the flag the moments play in slow motion behind the results and
   can be paged through one by one. The race keeps running underneath.
   Loaded before game.js; nothing here runs until the game calls it.
   ===================================================================== */
window.RP = (() => {
  const HZ = 20, ST = 6, MAXF = 26000;
  let frames = [], acc = 0, clock = 0, side = null, pend = [], ev = [], finT = -1, on = false, clips = [], ci = 0, pt = 0, view = null, cutNow = false, paused = false;
  let offT = 0, nearT = 0, nearI = -1, vTop = 0, vTopT = 0, pitWas = false, leadWas = -1, hitWas = 0, wired = false;
  const $id = id => document.getElementById(id);
  const who = o => o.human ? o.name : (typeof drvOf === 'function' ? drvOf(o.team, o.seat)[1] : TEAMS[o.team].code);

  function reset() { frames = []; acc = 0; clock = 0; side = null; pend = []; ev = []; finT = -1; offT = 0; nearT = 0; nearI = -1; vTop = 0; vTopT = 0; pitWas = false; leadWas = -1; hitWas = 0; stop(); }
  function stop() { on = false; view = null; clips = []; paused = false; for (const id of ['rpTag', 'rpBar', 'rpList']) { const t = $id(id); if (t) t.classList.add('hidden'); } }
  /* k: kind · t: when · i: the other car · score: how good a watch it is */
  function note(k, t, o) { ev.push(Object.assign({ k, t, lap: G.cars[G.me] ? G.cars[G.me].lap : 0 }, o)); }
  function mark(k, i, v) { // told by the game: a knock from another car
    if (on || G.sess !== 'race' || G.phase !== 'race') return; if (k === 'bump' && v > 55 && !ev.some(e => e.k === 'bump' && clock - e.t < 5)) note('bump', clock, { i, score: 1.2 + Math.min(1.5, v / 120) });
  }
  function watch(me) {
    if (finT < 0 && me.fin) finT = clock;
    const cars = G.cars, n = cars.length, T = G.track, pos = cars.filter(q => q.prog > me.prog).length;
    // the lead changes hands (anyone)
    { let lead = 0; for (let i = 1; i < n; i++) if (cars[i].prog > cars[lead].prog) lead = i; if (leadWas >= 0 && lead !== leadWas && G.t > 6 && !cars[lead].inPit && !cars[leadWas].inPit && lead !== G.me && leadWas !== G.me && Math.abs(cars[lead].x - me.x) < 900 && Math.abs(cars[lead].y - me.y) < 700) note('lead', clock, { i: lead, score: 1.1 }); leadWas = lead; }
    if (me.fin || G.t < 1) { side = null; pend = []; return; }
    // pit stop
    if (me.pitS && !pitWas) note('pit', clock + 1.2, { score: .9 }); pitWas = !!me.pitS;
    if (me.inPit || me.pitS) { side = null; pend = []; return; }
    // a hit on the barrier
    if (me.hitT && me.hitT !== hitWas) { hitWas = me.hitT; if (me.hitV > 70) note('crash', clock, { score: 1.3 + Math.min(1.7, me.hitV / 160), v: me.hitV }); }
    // off the road at speed
    if ((me.surf === 1 || me.surf === 2) && me.vF > 200) { offT += 1 / HZ; if (offT > .5 && offT < .5 + 1.5 / HZ) note('off', clock - .3, { score: me.surf === 2 ? 1.5 : 1, g: me.surf === 2 }); } else offT = 0;
    // top speed of the race
    if (me.vF > vTop + 4 && me.vF > VMAX * .9) { vTop = me.vF; vTopT = clock; }
    // passes made and lost
    const prev = side; side = cars.map(o => me.prog > o.prog ? 1 : -1);
    if (prev && G.t > 3) cars.forEach((o, i) => { if (o === me || prev[i] === side[i]) return;
      if (o.inPit || o.pitS || o.fin || o.vF < 140 || me.vF < 200 || Math.abs(me.prog - o.prog) > 30) return;
      const gained = side[i] === 1;
      pend.push({ t: clock, i, gained, due: clock + 1.6, pos, score: (gained ? 2 : .8) + Math.min(1, Math.abs(T.k[me.idx]) * 260) * 1.5 + (1 - Math.min(1, Math.abs(me.d - o.d) / 160)) + me.vF / VMAX + (1 - pos / n) * 1.5 + (me.bst ? .4 : 0) + (me.tow > .3 ? .3 : 0) }); });
    pend = pend.filter(q => { if (clock < q.due) return true; const o = cars[q.i], ahead = me.prog > o.prog; if (ahead === q.gained) note(q.gained ? 'pass' : 'lost', q.t, q); return false; }); // it only counts if it sticks
    // wheel to wheel: alongside another car for a while
    { let best = -1, bd = 1e9; cars.forEach((o, i) => { if (o === me || o.inPit || o.fin) return; const dp = Math.abs(o.prog - me.prog), dl = Math.abs(o.d - me.d); if (dp < 7 && dl < 95 && dl > 20 && me.vF > 260 && dp < bd) { bd = dp; best = i; } });
      if (best >= 0 && best === nearI) { nearT += 1 / HZ; if (nearT > 1.6 && nearT < 1.6 + 1.5 / HZ) note('duel', clock - .8, { i: best, score: 1.6 + me.vF / VMAX }); } else { nearT = 0; nearI = best; } }
  }
  function rec(dt) {
    if (on || G.mode !== 'race' || G.sess !== 'race' || G.phase !== 'race') return;
    clock += dt; acc += dt; if (acc < 1 / HZ) return; acc %= 1 / HZ;
    const n = G.cars.length, f = new Float32Array(1 + n * ST); f[0] = clock;
    for (let i = 0; i < n; i++) { const c = G.cars[i], o = 1 + i * ST; f[o] = c.x; f[o + 1] = c.y; f[o + 2] = c.h; f[o + 3] = c.vF; f[o + 4] = (c.surf || 0) | (c.bst ? 4 : 0) | (c.brk > .3 ? 8 : 0) | (c.pitS ? 16 : 0) | (c.inPit ? 32 : 0); f[o + 5] = c.slide || 0; }
    frames.push(f); if (frames.length > MAXF) frames.shift();
    const me = G.cars[G.me]; if (me) watch(me);
  }
  const fmtT = t => { const m = Math.floor(t / 60), s = Math.floor(t - m * 60); return m + ':' + (s < 10 ? '0' : '') + s; };
  function build() { // the diary → clips, in the order they happened
    const t0 = frames[0][0], end = frames[frames.length - 1][0], tf = finT >= 0 ? finT : end - 1.5, cars = G.cars, out = [];
    const add = (e, a, b, label, tag, slow) => out.push({ t: e.t, a: Math.max(t0, e.t - a), b: Math.min(end, e.t + b), label, tag, slow, i: e.i == null ? -1 : e.i, lap: e.lap || 1, score: e.score || 1 });
    if (t0 < 1.5) add({ t: t0 + 2.6, score: 3, lap: 1 }, 2.6, 4.2, 'СТАРТ', 'СТАРТ', .55);
    if (vTop > 0) add({ t: vTopT, score: 1.4, lap: 0 }, 2.2, 1.2, 'МАКСИМАЛКА · ' + Math.round(vTop * KMH) + ' КМ/Ч', 'СКОРОСТЬ', .5);
    for (const e of ev) { const o = e.i != null && cars[e.i] ? who(cars[e.i]) : '';
      if (e.t > tf - 1) continue;
      if (e.k === 'pass') add(e, 2.6, 1.8, 'ОБГОН · ' + o + ' · P' + (e.pos + 1) + ' → P' + Math.max(1, e.pos), 'ОБГОН', .4);
      else if (e.k === 'lost') add(e, 2.2, 1.6, 'ПОТЕРЯ ПОЗИЦИИ · ' + o, 'АТАКА', .45);
      else if (e.k === 'duel') add(e, 2, 2.2, 'КОЛЕСО В КОЛЕСО · ' + o, 'БОРЬБА', .45);
      else if (e.k === 'crash') add(e, 1.8, 1.6, e.v > 160 ? 'УДАР О СТЕНУ' : 'КАСАНИЕ СТЕНЫ', 'СТЕНА', .35);
      else if (e.k === 'bump') add(e, 1.6, 1.6, 'КОНТАКТ · ' + o, 'КОНТАКТ', .35);
      else if (e.k === 'off') add(e, 1.6, 2.2, e.g ? 'ВЫЛЕТ В ГРАВИЙ' : 'ВЫЛЕТ НА ТРАВУ', 'ВЫЛЕТ', .45);
      else if (e.k === 'pit') add(e, 2.4, 4.6, 'ПИТ-СТОП', 'БОКСЫ', .8);
      else if (e.k === 'lead') add(e, 2, 1.8, 'СМЕНА ЛИДЕРА · ' + o, 'ЛИДЕР', .5); }
    // nothing twice: of two moments closer than 3.5 s the better one stays (a pass always beats what led to it)
    out.sort((a, b) => b.score - a.score); const keep = []; for (const c of out) if (!keep.some(p => Math.abs(p.t - c.t) < 3.5)) keep.push(c);
    keep.sort((a, b) => a.t - b.t); const list = keep.slice(0, 60);
    list.push({ t: tf, a: Math.max(t0, tf - 3.8), b: Math.min(end, tf + 1.6), label: 'ФИНИШ', tag: 'ФИНИШ', slow: .4, i: -1, lap: G.laps, score: 9 });
    return list;
  }
  function start() {
    const me = G.cars[G.me]; if (on || frames.length < 20 || !me || G.sess !== 'race') return;
    clips = build();
    view = G.cars.map(c => Object.assign({}, c, { ai: null, wl: null, tr: null, human: c.human, fin: true, rx: c.x, ry: c.y, rh: c.h, pitSv: 0, crA: 0, crO: 0 }));
    on = true; paused = false; wire(); go(clips.length - 1); // the finish first, then the race from the start
    const bar = $id('rpBar'); if (bar) bar.classList.remove('hidden'); list();
  }
  function go(i) { ci = ((i % clips.length) + clips.length) % clips.length; pt = clips[ci].a; cutNow = true; label(); }
  function label() {
    const c = clips[ci], n = clips.length, nPass = clips.filter(q => q.tag === 'ОБГОН').length; if ($id('rpLabel')) $id('rpLabel').textContent = c.label;
    if ($id('rpCount')) $id('rpCount').textContent = 'ПОВТОР · ' + (ci + 1) + ' / ' + n + (nPass ? ' · ОБГОНОВ: ' + nPass : '');
    const d = $id('rpDots'); if (d) d.innerHTML = clips.map((q, k) => `<i class="${k === ci ? 'on' : ''}" title="${q.label}"></i>`).join('');
    const l = $id('rpList'); if (l) [...l.children].forEach((b, k) => b.classList.toggle('on', k === ci));
    if ($id('rpPlay')) $id('rpPlay').textContent = paused ? '▶' : '❚❚';
  }
  function list() { const l = $id('rpList'); if (!l) return; l.innerHTML = clips.map((c, k) => `<button data-k="${k}"><i>${fmtT(c.t)}${c.lap ? ' · L' + Math.min(c.lap, G.laps) : ''}</i><b>${c.label}</b><em>${c.tag}</em></button>`).join(''); }
  function wire() {
    if (wired) return; wired = true; const b = (id, fn) => { const e = $id(id); if (e) e.onclick = fn; };
    b('rpPrev', () => go(ci - 1)); b('rpNext', () => go(ci + 1)); b('rpPlay', () => { paused = !paused; label(); });
    b('rpAll', () => $id('rpList').classList.toggle('hidden'));
    b('rpList', e => { const t = e.target.closest('button'); if (t) { go(+t.dataset.k); paused = false; label(); } });
    addEventListener('keydown', e => { if (!on) return; if (e.code === 'ArrowLeft') go(ci - 1); else if (e.code === 'ArrowRight') go(ci + 1); else if (e.code === 'Space') { paused = !paused; label(); } });
  }
  function pose(t) {
    let lo = 0, hi = frames.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (frames[m][0] <= t) lo = m; else hi = m; }
    const A = frames[lo], B = frames[hi], k = B[0] > A[0] ? clamp((t - A[0]) / (B[0] - A[0]), 0, 1) : 0;
    view.forEach((c, i) => { const o = 1 + i * ST; if (o + ST > A.length) return;
      c.x = lerp(A[o], B[o], k); c.y = lerp(A[o + 1], B[o + 1], k); c.h = A[o + 2] + wrapA(B[o + 2] - A[o + 2]) * k; c.vF = lerp(A[o + 3], B[o + 3], k);
      const fl = A[o + 4] | 0; c.surf = fl & 3; c.bst = !!(fl & 4); c.brk = fl & 8 ? 1 : 0; c.pitS = fl & 16 ? 1 : 0; c.inPit = !!(fl & 32); c.slide = A[o + 5];
      c.vx = Math.sin(c.h) * c.vF; c.vy = -Math.cos(c.h) * c.vF; c.vL = 0; c.thr = c.brk ? 0 : 1; c.rx = c.x; c.ry = c.y; c.rh = c.h; });
  }
  function draw(dt) {
    const cl = clips[ci], sl = paused ? 0 : cl.slow;
    pt += dt * sl; if (pt >= cl.b) { go(ci + 1); }
    pose(pt);
    const real = G.cars, rf = G.follow; G.cars = view; G.follow = G.me;
    try {
      if (cutNow) { const c = view[G.me]; cam.x = c.x; cam.y = c.y; cam.lx = cam.ly = 0; for (const q of view) { q.wl = null; q.tr = null; } cutNow = false; }
      FX.effects(dt * sl); camera(dt);
      const c2 = clips[ci], o = c2.i >= 0 ? view[c2.i] : null, me = view[G.me]; // keep the rival in the picture
      if (o && me && Math.hypot(o.x - me.x, o.y - me.y) < 700) { cam.x += (o.x - me.x) * .4; cam.y += (o.y - me.y) * .4; }
      const p = document.querySelector('#results .menu-body').getBoundingClientRect(); // keep the action in the free part of the screen
      if (innerHeight > innerWidth) cam.y += (innerHeight - p.top) / 2 / cam.z; else cam.x += (innerWidth - p.left) / 2 / cam.z;
      FX.render(dt);
    } finally { G.cars = real; G.follow = rf; }
  }
  return { reset, stop, rec, start, draw, mark, get on() { return on; }, get moves() { return ev.filter(e => e.k === 'pass'); }, get events() { return ev; }, get clips() { return clips; }, get frames() { return frames.length; } };
})();
