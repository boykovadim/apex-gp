'use strict';
/* =====================================================================
   APEX GP · sound effects
   Everything here is synthesised with WebAudio — no samples: wind that
   builds with speed, tyres that howl in a slide, gravel and grass under
   the floor, kerbs, rain and thunder, the battery, gear shifts, cars
   flashing past, wall hits, the pit crew's guns, the crowd at the flag.
   Loaded before game.js; nothing runs until the game calls it.
   The engine itself (sampled loops) lives in game.js → Snd.
   ===================================================================== */
window.SFX = (() => {
  let ac = null, out = null, noise = null, L = null, gearWas = 0, shiftT = 0, lastHit = 0, passT = new Map(), cheerT = 0, wasFin = false, kerbPh = 0;
  const cl = (v, a, b) => v < a ? a : v > b ? b : v;
  const vol = () => (S.sound ? 1 : 0) * (S.vol == null ? 1 : S.vol) * (S.volF == null ? 1 : S.volF);

  function boot() {
    if (ac || !Snd.ctx) return !!ac; ac = Snd.ctx;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = .01; comp.release.value = .3; comp.knee.value = 12; // gentle: no pumping comp.connect(ac.destination);
    out = ac.createGain(); out.gain.value = 0; out.connect(comp);
    // two seconds of white noise is the raw material for most of it
    const n = ac.sampleRate * 2, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; noise = buf;
    const src = () => { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.start(0, Math.random() * 2); return s; };
    const chain = (type, f, q, g0) => { const s = src(), fl = ac.createBiquadFilter(), g = ac.createGain(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = g0 || 0; s.connect(fl); fl.connect(g); g.connect(out); return { fl, g }; };
    L = {
      wind: chain('lowpass', 220, .5), hiss: chain('bandpass', 700, .7), // air over the car, and the tearing edge of it flat out
      sq1: chain('bandpass', 1250, 11), sq2: chain('bandpass', 1730, 14),   // tyre howl: two narrow bands of noise
      dirt: chain('lowpass', 420, .7), rain: chain('bandpass', 1400, .5), spray: chain('lowpass', 700, .6),
    };
    { const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = 50; f.type = 'lowpass'; f.frequency.value = 180; g.gain.value = 0; o.connect(f); f.connect(g); g.connect(out); o.start(); L.kerb = { o, g }; }
    { const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(); o.type = 'sine'; o2.type = 'sine'; o.frequency.value = 500; o2.frequency.value = 1000; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 3; g.gain.value = 0; o.connect(f); o2.connect(f); f.connect(g); g.connect(out); o.start(); o2.start(); L.ers = { o, o2, f, g }; }
    { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = 180; g.gain.value = 0; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; o.connect(f); f.connect(g); g.connect(out); o.start(); L.top = { o, g }; } // the engine on the limiter: a hard edge on top of the loops
    return true;
  }
  const to = (p, v, tc) => p.setTargetAtTime(v, ac.currentTime, tc || .06);

  /* ---------- one-shots ---------- */
  function burst(type, f0, f1, dur, gain, q, when) { // filtered noise that sweeps and dies
    if (!boot() || vol() <= 0) return; const t = ac.currentTime + (when || 0), s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise; fl.type = type; fl.Q.value = q || 1; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), t + Math.min(.02, dur * .2)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + dur + .05);
  }
  function tone(type, f0, f1, dur, gain, when) {
    if (!boot() || vol() <= 0) return; const t = ac.currentTime + (when || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .05);
  }
  const ui = () => { if (!boot()) return; out.gain.value = Math.max(out.gain.value, vol() * .2); tone('sine', 1100, 800, .045, .02); };
  const radio = () => { tone('sine', 880, 880, .09, .035); tone('sine', 1320, 1320, .12, .03, .1); };
  function crash(v) { // v: how hard, in speed lost into the wall
    if (!boot()) return; const n = performance.now(); if (n - lastHit < 120) return; lastHit = n; const k = cl(v / 260, .15, 1);
    burst('lowpass', 900 * k + 300, 120, .2 + .3 * k, .09 * k + .02, .7); tone('sine', 90, 40, .25 + .2 * k, .1 * k + .02);
    if (k > .55) burst('bandpass', 2400, 700, .35, .05 * k, 2, .04); // carbon and bits of wing
  }
  const bump = j => { if (!boot()) return; const n = performance.now(); if (n - lastHit < 150) return; lastHit = n; const k = cl(j / 120, .2, 1); burst('lowpass', 1000, 180, .14, .1 * k, .7); tone('sine', 110, 55, .12, .09 * k); };
  function pit() { // four wheel guns, off then on
    for (const [t0, up] of [[.45, 0], [.62, 0], [2.1, 1], [2.3, 1]]) for (let k = 0; k < 2; k++) { burst('bandpass', up ? 1500 : 1900, up ? 2100 : 1300, .18, .035, 3, t0 + k * .07); }
    burst('lowpass', 500, 120, .16, .08, 1, .25); // the jack
  }
  const thunder = () => { burst('lowpass', 300, 50, 2.6, .14, .6, .15); burst('lowpass', 600, 100, .5, .07, .7); };
  const pop = () => { burst('lowpass', 700, 150, .25, .04, .7, Math.random() * .1); };
  const whoosh = k => burst('lowpass', 500, 900, .45, .025 * k, .7);
  const shift = () => {}; // gear changes now come from the recorded engine
  const cheer = () => { if (!boot() || vol() <= 0) return; const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noise; s.loop = true; f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = .8;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.06, t + .8); g.gain.linearRampToValueAtTime(.04, t + 3); g.gain.linearRampToValueAtTime(.0001, t + 6.5); f.frequency.linearRampToValueAtTime(1500, t + 1); f.frequency.linearRampToValueAtTime(950, t + 6);
    s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 7); for (let k = 0; k < 3; k++) tone('sine', 520 + k * 130, 500 + k * 130, .5, .015, .2 + k * .16); };
  function test() { if (!boot()) return; out.gain.value = vol() * .32; whoosh(1); crash(120); tone('sine', 880, 880, .1, .15, .5); burst('bandpass', 1250, 1500, .5, .2, 10, .7); }

  /* ---------- every frame: the continuous layers follow the car on screen ---------- */
  function tick(dt) {
    if (!boot()) return; const c = G.cars[G.follow], on = !!c && G.mode === 'race' && !G.paused && !RP.on && vol() > 0;
    to(out.gain, vol() * (on ? .26 : RP.on ? .08 : .14), .2);
    if (!c || !on) { for (const k of ['wind', 'hiss', 'sq1', 'sq2', 'dirt', 'rain', 'spray']) to(L[k].g.gain, 0, .12); to(L.kerb.g.gain, 0); to(L.ers.g.gain, 0); to(L.top.g.gain, 0); return; }
    const v = Math.max(0, c.vF), sp = cl(v / VMAX, 0, 1.25), T = G.track, wet = cl((G.h - 18) / 50, 0, 1), racing = G.phase === 'race';
    // wind: quiet below 150 km/h, a roar by 300, tearing at the top
    to(L.wind.g.gain, Math.pow(sp, 2.4) * .05, .25); to(L.wind.fl.frequency, 160 + sp * 260, .2); // air: a soft low rush under the engine, never a hiss
    to(L.hiss.g.gain, c.tow > 0 ? .006 * sp : 0, .2); // slipstream: a faint buffet
    to(L.top.g.gain, 0, .08); to(L.top.o.frequency, 150 + sp * 95, .05);
    // tyres: howl in a slide on tarmac, lower and rougher in the wet
    const tar = c.surf === 0 || c.surf === 3, sl = tar && racing ? cl(c.slide || 0, 0, 1) * cl(v / 200, 0, 1) : 0;
    to(L.sq1.g.gain, sl * (1 - wet * .8) * .06, .08); to(L.sq2.g.gain, sl * sl * (1 - wet * .8) * .02, .08);
    to(L.sq1.fl.frequency, 1050 + sp * 420 + (c.brk > .5 ? -180 : 0), .05); to(L.sq2.fl.frequency, 1580 + sp * 520, .05);
    // off the road: gravel rattles under the floor, grass thumps
    const off = c.surf === 1 || c.surf === 2 || c.surf === 4 ? cl(v / 260, 0, 1) : 0; to(L.dirt.g.gain, off * (c.surf === 2 ? .12 : .07), .08); to(L.dirt.fl.frequency, c.surf === 2 ? 900 : 380, .05);
    const onKerb = c.surf === 3 && Math.abs(c.d) > T.hw - 8 && T.kerb[c.idx] && v > 60; to(L.kerb.g.gain, onKerb ? .035 : 0, .03); to(L.kerb.o.frequency, 26 + sp * 70, .03);
    // weather
    to(L.rain.g.gain, cl((G.h - 20) / 60, 0, 1) * .012, .6); to(L.spray.g.gain, wet * sp * .022, .2); to(L.spray.fl.frequency, 400 + sp * 400, .2);
    // battery
    to(L.ers.g.gain, c.bst ? .006 : 0, .1); if (c.bst) { to(L.ers.o.frequency, 380 + sp * 520, .08); to(L.ers.o2.frequency, 760 + sp * 1040, .08); to(L.ers.f.frequency, 900 + sp * 1500, .08); }
    // gear changes
    let gear = 0; while (gear < 7 && v > GEARS[gear] * VMAX) gear++; shiftT -= dt; if (gear !== gearWas && racing && shiftT <= 0 && v > 60) { shiftT = .12; if (gear > gearWas) shift(); } gearWas = gear;
    // cars flashing past
    const now = performance.now(); for (const o of G.cars) { if (o === c || o.inPit !== c.inPit) continue; const dx = o.x - c.x, dy = o.y - c.y; if (dx * dx + dy * dy > 110 * 110) continue;
      const rel = Math.abs(o.vF - v); if (rel > 90 && now - (passT.get(o) || 0) > 2500) { passT.set(o, now); whoosh(cl(rel / 300, .35, 1)); } }
    // the flag
    if (c.fin && !wasFin && G.sess === 'race') cheer(); wasFin = !!c.fin;
  }
  const reset = () => { wasFin = false; passT = new Map(); gearWas = 0; };
  return { tick, ui, radio, crash, bump, pit, thunder, pop, test, reset, vol() { if (ac && out) to(out.gain, vol() * .2, .05); } };
})();
