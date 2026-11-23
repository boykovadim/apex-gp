'use strict';
/* =====================================================================
   APEX GP — top-down formula racing (canvas 2D, vector graphics)
   ===================================================================== */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const rand = (a, b) => a + Math.random() * (b - a);
const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/* ---------- tuning ---------- */
const DS = 8, VMAX = 920, ACC = 276, AIRD = 90, BRAKE = 360, GRIP = 1450, KMH = 0.387, STEP = 1 / 120; // KMH: display only — a Mercedes tops out near 360 km/h at the end of a long straight, a Cadillac near 350
const CS = 1.85, CAR_HALF = 12 * CS, CAR_R = 10.5 * CS, WMAX = 2.0;
/* the engine pushes with what the tyres can take at low speed and with its power above that; air drag grows with the square of speed.
   The top speed is where power and drag balance, and the car only creeps towards it: 300 km/h ≈ 4.5 s from a standstill,
   350 needs a decent straight, 390+ only the longest ones. No car ever sits on a hard limit. */
const pushA = (v, vmax, am) => Math.min(ACC * (am || 1), (AIRD + 55) * vmax / Math.max(v, 40)), dragA = (v, vmax) => AIRD * (v / vmax) ** 2; // the top speed is an asymptote: ~280 km/h in 4 s, ~345 in 8 s, the last 10 km/h only at the end of a long straight — never a wall
const netA = (v, vmax) => Math.max(4, pushA(v, vmax) - dragA(v, vmax) - 55); // flat-out acceleration of a perfect car, for the lap-time models
const GEARS = [.27, .39, .50, .60, .70, .80, .90, 1.0];

/* ---------- teams, fastest first. Solo: tiny pace ladder (±0.45%). With friends every car is identical (see carStats). ---------- */
const TEAMS = [
  { id: 'mercedes',    n: 'MERCEDES',     f: 'Mercedes-AMG Petronas F1', c1: '#C0C6CC', c2: '#111111', c3: '#00D2BE', ui: '#00D2BE', bg: '#2b2e33', num: 63, drv: 'George Russell',    code: 'RUS', ch: 'W17',      pu: 'Mercedes M17',  tit: 8,  spd: 1.0275, acc: 1.0600, grip: 1.0160, brk: 1.0100 },
  { id: 'ferrari',     n: 'FERRARI',      f: 'Scuderia Ferrari HP',      c1: '#DC0000', c2: '#FFFFFF', c3: '#FFD700', ui: '#FF2A2A', bg: '#9c000c', num: 16, drv: 'Charles Leclerc',   code: 'LEC', ch: 'SF-26',    pu: 'Ferrari 067',   tit: 16, spd: 1.0245, acc: 1.0500, grip: 1.0135, brk: 1.0080 },
  { id: 'redbull',     n: 'RED BULL',     f: 'Oracle Red Bull Racing',   c1: '#1E2B5C', c2: '#DB0A40', c3: '#FFC906', ui: '#FFC906', bg: '#16265e', num: 1,  drv: 'Max Verstappen',    code: 'VER', ch: 'RB22',     pu: 'Red Bull Ford', tit: 6,  spd: 1.0240, acc: 1.0500, grip: 1.0135, brk: 1.0060 },
  { id: 'mclaren',     n: 'MCLAREN',      f: 'McLaren Formula 1 Team',   c1: '#FF8000', c2: '#1A1B1F', c3: '#47C7FC', ui: '#FF8A1A', bg: '#d86400', num: 4,  drv: 'Lando Norris',      code: 'NOR', ch: 'MCL40',    pu: 'Mercedes M17',  tit: 10, spd: 1.0235, acc: 1.0460, grip: 1.0128, brk: 1.0040 },
  { id: 'alpine',      n: 'ALPINE',       f: 'BWT Alpine F1 Team',       c1: '#0A6BE8', c2: '#FF69B4', c3: '#FFFFFF', ui: '#FF79C0', bg: '#8a3fb0', num: 43, drv: 'Franco Colapinto',  code: 'COL', ch: 'A526',     pu: 'Mercedes M17',  tit: 2,  spd: 1.0175, acc: 1.0200, grip: 1.0060, brk: 1.0020 },
  { id: 'racingbulls', n: 'RACING BULLS', f: 'Visa Cash App Racing Bulls',c1: '#F2F2F2', c2: '#1634CC', c3: '#E4002B', ui: '#7d95ff', bg: '#2340b0', num: 30, drv: 'Liam Lawson',       code: 'LAW', ch: 'VCARB 03', pu: 'Red Bull Ford', tit: 0,  spd: 1.0150, acc: 1.0080, grip: 1.0020, brk: 1.0000 },
  { id: 'audi',        n: 'AUDI',         f: 'Audi F1 Team',             c1: '#BFC3C8', c2: '#101010', c3: '#FF3B1F', ui: '#FF4B2B', bg: '#6c7178', num: 27, drv: 'Nico Hülkenberg',   code: 'HUL', ch: 'R26',      pu: 'Audi AFR 26',   tit: 0,  spd: 1.0120, acc: 0.9960, grip: 0.9980, brk: 0.9980 },
  { id: 'haas',        n: 'HAAS',         f: 'MoneyGram Haas F1 Team',   c1: '#EDEDED', c2: '#1C1C1C', c3: '#E6002B', ui: '#FF3344', bg: '#a8101e', num: 31, drv: 'Esteban Ocon',      code: 'OCO', ch: 'VF-26',    pu: 'Ferrari 067',   tit: 0,  spd: 1.0095, acc: 0.9840, grip: 0.9950, brk: 0.9960 },
  { id: 'williams',    n: 'WILLIAMS',     f: 'Atlassian Williams Racing',c1: '#1F5FD6', c2: '#0B1A3A', c3: '#00A3E0', ui: '#4DA3FF', bg: '#1652c2', num: 55, drv: 'Carlos Sainz',      code: 'SAI', ch: 'FW48',     pu: 'Mercedes M17',  tit: 9,  spd: 1.0060, acc: 0.9720, grip: 0.9920, brk: 0.9940 },
  { id: 'astonmartin', n: 'ASTON MARTIN', f: 'Aston Martin Aramco F1',   c1: '#00594F', c2: '#CEDC00', c3: '#FFFFFF', ui: '#2fd3b5', bg: '#007a68', num: 14, drv: 'Fernando Alonso',   code: 'ALO', ch: 'AMR26',    pu: 'Honda RA626H',  tit: 0,  spd: 1.0025, acc: 0.9580, grip: 0.9890, brk: 0.9920 },
  { id: 'cadillac',    n: 'CADILLAC',     f: 'Cadillac Formula 1 Team',  c1: '#E9E9E9', c2: '#151515', c3: '#C9A24A', ui: '#E2C275', bg: '#2e2c28', num: 11, drv: 'Sergio Pérez',      code: 'PER', ch: 'MAC-26',   pu: 'Ferrari 067',   tit: 0,  spd: 0.9990, acc: 0.9440, grip: 0.9860, brk: 0.9900 },
];

/* team mark for tables: the badge from the garage roofs */
const teamMark = t => { const T = TEAMS[t], u = window.teamIcon ? teamIcon(T.id) : null; return u ? `background:url(${u}) center/contain no-repeat;width:16px;height:16px;flex:0 0 16px;border-radius:4px;vertical-align:-3px;margin-right:8px` : `background:${T.c1}`; }; // the team's badge, like on its garage roof
/* second seat of every team (team mode: 22 cars) */
const DRV2 = { mercedes: ['Kimi Antonelli', 'ANT', 12], ferrari: ['Lewis Hamilton', 'HAM', 44], redbull: ['Isack Hadjar', 'HAD', 6], mclaren: ['Oscar Piastri', 'PIA', 81], alpine: ['Pierre Gasly', 'GAS', 10], racingbulls: ['Arvid Lindblad', 'LIN', 41],
  audi: ['Gabriel Bortoleto', 'BOR', 5], haas: ['Oliver Bearman', 'BEA', 87], williams: ['Alexander Albon', 'ALB', 23], astonmartin: ['Lance Stroll', 'STR', 18], cadillac: ['Valtteri Bottas', 'BOT', 77] };
const drvOf = (t, seat) => seat ? DRV2[TEAMS[t].id] : [TEAMS[t].drv, TEAMS[t].code, TEAMS[t].num];
const carTag = c => c.human && c.human !== 'local' ? c.name.slice(0, 3).toUpperCase() : c.human ? drvOf(c.team, c.seat)[1] : c.name;
/* ---------- tyres ----------
   pace: speed / acceleration / grip multiplier of a fresh tyre. The compounds are close on purpose (soft 1 · medium −2.5% · hard −4.5%)
   so that over a race distance every one of them can be the right call: softs are quick but need a stop, hards go the distance.
   w / wc: % of tread per lap in dry / overcast weather (each set gets ±20%)
   Life to 50%: soft ≈ 3 laps, medium ≈ 4–5, hard ≈ 6–7. Wet = the only tyre that works on a wet road, and it melts on a dry one. */
const TY = [{ n: 'SOFT', l: 'S', c: '#ff3b3b', pace: 1, w: 16, wc: 18.5 }, { n: 'MEDIUM', l: 'M', c: '#ffd000', pace: .975, w: 10.5, wc: 12.2 }, { n: 'HARD', l: 'H', c: '#f2f2f2', pace: .955, w: 7.5, wc: 8.8 }, { n: 'WET', l: 'W', c: '#2a9dff', pace: .95, w: 10.5, wc: 10.5 }];
/* wear → multiplier on speed, acceleration and grip, relative to the tyre's own fresh pace:
   100–80% none · 80–60% −5% · 60–50% −10% · below 50% −20% (short blends so the car never jolts) */
const wearMul = w => { const st = (x, e) => clamp((e - x) / 2 + .5, 0, 1); return 1 - .035 * st(w, 80) - .035 * st(w, 60) - .07 * st(w, 50); };
/* a set past its life: under 40% everything is another 10% worse than under 50%, under 30% another 20% — speed, pull, grip, braking */
const wearDeep = w => { const st = (x, e) => clamp((e - x) / 2 + .5, 0, 1); return 1 - .1 * st(w, 40) - .1 * st(w, 30); };
const tab = (T, w) => { for (let i = 1; i < T.length; i++) if (w >= T[i][0]) return lerp(T[i][1], T[i - 1][1], (w - T[i][0]) / (T[i - 1][0] - T[i][0])); return T[T.length - 1][1]; };
const NEUTRAL = { spd: 1, acc: 1, grip: 1, brk: 1 }, PITV = 100 / 0.387, PITV_H = 110 / 0.387, QK = 1.06; // pit lane: 100 km/h for the bots, up to 110 for the player
const carStats = c => (G.net === 'host' || G.net === 'client') && !G.opts.rl ? NEUTRAL : c.st || TEAMS[c.team];
/* how strong a car is (1 = the best), and how much slower a bot in it should be than the best car */
const cpace = t => { const s = (G.net === 'host' || G.net === 'client') && !G.opts.rl ? NEUTRAL : TEAMS[t]; return s.spd * .5 + s.acc * .2 + s.grip * .3; };
const carGap = t => Math.pow(Math.max(...TEAMS.map((_, i) => cpace(i))) / cpace(t), 1.1);
const pitOn = () => G.opts.tyres && G.track.pit && G.sess !== 'quali' && G.sess !== 'attract';
/* the compound's behaviour at humidity h: [pace multiplier, extra grip multiplier, wear multiplier, slide 0..1] */
function tyreWx(k, h) {
  if (k === 3) { // wets: made for standing water; on a drying road they overheat, lose pace and melt away
    const dry = clamp((32 - h) / 20, 0, 1), deep = clamp((h - 45) / 45, 0, 1);
    return [1 - .15 * dry, 1 - .05 * dry - .08 * deep, 1 + 1.2 * dry + 5 * dry * dry, .22 * deep];
  }
  const wet = clamp((h - 18) / 48, 0, 1); // slicks: fine up to ~18%, then the grip goes — in a downpour they are hopeless
  return [1 - .05 * wet, 1 - .2 * wet, 1 + 3.5 * Math.min(1, wet * 1.8), clamp((h - 22) / 30, 0, 1) * .35]; // −5% pull, −20% grip: the car moves around, it does not spin by itself
}
const dryRate = (k, h) => lerp(TY[k].w, TY[k].wc, clamp((h - 5) / 10, 0, 1)); // dry → overcast
function tyreFx(c) {
  const fx = c.fx || (c.fx = { s: 1, a: 1, g: 1, f: 1, r: 0, sl: 0 }); if (!G.opts.tyres) { fx.s = fx.a = fx.g = fx.f = fx.wg = 1; fx.r = 0; fx.sl = 0; return fx; }
  const k = c.tyre, h = G.h, [p, g, wm, sl] = tyreWx(k, h), dp = wearDeep(c.wear), m = TY[k].pace * p * wearMul(c.wear) * dp;
  fx.s = TY[k].pace * p * (1 - (1 - dp) * .5); fx.a = m; fx.g = m * g; fx.f = m; fx.sl = sl; fx.wg = g; // worn rubber: the top speed is still there, it just takes longer to get to it
  fx.r = (k === 3 ? TY[3].w : dryRate(k, h)) * wm * (c.wv || 1);
  return fx;
}
/* ---------- strategy ----------
   Every bot works out the quickest way to the flag: lap by lap, with the tyre wearing, the track getting wetter or drier,
   and the real cost of a stop. Costs are in "laps of a perfect soft". */
const WX_T = [5, 15, 60, 90, 5, 35]; // 0 dry · 1 overcast · 2 rain · 3 downpour · (4 = automatic) · 5 damp
function hAhead(t) { // humidity t seconds from now: the sky as it is, plus the changes the radar already shows (the race's plan)
  let st = G.opts.wx === 4 ? G.wS : G.opts.wx; if (st == null || st < 0 || st > 5 || st === 4) return G.h;
  const step = (h, s2, d) => { const tg = WX_T[s2], up = s2 === 3 ? 2 : s2 === 2 ? 1 : .6; return h < tg ? Math.min(tg, h + up * d) : Math.max(tg, h - d); };
  let h = G.h, now = 0; const ev = G.opts.wx === 4 && G.wPlan && !(G.order && G.order.length) ? G.wPlan : [];
  for (const e of ev) { const at = e.t - G.t; if (at > t) break; if (at > now) { h = step(h, st, at - now); now = at; } st = e.s; }
  return step(h, st, t - now);
}
function lapCost(k, wear, h, wv) { // one lap on compound k from `wear` at humidity h → [time, wear after]
  const [p, g, wm] = tyreWx(k, h), r = (k === 3 ? TY[3].w : dryRate(k, h)) * wm * (wv || 1), base = TY[k].pace * p * Math.sqrt(g); let t = 0;
  for (let q = 0; q < 4; q++) { const w = Math.max(0, wear - r * (q + .5) / 4); t += .25 / Math.max(.3, base * wearMul(w) * wearDeep(w)) + (w < 30 ? .12 : 0); } // under 30% a bot will not go: priced in
  return [t, Math.max(0, wear - r)];
}
const PITSTOP = [2.42, 2.62];
/* the player's stop, timed from the moment the car stands in its box: a quick call (under 0.7 s) gives 2.4–2.6 s,
   0.7–1 s of doubt ≈3 s, over a second ≈3.2, close to two seconds ≈3.5 */
const humanStop = w => (w < .7 ? rand(2.4, 2.6) : w < 1 ? lerp(2.85, 3.05, (w - .7) / .3) : w < 1.8 ? lerp(3.15, 3.35, (w - 1) / .8) : Math.min(4.2, 3.5 + (w - 1.8) * .35)) + rand(-.03, .03);
const pitDur = () => 2.31 + Math.pow(Math.random(), 1.5) * .72 + (Math.random() < .14 ? rand(.25, .85) : 0); // every stop is different: mostly 2.3–3.0 s, now and then a wheel nut sticks // the crew's work; a person who is still choosing tyres adds ~40% of the time spent choosing
function pitLossLaps() { const T = G.track, P = T.pit; return (2.6 + (P ? P.len * DS / PITV - P.len * DS / 640 : 0) + 3.4) / Math.max(30, T.refLap); } // measured: 11–14 s all in
const compoundsOn = () => G.opts.wx >= 0 ? [0, 1, 2, 3] : [0, 1, 2];
/* cur = { k, wear, wv }: the set on the car, or null on the grid · nz: this driver's own opinion of each compound
   → { cost, k, n, now, stay }: the best compound to fit (on the grid / at the next stop), the laps until that stop,
     and the cost of boxing right now against the best plan that carries on */
function plan(left, cur, nz) {
  const L = clamp(left | 0, 1, 14), ls = Math.max(30, G.track.refLap * 1.06), H = [], ks = compoundsOn(), pl = pitLossLaps(), nzk = k => nz ? nz[k] : 1;
  for (let l = 0; l < L; l++) H.push(hAhead((l + .5) * ls));
  // F[k][a][n]: n laps on a fresh set of k fitted before lap a
  const F = ks.map(k => { const A = []; for (let a = 0; a < L; a++) { const c = [0]; let w = 100; for (let n = 1; n <= L - a; n++) { const r = lapCost(k, w, H[a + n - 1], 1); c.push(c[n - 1] + r[0] * nzk(k)); w = r[1]; } A.push(c); } return A; });
  const tail = []; // tail[s][a]: best cost from lap a to the flag on fresh tyres with at most s more stops → [cost, k, n]
  for (let sN = 0; sN < 3; sN++) { const row = []; for (let a = L - 1; a >= 0; a--) { let best = [1e9, ks[0], L - a];
      ks.forEach((k, ki) => { const c0 = F[ki][a][L - a]; if (c0 < best[0]) best = [c0, k, L - a];
        if (sN) for (let b = a + 1; b < L; b++) { const c1 = F[ki][a][b - a] + pl + tail[sN - 1][b][0]; if (c1 < best[0]) best = [c1, k, b - a]; } });
      row[a] = best; } tail.push(row); }
  if (!cur) { const t = tail[2][0]; return { cost: t[0], k: t[1], n: t[2] }; }
  const now = pl + tail[1][0][0]; let stay = 0, w = cur.wear, run = 0, bestStay = 1e9;
  for (let m = 1; m <= L; m++) { const r = lapCost(cur.k, w, H[m - 1], cur.wv); run += r[0] * nzk(cur.k); w = r[1]; bestStay = Math.min(bestStay, run + (m < L ? pl + tail[1][m][0] : 0)); }
  stay = bestStay; return { cost: Math.min(now, stay), k: tail[1][0][1], n: tail[1][0][2], now, stay };
}
const BOTNZ = Array.from({ length: 8 }, () => [rand(.985, 1.015), rand(.985, 1.015), rand(.985, 1.015), 1]);
/* every bot gets a plan on the grid: soft→medium, medium→hard, hard→medium… with its stop lap. It follows the plan while the
   track is dry and the tyres last; rain, damage or a worn-out set hand the call back to the live calculation */
const STRATS = [[0, 1, 4], [1, 2, 3], [2, 1, 3], [1, 0, 3], [0, 2, 2], [2, 0, 2], [1, 1, 1], [0, 0, 1]], LIFE = [.36, .5, .62];
function botStrat(laps) {
  if (!G.opts.tyres || G.h > 18 || G.opts.wx === 2 || G.opts.wx === 3 || G.opts.wx === 5) return null;
  if (laps <= 3) return { k0: 0, k1: -1, at: 99 }; // a sprint: softs for all, nothing else is quicker
  if (laps < 6) return { k0: Math.random() < .8 ? 0 : 1, k1: -1, at: 99 }; // short: softs, a few gamble on mediums — never hards
  let tot = 0; for (const q of STRATS) tot += q[2]; let r = Math.random() * tot, pick = STRATS[0]; for (const q of STRATS) { r -= q[2]; if (r < 0) { pick = q; break; } }
  let life = 0; for (let w = 100; life < laps; life++) { w = lapCost(pick[0], w, G.h, 1.1)[1]; if (w < 42) break; } // the first set comes off before it drops past 40%
  return { k0: pick[0], k1: pick[1], at: clamp(Math.min(life, Math.round(laps * (LIFE[pick[0]] + rand(-.07, .07)))), 2, laps - 1) };
}
function botTyre(lapsLeft, c) {
  if (!G.opts.tyres) return 0;
  if (lapsLeft <= 3 && G.h < 18) return 0; // three laps or fewer on a dry track: nothing beats the soft
  if (c && c.strat && c.strat.k1 >= 0 && !c.stops && G.h < 18) return c.strat.k1; const nz = c && c.ai && c.ai.nz;
  return plan(Math.max(1, lapsLeft), null, nz || BOTNZ[Math.random() * BOTNZ.length | 0]).k;
}
/* should this bot box this lap? "pit now" against the best plan that stays out at least one more lap */
function botWantsPit(c) {
  const left = G.laps - c.lap; if (left <= 0) return false;
  if (Math.min(lapCost(c.tyre, c.wear, G.h, c.wv)[1], lapCost(c.tyre, c.wear, hAhead(G.track.refLap), c.wv)[1]) < 35) return true; // the set would drop under 30% before the next chance to stop: box now, always
  const st = c.strat; if (st && st.k1 >= 0 && !c.stops && G.h < 18 && c.tyre === st.k0 && c.wear > 40) return c.lap >= st.at; // the plan, as long as it still makes sense
  const p = plan(left, { k: c.tyre, wear: c.wear, wv: c.wv }, c.ai.nz);
  return p.now + c.ai.pitBias + (left === 1 ? .02 : 0) < p.stay;
}
/* the tyre the pit wall would fit for the rest of the race (shown to the player as the recommended one) */
function bestTyre(lapsLeft) { return G.opts.tyres ? plan(Math.max(1, lapsLeft), null, null).k : 0; }
function fitTyre(c, k) { c.tyre = k; c.wear = 100; c.wv = rand(.8, 1.2); (c.hist || (c.hist = [])).push(k); } // hist: every set the car ran, for the results
/* the sky over one race is decided on the grid: it stays, or it changes once or twice — never a new sky every lap.
   Automatic weather follows the circuit's climate; a fixed choice stays fixed. */
function nextSky(s, wetC, dry) {
  const r = Math.random();
  if (s === 0) return !dry && r < wetC * .5 ? 2 : 1;
  if (s === 1) return r < .3 + wetC * .9 ? (!dry && Math.random() < .2 + wetC * .5 ? 3 : 2) : 0;
  if (s === 2) return r < .5 ? 1 : r < .72 && !dry ? 3 : 0;
  return r < .6 ? 2 : 1;
}
function wxPlan() {
  const cl = G.track.def.climate || [.5, .25, .2, .05], wetC = cl[2] + cl[3], dry = wetC < .1, P = []; let s = G.wS || 0;
  if (G.laps >= 999) { let t = 0; for (let k = 0; k < 14; k++) { t += rand(240, 600); s = Math.random() < .45 ? s : nextSky(s, wetC, dry); P.push({ t, s }); } return P; } // practice: a slow sky
  const dur = Math.max(90, G.laps * G.track.refLap * 1.1), short = G.laps <= 3;
  let n = Math.random() < (short ? .18 : .32) + wetC * (short ? .5 : .9) + (s === 1 ? .12 : 0) ? 1 : 0; // a grey sky is the one that tends to turn
  if (n && !short && G.laps >= 8 && Math.random() < .3 + wetC * .6) n = 2;
  for (let k = 0; k < n; k++) { const t = dur * (n === 1 ? rand(.22, .62) : k === 0 ? rand(.18, .4) : rand(.58, .82)); s = nextSky(s, wetC, dry); P.push({ t, s }); }
  return P;
}
function weatherTick(dt) {
  const m = G.opts.wx; if (m == null || m < 0 || G.sess === 'quali') return;
  if (G.sess === 'race' && G.order && G.order.length) return; // the leader has the flag: the sky stays as it is
  let st = m;
  if (m === 4) { if (G.net !== 'client') { if (G.wS == null) G.wS = 0; if (!G.wPlan) G.wPlan = wxPlan(); while (G.wPlan.length && G.t >= G.wPlan[0].t) G.wS = G.wPlan.shift().s; } st = G.wS == null ? 0 : G.wS; }
  else G.wS = m;
  const target = WX_T[st], rate = st === 3 ? 2 : st === 2 ? 1 : st === 5 ? .8 : .6; // light rain +1%/s, downpour +2%/s
  G.h = G.h < target ? Math.min(target, G.h + rate * dt) : Math.max(target, G.h - (G.h > 40 && target < 20 ? .7 : 1) * dt);
}

/* ---------- settings ---------- */
const S = Object.assign({ team: 0, diff: 1, laps: 3, lefty: false, sound: true, name: '', ctrl: 'wheel', track: 0, quali: false, bots: true, tyres: true, weather: true, wx: 4, zoom: 1, nick: true, line: true, abs: true, gfx: 'auto', tw: 1.4, mapS: 1, wheelS: 1, padS: 1, hudS: 1, spdFx: .6, assist: 2, seat: 0, n22: false, rows: 5, vol: 1, volE: 1, volF: 1, kmh: true, skin: 0 },
  (() => { try { return JSON.parse(localStorage.getItem('apexgp') || '{}'); } catch (e) { return {}; } })());
if (!S.fx3) { S.spdFx = .3; S.fx3 = 1; }
if (!S.v5) { S.v5 = 1; S.volF = .6; if (!S.gfx || S.gfx === 'auto') S.gfx = 'auto'; }
if (!S.v4) { S.v4 = 1; S.tw = 1.4; S.spdFx = Math.max(.6, S.spdFx || 0); S.assist = 2; } // this update: wider road by default, more sense of speed
/* ---------- driving aids ----------
   grip: how much more the tyres hold than a bot's · guard: the nose is eased away from a wall · wall: how much of a hit is paid for in speed
   settle: on keys the nose settles along the road · rub: catch-up help far behind · cap: steering lock limited to what the grip takes
   Level 0 leaves the driver alone with the car; level 3 is the old "it drives itself" behaviour. Auto-brake on lift needs level 2+. */
const ASSIST = [
  { n: 'Выкл',    grip: 1.06, guard: 0,   wall: 1,   settle: 0,  rub: 0,  cap: 1.25 },
  { n: 'Низкая',  grip: 1.12, guard: 0,   wall: .8,  settle: .5, rub: .5, cap: 1.1 },
  { n: 'Средняя', grip: 1.19, guard: .45, wall: .55, settle: 1,  rub: 1,  cap: 1 },
  { n: 'Полная',  grip: 1.27, guard: 1,   wall: .22, settle: 1,  rub: 1,  cap: 1 }];
const asLvl = () => clamp(+(G.opts && G.opts.as != null ? G.opts.as : S.assist) || 0, 0, 3) | 0, AS = () => ASSIST[asLvl()];
const sfx = (n, a, b, c) => { const x = window.SFX; if (x && x[n]) x[n](a, b, c); };
const saveS = () => { try { localStorage.setItem('apexgp', JSON.stringify(S)); } catch (e) {} };

/* =====================================================================
   TRACK
   ===================================================================== */
const MONACO = {
  name: 'MONACO', sub: 'Circuit de Monaco · Monte Carlo', km: '3.34', scale: 2.2, hw: 130, wall: 14, theme: 'city',
  pts: [[0.0,1000.0],[0.0,978.2],[0.0,956.3],[0.0,934.5],[0.0,912.7],[0.0,890.8],[0.0,869.0],[0.0,847.2],[0.0,825.3],[0.0,803.5],[0.0,781.7],[0.0,759.9],[0.0,738.0],[0.0,716.2],[0.0,694.4],[0.0,672.5],[0.0,650.7],[0.0,628.9],[0.0,607.0],[0.0,585.2],[0.0,563.4],[0.0,541.5],[0.0,519.7],[0.0,497.9],[0.0,476.0],[0.0,454.2],[0.0,432.4],[-0.0,410.6],[-0.0,388.7],[-0.1,366.9],[-0.1,345.1],[-0.3,323.2],[-0.4,301.4],[-0.6,279.6],[-0.8,257.7],[-1.0,235.9],[-1.2,214.1],[-1.4,192.2],[-1.6,170.4],[-1.8,148.6],[-2.0,126.8],[-2.1,104.9],[-2.2,83.1],[-2.2,61.3],[-2.2,39.4],[-2.0,17.6],[-1.7,-4.2],[-1.2,-26.1],[-0.5,-47.9],[0.4,-69.7],[1.3,-91.5],[2.1,-113.3],[3.0,-135.1],[4.4,-156.9],[7.3,-178.5],[13.3,-199.5],[23.0,-219.1],[35.3,-237.0],[50.3,-252.9],[67.8,-266.0],[86.7,-276.8],[106.4,-286.3],[126.3,-295.2],[146.2,-304.1],[166.0,-313.3],[185.7,-322.7],[205.6,-331.8],[225.6,-340.4],[245.8,-348.7],[266.1,-356.8],[286.4,-364.8],[306.7,-372.8],[327.0,-380.8],[347.3,-389.0],[367.5,-397.2],[387.6,-405.7],[407.6,-414.4],[427.5,-423.4],[447.3,-432.7],[466.9,-442.4],[486.2,-452.5],[505.3,-463.0],[524.2,-473.9],[543.0,-485.0],[561.7,-496.4],[580.2,-507.9],[598.7,-519.6],[617.0,-531.4],[635.3,-543.3],[653.5,-555.4],[671.6,-567.6],[689.6,-579.9],[707.6,-592.3],[725.4,-604.9],[743.2,-617.5],[761.0,-630.3],[778.6,-643.2],[796.1,-656.2],[813.5,-669.4],[830.8,-682.7],[847.9,-696.3],[864.8,-710.1],[881.5,-724.1],[898.0,-738.5],[914.0,-753.3],[929.5,-768.7],[944.2,-784.8],[958.0,-801.7],[970.9,-819.3],[982.7,-837.7],[993.5,-856.7],[1002.1,-876.7],[1008.3,-897.6],[1013.0,-919.0],[1016.6,-940.5],[1019.9,-962.1],[1023.4,-983.6],[1027.9,-1005.0],[1034.2,-1025.9],[1042.9,-1045.9],[1052.8,-1065.3],[1063.4,-1084.4],[1074.8,-1103.0],[1087.3,-1120.9],[1101.0,-1137.9],[1116.1,-1153.7],[1132.6,-1167.9],[1150.6,-1180.3],[1169.7,-1190.8],[1189.6,-1199.7],[1210.1,-1207.4],[1230.9,-1213.9],[1252.1,-1219.3],[1273.5,-1223.7],[1295.0,-1227.0],[1316.8,-1229.1],[1338.6,-1230.0],[1360.4,-1229.5],[1382.1,-1227.3],[1403.6,-1223.7],[1424.9,-1218.9],[1446.0,-1213.3],[1466.8,-1206.7],[1487.4,-1199.3],[1507.6,-1191.1],[1527.4,-1182.0],[1546.8,-1171.8],[1565.0,-1159.9],[1581.6,-1145.7],[1596.3,-1129.6],[1609.3,-1112.0],[1620.9,-1093.5],[1631.7,-1074.6],[1642.4,-1055.6],[1652.0,-1036.0],[1660.0,-1015.6],[1666.6,-994.8],[1672.2,-973.7],[1677.4,-952.5],[1681.7,-931.1],[1686.9,-910.0],[1697.0,-890.7],[1711.3,-874.2],[1729.1,-861.7],[1749.3,-853.5],[1770.8,-850.3],[1792.5,-852.3],[1813.3,-859.1],[1831.7,-870.7],[1846.9,-886.3],[1858.6,-904.7],[1865.6,-925.3],[1870.9,-946.4],[1881.1,-965.7],[1893.6,-983.6],[1908.0,-1000.0],[1925.0,-1013.7],[1944.6,-1023.0],[1965.9,-1027.7],[1987.7,-1027.4],[2008.9,-1022.4],[2028.7,-1013.3],[2047.3,-1001.8],[2064.5,-988.3],[2080.3,-973.3],[2094.8,-957.0],[2107.9,-939.6],[2119.5,-921.1],[2129.2,-901.5],[2137.4,-881.3],[2144.4,-860.6],[2150.0,-839.5],[2153.6,-818.0],[2154.7,-796.2],[2152.9,-774.5],[2148.0,-753.2],[2141.1,-732.5],[2132.8,-712.3],[2123.0,-692.8],[2111.9,-674.0],[2099.6,-655.9],[2086.3,-638.7],[2071.9,-622.2],[2056.7,-606.6],[2040.8,-591.6],[2024.2,-577.4],[2007.2,-563.8],[1989.8,-550.6],[1972.1,-537.7],[1954.3,-525.2],[1936.2,-512.9],[1918.0,-500.9],[1899.6,-489.1],[1881.1,-477.5],[1862.5,-466.1],[1843.7,-455.0],[1824.9,-444.0],[1805.9,-433.3],[1786.7,-422.9],[1767.2,-413.0],[1747.5,-403.6],[1727.5,-394.8],[1707.4,-386.3],[1687.1,-378.1],[1666.8,-370.3],[1646.3,-362.6],[1625.9,-355.0],[1605.4,-347.4],[1585.0,-339.7],[1564.6,-331.8],[1544.3,-323.8],[1524.0,-315.9],[1503.6,-308.1],[1483.1,-300.4],[1462.7,-292.8],[1442.2,-285.2],[1421.8,-277.5],[1401.3,-269.9],[1380.9,-262.1],[1360.6,-254.2],[1340.4,-245.8],[1320.9,-236.1],[1301.9,-225.2],[1282.7,-214.9],[1261.9,-208.6],[1240.2,-206.9],[1218.7,-210.8],[1198.7,-219.3],[1179.6,-230.0],[1158.8,-236.4],[1137.1,-238.2],[1115.6,-235.0],[1095.2,-227.2],[1076.7,-215.6],[1057.4,-205.5],[1036.5,-199.5],[1014.8,-197.0],[993.0,-196.3],[971.1,-196.4],[949.3,-196.8],[927.5,-197.1],[905.6,-196.9],[883.9,-195.7],[862.2,-192.8],[841.1,-187.3],[820.4,-180.3],[800.3,-171.9],[781.0,-161.7],[763.1,-149.2],[747.3,-134.2],[734.2,-116.8],[724.0,-97.5],[716.7,-76.9],[711.2,-55.8],[707.1,-34.4],[704.0,-12.7],[701.9,9.0],[700.5,30.8],[699.9,52.6],[699.9,74.4],[701.4,96.2],[705.4,117.6],[711.3,138.7],[718.2,159.4],[725.4,180.0],[732.0,200.8],[737.1,222.0],[739.7,243.7],[738.9,265.5],[734.1,286.7],[726.1,307.1],[717.9,327.3],[711.1,348.0],[706.2,369.3],[702.7,390.8],[700.5,412.6],[699.2,434.3],[698.3,456.2],[697.6,478.0],[697.1,499.8],[696.7,521.6],[696.4,543.5],[696.3,565.3],[696.2,587.1],[696.2,609.0],[696.2,630.8],[696.3,652.6],[696.4,674.4],[696.6,696.3],[696.8,718.1],[697.1,739.9],[697.4,761.8],[697.7,783.6],[698.1,805.4],[698.5,827.3],[698.9,849.1],[699.4,870.9],[699.8,892.7],[700.4,914.6],[701.3,936.4],[702.4,958.2],[703.8,980.0],[705.3,1001.7],[707.0,1023.5],[708.8,1045.3],[710.6,1067.0],[712.5,1088.8],[714.4,1110.5],[716.2,1132.3],[717.9,1154.0],[719.4,1175.8],[720.6,1197.6],[721.4,1219.4],[721.7,1241.3],[721.1,1263.1],[719.4,1284.8],[715.7,1306.3],[709.3,1327.2],[700.2,1347.0],[688.8,1365.6],[676.1,1383.4],[663.9,1401.4],[655.2,1421.4],[651.4,1442.9],[652.8,1464.6],[658.6,1485.6],[667.2,1505.7],[676.7,1525.4],[685.8,1545.2],[693.6,1565.6],[698.7,1586.8],[700.2,1608.5],[700.4,1630.4],[699.9,1652.2],[698.6,1674.0],[696.3,1695.7],[692.7,1717.2],[687.3,1738.4],[679.8,1758.9],[669.3,1778.0],[655.3,1794.7],[638.3,1808.4],[619.7,1819.7],[600.0,1829.1],[579.6,1837.0],[558.8,1843.6],[537.7,1849.0],[516.3,1853.4],[494.7,1856.8],[473.0,1859.1],[451.2,1860.3],[429.4,1860.0],[407.6,1858.3],[386.0,1855.4],[364.5,1851.3],[343.3,1846.2],[322.4,1840.1],[301.7,1833.0],[281.5,1824.9],[261.6,1815.9],[242.2,1805.8],[223.2,1795.0],[204.7,1783.5],[186.7,1771.2],[169.2,1758.1],[152.3,1744.2],[136.2,1729.5],[121.0,1713.9],[106.6,1697.4],[93.3,1680.1],[81.2,1662.0],[70.2,1643.1],[60.1,1623.8],[50.9,1604.0],[42.6,1583.8],[35.1,1563.3],[28.4,1542.5],[22.5,1521.5],[17.2,1500.3],[12.6,1479.0],[8.5,1457.5],[4.9,1436.0],[1.8,1414.4],[-0.8,1392.7],[-2.9,1371.0],[-4.3,1349.2],[-5.3,1327.4],[-5.8,1305.6],[-5.9,1283.7],[-5.8,1261.9],[-5.4,1240.1],[-4.9,1218.2],[-4.3,1196.4],[-3.6,1174.6],[-2.9,1152.8],[-2.3,1131.0],[-1.6,1109.1],[-1.1,1087.3],[-0.6,1065.5],[-0.3,1043.7],[-0.1,1021.8]],
  sea: [[900,-20],[1100,-25],[1250,-40],[1460,-108],[1670,-180],[1910,-280],[2190,-470],[2330,-760],[2400,-1150],[3600,-1150],[3600,3200],[1600,3200],[1600,2150],[1250,1950],[900,1950]],
  beach: [[2190,-470],[2330,-760],[2400,-1150],[3600,-1150]],
  piers: [[[1150,150],[1150,1250]],[[1400,250],[1400,1350]],[[950,1600],[1500,1600]],[[2000,-200],[2400,700]]],
  parks: [[1250,-980,230],[300,2350,600],[700,2200,260],[-500,-200,260],[1777,-855,30],[2250,-1350,200]],
  tunnel: [[2150,-760],[1250,-215]],
  decor: [['fountain',1250,-990],['heli',520,2420],['tennis',-420,-180,.35],['tennis',2230,-1380,.35],['pool',-120,1250,0],['pool',1950,-1350,.35]]
};

function crc(p0, p1, p2, p3, t) { // centripetal Catmull-Rom
  const d = (p, q) => Math.pow(Math.hypot(q[0] - p[0], q[1] - p[1]), .5) || 1e-4;
  const t0 = 0, t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), tt = t1 + (t2 - t1) * t;
  const L = (A, B, a, b) => { const w = (tt - a) / (b - a); return [A[0] + (B[0] - A[0]) * w, A[1] + (B[1] - A[1]) * w]; };
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  return L(L(A1, A2, t0, t2), L(A2, A3, t1, t3), t1, t2);
}
/* the racing line as a minimum-curvature path: each point moves along its normal toward where a smooth curve through its
   neighbours wants it (a 5-point biharmonic stencil, stride 5), clamped to the road. Starts from the apex heuristic. */
function shortLine(T, X, Y, d0, lim) { // the shortest way round inside the road: every point pulled to the middle of its neighbours
  const N = T.N, d = Float32Array.from(d0), s = 4, J = i => (i + N) % N, px = i => X[J(i)] + T.nx[J(i)] * d[J(i)], py = i => Y[J(i)] + T.ny[J(i)] * d[J(i)];
  for (let it = 0; it < 90; it++) for (let i = 0; i < N; i++) { const tx = (px(i - s) + px(i + s)) / 2, ty = (py(i - s) + py(i + s)) / 2; d[i] = clamp((tx - X[i]) * T.nx[i] + (ty - Y[i]) * T.ny[i], -lim, lim); }
  return smooth(d, 3, 2);
}
function lineK(T, X, Y, d) { // curvature of a line given as offsets, per track point
  const N = T.N, J = i => (i + N) % N, k = new Float32Array(N), px = i => X[J(i)] + T.nx[J(i)] * d[J(i)], py = i => Y[J(i)] + T.ny[J(i)] * d[J(i)];
  for (let i = 0; i < N; i++) { const a1 = Math.atan2(py(i) - py(i - 4), px(i) - px(i - 4)), a2 = Math.atan2(py(i + 4) - py(i), px(i + 4) - px(i)), L = Math.hypot(px(i + 4) - px(i - 4), py(i + 4) - py(i - 4)) / 2; k[i] = wrapA(a2 - a1) / Math.max(1, L); }
  return smooth(k, 3, 3);
}
function lineLap(T, X, Y, d) { // quasi-steady lap time on that line: corner speed from grip, flat-out with the real power curve, braking backwards
  const N = T.N, k = lineK(T, X, Y, d), J = i => (i + N) % N, vc = new Float32Array(N), ds = new Float32Array(N);
  for (let i = 0; i < N; i++) { vc[i] = Math.min(VMAX, Math.sqrt(GRIP * .93 / Math.max(Math.abs(k[i]), 1e-6))); ds[i] = Math.hypot(X[J(i + 1)] + T.nx[J(i + 1)] * d[J(i + 1)] - X[i] - T.nx[i] * d[i], Y[J(i + 1)] + T.ny[J(i + 1)] * d[J(i + 1)] - Y[i] - T.ny[i] * d[i]); }
  for (let it = 0; it < 2; it++) for (let i = N - 1; i >= 0; i--) vc[i] = Math.min(vc[i], Math.sqrt(vc[J(i + 1)] ** 2 + 2 * BRAKE * .8 * ds[i]));
  let v = 200, t = 0; for (let l = 0; l < 2; l++) { t = 0; for (let i = 0; i < N; i++) { v = Math.min(vc[i], Math.sqrt(v * v + 2 * netA(v, VMAX) * ds[i])); t += ds[i] / Math.max(v, 30); } }
  return t;
}
function bestLine(T, X, Y, d0, lim) { // try blends of the two classic lines, keep the one with the quickest simulated lap
  const mc = minCurveLine(T, X, Y, d0, lim), sp = shortLine(T, X, Y, mc, lim); let best = mc, bt = lineLap(T, X, Y, mc);
  for (const w of [.35, .7, 1]) { const d = mc.map((v, i) => v * (1 - w) + sp[i] * w), t = lineLap(T, X, Y, d); if (t < bt - 1e-3) { bt = t; best = d; } }
  T.lineW = best === mc ? 0 : null; return best;
}
function minCurveLine(T, X, Y, d0, lim) {
  const N = T.N, d = Float32Array.from(d0), s = 5, J = i => (i + N) % N, px = i => X[J(i)] + T.nx[J(i)] * d[J(i)], py = i => Y[J(i)] + T.ny[J(i)] * d[J(i)];
  for (let it = 0; it < 110; it++) for (let i = 0; i < N; i++) {
    const tx = (-px(i - 2 * s) + 4 * px(i - s) + 4 * px(i + s) - px(i + 2 * s)) / 6, ty = (-py(i - 2 * s) + 4 * py(i - s) + 4 * py(i + s) - py(i + 2 * s)) / 6;
    const want = (tx - X[i]) * T.nx[i] + (ty - Y[i]) * T.ny[i]; d[i] = clamp(d[i] + (want - d[i]) * .8, -lim, lim); }
  return smooth(d, 3, 2);
}
const smooth = (a, r, passes) => {
  const N = a.length; let s = Float32Array.from(a);
  for (let p = 0; p < passes; p++) {
    const o = new Float32Array(N);
    for (let i = 0; i < N; i++) { let v = 0; for (let k = -r; k <= r; k++) v += s[(i + k + N) % N]; o[i] = v / (2 * r + 1); }
    s = o;
  }
  return s;
};

MONACO.id = 'monaco'; MONACO.flag = 'mc'; MONACO.climate = [.6, .25, .13, .02]; MONACO.sec = [.31, .69];
const TRK = [MONACO, ...(window.EXTRA_TRACKS || [])], TRK_C = [];
const normTw = w => clamp(Math.round((+w || 1.4) * 100) / 100, .6, 1.9);
/* each circuit's own character: road width (× the player's base width), weather odds [dry, cloudy, rain, storm], place in the 2026 calendar */
const CAL = [['melbourne', 'МАР'], ['shanghai', 'МАР'], ['suzuka', 'МАР'], ['sakhir', 'АПР'], ['jeddah', 'АПР'], ['miami', 'МАЙ'], ['montreal', 'МАЙ'], ['monaco', 'ИЮН'], ['catalunya', 'ИЮН'], ['rbring', 'ИЮН'], ['silverstone', 'ИЮЛ'], ['spa', 'ИЮЛ'], ['hungaroring', 'ИЮЛ'], ['zandvoort', 'АВГ'], ['monza', 'СЕН'], ['madrid', 'СЕН'], ['baku', 'СЕН'], ['marinabay', 'ОКТ'], ['austin', 'ОКТ'], ['mexico', 'НОЯ'], ['interlagos', 'НОЯ'], ['vegas', 'НОЯ'], ['losail', 'НОЯ'], ['yas', 'ДЕК']];
const PAST = { sepang: 'до 2017', nurburgring: 'до 2013', valencia: 'до 2012', sochi: 'до 2021', longbeach: 'до 1983', lemans: '1967' };
const TRACK_CFG = { monaco: [.78, [.65, .2, .12, .03]], marinabay: [.85, [.38, .22, .25, .15]], baku: [1, [.72, .2, .07, .01]], jeddah: [.92, [.8, .15, .05, 0]], sakhir: [1.08, [.8, .15, .05, 0]], losail: [1.08, [.8, .15, .05, 0]], yas: [1.05, [.85, .12, .03, 0]],
  vegas: [.95, [.8, .15, .05, 0]], madrid: [.9, [.75, .18, .06, .01]], miami: [.95, [.55, .2, .18, .07]], valencia: [.9, [.75, .18, .06, .01]], longbeach: [.85, [.85, .12, .03, 0]], montreal: [.95, [.5, .25, .2, .05]], melbourne: [.97, [.55, .25, .15, .05]],
  mexico: [1.05, [.55, .2, .2, .05]], monza: [1.15, [.65, .2, .12, .03]], spa: [1.08, [.25, .3, .3, .15]], silverstone: [1.08, [.35, .3, .25, .1]], austin: [1.08, [.65, .2, .12, .03]], shanghai: [1.08, [.4, .25, .25, .1]], sepang: [1.08, [.3, .2, .3, .2]],
  interlagos: [1, [.35, .25, .25, .15]], hungaroring: [.97, [.65, .22, .1, .03]], zandvoort: [.95, [.45, .3, .18, .07]], rbring: [1.02, [.5, .25, .2, .05]], suzuka: [.97, [.45, .25, .2, .1]], catalunya: [1.05, [.7, .2, .08, .02]], nurburgring: [1.05, [.35, .3, .25, .1]], lemans: [.95, [.45, .3, .2, .05]], sochi: [1, [.6, .22, .15, .03]] };
TRK.forEach(d => { const c = TRACK_CFG[d.id]; if (c) { d.wk = c[0]; d.climate = c[1]; } const k = CAL.findIndex(q => q[0] === d.id); d.cal = k >= 0 ? k : null; d.mon = k >= 0 ? CAL[k][1] : null; d.past = PAST[d.id] || null; });
const TRK_ORDER = TRK.map((_, i) => i).sort((a, b) => { const A = TRK[a], B = TRK[b], g = d => d.cal != null ? 0 : d.past ? 1 : 2; return g(A) - g(B) || (A.cal != null ? A.cal - B.cal : A.name.localeCompare(B.name)); });
const twOf = (i, base) => normTw((base == null ? S.tw : base) * (TRK[i].wk || 1) * (((S.twT || {})[TRK[i].id]) || 1)); // this circuit's road width for this player
const getTrack = (i, w) => { w = w == null ? twOf(i) : normTw(w); const t = TRK_C[i]; return t && t.tw === w ? t : (TRK_C[i] = buildTrack(TRK[i], w)); };
function buildTrack(def, tw) {
  const P = def.pts.map(p => [p[0] * def.scale, p[1] * def.scale]), n = P.length, dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const steps = Math.max(6, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 3));
    for (let k = 0; k < steps; k++) dense.push(crc(p0, p1, p2, p3, k / steps));
  }
  const rs = dense => { const X = [dense[0][0]], Y = [dense[0][1]]; let acc = 0;
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length], seg = Math.hypot(b[0] - a[0], b[1] - a[1]); let t0 = 0;
    if (seg < 1e-6) continue;
    while (acc + seg * (1 - t0) >= DS) { t0 += (DS - acc) / seg; acc = 0; X.push(a[0] + (b[0] - a[0]) * t0); Y.push(a[1] + (b[1] - a[1]) * t0); }
    acc += seg * (1 - t0);
  }
  if (Math.hypot(X[X.length - 1] - X[0], Y[Y.length - 1] - Y[0]) < DS * .6) { X.pop(); Y.pop(); } return [X, Y]; };
  let [X, Y] = rs(dense);
  { // a hairpin tighter than half the road folds its inside edge and its barrier: open it until a car fits
    const Rmin = Math.round(def.hw * tw) * .9, n = X.length, ang = new Float32Array(n), bad = new Uint8Array(n); let moved = false;
    for (let pass = 0; pass < 140; pass++) { let any = false; bad.fill(0);
      for (let i = 0; i < n; i++) { const a = (i - 3 + n) % n, b = (i + 3) % n; ang[i] = Math.atan2(Y[b] - Y[a], X[b] - X[a]); }
      for (let i = 0; i < n; i++) if (Math.abs(wrapA(ang[(i + 3) % n] - ang[(i - 3 + n) % n])) / (6 * DS) * Rmin > 1 && Math.abs(wrapA(ang[(i + 16) % n] - ang[(i - 16 + n) % n])) > 1.75) { any = true; for (let e = -10; e <= 10; e++) bad[(i + e + n) % n] = 1; }
      if (!any) break; moved = true; const nx = X.slice(), ny = Y.slice();
      for (let i = 0; i < n; i++) if (bad[i]) { let sx = 0, sy = 0; for (let e = -3; e <= 3; e++) { const j = (i + e + n) % n; sx += X[j]; sy += Y[j]; } nx[i] = sx / 7; ny[i] = sy / 7; }
      X = nx; Y = ny; }
    if (moved) [X, Y] = rs(X.map((x, i) => [x, Y[i]])); }
  { // traced straights carry a little wobble from the poster: iron it out where the road is meant to be straight (corners are left alone)
    const n = X.length, ang = new Float32Array(n), flat = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const a = (i - 4 + n) % n, b = (i + 4) % n; ang[i] = Math.atan2(Y[b] - Y[a], X[b] - X[a]); }
    for (let i = 0; i < n; i++) { let mx = 0; for (let e = -24; e <= 24; e += 4) mx = Math.max(mx, Math.abs(wrapA(ang[(i + e + 4 + n) % n] - ang[(i + e - 4 + n) % n]))); if (Math.abs(wrapA(ang[(i + 30) % n] - ang[(i - 30 + n) % n])) < .22 && mx < .12) flat[i] = 1; }
    let any = false; for (let pass = 0; pass < 10; pass++) { const nx = X.slice(), ny = Y.slice(); for (let i = 0; i < n; i++) if (flat[i]) { any = true; let sx = 0, sy = 0; for (let e = -4; e <= 4; e++) { const j = (i + e + n) % n; sx += X[j]; sy += Y[j]; } nx[i] = sx / 9; ny[i] = sy / 9; } X = nx; Y = ny; }
    if (any) [X, Y] = rs(X.map((x, i) => [x, Y[i]])); }
  const N = X.length, hw = Math.round(def.hw * tw);
  const T = { def, N, hw, tw, sand: ((window.FX && FX.look[def.id]) || {}).g === 2, wall: def.wall, city: def.theme === 'city', len: N * DS, x: Float32Array.from(X), y: Float32Array.from(Y),
    tx: new Float32Array(N), ty: new Float32Array(N), nx: new Float32Array(N), ny: new Float32Array(N), ang: new Float32Array(N) };
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N; let dx = X[b] - X[a], dy = Y[b] - Y[a]; const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    T.tx[i] = dx; T.ty[i] = dy; T.nx[i] = -dy; T.ny[i] = dx; T.ang[i] = Math.atan2(dy, dx);
  }
  const k = new Float32Array(N);
  for (let i = 0; i < N; i++) k[i] = wrapA(T.ang[(i + 4) % N] - T.ang[(i - 4 + N) % N]) / (8 * DS);
  T.k = smooth(k, 3, 3);
  const kw = smooth(T.k, 6, 10);
  T.line = new Float32Array(N);
  for (let i = 0; i < N; i++) T.line[i] = Math.sign(kw[i]) * hw * .72 * Math.min(1, Math.abs(kw[i]) * 520);
  T.line = smooth(T.line, 7, 6); // one flowing line through a run of bends, not a zig-zag from kerb to kerb
  T.line = bestLine(T, X, Y, T.line, hw * .74); // the quickest line found by lap simulation: between minimum curvature and shortest path
  const kL = lineK(T, X, Y, T.line);
  // target speed profile (corner speed + braking backward pass)
  const ks = smooth(T.k, 4, 3); T.vt = new Float32Array(N);
  const wideR = (hw - def.hw) * 1.5, kEff = q => Math.abs(q) / Math.max(.45, 1 + Math.abs(q) * wideR); // a wider road lets a car open the corner up, bots included
  const kU = new Float32Array(N); for (let i = 0; i < N; i++) kU[i] = Math.min(kEff(ks[i]) * .8, Math.abs(kL[i]) * 1.02); // the corner as the racing line takes it
  for (let i = 0; i < N; i++) T.vt[i] = Math.min(VMAX * 1.08, Math.sqrt(GRIP * .93 / Math.max(kU[i], 1e-6)));
  // corners that turn more than 90°: T.vc = the most speed they take with the throttle still open
  T.vc = new Float32Array(N);
  { const inC = i => Math.abs(ks[i]) > 1 / 900; let s0 = 0; while (s0 < N && inC(s0)) s0++;
    for (let n = 0; n < N;) { const i0 = (s0 + n) % N; if (!inC(i0)) { n++; continue; } const sg = Math.sign(ks[i0]); let m = 0, turn = 0, km = 0;
      while (n + m < N && inC((s0 + n + m) % N) && Math.sign(ks[(s0 + n + m) % N]) === sg) { const q = Math.abs(ks[(s0 + n + m) % N]); turn += q * DS; km = Math.max(km, q); m++; }
      if (turn > 1.35) { const lim = Math.sqrt(GRIP * .93 / (kEff(km) * .8)) * .9; for (let e = 0; e < m; e++) T.vc[(s0 + n + e) % N] = lim; } n += m; } }
  for (let it = 0; it < 2; it++) for (let i = N - 1; i >= 0; i--) { const j = (i + 1) % N; T.vt[i] = Math.min(T.vt[i], Math.sqrt(T.vt[j] ** 2 + 2 * BRAKE * .8 * DS)); }
  { let v = 200, t = 0; for (let l = 0; l < 2; l++) { t = 0; for (let i = 0; i < N; i++) { const r = Math.max(0, v) / VMAX; v = Math.min(Math.min(T.vt[i], VMAX), Math.sqrt(v * v + 2 * netA(v, VMAX) * DS)); t += DS / Math.max(v, 30); } } T.refLap = t; }
  T.humC = {}; T.hum = gk => { const key = Math.round(gk * 100); if (T.humC[key]) return T.humC[key]; const vh = new Float32Array(N); for (let i = 0; i < N; i++) { vh[i] = Math.min(VMAX, Math.sqrt(GRIP * gk * .93 / Math.max(kU[i], 1e-6))); if (T.vc[i] > 0) vh[i] = Math.min(vh[i], T.vc[i] * 1.16); } // the best lap a human could drive
    for (let it = 0; it < 2; it++) for (let i = N - 1; i >= 0; i--) { const j = (i + 1) % N; vh[i] = Math.min(vh[i], Math.sqrt(vh[j] ** 2 + 2 * BRAKE * DS)); }
    let v = 200, t = 0; for (let l = 0; l < 2; l++) { t = 0; for (let i = 0; i < N; i++) { const r = Math.max(0, v) / VMAX; v = Math.min(vh[i], Math.sqrt(v * v + 2 * netA(v, VMAX) * DS)); t += DS / Math.max(v, 30); } } return T.humC[key] = t; };
  { const sq = def.sec || [1 / 3, 2 / 3]; T.sec = [Math.floor(sq[0] * N), Math.floor(sq[1] * N)]; let v = 400; const st = [0, 0, 0]; for (let i = 0; i < N; i++) { const r = Math.max(0, v) / VMAX; v = Math.min(Math.min(T.vt[i], VMAX), Math.sqrt(v * v + 2 * netA(v, VMAX) * DS)); st[i < T.sec[0] ? 0 : i < T.sec[1] ? 1 : 2] += DS / Math.max(v, 30); } const su = st[0] + st[1] + st[2]; T.secF = st.map(x => x / su); }
  // spatial hash
  T.cell = 256; T.grid = new Map();
  for (let i = 0; i < N; i += 2) { const key = Math.floor(X[i] / 256) + ',' + Math.floor(Y[i] / 256); (T.grid.get(key) || T.grid.set(key, []).get(key)).push(i); }
  // kerbs / gravel masks
  T.kerb = new Uint8Array(N); T.grav = new Int8Array(N); // grav: -1 left side, +1 right side
  for (let i = 0; i < N; i++) {
    if (def.theme !== 'city' && !def.zones && Math.abs(ks[i]) > 1 / 650) for (let e = -4; e <= 14; e++) T.grav[(i + e + N) % N] = -Math.sign(ks[i]);
  }
  { const inC = i => Math.abs(ks[i]) > 1 / 1500; let s0 = 0; while (s0 < N && inC(s0)) s0++;
    for (let n = 0; n < N;) { const i0 = (s0 + n) % N; if (!inC(i0)) { n++; continue; } const sg = Math.sign(ks[i0]); let m = 0, turn = 0;
      while (n + m < N && inC((s0 + n + m) % N) && Math.sign(ks[(s0 + n + m) % N]) === sg) { turn += Math.abs(ks[(s0 + n + m) % N]) * DS; m++; }
      if (turn > .52) for (let e = -9; e < m + 6; e++) T.kerb[(s0 + n + e + N) % N] = 1; n += m; } }
  buildRunoff(T);
  buildScenery(T);
  // nothing with a footprint may stand on, or hide, any part of the circuit
  const clearOf = (o, hx, hy) => { const ca = Math.cos(o.a), sa = Math.sin(o.a); for (const [u, v] of [[0, 0], [-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy], [0, -hy], [0, hy], [-hx, 0], [hx, 0]]) { const qx = o.x + u * ca - v * sa, qy = o.y + u * sa + v * ca; if (clearTrack(T, qx, qy)[0] < hw + T.wall + 14 || (T.pit && T.pit.block(qx, qy))) return false; } return true; };
  const settle = (L, hx, hy) => L.filter(o => { const [, bi] = nearTrack(T, o.x, o.y); let ux = o.x - T.x[bi], uy = o.y - T.y[bi]; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
    for (let k = 0; k < 9; k++) { if (clearOf(o, hx, hy)) return true; o.x += ux * 25; o.y += uy * 25; } return false; });
  T.stands = settle(T.stands, 146, 78); if (!T.pit) T.pits = settle(T.pits, 72, 84);
  return T;
}
const ss = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
/* Pit lane: a band beside the start straight, expressed in the track's own (idx, lateral) coordinates */
/* Pit lane: always beside the start straight, next to the grid. The garage row is a straight line even where the straight
   bends a little: every lateral offset in the lane carries dv(rel), the distance from the circuit's own curve to that chord.
   The way in and out may bend with the circuit. Two lanes inside: the fast lane by the pit wall, the working lane by the garages. */
function buildPit(T) {
  // [way in/out, garage spacing, run to the first garage, lane width, chord bend allowed, never after a corner, how far from the line, straightest bend beside the garages]
  const tries = [[84, 19, 18, 232, 70, 1, 260, 1 / 2500], [74, 17, 12, 222, 90, 1, 300, 1 / 2000], [64, 15, 8, 210, 110, 0, 340, 1 / 1600], [52, 14, 4, 198, 140, 0, 380, 1 / 1100], [50, 16, 10, 196, 220, 0, 520, 1 / 700], [44, 15, 8, 186, 1e9, 0, 600, 1]];
  if (T.def.pit) for (const flat of [false, true]) for (const L of [...tries.slice(2), [46, 13, 2, 190], [40, 12, 2, 184]]) for (const dc of [0, 10, -10, 20, -20]) for (const sd of [T.def.pit.sd, -T.def.pit.sd]) { const P = buildPitL(T, L[0], L[1], L[2], L[3], 1e9, 0, 0, 1, { c: T.def.pit.c + dc, sd, flat }); if (P) return P; } // a circuit that says where its pits are (Spa: the start straight)
  for (const L of tries) { const P = buildPitL(T, ...L); if (P) return P; } return null;
}
function buildPitL(T, G0, slot, pre, laneW, devMax, safe, reach, kBox, at) {
  const N = T.N, hw = T.hw, W = T.wall, len = 2 * G0 + 11 * slot + pre * 2, inner = hw + W + 10, dP = inner + laneW / 2, outer = inner + laneW + 46;
  const fl = inner + 58, bo = inner + laneW - 58, b0 = G0 + pre - (slot >> 1), b1 = len - G0 - pre + (slot >> 1);
  const pt = (i, o, sd) => [T.x[i] + T.nx[i] * o * sd, T.y[i] + T.ny[i] * o * sd];
  const devOf = (a, sd) => { // the chord from the first to the last garage, as an offset from the circuit's curve at every point of the lane
    const iA = (a + b0) % N, iB = (a + b1) % N, A = pt(iA, dP, sd), B = pt(iB, dP, sd), dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, D = new Float32Array(len + 1);
    for (let r = b0; r <= b1; r++) { const i = (a + r) % N, P0 = pt(i, dP, sd), qx = T.nx[i] * sd, qy = T.ny[i] * sd, den = qx * uy - qy * ux; D[r] = Math.abs(den) < .05 ? 0 : -((P0[0] - A[0]) * uy - (P0[1] - A[1]) * ux) / den; }
    for (let r = 0; r <= len; r++) if (r < b0) D[r] = D[b0] * ss((r - (G0 - 10)) / (b0 - G0 + 10)); else if (r > b1) D[r] = D[b1] * ss((len - G0 + 10 - r) / (len - G0 + 10 - b1));
    return D; };
  const fit = (a, sd) => {
    for (let r = b0 - 6; r <= b1 + 6; r += 2) if (Math.abs(T.k[(a + r + N) % N]) > kBox) return null; // no corner beside the garages
    const D = at && at.flat ? new Float32Array(len + 1) : devOf(a, sd); for (let r = b0; r <= b1; r++) if (Math.abs(D[r]) > devMax) return null;
    if (safe) for (let r = -80; r <= G0 * .6; r += 2) { const i = (a + r + N) % N; if (T.k[i] * sd < 0 && 1 / Math.abs(T.k[i]) < 2400) return null; } // never on the outside of a corner exit: nobody drives in by mistake
    for (let r = 0; r <= len; r += 4) { const i = (a + r + N) % N;
      if (T.k[i] * sd > 0 && 1 / Math.abs(T.k[i]) < outer + (at ? 0 : 160) + Math.max(0, D[r])) return null;
      for (const o of at ? [hw + W + 60, inner + laneW, outer] : [hw + W + 60, inner + laneW, outer, outer + 140]) { const p = pt(i, o + (o > hw + W + 60 ? D[r] : 0), sd), [d, b] = nearTrack(T, p[0], p[1]); let di = Math.abs(b - i); di = Math.min(di, N - di); if (di > 45 && d < hw + W + 18) return null; } }
    return D; };
  let a = -1, sd = 1, D = null;
  if (at) { const c = (N + at.c - (len >> 1)) % N, r = fit(c, at.sd); if (r) { a = c; sd = at.sd; D = r; } }
  else search: for (let s = 0; s <= reach; s += 10) for (const sg of s ? [-1, 1] : [1]) for (const side of [1, -1]) { const c = (N - (len >> 1) + sg * s + N) % N, r = fit(c, side); if (r) { a = c; sd = side; D = r; break search; } } // the garages face the grid
  if (a < 0) return null;
  const e = rel => rel < G0 ? ss(rel / G0) : rel > len - G0 ? ss((len - rel) / G0) : 1, dv = rel => D[clamp(Math.round(rel), 0, len)];
  const P = { a, len, G: G0, sd, inner, dP, outer, laneW, box: [], boxP: [], lw: 124, bo, fl, lo: inner + 14, hi: inner + laneW - 16, div: inner + laneW / 2 + 4, dv };
  P.c = rel => lerp(hw + W - 40, fl + dv(rel), e(rel)); // the centre of the way in / the way out, which becomes the fast lane
  P.at = (rel, off) => { const i = (a + rel + N) % N; return [T.x[i] + T.nx[i] * off * sd, T.y[i] + T.ny[i] * off * sd, i]; };
  const line = (r0, r1, off, st) => { const p = new Path2D(); for (let r = r0; r <= r1; r += st || 2) { const [x, y] = P.at(r, typeof off === 'function' ? off(r) : off); r === r0 ? p.moveTo(x, y) : p.lineTo(x, y); } return p; };
  P.path = line(0, len, P.c); P.mouth = new Path2D(); P.mouth.addPath(line(0, G0 + 2, P.c)); P.mouth.addPath(line(len - G0 - 2, len, P.c));
  P.band = line(G0 - 10, len - G0 + 10, r => dP + dv(r)); P.divL = line(G0 + 4, len - G0 - 4, r => P.div + dv(r));
  P.edgeL = new Path2D(); P.hatch = new Path2D();
  for (const [r0, r1] of [[0, G0], [len - G0, len]]) { let on = false;
    for (let r = r0; r <= r1; r += 2) { const o = P.c(r) - 62; if (o < hw + 6) { on = false; continue; } const [x, y] = P.at(r, o); if (!on) { P.edgeL.moveTo(x, y); on = true; } else P.edgeL.lineTo(x, y); }
    for (let r = r0; r <= r1; r += 7) { const o = P.c(r) - 62; if (o < hw + 26) continue; const [x1, y1] = P.at(r, hw + 4), [x2, y2] = P.at(r + (r < G0 ? 6 : -6), o - 4); P.hatch.moveTo(x1, y1); P.hatch.lineTo(x2, y2); } }
  const wall = { p: new Path2D(), x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, n: 0 };
  for (let r = 0; r <= len; r += 2) { const [ox, oy] = P.at(r, lerp(hw + W, outer + 132 + dv(r), e(r)));
    r ? wall.p.lineTo(ox, oy) : wall.p.moveTo(ox, oy); wall.n++;
    wall.x0 = Math.min(wall.x0, ox); wall.y0 = Math.min(wall.y0, oy); wall.x1 = Math.max(wall.x1, ox); wall.y1 = Math.max(wall.y1, oy); }
  P.edge = new Path2D(); P.gate = new Path2D(); P.tEdge = new Path2D(); P.tEdge.addPath(line(0, G0, hw + 2)); P.tEdge.addPath(line(len - G0, len, hw + 2));
  P.wall = wall; P.apron = line(G0 - 6, len - G0 + 6, r => (inner + laneW - 6 + outer + 130) / 2 + dv(r)); P.apronW = outer + 130 - (inner + laneW - 6);
  for (const [r0, r1] of [[0, G0], [len - G0, len]]) for (let r = r0; r <= r1; r += 2) { const [x, y] = P.at(r, hw + W); r === r0 ? P.gate.moveTo(x, y) : P.gate.lineTo(x, y); }
  // garages and boxes on the chord: one straight row, all facing the same way
  const gA = P.at(b0, outer + 48 + dv(b0)), gB = P.at(b1, outer + 48 + dv(b1)), rowA = Math.atan2(gB[1] - gA[1], gB[0] - gA[0]) + Math.PI / 2;
  P.garages = [];
  for (let t = 0; t < 11; t++) { const r = G0 + pre + slot * t, [bx, by, i] = P.at(r, bo + dv(r)), [gx, gy] = P.at(r, outer + 48 + dv(r)), [qx, qy] = P.at(r, outer + 230 + dv(r)), nq = nearTrack(T, qx, qy);
    P.box[t] = r; P.boxP[t] = { x: bx, y: by, h: rowA, a: rowA - Math.PI / 2 };
    P.garages.push({ x: gx, y: gy, a: rowA - Math.PI / 2 + (sd < 0 ? Math.PI : 0), t, pad: nq[0] > outer + 170 }); } // pad: room behind the garage for the team's paddock
  P.zone = []; for (let r = 0; r <= len; r += 7) { for (const o of [P.c(r), r > G0 - 10 && r < len - G0 + 10 ? outer + 60 + dv(r) : P.c(r) + 70]) { const [x, y] = P.at(r, o); P.zone.push([x, y]); } }
  for (const q of P.garages) if (q.pad) { const r = P.box[q.t], [x, y] = P.at(r, outer + 200 + dv(r)); P.zone.push([x, y]); }
  P.block = (x, y) => P.zone.some(q => (q[0] - x) ** 2 + (q[1] - y) ** 2 < 205 * 205);
  P.rel = i => (i - a + N) % N;
  return P;
}
function nearTrack(T, x, y) {
  const cx = Math.floor(x / 256), cy = Math.floor(y / 256); let best = Infinity, bi = -1;
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
    const l = T.grid.get((cx + a) + ',' + (cy + b)); if (!l) continue;
    for (const i of l) { const d = (x - T.x[i]) ** 2 + (y - T.y[i]) ** 2; if (d < best) { best = d; bi = i; } }
  }
  return [Math.sqrt(best), bi];
}
/* grass run-off: the barrier moves back wherever the circuit has room (never onto another part of the lap) */
function buildRunoff(T) {
  const N = T.N, hw = T.hw, def = T.def, RO = def.ro != null ? def.ro : (def.theme === 'city' ? 0 : 190);
  T.roP = new Float32Array(N); T.roN = new Float32Array(N); T.gv = [new Float32Array(N), new Float32Array(N)]; if (RO <= 0) return;
  const ks = smooth(T.k, 6, 3);
  for (const sd of [1, -1]) {
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i += 2) {
      let ro = RO;
      if (Math.sign(ks[i]) === sd) ro = Math.min(ro, .7 / Math.max(1e-6, Math.abs(ks[i])) - hw - T.wall);
      for (let s = hw + 30; s <= 2 * (hw + T.wall + RO) + 60; s += 12) {
        const px = T.x[i] + T.nx[i] * s * sd, py = T.y[i] + T.ny[i] * s * sd, [d, bi] = nearTrack(T, px, py); let di = Math.abs(bi - i); di = Math.min(di, N - di);
        if (di > 25 && d < s) { ro = Math.min(ro, (s + d) / 2 - 28 - hw - T.wall); break; }
      }
      raw[i] = raw[(i + 1) % N] = Math.max(0, ro);
    }
    const mn = new Float32Array(N); for (let i = 0; i < N; i++) { let m = 1e9; for (let e = -14; e <= 14; e++) m = Math.min(m, raw[(i + e + N) % N]); mn[i] = m; }
    const sm = smooth(mn, 9, 4); for (let i = 0; i < N; i++) sm[i] = sm[i] < 16 ? 0 : sm[i];
    (sd > 0 ? T.roP : T.roN).set(sm);
  }
  // gravel traps on the outside of real corners, where the run-off is deep enough: [right side, left side], 0..1
  { const k5 = smooth(T.k, 5, 2), J = i => ((i % N) + N) % N;
    T.gv = [1, -1].map(sd => { const w = new Float32Array(N), ro = sd > 0 ? T.roP : T.roN; for (let i = 0; i < N; i++) if (Math.abs(k5[i]) > 1 / 800 && Math.sign(k5[i]) === -sd && ro[i] > 60) for (let e = -6; e <= 24; e++) w[J(i + e)] = 1; return smooth(w, 8, 3); }); }
}
const humLap = T => T.hum(AS().grip);
const inGravel = (T, i, d) => { const sd = d > 0 ? 0 : 1, ro = sd ? T.roN[i] : T.roP[i], gv = T.gv[sd][i], ad = Math.abs(d); return gv > .05 && ro > 46 && ad > T.hw + 20 && ad < T.hw + 20 + (T.wall + ro - 34) * Math.min(1, gv * 1.15); };
const roAt = (T, i, sd) => sd > 0 ? T.roP[i] : T.roN[i];
/* distance to the circuit measured from the barrier line, not the kerb: anything placed by this stays off the grass */
function clearTrack(T, x, y) { const r = nearTrack(T, x, y), bi = r[1]; if (bi < 0) return r; const sd = (x - T.x[bi]) * T.nx[bi] + (y - T.y[bi]) * T.ny[bi] > 0 ? 1 : -1; return [r[0] - roAt(T, bi, sd), bi]; }
function offsetRuns(T, off, mask, minClear, soft) { // builds polylines at lateral offset (number or (i, side) => offset); mask(i) => side (+1/-1) or 0
  const runs = []; let cur = null;
  for (let i = 0; i <= T.N; i++) {
    const j = i % T.N, side = i < T.N ? mask(j) : 0;
    let ok = side !== 0;
    let px, py;
    if (ok) { const o = typeof off === 'function' ? off(j, side) : off; px = T.x[j] + T.nx[j] * o * side; py = T.y[j] + T.ny[j] * o * side; if (minClear) { const [dd, bi] = nearTrack(T, px, py); let di = Math.abs(bi - j); di = Math.min(di, T.N - di); if (dd < minClear || di > 16) ok = false; else if (soft && dd < o - 8) { if (cur && ++cur.sk > 3) { if (cur.n > 1) runs.push(cur); cur = null; } continue; } } }
    if (ok && cur && soft && ((px - cur.lx) * T.tx[j] + (py - cur.ly) * T.ty[j]) < 2) continue; // the inside of a tight bend folds the offset line back on itself: skip the fold, no spikes
    if (ok && cur && minClear && cur.n) { const mx = (px + cur.lx) / 2, my = (py + cur.ly) / 2; if (nearTrack(T, mx, my)[0] < minClear - 6) { if (cur.n > 1) runs.push(cur); cur = null; } } // a fence never cuts across the road
    if (ok) { if (!cur) { cur = { p: new Path2D(), x0: px, y0: py, x1: px, y1: py, n: 0, sk: 0 }; cur.p.moveTo(px, py); } else cur.p.lineTo(px, py); cur.lx = px; cur.ly = py; cur.sk = 0;
      cur.n++; cur.x0 = Math.min(cur.x0, px); cur.y0 = Math.min(cur.y0, py); cur.x1 = Math.max(cur.x1, px); cur.y1 = Math.max(cur.y1, py); }
    else if (cur) { if (cur.n > 1) runs.push(cur); cur = null; }
  }
  return runs;
}
/* the inside of a corner tighter than the road is wide: the two inner edges meet in a sharp point. Real circuits pave that
   point round, so every such corner gets a fillet — a curve of asphalt tangent to both edges — and no kerb or barrier on the spike */
function buildFillets(T) {
  const N = T.N, hw = T.hw, J = i => ((i % N) + N) % N, rf = 64; T.fillets = []; T.noK = [new Uint8Array(N), new Uint8Array(N)];
  for (let i = 0; i < N; i++) {
    const k = T.k[i]; if (Math.abs(k) < 1 / (hw + 40)) continue; let pk = true; for (let e = -6; e <= 6; e++) if (Math.abs(T.k[J(i + e)]) > Math.abs(k) + 1e-9 && e) { pk = false; break; } if (!pk) continue; // one per corner, at its tightest point
    const sd = Math.sign(k), E = j => [T.x[J(j)] + T.nx[J(j)] * hw * sd, T.y[J(j)] + T.ny[J(j)] * hw * sd];
    let best = null;
    for (let a = i - 70; a < i; a++) { const p1 = E(a), p2 = E(a + 1);
      for (let b = i + 70; b > i; b--) { const q1 = E(b), q2 = E(b + 1), rx = p2[0] - p1[0], ry = p2[1] - p1[1], sx = q2[0] - q1[0], sy = q2[1] - q1[1], den = rx * sy - ry * sx; if (Math.abs(den) < 1e-9) continue;
        const t = ((q1[0] - p1[0]) * sy - (q1[1] - p1[1]) * sx) / den, u = ((q1[0] - p1[0]) * ry - (q1[1] - p1[1]) * rx) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { if (!best || b - a > best.m - best.j) best = { j: a, m: b, Q: [p1[0] + rx * t, p1[1] + ry * t] }; break; } } }
    if (!best) continue;
    const { j, m, Q } = best, A = E(j - 6), B = E(m + 7), u1 = [A[0] - Q[0], A[1] - Q[1]], u2 = [B[0] - Q[0], B[1] - Q[1]], l1 = Math.hypot(...u1), l2 = Math.hypot(...u2); if (l1 < 1 || l2 < 1) continue;
    u1[0] /= l1; u1[1] /= l1; u2[0] /= l2; u2[1] /= l2; const cosA = clamp(u1[0] * u2[0] + u1[1] * u2[1], -1, 1), al = Math.acos(cosA); if (al < .2 || al > 2.9) continue;
    const bx = u1[0] + u2[0], by = u1[1] + u2[1], bl = Math.hypot(bx, by) || 1;
    const sn = Math.sin(al / 2), C = [Q[0] + bx / bl * rf / sn, Q[1] + by / bl * rf / sn];
    const mk = o => { const r = rf - (o - hw), q = [Q[0] + bx / bl * (o - hw) / sn, Q[1] + by / bl * (o - hw) / sn], tl = r / Math.tan(al / 2); return { r, C, Q: q, T1: [q[0] + u1[0] * tl, q[1] + u1[1] * tl], T2: [q[0] + u2[0] * tl, q[1] + u2[1] * tl], tl }; };
    const f = { Q, sd, i, L: [mk(hw + 13), mk(hw + 3), mk(hw - 5)], a: mk(hw - 5) }; T.fillets.push(f); // one rounded layer per painted band: shadow, white line, asphalt
    const span = Math.ceil(f.a.tl / DS) + 6; for (let q = j - span; q <= m + span; q++) T.noK[sd > 0 ? 0 : 1][J(q)] = 1;
  }
}
function buildScenery(T) {
  const N = T.N, hw = T.hw, CH = 48;
  T.chunks = [];
  for (let s = 0; s < N; s += CH) {
    const c = { p: new Path2D(), l: new Path2D(), x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    for (let i = s; i <= s + CH; i++) {
      const j = i % N, x = T.x[j], y = T.y[j], lx = x + T.nx[j] * T.line[j], ly = y + T.ny[j] * T.line[j];
      if (i === s) { c.p.moveTo(x, y); c.l.moveTo(lx, ly); } else { c.p.lineTo(x, y); c.l.lineTo(lx, ly); }
      c.x0 = Math.min(c.x0, x); c.y0 = Math.min(c.y0, y); c.x1 = Math.max(c.x1, x); c.y1 = Math.max(c.y1, y);
    }
    T.chunks.push(c);
  }
  const PT = T.pit = buildPit(T);
  if (PT) { const arr = PT.sd > 0 ? T.roP : T.roN; for (let r = -70; r <= PT.len + 70; r++) { const i = (PT.a + r + N) % N, e = r < 0 ? -r / 70 : r > PT.len ? (r - PT.len) / 70 : 0; arr[i] *= ss(e); } }
  const pitSide = (j, sd) => PT && sd === PT.sd && (PT.rel(j) + 40) % N <= PT.len + 80;
  buildFillets(T);
  T.kerbs = [...offsetRuns(T, hw + 1, j => T.kerb[j] && !pitSide(j, 1) ? 1 : 0), ...offsetRuns(T, hw + 1, j => T.kerb[j] && !pitSide(j, -1) ? -1 : 0)];
  const Wl = T.wall;
  T.kerbW = new Path2D(); T.kerbR = new Path2D(); T.tyres = new Path2D();
  for (let i = 0; i < N; i += 2) {
    if (!T.kerb[i]) continue; const j = (i + 2) % N, K = ((i >> 1) & 1) ? T.kerbR : T.kerbW;
    for (const sd of [-1, 1]) {
      if (sd === Math.sign(T.k[i]) && 1 / Math.abs(T.k[i]) < hw + 25) continue; if (pitSide(i, sd)) continue; if (T.noK[sd > 0 ? 0 : 1][i]) continue;
      { const px = T.x[i] + T.nx[i] * (hw + 2) * sd, py = T.y[i] + T.ny[i] * (hw + 2) * sd, [dd, bi] = nearTrack(T, px, py); let di = Math.abs(bi - i); di = Math.min(di, N - di); if (di > 16 && dd < hw + 14) continue; } // no kerb on top of another part of the track
      const q = (k, o) => [T.x[k] + T.nx[k] * o * sd, T.y[k] + T.ny[k] * o * sd], a1 = q(i, hw - 7), a2 = q(i, hw + 12), a3 = q(j, hw + 12), a4 = q(j, hw - 7);
      K.moveTo(a1[0], a1[1]); K.lineTo(a2[0], a2[1]); K.lineTo(a3[0], a3[1]); K.lineTo(a4[0], a4[1]); K.closePath();
    }
    if (Math.abs(T.k[i]) > 1 / 520) { const sd = -Math.sign(T.k[i]);
      for (const o of [Wl + 10 + roAt(T, i, sd), Wl + 21 + roAt(T, i, sd)]) { const x = T.x[i] + T.nx[i] * (hw + o) * sd, y = T.y[i] + T.ny[i] * (hw + o) * sd; if (nearTrack(T, x, y)[0] < hw + Wl - 6) continue; T.tyres.moveTo(x + 6, y); T.tyres.arc(x, y, 6, 0, 7); } }
  }
  T.zebra = [.1, .3, .45, .62, .9].map(f => Math.round(f * N)).filter(i => Math.abs(T.k[i]) < 1 / 1500);
  T.gravel = T.city ? [] : offsetRuns(T, hw + 70, j => T.grav[j], hw + 40);
  // no run-off under the start grid stands either: keep the start straight a street-like corridor
  T.grassC = [];
  for (const sd of [1, -1]) for (let s0 = 0; s0 < N; s0 += 48) {
    let any = false; for (let i = s0; i <= s0 + 48; i++) if (roAt(T, i % N, sd) > 0) { any = true; break; } if (!any) continue;
    const p = new Path2D(), e = new Path2D(), c = { p, e, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    for (let i = s0; i <= s0 + 48; i++) { const j = i % N, o = hw - 4, x = T.x[j] + T.nx[j] * o * sd, y = T.y[j] + T.ny[j] * o * sd; i === s0 ? p.moveTo(x, y) : p.lineTo(x, y); }
    for (let i = s0 + 48; i >= s0; i--) { const j = i % N, o = hw + Wl + roAt(T, j, sd) + 4, x = T.x[j] + T.nx[j] * o * sd, y = T.y[j] + T.ny[j] * o * sd; p.lineTo(x, y); i === s0 + 48 ? e.moveTo(x, y) : e.lineTo(x, y);
      c.x0 = Math.min(c.x0, x); c.y0 = Math.min(c.y0, y); c.x1 = Math.max(c.x1, x); c.y1 = Math.max(c.y1, y); }
    p.closePath(); T.grassC.push(c);
  }
  const gate = (j, sd) => { if (!PT || sd !== PT.sd) return false; const r = PT.rel(j); return r <= PT.len && (r < PT.G || r > PT.len - PT.G); };
  const bOff = (j, sd) => hw + Wl + roAt(T, j, sd);
  T.barrier = [...offsetRuns(T, bOff, j => gate(j, 1) ? 0 : 1, hw + Wl - 30, true), ...offsetRuns(T, bOff, j => gate(j, -1) ? 0 : -1, hw + Wl - 30, true)];
  if (PT) T.barrier.push(PT.wall);
  T.stands = []; T.pits = PT ? PT.garages : []; const standSd = PT ? -PT.sd : -1;
  for (let i = -60; i < 140; i += 30) {
    const j = (i + N) % N, so = hw + Wl + 90 + roAt(T, j, standSd), po = hw + Wl + 60;
    T.stands.push({ x: T.x[j] + T.nx[j] * so * standSd, y: T.y[j] + T.ny[j] * so * standSd, a: T.ang[j] + (standSd > 0 ? Math.PI : 0) });
    if (!PT) T.pits.push({ x: T.x[j] + T.nx[j] * po, y: T.y[j] + T.ny[j] * po, a: T.ang[j], t: ((i + 60) / 30 | 0) % 11 });
  }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < N; i++) { x0 = Math.min(x0, T.x[i]); y0 = Math.min(y0, T.y[i]); x1 = Math.max(x1, T.x[i]); y1 = Math.max(y1, T.y[i]); }
  T.bbox = [x0, y0, x1, y1];
  const R = rng(7); T.trees = []; T.blds = []; T.yachts = []; T.palms = [];
  if (T.def.zones) { buildThemed(T); return; }
  if (!T.city) {
    for (let k = 0; k < 4200 && T.trees.length < 900; k++) {
      const x = lerp(x0 - 1200, x1 + 1200, R()), y = lerp(y0 - 1200, y1 + 1200, R());
      const [d] = nearTrack(T, x, y); if (d < hw + 290) continue;
      T.trees.push({ x, y, r: 26 + R() * 30, v: R() * 3 | 0 });
    }
    return;
  }
  const sc = T.def.scale, P = a => [a[0] * sc, a[1] * sc];
  T.seaPts = T.def.sea.map(P); T.seaP = new Path2D(); T.seaPts.forEach((p, i) => i ? T.seaP.lineTo(p[0], p[1]) : T.seaP.moveTo(p[0], p[1])); T.seaP.closePath();
  const sea = (x, y) => inPoly(T.seaPts, x, y), clear = (x, y, m) => nearTrack(T, x, y)[0] > hw + Wl + m;
  const parks = T.def.parks.map(p => [p[0] * sc, p[1] * sc, p[2] * sc]), inPark = (x, y) => parks.some(p => (x - p[0]) ** 2 + (y - p[1]) ** 2 < p[2] ** 2);
  T.piers = T.def.piers.map(q => [P(q[0]), P(q[1])]); T.pierP = new Path2D();
  for (const [a, b] of T.piers) {
    T.pierP.moveTo(a[0], a[1]); T.pierP.lineTo(b[0], b[1]);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    for (let s = 40; s < L - 30; s += 58) for (const sd of [-1, 1]) {
      if (R() < .2) continue; const l = 70 + R() * 95, w = l * (.24 + R() * .06), off = 22 + l / 2;
      const dx = -uy * sd, dy = ux * sd, x = a[0] + ux * s + dx * off, y = a[1] + uy * s + dy * off;
      if (sea(x, y) && clear(x, y, 60)) T.yachts.push({ x, y, l, w, a: Math.atan2(dx, -dy) });
    }
  }
  for (let k = 0; k < 400 && T.yachts.length < 140; k++) {
    const x = lerp(x0, x1 + 1500, R()), y = lerp(y0 - 800, y1 + 1500, R());
    if (sea(x, y) && clear(x, y, 420) && !inPoly(T.seaPts, x - 300, y) === false) T.yachts.push({ x, y, l: 130 + R() * 120, w: 40 + R() * 18, a: R() * 7 });
  }
  const th = .35, cs = Math.cos(th), sn = Math.sin(th), md = v => ((v % 620) + 620) % 620;
  const onStreet = (x, y) => { const u = md(x * cs + y * sn), v = md(-x * sn + y * cs); return u < 125 || u > 495 || v < 125 || v > 495; };
  T.decor = (T.def.decor || []).map(d => ({ t: d[0], x: d[1] * sc, y: d[2] * sc, a: d[3] || 0 }));
  const nearDecor = (x, y, r) => T.decor.some(d => Math.hypot(x - d.x, y - d.y) < r);
  T.streets = new Path2D(); const D = 9000, cx0 = (x0 + x1) / 2, cy0 = (y0 + y1) / 2;
  for (let k = -16; k <= 16; k++) for (const [ax, ay, bx, by] of [[cs, sn, -sn, cs], [-sn, cs, cs, sn]]) {
    const base = Math.round((cx0 * ax + cy0 * ay) / 620) * 620 + k * 620, px = ax * base, py = ay * base;
    T.streets.moveTo(px - bx * D + (bx * (cx0 * bx + cy0 * by)), py - by * D + (by * (cx0 * bx + cy0 * by))); T.streets.lineTo(px + bx * D + (bx * (cx0 * bx + cy0 * by)), py + by * D + (by * (cx0 * bx + cy0 * by)));
  }
  for (let i = 0; i < N; i += 26) {
    if (!T.kerb[i] || T.stands.length > 34) continue; const sd = -Math.sign(T.k[i]) || 1, o = hw + Wl + 95;
    const x = T.x[i] + T.nx[i] * o * sd, y = T.y[i] + T.ny[i] * o * sd;
    if (!sea(x, y) && nearTrack(T, x, y)[0] > hw + Wl + 80 && !nearDecor(x, y, 220)) T.stands.push({ x, y, a: T.ang[i] + (sd > 0 ? Math.PI : 0) });
  }
  T.boats = [];
  for (let k = 0; k < 900 && T.boats.length < 9; k++) { const x = lerp(x0, x1 + 2500, R()), y = lerp(y0 - 1500, y1 + 1500, R());
    if (sea(x, y) && clear(x, y, 500)) T.boats.push({ x, y, a: R() * 7, v: 60 + R() * 90, l: 40 + R() * 30, w: 14 + R() * 6 }); }
  T.isSea = sea;
  for (const p of parks) for (let k = 0; k < p[2] * p[2] / 2200; k++) {
    const a = R() * 7, r = Math.sqrt(R()) * p[2], x = p[0] + Math.cos(a) * r, y = p[1] + Math.sin(a) * r;
    if (!sea(x, y) && clear(x, y, 40) && !nearDecor(x, y, 120)) T.trees.push({ x, y, r: 18 + R() * 22, v: R() * 3 | 0 });
  }
  for (let i = 0; i < N; i += 9) {
    const sd = R() < .5 ? 1 : -1, o = hw + Wl + 42, x = T.x[i] + T.nx[i] * o * sd, y = T.y[i] + T.ny[i] * o * sd;
    if (!sea(x, y) && clear(x, y, 30)) R() < .5 ? T.palms.push({ x, y, r: 26 + R() * 10, a: R() * 7 }) : T.trees.push({ x, y, r: 16 + R() * 9, v: R() * 3 | 0 });
  }
  for (let e = 0; e < T.seaPts.length; e++) {
    const a = T.seaPts[e], b = T.seaPts[(e + 1) % T.seaPts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > 4000) continue;
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    for (let s2 = 50; s2 < L; s2 += 95) for (const sd of [1, -1]) {
      const x = a[0] + ux * s2 - uy * sd * 46, y = a[1] + uy * s2 + ux * sd * 46;
      if (!sea(x, y) && clear(x, y, 25)) { T.palms.push({ x, y, r: 28 + R() * 10, a: R() * 7 }); break; }
    }
  }
  if (T.def.beach) { T.beachP = new Path2D(); T.def.beach.map(P).forEach((p, i) => i ? T.beachP.lineTo(p[0], p[1]) : T.beachP.moveTo(p[0], p[1])); }
  for (let gx = x0 - 1700; gx < x1 + 1700; gx += 125) for (let gy = y0 - 1700; gy < y1 + 1700; gy += 125) {
    if (R() < .1) continue;
    const x = gx + R() * 40 - 20, y = gy + R() * 40 - 20;
    if (sea(x, y) || inPark(x, y) || onStreet(x, y) || nearDecor(x, y, 140)) continue;
    const [d, bi] = nearTrack(T, x, y);
    if (T.pit && T.pit.block(x, y)) continue;
    if (d < hw + Wl + 120 || ((bi > N - 80 || (bi >= 0 && bi < 160)) && d < hw + Wl + 300)) continue;
    const big = R() < .15;
    T.blds.push({ x, y, w: (big ? 115 : 66) + R() * 46, h: (big ? 115 : 66) + R() * 46, a: (bi >= 0 && d < 800 ? T.ang[bi] : .35) + (R() < .1 ? .3 : 0),
      c: ROOF[R() * ROOF.length | 0], hg: (big ? 30 : 8) + R() * 22, d: R() < .12 ? 3 : R() < .28 ? 1 : R() < .45 ? 2 : 4 }); // Monaco: rooftop pools everywhere
    const b = T.blds[T.blds.length - 1];
    if (b.d === 3) { b.cars = []; for (let cx2 = -b.w / 2 + 14; cx2 < b.w / 2 - 10; cx2 += 17) for (const ry of [-b.h / 2 + 16, b.h / 2 - 16]) if (R() < .8) b.cars.push([cx2, ry, LUXC[R() * LUXC.length | 0]]); } // Monaco car parks: supercars
    if (b.d === 4 && R() < .5) { b.c = TERRA[R() * TERRA.length | 0]; b.hip = 1; }
    b.wc = FAC[R() * FAC.length | 0]; b.bal = R() < .6; b.sh = b.hip && R() < .75; b.H = Math.min(b.hg * 1.6, d < hw + Wl + 320 ? 30 : 88);
  }
  const nearIdx = p => { let b = 1e18, bi = 0; for (let i = 0; i < N; i++) { const dd = (T.x[i] - p[0]) ** 2 + (T.y[i] - p[1]) ** 2; if (dd < b) { b = dd; bi = i; } } return bi; };
  const ia = nearIdx(P(T.def.tunnel[0])), ib = nearIdx(P(T.def.tunnel[1]));
  T.tunP = new Path2D(); T.tunB = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
  for (let i = ia, f = true; ; i = (i + 1) % N, f = false) {
    f ? T.tunP.moveTo(T.x[i], T.y[i]) : T.tunP.lineTo(T.x[i], T.y[i]);
    const b = T.tunB; b.x0 = Math.min(b.x0, T.x[i] - 300); b.y0 = Math.min(b.y0, T.y[i] - 300); b.x1 = Math.max(b.x1, T.x[i] + 300); b.y1 = Math.max(b.y1, T.y[i] + 300);
    if (i === ib) break;
  }
}
const LUXC = ['#d40000', '#ffd400', '#f2f2f2', '#111214', '#ff7a00', '#c9a24a', '#00a39a', '#1b2f6e', '#e8e8e8'];
const CARC = ['#c9c9c9', '#2b2d31', '#a3262b', '#e8e6e0', '#3a5d8f', '#c8a640', '#5c6b54', '#7a7d82'];
const FAC = ['#d3c2a3', '#c9a482', '#c48e76', '#d1a99a', '#dcdad2', '#d4c38c', '#bfb3a3', '#b9a48a'];
const TERRA = ['#9a5a40', '#a8644a', '#8c4f39', '#b06c4e'];
const ROOF = ['#d9d6cf', '#c7c3ba', '#7f5443', '#8b5e4a', '#74503f', '#957c66', '#86817a', '#686a6c', '#a39885', '#8e7056', '#9a9387', '#b3aa98'];
function inPoly(p, x, y) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }

/* ---------- textures ---------- */
function makePattern(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); return c; }
let PAT = {};
function buildPatterns(ctx) {
  PAT.grass = ctx.createPattern(makePattern(512, (g, s) => {
    g.fillStyle = '#3f6e30'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 64) { g.fillStyle = (i / 64) % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.035)'; g.fillRect(0, i, s, 64); }
    const R = rng(3);
    for (let i = 0; i < 260; i++) { g.fillStyle = R() < .5 ? 'rgba(20,50,10,.10)' : 'rgba(170,210,110,.07)'; g.beginPath(); g.arc(R() * s, R() * s, 2 + R() * 9, 0, 7); g.fill(); }
  }), 'repeat');
  PAT.grassN = ctx.createPattern(makePattern(512, (g, s) => {
    g.fillStyle = '#21452a'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 64) { g.fillStyle = (i / 64) % 2 ? 'rgba(120,255,170,.04)' : 'rgba(0,0,0,.06)'; g.fillRect(0, i, s, 64); }
  }), 'repeat');
  PAT.asph =ctx.createPattern(makePattern(256, (g, s) => {
    g.fillStyle = '#2c2e32'; g.fillRect(0, 0, s, s); const R = rng(11);
    for (let i = 0; i < 1400; i++) { const l = R() < .5; g.fillStyle = l ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.09)'; g.fillRect(R() * s, R() * s, 1 + R() * 2, 1 + R() * 2); }
  }), 'repeat');
  PAT.grav = ctx.createPattern(makePattern(128, (g, s) => {
    g.fillStyle = '#d5bd88'; g.fillRect(0, 0, s, s); const R = rng(5);
    for (let i = 0; i < 500; i++) { g.fillStyle = R() < .5 ? 'rgba(120,90,40,.18)' : 'rgba(255,250,230,.25)'; g.fillRect(R() * s, R() * s, 1.5, 1.5); }
  }), 'repeat');
  PAT.city = ctx.createPattern(makePattern(256, (g, s) => {
    g.fillStyle = '#4a4743'; g.fillRect(0, 0, s, s); const R = rng(17);
    for (let i = 0; i < 900; i++) { g.fillStyle = R() < .5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.07)'; g.fillRect(R() * s, R() * s, 1 + R() * 3, 1 + R() * 3); }
  }), 'repeat');
  PAT.water = ctx.createPattern(makePattern(512, (g, s) => {
    const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#183847'); gr.addColorStop(1, '#183847');
    g.fillStyle = gr; g.fillRect(0, 0, s, s); const R = rng(23); g.lineCap = 'round';
    for (let i = 0; i < 160; i++) { const x = R() * s, y = R() * s, l = 8 + R() * 26; g.strokeStyle = `rgba(200,230,240,${.03 + R() * .05})`; g.lineWidth = 1 + R() * 1.5; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke(); }
  }), 'repeat');
  PAT.tiles = ctx.createPattern(makePattern(64, (g, s) => {
    g.fillStyle = '#9a9184'; g.fillRect(0, 0, s, s); g.strokeStyle = 'rgba(70,60,50,.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s / 2, 0); g.lineTo(s, s / 2); g.lineTo(s / 2, s); g.closePath(); g.stroke();
    g.fillStyle = 'rgba(190,140,100,.18)'; g.beginPath(); g.moveTo(s / 2, 12); g.lineTo(s - 12, s / 2); g.lineTo(s / 2, s - 12); g.lineTo(12, s / 2); g.fill();
  }), 'repeat');
  PAT.sand = ctx.createPattern(makePattern(128, (g, s) => {
    g.fillStyle = '#cdb68a'; g.fillRect(0, 0, s, s); const R = rng(31);
    for (let i = 0; i < 500; i++) { g.fillStyle = R() < .5 ? 'rgba(120,95,55,.16)' : 'rgba(255,250,235,.22)'; g.fillRect(R() * s, R() * s, 1.5, 1.5); }
  }), 'repeat');
  PAT.crowd = ctx.createPattern(makePattern(64, (g, s) => {
    g.fillStyle = '#2b2f36'; g.fillRect(0, 0, s, s); const R = rng(9), cols = ['#e8e8e8', '#d8091c', '#ffc400', '#0a8bE8', '#ff8700', '#7d8590', '#f4c7a1'];
    for (let y = 2; y < s; y += 7) for (let x = 2; x < s; x += 5) { g.fillStyle = cols[R() * cols.length | 0]; g.beginPath(); g.arc(x + R(), y, 1.7, 0, 7); g.fill(); }
  }), 'repeat');
}

/* =====================================================================
   CAR ART (pure vector, shaded for volume)
   ===================================================================== */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255;
  if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function paintCar(g, t) {
  const C1 = t.c1, C2 = t.c2, C3 = t.c3;
  const tyre = (x, y, w, h) => { const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#08080a'); gr.addColorStop(.5, '#3b3d42'); gr.addColorStop(1, '#08080a'); g.fillStyle = gr; rrect(g, x, y, w, h, 1.8); g.fill();
    g.fillStyle = 'rgba(255,255,255,.07)'; for (let k = 1; k < 5; k++) g.fillRect(x + .5, y + h * k / 5, w - 1, .35); };
  // suspension
  g.strokeStyle = '#18191c'; g.lineWidth = .8; g.beginPath();
  for (const s of [-1, 1]) { g.moveTo(2.5 * s, -16.5); g.lineTo(8.5 * s, -15); g.moveTo(2.8 * s, -12); g.lineTo(8.5 * s, -14); g.moveTo(5 * s, 12); g.lineTo(8.5 * s, 14.5); g.moveTo(4.5 * s, 17); g.lineTo(8.5 * s, 16); }
  g.stroke();
  tyre(-11.8, -19.8, 4.5, 9.6); tyre(7.3, -19.8, 4.5, 9.6); tyre(-12.4, 10, 5.4, 10.6); tyre(7, 10, 5.4, 10.6);
  // floor
  g.fillStyle = '#141519'; g.beginPath(); g.moveTo(-3.5, -9); g.lineTo(-8.8, -3); g.lineTo(-9.2, 12); g.lineTo(-7, 18.5); g.lineTo(7, 18.5); g.lineTo(9.2, 12); g.lineTo(8.8, -3); g.lineTo(3.5, -9); g.fill();
  // rear wing
  g.fillStyle = shade(C2, -.1); rrect(g, -9, 19.4, 18, 4.2, 1); g.fill();
  g.fillStyle = shade(C1, -.25); g.fillRect(-9, 22.2, 18, 1.1);
  g.fillStyle = C3; g.fillRect(-9.7, 18.6, 1.3, 5.8); g.fillRect(8.4, 18.6, 1.3, 5.8);
  // nose
  let gr = g.createLinearGradient(-2.8, 0, 2.8, 0); gr.addColorStop(0, shade(C1, -.4)); gr.addColorStop(.5, shade(C1, .3)); gr.addColorStop(1, shade(C1, -.4));
  g.fillStyle = gr; g.beginPath(); g.moveTo(-1.2, -25.5); g.lineTo(1.2, -25.5); g.lineTo(2.9, -10); g.lineTo(-2.9, -10); g.fill();
  g.fillStyle = C3; g.fillRect(-.9, -25.6, 1.8, 2.2);
  // front wing
  g.fillStyle = shade(C2, -.05); rrect(g, -11.3, -27.6, 22.6, 3.2, 1.2); g.fill();
  g.fillStyle = C1; rrect(g, -10.8, -25, 21.6, 1.3, .6); g.fill();
  g.fillStyle = C3; g.fillRect(-11.8, -28, 1.3, 4.6); g.fillRect(10.5, -28, 1.3, 4.6);
  // body + sidepods
  const body = new Path2D('M0,-12 C2.2,-12 3.2,-9 3.6,-6 C6.8,-5.2 7.7,-1 7.7,3 C7.7,9 5.6,13 3.2,17 L1.6,19.6 L-1.6,19.6 L-3.2,17 C-5.6,13 -7.7,9 -7.7,3 C-7.7,-1 -6.8,-5.2 -3.6,-6 C-3.2,-9 -2.2,-12 0,-12 Z');
  gr = g.createLinearGradient(-7.7, 0, 7.7, 0);
  gr.addColorStop(0, shade(C1, -.5)); gr.addColorStop(.17, C1); gr.addColorStop(.4, shade(C1, .22)); gr.addColorStop(.5, shade(C1, .32)); gr.addColorStop(.6, shade(C1, .22)); gr.addColorStop(.83, C1); gr.addColorStop(1, shade(C1, -.5));
  g.fillStyle = gr; g.fill(body);
  g.save(); g.clip(body);
  g.fillStyle = C2; g.globalAlpha = .92;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(7.8 * s, 1); g.bezierCurveTo(6 * s, -2, 4.5 * s, -4.5, 3.4 * s, -6.5); g.lineTo(2.2 * s, -6.5); g.bezierCurveTo(3.5 * s, 0, 4.5 * s, 7, 5 * s, 14); g.lineTo(7.8 * s, 9); g.fill(); }
  g.globalAlpha = 1; g.fillStyle = C3; for (const s of [-1, 1]) g.fillRect(s > 0 ? 5.8 : -6.6, 2, .8, 6);
  g.restore();
  // engine cover spine
  gr = g.createLinearGradient(-1.8, 0, 1.8, 0); gr.addColorStop(0, shade(C2, -.35)); gr.addColorStop(.5, shade(C2, .25)); gr.addColorStop(1, shade(C2, -.35));
  g.fillStyle = gr; rrect(g, -1.8, -1.5, 3.6, 18.5, 1.8); g.fill();
  g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(-.25, -10, .5, 26);
  // mirrors
  g.fillStyle = shade(C1, -.3); g.fillRect(-5.6, -6.6, 1.6, .9); g.fillRect(4, -6.6, 1.6, .9);
  // cockpit, helmet, halo
  g.fillStyle = '#09090b'; g.beginPath(); g.ellipse(0, -4.4, 2.5, 4.1, 0, 0, 7); g.fill();
  g.fillStyle = C3; g.beginPath(); g.arc(0, -3.7, 1.9, 0, 7); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.ellipse(0, -4.8, 1.4, .6, 0, 0, 7); g.fill();
  g.strokeStyle = '#1d1e22'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-2.7, -.8); g.quadraticCurveTo(-2.9, -8.8, 0, -9.4); g.quadraticCurveTo(2.9, -8.8, 2.7, -.8); g.moveTo(0, -9.4); g.lineTo(0, -7.2); g.stroke();
  g.fillStyle = '#0c0c0e'; g.beginPath(); g.ellipse(0, .9, 1.25, 1.7, 0, 0, 7); g.fill();
  // global light: top-left key, bottom-right falloff
  g.save(); g.globalCompositeOperation = 'source-atop';
  gr = g.createLinearGradient(-12, -28, 12, 26); gr.addColorStop(0, 'rgba(255,255,255,.20)'); gr.addColorStop(.45, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.28)');
  g.fillStyle = gr; g.fillRect(-14, -30, 28, 60); g.restore();
}
const SPR = [];
function buildSprite(i) {
  const t = TEAMS[i], SC = t.pic ? 3.5 : 3, P = 6;
  const W = t.pic ? 52 * t.pic.width / t.pic.height + 2 : 30, H = t.pic ? 54 : 58;
  const c = document.createElement('canvas'); c.width = Math.ceil(W * SC); c.height = H * SC;
  const g = c.getContext('2d'); g.scale(SC, SC); g.translate(W / 2, H / 2);
  if (t.pic) { g.save(); g.shadowColor = 'rgba(8,8,10,.95)'; g.shadowBlur = 1.4 * SC; drawCarArt(g, i); g.restore(); }
  drawCarArt(g, i);
  if (t.pic) { g.save(); g.globalCompositeOperation = 'source-atop'; const lg = g.createLinearGradient(-W / 2, -H / 2, W / 2, H / 2);
    lg.addColorStop(0, 'rgba(255,255,255,.16)'); lg.addColorStop(.5, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(0,0,0,.22)'); g.fillStyle = lg; g.fillRect(-W, -H, W * 2, H * 2); g.restore(); }
  const s = document.createElement('canvas'); s.width = Math.ceil((W + P * 2) * SC); s.height = (H + P * 2) * SC;
  const h = s.getContext('2d'); h.shadowColor = 'rgba(0,0,0,.6)'; h.shadowBlur = 2.8 * SC; h.shadowOffsetX = s.width;
  h.drawImage(c, P * SC - s.width, P * SC);
  SPR[i] = { car: c, sh: s, W, H, P };
}
function buildSprites() { TEAMS.forEach((_, i) => buildSprite(i)); }
function drawCarArt(g, i) {
  const t = TEAMS[i];
  if (t.pic) { const w = 52 * t.pic.width / t.pic.height; g.drawImage(t.pic, -w / 2, -26, w, 52); } else paintCar(g, t);
}
/* PNG cars: drop top-down images (nose up) into cars/<team>.png — background is cut out automatically */
function cutout(im) {
  const k = Math.min(1, 900 / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  const g = c.getContext('2d'); g.drawImage(im, 0, 0, c.width, c.height);
  const W = c.width, H = c.height, d = g.getImageData(0, 0, W, H), p = d.data;
  if (p[3] > 200) {
    const bg = [p[0], p[1], p[2]], seen = new Uint8Array(W * H), st = [];
    for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
    while (st.length) {
      const q = st.pop(); if (seen[q]) continue; seen[q] = 1; const o = q * 4;
      if (Math.abs(p[o] - bg[0]) + Math.abs(p[o + 1] - bg[1]) + Math.abs(p[o + 2] - bg[2]) > 70) continue;
      p[o + 3] = 0; const x = q % W;
      if (x > 0) st.push(q - 1); if (x < W - 1) st.push(q + 1); if (q >= W) st.push(q - W); if (q < W * (H - 1)) st.push(q + W);
    }
    g.putImageData(d, 0, 0);
  }
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p[(y * W + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, rot = w > h * 1.15, out = document.createElement('canvas');
  out.width = rot ? h : w; out.height = rot ? w : h; const o = out.getContext('2d');
  if (rot) { o.translate(out.width / 2, out.height / 2); o.rotate(-Math.PI / 2); o.drawImage(c, x0, y0, w, h, -w / 2, -h / 2, w, h); }
  else o.drawImage(c, x0, y0, w, h, 0, 0, w, h);
  return out;
}
let photoLoad = 0;
function loadCarPNGs() {
  const generation = ++photoLoad;
  if (S.art === 'draw' && window.CARART) { TEAMS.forEach((t, i) => { t.pic = CARART.render(i); buildSprite(i); }); if (window.SKINS) SKINS.drop(); return; } // the cars drawn in the game's own style
  // Decode and prepare one livery per idle slice, with the selected car first.
  const order = [S.team, ...TEAMS.map((_, i) => i).filter(i => i !== S.team)];
  const idle = fn => window.requestIdleCallback ? requestIdleCallback(fn, {timeout: 180}) : setTimeout(fn, 16);
  function next() {
    if (generation !== photoLoad || !order.length) return;
    const i = order.shift(), t = TEAMS[i], im = new Image();
    im.decoding = 'async';
    im.onload = () => idle(() => {
      if (generation !== photoLoad) return;
      try { t.pic = cutout(im); } catch { t.pic = im; }
      buildSprite(i);
      if (window.SKINS) SKINS.drop();
      if (i === S.team && !$('#menu').classList.contains('hidden')) refreshMenu();
      next();
    });
    im.onerror = next;
    im.src = 'cars/' + t.id + '.png';
  }
  next();
}

/* =====================================================================
   GAME STATE
   ===================================================================== */
const cv = $('#c'); let ctx = cv.getContext('2d'); // `let`: the FX engine points it at a tile while baking
let DPR = 1, isDesk = matchMedia('(hover:hover) and (pointer:fine)').matches;
if (isDesk) document.body.classList.add('desktop');
const G = { mode: 'menu', net: null, track: null, cars: [], me: -1, follow: 0, laps: 3, t: 0, lt: 0, phase: 'grid', lightsOut: 5.8, paused: false,
  skids: new Float32Array(2400 * 4), skidN: 0, parts: [], order: [], resT: -1, snaps: [], bs: [0, 0, 0], sess: 'attract', opts: { tyres: false, wx: -1 }, h: 5, qb: [], qdone: false };
const cam = { x: 0, y: 0, a: 0, z: .8, shake: 0 };

function slotPos(T, slot) {
  const i = ((-(slot >> 1) * 17 - 7 - (slot & 1) * 8) % T.N + T.N) % T.N, off = ((slot & 1) ? 1 : -1) * T.hw * .45;
  return { i, x: T.x[i] + T.nx[i] * off, y: T.y[i] + T.ny[i] * off, h: Math.atan2(T.tx[i], -T.ty[i]), off };
}
function makeCar(team, slot, o) {
  const p = slotPos(G.track, slot);
  return Object.assign({ team, slot, x: p.x, y: p.y, h: p.h, vx: 0, vy: 0, vF: 0, vL: 0, steer: 0, thr: 0, brk: 0, idx: p.i, d: p.off,
    lap: 0, half: true, prog: 0, fin: false, finT: 0, best: Infinity, last: 0, lapStart: 0, human: null, name: TEAMS[team].code,
    kx: 0, ky: 0, ai: null, wallT: 0, sc: [0, 0, 0], ls: [0, 0, 0], bs: [0, 0, 0], secI: 0, sLast: 0, tyre: 0, wear: 100, pitS: 0, pitSel: null, pitT: 0, inPit: false, pitDone: false, qt: 0, qs: 0, warn: 0, skill: 1, sk: 1, react: rand(.06, .18), d0: p.off, avoid: 0, mist: 0, stuck: 0, slide: 0, tow: 0, surf: 0, wl: null, rx: p.x, ry: p.y, rh: p.h }, o);
}
/* form of the day: on the straights the car order never changes, but who has the pace this weekend does. The big four
   (Mercedes, Ferrari, Red Bull, McLaren) trade places from race to race; the circuit tilts the odds (2026 season podiums). */
const TRACK_FORM = { melbourne: { mercedes: 1.8, ferrari: .4 }, shanghai: { mercedes: 1.8, ferrari: .4 }, suzuka: { mercedes: 1.4, mclaren: .8, ferrari: .4 }, miami: { mercedes: 1.4, mclaren: 1 },
  montreal: { mercedes: 1.4, ferrari: .8, redbull: .4 }, monaco: { mercedes: 1.4, ferrari: .8, alpine: .7 }, catalunya: { ferrari: 1.4, mercedes: .8, mclaren: .4 }, rbring: { mercedes: 1.6, redbull: .8 },
  silverstone: { ferrari: 1.6, mercedes: .8 }, spa: { mercedes: 1.4, ferrari: .8, redbull: .4 }, hungaroring: { mclaren: 1.4, redbull: .8, mercedes: .4 }, zandvoort: { mclaren: 1.4, mercedes: 1 },
  monza: { mercedes: 1.8, redbull: .4 }, madrid: { mercedes: 1.4, redbull: .8, mclaren: .4 }, baku: { mercedes: 1.4, redbull: 1 }, sepang: { redbull: 1.4, mercedes: .8, ferrari: .4 },
  marinabay: { redbull: 1.4, ferrari: .8, mercedes: .4 }, austin: { mercedes: 1.4, ferrari: .8, redbull: .4 }, mexico: { redbull: 1.4, ferrari: .8, mercedes: .4 }, interlagos: { mclaren: 1.4, redbull: 1 } };
function rollForm(trk) { // → for every team its place in this weekend's pecking order (0 = quickest)
  const aff = TRACK_FORM[(TRK[trk] || {}).id] || {}, BASEF = [0, 1, 1.05, 2.2, 4, 5, 6, 7, 8, 9, 10], e = TEAMS.map((t, i) => ({ i, v: BASEF[i] - (aff[t.id] || 0) * .45 + rand(-.55, .55) })); // Mercedes on top, Ferrari and Red Bull level, then McLaren; a small shuffle of the day
  e.sort((a, b) => a.v - b.v); const pos = []; e.forEach((q, k) => pos[q.i] = k); return pos;
}
const formPos = t => G.form ? G.form[t] : t;
const SKC = [0, .035, .045, .075, .34, .45, .55, .65, .76, .88, 1]; // where each place of the pecking order sits between the best and the slowest driver: the front four within a couple of tenths
function botSkill(team) { const [lo, hi] = difficultyRange(); return G.net === 'host' ? lerp(hi, lo, Math.random()) : clamp(lerp(hi, lo, SKC[clamp(formPos(team), 0, 10)]) + rand(-.002, .002), lo, hi); }
function difficultyRange() { return [[.96, 1.01], [1.03, 1.075], [1.125, 1.17]][S.diff]; }

function startRace(grid, laps, net, trk, o) {
  o = o || {}; G.sess = o.sess || (net === 'attract' ? 'attract' : 'race'); G.opts = { tyres: !!o.tyres, wx: o.wx == null ? -1 : o.wx, rl: true, tm: !!o.tm, as: o.as == null ? S.assist : o.as }; G.form = o.form || (net === 'client' ? null : rollForm(trk == null ? S.track : trk)); G.qBest = [1e9, 1e9, 1e9]; G.qb = o.qb || []; G.qdone = false; G.wS = null; G.wT = 0; G.bs = [0, 0, 0];
  G.h = o.h0 != null ? o.h0 : G.opts.wx >= 0 && G.opts.wx !== 4 ? WX_H0[G.opts.wx] : 5; G.net = net; closeTyreUI(); G.wPlan = null; G.wS = null; if (o.ws0 != null && G.opts.wx === 4) G.wS = o.ws0;
  G.track = getTrack(trk == null ? S.track : trk, o.tw); RP.reset(); G.wxSeen = null;
  G.cars = grid.map((g, slot) => {
    const c = makeCar(g.team, slot, { human: g.human, name: g.name || drvOf(g.team, g.seat)[1], id: slot, seat: g.seat | 0, skin: g.human === 'local' ? (window.SKINS && SKINS.has(S.skin | 0) ? S.skin | 0 : 0) : g.sk | 0 });
    if (!g.human) { c.skill = g.skill || botSkill(g.team); const a = TEAMS[g.team], b = TEAMS[formPos(g.team)], m = k => lerp(a[k], b[k], .6); c.st = { spd: m('spd'), acc: m('acc'), grip: m('grip'), brk: m('brk') }; } // a bot's car leans towards its form of the day
    c.strat = g.strat || null; c.tySet = g.t != null; if (g.t != null) c.tyre = g.t; else if (!g.human && G.opts.tyres) c.tyre = botTyre(laps); fitTyre(c, c.tyre);
    return c;
  });
  G.me = G.cars.findIndex(c => c.human === 'local'); G.follow = Math.max(0, G.me);
  G.pRef = 0; G.paV = 1; { const bots = G.cars.filter(c => !c.human); const same = new Set(G.cars.map(c => cpace(c.team))).size < 2; bots.forEach(c => { c.pa = 1; c.spread = carGap(formPos(c.team)) * (same ? rand(.995, 1.006) : rand(.999, 1.001)); if (S.diff === 2 && G.sess === 'race') c.pa = clamp(G.track.refLap / (humLap(G.track) * PRO_FLOOR * c.spread) / c.skill, .8, 1.1); }); G.pRefS = 1; if (G.sess === 'race') { const T = G.track, mine = grid.find(g => g.human === 'local' && g.qt); if (mine) { G.pRef = mine.qt * 1.012; G.pRefS = carGap(mine.team); } grid.forEach((g, k) => { const c = G.cars[k]; if (!g.human && g.qt && c) c.pa = clamp(T.refLap / (c.skill * g.qt * 1.012), .75, 1.25); }); } if (bots.length) G.paV = bots.reduce((s, q) => s + q.pa * q.skill, 0) / bots.length; }
  G.laps = laps; G.net = net; G.t = 0; G.lt = 0; G.phase = net === 'attract' ? 'race' : 'grid'; G.lightsOut = 5 + rand(.4, 1.3);
  G.rated = false; G.statDone = false; G.chDone = false; G.pdOn = false; G.wetRace = false; G.fl = 0; G.flC = null; G.skidN = 0; G.parts.length = 0; G.order = []; G.resT = -1; G.snaps = []; G.playback = {}; G.paused = false; G.shownLights = -1;
  G.mode = net === 'attract' ? 'attract' : 'race';
  FX.onRace(); sfx('reset');
  if (G.sess === 'race' && net !== 'client' && net !== 'attract' && Math.random() < .2) { const b = G.cars.filter(c => !c.human); if (b.length) { const j = b[Math.random() * b.length | 0]; j.fs = 1; j.react = 0; } } // now and then a bot jumps the start
  if (G.sess === 'quali' || G.sess === 'practice') { const p = slotPos(G.track, 10); for (const q of G.cars) { q.idx = p.i; q.x = p.x; q.y = p.y; q.d = p.off; q.h = p.h; q.vx = q.vy = q.vF = 0; if (G.sess === 'quali') fitTyre(q, G.opts.tyres ? (q.tySet ? q.tyre : G.h > 30 ? 3 : 0) : 0); q.rx = q.x; q.ry = q.y; q.rh = q.h; } } // qualifying starts from the last grid box, on the lights
  const c = G.cars[G.follow]; cam.x = c.x; cam.y = c.y; cam.a = c.h;
  if (G.mode === 'race') {
    document.body.classList.toggle('brk', S.abs === false || asLvl() < 2); $('#rc').classList.add('hidden');
    show(null); $('#hud').classList.remove('hidden'); $('#specChip').classList.add('hidden'); document.body.classList.toggle('spec', G.me < 0); $('#lights').classList.remove('hidden');
    $$('#lights i').forEach(i => i.classList.remove('on'));
    $('#hLapN').textContent = G.sess === 'quali' ? '' : G.sess === 'practice' ? '/∞' : '/' + laps; if (G.sess !== 'race') setTimeout(() => G.sess !== 'race' && banner(G.sess === 'quali' ? 'QUALIFYING' : 'PRACTICE', '#FFC400'), 200); $('#hPosN').textContent = '/' + G.cars.length;
    if (isDesk) { $('#deskHint').classList.remove('hidden'); setTimeout(() => $('#deskHint').classList.add('hidden'), 6000); }
    buildMini();
  } else if (!CFG) $('#hud').classList.add('hidden');
}
const soloOpts = () => ({ tyres: S.tyres, wx: S.tyres && S.weather ? S.wx : -1, tw: twOf(S.track), as: S.assist, tm: !!S.n22 });
/* the sky at the start: 0 dry 5% · 1 overcast 15% · 2 light rain 60% · 3 downpour 90% */
const WX_H0 = [5, 15, 60, 90, 5, 35], WX_N = ['Сухо', 'Облачно', 'Дождь', 'Ливень', 'Авто', 'Влажно'];
function wxStart(o, trk) { if (!(o.wx >= 0)) return o; let s = o.wx; if (s === 4) { const cl = TRK[trk].climate || [.5, .25, .2, .05]; let q = Math.random(); s = 0; for (let k = 0; k < 4; k++) { q -= cl[k]; if (q < 0) { s = k; break; } } } return { ...o, ws0: s, h0: WX_H0[s] }; }
const wxText = o => o && o.ws0 != null ? 'ПОГОДА НА СТАРТЕ: ' + WX_N[o.ws0] + ' · влажность ' + o.h0 + '%' : '';
function startSolo() { flowStart('solo'); }
function startPractice() { startRace([{ team: S.team, seat: S.seat | 0, human: 'local', name: myName() }], 9999, null, S.track, { sess: 'practice', ...wxStart(soloOpts(), S.track) }); }
/* ---------- race weekend flow: [qualifying] -> [tyre choice] -> race ---------- */
let Flow = null;
function flowStart(kind, fo) {
  const solo = kind === 'solo', tm = solo ? !!S.n22 : !!Net.o.tm; if (!solo) { Net.players.forEach(p => delete p.spec); bcastLobby(); } // watchers join in from this race on
  const humans = solo ? [{ team: S.team, human: 'local', name: myName(), seat: S.seat ? 1 : 0 }] : Net.players.map(p => ({ team: p.team, human: p.id === Net.me ? 'local' : p.id, name: p.name, sk: p.id === Net.me ? (window.SKINS && SKINS.has(S.skin | 0) ? S.skin | 0 : 0) : p.sk | 0 }));
  if (!solo) humans.forEach((h, k) => h.seat = humans.slice(0, k).filter(q => q.team === h.team).length);
  // 22 cars: both seats of every team. 11 cars: one car per team, and which of its two drivers turns up changes from race to race
  const withBots = solo || Net.o.b, bots = withBots ? TEAMS.flatMap((_, i) => (tm ? [0, 1] : [Champ.on ? 0 : Math.random() < .5 ? 0 : 1]).filter(s => !humans.some(h => h.team === i && (tm ? h.seat === s : true))).map(s => ({ team: i, seat: s }))).sort(() => Math.random() - .5) : [];
  const o = Net.o, opts = wxStart(solo ? soloOpts() : { tyres: o.t, wx: o.t && o.w ? o.m : -1, tw: twOf(Net.track, o.tw), rl: true, tm, as: o.as == null ? 2 : o.as }, solo ? S.track : Net.track);
  clearTimeout(Flow && Flow.tm);
  Flow = { kind, humans, bots, laps: solo ? S.laps : Net.laps, trk: solo ? S.track : Net.track, opts, picks: {} };
  G.net = solo ? null : 'host'; Flow.form = G.form = rollForm(Flow.trk);
  if (solo ? S.quali : o.q) return startQuali();
  const n = bots.length + humans.length, order = bots.map(b => ({ team: b.team, seat: b.seat, human: null })); humans.slice().sort(() => Math.random() - .5).forEach((h, k) => order.splice(fo && fo.last ? order.length : Math.min(order.length, (solo ? Math.round(n * .45) : 4) + k), 0, h)); // a race without qualifying in the championship: from the back
  flowPick(order);
}
const netGrid = l => l.map(g => ({ team: g.team, seat: g.seat | 0, human: g.human === 'local' ? Net.me : g.human, name: g.name, t: g.t, skill: g.skill, sk: g.sk | 0 }));
function startQuali(ty) {
  const F = Flow, T = getTrack(F.trk, F.opts.tw); G.net = F.kind === 'solo' ? null : 'host';
  const wetQ = withRace(F, () => G.h > 30), rec = F.opts.tyres ? (wetQ ? 3 : 0) : 0;
  if (ty == null && F.opts.tyres && F.kind === 'solo') { openPick(F.opts.wx >= 0, 0, k => startQuali(k), wxText(F.opts), rec); $('#tpTitle').textContent = TRK[F.trk].name + ' · КВАЛИФИКАЦИЯ'; return; }
  F.humans.forEach(h => { h.t = F.kind === 'solo' && h.human === 'local' && ty != null ? ty : rec; });
  const qb = F.bots.map(b => { const t = b.team, st = G.net && !F.opts.rl ? NEUTRAL : TEAMS[formPos(t)], perf = (st.spd + st.acc + st.grip + st.brk) / 4; const sk = botSkill(t); return { team: t, seat: b.seat, name: drvOf(t, b.seat)[1], skill: sk, t: T.refLap * QK / (lerp(1, sk, .8) * perf) * rand(.99, 1.015), f: T.secF.map(x => x * rand(.985, 1.015)), ty: rec }; });
  F.qb = qb;
  if (G.net) bcast({ t: 'start', sess: 'quali', grid: netGrid(F.humans), laps: 1, track: F.trk, opts: { ...F.opts, form: F.form } });
  startRace(F.humans, 1, G.net, F.trk, { sess: 'quali', ...F.opts, qb, form: F.form });
}
function qEnd() {
  G.qdone = true; const F = Flow;
  const hs = G.cars.filter(c => c.human || F.humans.some(h => h.team === c.team)).map(c => ({ team: c.team, seat: c.seat, name: c.name, human: c.human, time: c.qt || 999, sec: c.qt ? c.ls : null })).sort((a, b) => a.time - b.time);
  let bs = (F.qb || []).map(b => ({ team: b.team, seat: b.seat, name: b.name, human: null, time: b.t, skill: b.skill, f: b.f })).sort((a, b) => a.time - b.time), rows;
  if (G.net && hs.length > 1 && bs.length) { // friends spread evenly through the field: winner on pole, last at the back
    const n = hs.length + bs.length, m = hs.length; rows = new Array(n); hs.forEach((h, k) => rows[Math.round(k * (n - 1) / (m - 1))] = h);
    let bi = 0; for (let p = 0; p < n; p++) if (!rows[p]) rows[p] = bs[bi++];
    let lastH = 0; for (let p = 1; p < n; p++) { if (rows[p].human) { const a = rows[lastH].time, top = rows[p].time >= 999 ? a + (p - lastH) * .35 : rows[p].time; for (let q = lastH + 1; q < p; q++) rows[q].time = lerp(a, top, (q - lastH) / (p - lastH)); lastH = p; } }
  } else rows = [...hs, ...bs].sort((a, b) => a.time - b.time);
  for (const r of rows) if (r.f) { const su = r.f[0] + r.f[1] + r.f[2]; r.sec = r.f.map(x => x / su * r.time); }
  F.rows = rows;
  const wire = rows.map(r => ({ team: r.team, seat: r.seat | 0, name: r.name, time: +r.time.toFixed(3), sec: r.sec && r.sec.map(x => +x.toFixed(3)), human: r.human === 'local' ? Net.me : r.human }));
  if (G.net) bcast({ t: 'qres', rows: wire });
  showQuali(rows.map(r => ({ ...r, me: r.human === 'local' })), true);
  if (G.net) { clearTimeout(F.tm); F.tm = setTimeout(qGo, 20000); }
}
function showQuali(rows, canGo) {
  $('#hud').classList.add('hidden'); show('quali');
  const best = rows[0].time, bestS = [0, 1, 2].map(k => Math.min(...rows.map(r => r.sec && r.sec[k] > 0 ? r.sec[k] : 1e9)));
  const sc = (r, k) => r.sec && r.sec[k] > 0 ? `<td class="t s${r.sec[k] <= bestS[k] + 1e-6 ? ' pb' : ''}">${r.sec[k].toFixed(3)}</td>` : '<td class="t s">—</td>';
  $('#qTable').innerHTML = `<tr class="hd"><td></td><td>ПИЛОТ</td><td class="t s">S1</td><td class="t s">S2</td><td class="t s">S3</td><td class="t">КРУГ</td></tr>` + rows.map((r, k) => `<tr class="${r.me ? 'me' : ''}"><td>${k + 1}</td><td><i style="${teamMark(r.team)}"></i>${r.human ? esc(r.name) : esc(r.name || TEAMS[r.team].code)}</td>${sc(r, 0)}${sc(r, 1)}${sc(r, 2)}<td class="t">${r.time >= 999 ? 'НЕТ' : k ? '+' + (r.time - best).toFixed(3) : fmt(r.time)}</td></tr>`).join('');
  $('#qGo').classList.toggle('hidden', !canGo); $('#qWait').classList.toggle('hidden', canGo);
}
function qGo() {
  const F = Flow; if (!F || !F.rows) return; clearTimeout(F.tm); const rows = F.rows; F.rows = null;
  flowPick(rows.map(r => ({ team: r.team, seat: r.seat | 0, human: r.human, name: r.name, skill: r.skill, qt: r.time < 999 ? r.time : 0, sk: (F.humans.find(h => h.human === r.human) || {}).sk | 0 })));
}
function withRace(F, fn) { // the race does not exist yet: borrow its track, sky and rules for a moment
  const save = [G.h, G.track, G.opts, G.wS, G.laps]; G.h = F.opts.h0 != null ? F.opts.h0 : F.opts.wx === 1 ? 15 : 5; G.wS = F.opts.ws0; G.track = getTrack(F.trk, F.opts.tw); G.opts = { tyres: F.opts.tyres, wx: F.opts.wx, rl: F.opts.rl, tm: F.opts.tm, as: F.opts.as }; G.laps = F.laps;
  try { return fn(); } finally { [G.h, G.track, G.opts, G.wS, G.laps] = save; }
}
function flowPick(order) {
  const F = Flow; F.order = order;
  if (!F.opts.tyres) return flowGo();
  F.rec = withRace(F, () => bestTyre(F.laps));
  const go = k => { F.picks.local = k; if (!G.net) return flowGo(); if (F.order.filter(h => h.human).every(h => F.picks[h.human] != null)) flowGo(); };
  openPick(F.opts.wx >= 0, G.net ? 12 : 0, go, wxText(F.opts), F.rec);
  if (G.net) { bcast({ t: 'tpick', wet: F.opts.wx >= 0, secs: 12, wx: wxText(F.opts), rec: F.rec }); clearTimeout(F.tm); F.tm = setTimeout(flowGo, 12500); }
}
function flowGo() {
  const F = Flow; if (!F || !F.order) return; clearTimeout(F.tm);
  const live = h => !h.human || h.human === 'local' || Net.players.some(p => p.id === h.human), lapsL = F.laps;
  const grid = withRace(F, () => F.order.map(h => { const hu = live(h) ? h.human : null, t = hu ? (F.picks[hu] != null ? F.picks[hu] : F.rec != null ? F.rec : G.h > 22 ? 3 : 1) : null; const sg = hu ? null : botStrat(lapsL), t2 = t != null ? t : sg ? sg.k0 : botTyre(lapsL); return { team: h.team, seat: h.seat | 0, human: hu, name: h.name, t: t2, strat: sg, skill: h.skill || 0, sk: h.sk | 0, qt: h.qt || 0 }; }));
  F.order = null;
  if (G.net) bcast({ t: 'start', sess: 'race', grid: netGrid(grid), laps: F.laps, track: F.trk, opts: { ...F.opts, form: F.form } });
  startRace(grid, F.laps, G.net, F.trk, { sess: 'race', ...F.opts, form: F.form });
}
/* ---------- championship: the 2026 calendar in order, each round a weekend of practice, qualifying and the race ---------- */
const Champ = { on: false, tab: 'd' };
const ROUNDS = CAL.map(q => TRK.findIndex(d => d.id === q[0])).filter(i => i >= 0);
const champ = () => S.ch || (S.ch = { r: 0, pts: {}, cpts: {}, res: [], mode: 'solo', n22: !!S.n22, cnt: 24, sel: 'cal', pick: [] });
const chKey = c => c.human === 'local' ? 'me' : c.human ? 'h:' + (c.name || '') : c.team + '-' + (c.seat | 0);
/* the season's rounds: the whole calendar, its first N races, N random circuits, or the player's own choice (in calendar order) */
const calKey = i => TRK[i].cal != null ? TRK[i].cal : 100 + TRK_ORDER.indexOf(i);
function chRounds(C) {
  if (C.list && (C.r > 0 || (C.res && C.res.length))) return C.list; // a season under way keeps its rounds
  const n = C.cnt || 24; let L;
  if (C.sel === 'pick') L = (C.pick || []).slice().sort((a, b) => calKey(a) - calKey(b));
  else if (C.sel === 'rnd') { if (!C.rnd || C.rnd.length !== Math.min(n, TRK.length)) C.rnd = TRK.map((_, i) => i).sort(() => Math.random() - .5).slice(0, n).sort((a, b) => calKey(a) - calKey(b)); L = C.rnd; }
  else L = ROUNDS.slice(0, n);
  return C.list = L;
}
const chOpen = C => !(C.r > 0 || (C.res && C.res.length)); // the season's shape can still change
function champAward() {
  const C = champ(), RD = chRounds(C), st = standings(); if (C.r >= RD.length) return; let my = 0;
  st.forEach((c, k) => { const p = (c.fin || G.sess === 'race') ? F1PTS[k] || 0 : 0, key = chKey(c); C.pts[key] = (C.pts[key] || 0) + p; C.cpts[c.team] = (C.cpts[c.team] || 0) + p; if (c.human === 'local') my = k + 1; });
  const names = C.names || (C.names = {}); st.forEach(c => { const key = chKey(c); if (!names[key]) names[key] = [c.team, c.human === 'local' ? myName() : c.human ? c.name : drvOf(c.team, c.seat | 0)[0]]; });
  C.res[C.r] = { p: my, w: chKey(st[0]) }; C.r++; saveS();
  setTimeout(() => toast(C.r >= RD.length ? 'Сезон окончен! Итоги — в таблице чемпионата' : 'Этап ' + C.r + ' / ' + RD.length + ' · ' + (F1PTS[my - 1] || 0) + ' очк.'), 600);
}
function openChamp() { Champ.on = true; show('champ'); renderChamp(); }
const rainPct = d => { const cl = d.climate || [.5, .25, .2, .05]; return Math.round((cl[2] + cl[3]) * 100); };
function chSync() {
  const on = (id, v) => $$(id + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === String(v)));
  on('#chLaps', S.laps); on('#chCars', S.n22 ? 1 : 0); on('#chDiff', S.diff); on('#chAssist', S.assist);
}
function renderChamp() {
  const C = champ(), RD = chRounds(C), open = chOpen(C), done = !open && C.r >= RD.length, need = open && RD.length < Math.min(C.cnt || 24, TRK.length);
  const ti = RD.length ? RD[Math.min(C.r, RD.length - 1)] : ROUNDS[0], d = TRK[ti];
  $('#chRound').textContent = done ? 'СЕЗОН ЗАВЕРШЁН' : need ? 'ВЫБЕРИ ТРАССЫ СЕЗОНА' : 'ЭТАП ' + (C.r + 1) + ' / ' + RD.length + (d.mon ? ' · ' + d.mon : '');
  $('#chTrack').textContent = done ? 'ИТОГИ СЕЗОНА' : d.name; $('#chFlag').className = 'flag ' + (d.flag || 'mc');
  $('#chSub').textContent = done ? 'Начни новый сезон кнопкой вверху' : need ? 'Отметь ещё ' + (Math.min(C.cnt || 24, TRK.length) - RD.length) + ' в списке ниже' : d.sub;
  $('#chFacts').innerHTML = done ? '' : `<div><b>${d.km}</b><span>КМ</span></div><div><b>${S.laps}</b><span>КРУГОВ</span></div><div><b>${(parseFloat(d.km) * S.laps).toFixed(0)}</b><span>КМ ГОНКИ</span></div><div><b>${rainPct(d)}%</b><span>ШАНС ДОЖДЯ</span></div>`;
  { const tc = $('#chThumb'), r = tc.getBoundingClientRect(), dp = Math.min(3, Math.max(2, devicePixelRatio || 1)); if (r.width > 10) { tc.width = Math.round(r.width * dp); tc.height = Math.round(r.height * dp); } defOutline(tc, d, '#FFC400', 14 * dp, 3.4 * dp); }
  $('#chPrac').disabled = $('#chQ').disabled = $('#chGo').disabled = done || need; $$('#chMode button').forEach(b => b.classList.toggle('on', b.dataset.v === (C.mode || 'solo')));
  $('#chInvRow').classList.toggle('hidden', C.mode !== 'net' || done || need);
  $('#chSetup').classList.toggle('hidden', !open); $$('#chCnt button').forEach(b => b.classList.toggle('on', +b.dataset.v === (C.cnt || 24))); $$('#chSel button').forEach(b => b.classList.toggle('on', b.dataset.v === (C.sel || 'cal')));
  $('#chSeasonL').textContent = open ? 'СЕЗОН · НАСТРОЙКА' : 'КАЛЕНДАРЬ СЕЗОНА';
  $('#chSeasonN').textContent = open ? (C.sel === 'pick' ? 'Нажимай на трассы: выбрано ' + RD.length + ' из ' + Math.min(C.cnt || 24, TRK.length) : RD.length + ' ' + (RD.length < 5 ? 'гонки' : 'гонок') + ' · начни первый этап — и сезон пошёл') : C.r + ' из ' + RD.length + ' пройдено';
  const pickMode = open && C.sel === 'pick', show = pickMode ? TRK_ORDER : RD;
  $('#chCal').innerHTML = show.map(i => { const t = TRK[i], k = RD.indexOf(i), r = k >= 0 ? C.res[k] : null, sel = pickMode && k >= 0;
    return `<button data-i="${i}" class="${pickMode ? (sel ? 'sel' : 'off') : k < C.r ? 'done' : k === C.r ? 'now' : ''}"><canvas width="96" height="60"></canvas><em>${k >= 0 ? String(k + 1).padStart(2, '0') : '··'}${t.mon ? ' · ' + t.mon : ''}</em><b><i class="flag ${t.flag || 'mc'}"></i> ${t.name}</b><small>${t.km} км · дождь ${rainPct(t)}%</small>${r ? `<u>${r.p ? 'P' + r.p : '—'}</u>` : ''}</button>`; }).join('');
  { const dp = Math.min(3, Math.max(2, devicePixelRatio || 1)); $$('#chCal button').forEach(b => { const i = +b.dataset.i, k = RD.indexOf(i), cv = b.querySelector('canvas'), r = cv.getBoundingClientRect(); if (r.width > 4) { cv.width = Math.round(r.width * dp); cv.height = Math.round(r.height * dp); } defOutline(cv, TRK[i], k === C.r && !pickMode ? '#FFC400' : k >= 0 && k < C.r ? '#24d07a' : '#d9dce2', 6 * dp, 2 * dp); }); } // drawn at the size it is shown, times the screen's pixel density: sharp
  $$('#chTabs button').forEach(b => b.classList.toggle('on', b.dataset.v === Champ.tab)); const N = C.names || {};
  if (Champ.tab === 'c') { const rows = TEAMS.map((t, i) => ({ i, p: C.cpts[i] || 0 })).sort((a, b) => b.p - a.p);
    $('#chTable').innerHTML = '<tr class="hd"><td></td><td>КОМАНДА</td><td class="t">ОЧКИ</td></tr>' + rows.map((r, k) => `<tr class="${r.i === S.team ? 'me' : ''}"><td>${k + 1}</td><td><i style="${teamMark(r.i)}"></i>${TEAMS[r.i].n}</td><td class="t">${r.p}</td></tr>`).join(''); }
  else { const keys = new Set(Object.keys(C.pts)); keys.add('me'); TEAMS.forEach((_, i) => { if (i !== S.team || C.n22) keys.add(i + '-0'); if (C.n22) keys.add(i + '-1'); });
    const nm = k => N[k] ? N[k] : k === 'me' ? [S.team, myName()] : k.startsWith('h:') ? [0, k.slice(2)] : [+k.split('-')[0], drvOf(+k.split('-')[0], +k.split('-')[1])[0]];
    const rows = [...keys].map(k => ({ k, p: C.pts[k] || 0, n: nm(k) })).sort((a, b) => b.p - a.p);
    $('#chTable').innerHTML = '<tr class="hd"><td></td><td>ПИЛОТ</td><td class="t">ОЧКИ</td></tr>' + rows.map((r, k) => `<tr class="${r.k === 'me' ? 'me' : ''}"><td>${k + 1}</td><td><i style="${teamMark(r.n[0])}"></i>${esc(r.n[1])}</td><td class="t">${r.p}</td></tr>`).join(''); }
  chSync(); fitUI();
}
function champRun(kind) {
  const C = champ(), RD = chRounds(C); if (C.r >= RD.length) return; const ti = RD[C.r], keep = S.track, kq = S.quali; Snd.init(); sfx('ui'); C.n22 = !!S.n22; C.list = RD.slice();
  if (C.mode === 'net') { champInvite(); return; }
  // a championship weekend: the sky is always the circuit's own (automatic), qualifying only when the player picks it
  const kw = [S.wx, S.weather, S.tyres]; S.track = ti; S.wx = 4; S.weather = true; S.tyres = true;
  try { if (kind === 'practice') startPractice(); else { S.quali = kind === 'quali'; flowStart('solo', { last: kind === 'race' }); } } finally { S.track = keep; S.quali = kq; [S.wx, S.weather, S.tyres] = kw; }
}
/* with friends: a lobby on this round's circuit; the link goes to the clipboard right away, the code shows in the lobby */
function champInvite() {
  const C = champ(), RD = chRounds(C); if (C.r >= RD.length) return; C.list = RD.slice(); S.track = RD[C.r]; saveS();
  if (!S.name) S.name = myName(); try { RT.setNick(S.name); } catch (e) {}
  hostLobby(); toast('Создаём лобби этапа ' + (C.r + 1) + ' — ссылку для друзей скопируй в лобби');
  const t0 = Date.now(), iv = setInterval(() => { if (Net.code && Net.host) { clearInterval(iv); const url = location.origin + location.pathname + '#join=' + Net.code; (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast('Ссылка-приглашение скопирована — отправь друзьям'), () => toast('Ссылка: ' + url)); } else if (Date.now() - t0 > 15000) clearInterval(iv); }, 300);
}
/* ---------- tyre pickers ---------- */
function tyreCards(el, wet, cb, rec) {
  const life = ['≈3 круга', '≈4–5 кругов', '≈6–7 кругов', 'только дождь'], pace = ['самые быстрые', '−2.5% темпа', '−4.5% темпа', 'держат мокрую трассу'], note = ['износ 16% / круг', 'износ 10.5% / круг', 'износ 7.5% / круг', 'на сухом тают за круг'], bar = [[1, .34], [.72, .62], [.5, 1], [.6, .6]];
  el.innerHTML = TY.slice(0, wet ? 4 : 3).map((t, k) => `<button class="tcard${k === rec ? ' rec' : ''}" data-k="${k}" style="--tc:${t.c}"><i style="border-color:${t.c};color:${t.c}">${t.l}</i><b>${t.n}</b><span>${pace[k]}</span><span>${life[k]}</span><span>${note[k]}</span><u title="темп"><s style="width:${bar[k][0] * 100}%"></s></u><u title="ресурс" class="lf"><s style="width:${bar[k][1] * 100}%"></s></u>${k === rec ? '<em>СОВЕТ ИНЖЕНЕРА</em>' : ''}<kbd>${k + 1}</kbd></button>`).join('');
  el.onclick = e => { const b = e.target.closest('.tcard'); if (b) cb(+b.dataset.k); };
}
let pickT = 0;
function openPick(wet, secs, cb, wx, rec) {
  show('tyrepick'); { const F = Flow, d = F && TRK[F.trk]; $('#tpTitle').textContent = d ? d.name + ' · ' + F.laps + (F.laps < 5 ? ' КРУГА' : ' КРУГОВ') : ''; } $('#tpWx').textContent = wx || ''; $('#tpWx').classList.toggle('hidden', !wx); tyreCards($('#tpCards'), wet, k => { $$('#tpCards .tcard').forEach((b, i) => b.classList.toggle('on', i === k)); S.lastTy = k; clearInterval(pickT); $('#tpTimer').textContent = secs ? 'Ждём остальных…' : ''; cb(k); }, rec);
  clearInterval(pickT); $('#tpTimer').textContent = secs ? secs + ' сек' : ''; if (secs) { let s = secs; pickT = setInterval(() => { s--; $('#tpTimer').textContent = Math.max(0, s) + ' сек'; if (s <= 0) clearInterval(pickT); }, 1000); }
}
function closeTyreUI() { clearInterval(pickT); const a = document.getElementById('pitSheet'); if (a) a.classList.add('hidden'); PitUI.open = false; }
const PitUI = { open: false };
function pitPick(k) { const me = G.cars[G.me]; if (!me || (me.pitS && me.pitSet)) return; PitUI.sel = k; if (me.pitS) me.pitSel = k; else me.pitPre = k; $$('#pitCards .tcard').forEach((b, i) => b.classList.toggle('on', i === k)); if (G.net === 'client' && Net.hc) Net.hc.send({ t: 'pit', k }); sfx('ui'); }
function startAttract() {
  const grid = TEAMS.map((_, i) => ({ team: i, human: null, skill: rand(.9, 1) }));
  startRace(grid, 999, 'attract', S.track);
  G.follow = G.cars.findIndex(c => c.team === S.team);
  const c = G.cars[G.follow]; cam.x = c.x; cam.y = c.y; cam.a = c.h;
  show('menu');
}

/* =====================================================================
   PHYSICS
   ===================================================================== */
function trackPos(c, forced) {
  const T = G.track, N = T.N; let best = 1e18, bi = forced != null ? forced : c.idx;
  if (forced == null) for (let k = -22; k <= 22; k++) { const i = (c.idx + k + N) % N, dx = c.x - T.x[i], dy = c.y - T.y[i], d = dx * dx + dy * dy; if (d < best) { best = d; bi = i; } }
  const prev = c.idx; c.idx = bi; c.d = (c.x - T.x[bi]) * T.nx[bi] + (c.y - T.y[bi]) * T.ny[bi];
  if (c.secI < 2 && prev < T.sec[c.secI] && bi >= T.sec[c.secI] && bi - prev < N * .5) { secMark(c); c.secI++; }
  if (bi > N * .3 && bi < N * .7) c.half = true;
  if (prev > N * .8 && bi < N * .2) { if (c.back) { c.lap++; c.half = false; c.back = false; } else if (c.half) { c.lap++; c.half = false; onLap(c); } }
  else if (prev < N * .2 && bi > N * .8) { c.lap--; c.half = true; c.back = true; }
  c.prog = c.lap * N + bi;
}
function secMark(c) { const k = c.secI, v = G.t - c.sLast; adaptSec(c, k, v); if (G.sess === 'quali' && c.human && G.net !== 'client' && (c.lap === 1 || (c.lap === 2 && k === 2 && !c.qt))) qualiSector(c, k, v); c.sc[k] = v; c.sLast = G.t; if (!c.bs[k] || v < c.bs[k]) c.bs[k] = v; if (!G.bs[k] || v < G.bs[k]) G.bs[k] = v; }
/* after every sector of the timed lap: my place on pace, and the purple plaque for the quickest player */
function qualiSector(c, k, v) {
  const q = c.qsec || (c.qsec = [0, 0, 0]); q[k] = v;
  const others = [...G.cars.filter(o => o !== c && o.qsec && o.qsec[k]).map(o => o.qsec[k]), ...(G.qb || []).map(b => b.t * b.f[k] / (b.f[0] + b.f[1] + b.f[2]))];
  const pos = 1 + others.filter(x => x < v).length, best = !!G.net && v < G.qBest[k]; if (best) G.qBest[k] = v;
  const m = { t: 'sec', k, pos, v: +v.toFixed(3), n: c.name, best, uid: c.human === 'local' ? Net.me : c.human };
  if (G.net) bcast(m); showSec(m, c.human === 'local');
}
let secT = 0, secT2 = 0;
function showSec(m, mine) {
  if (mine) { const e = $('#secPop'); e.innerHTML = `<span>S${m.k + 1}</span><b>P${m.pos}</b><em>${m.v.toFixed(3)}</em>`; e.className = m.pos === 1 ? 'pb' : m.pos <= 3 ? 'gd' : ''; clearTimeout(secT); secT = setTimeout(() => e.classList.add('hidden'), 2600); }
  if (m.best) { const e = $('#secBest'); e.innerHTML = `<span>S${m.k + 1}</span><b>${esc(m.n)}</b><em>${m.v.toFixed(3)}</em>`; e.classList.remove('hidden'); clearTimeout(secT2); secT2 = setTimeout(() => e.classList.add('hidden'), 3200); }
}
function onLap(c) {
  if (c.secI === 2) { secMark(c); c.ls = c.sc; } c.sc = [0, 0, 0]; c.secI = 0; c.sLast = G.t;
  if (G.sess === 'quali') { if (c.lap === 1) c.qs = G.t; else if (c.lap === 2 && !c.qt) { c.qt = G.t - c.qs; c.fin = true; c.finT = c.qt; if (c.human === 'local') banner(fmt(c.qt), '#FFC400'); } return; }
  if (G.sess === 'practice' && c.lap === 1) c.lapStart = G.t; // the flying lap starts at the line
  if (c.lap >= 2) { c.last = G.t - c.lapStart; const pb = c.last < c.best; c.best = Math.min(c.best, c.last); c.lapStart = G.t;
    c.lls = c.ls.slice(); if (pb) { c.bls = c.ls.slice(); if (G.sess === 'practice' && c.human === 'local') pracSave(c); }
    if (c.human === 'local' && c.lap <= G.laps) banner(c.last <= c.best ? 'BEST LAP' : (c.lap === G.laps ? 'FINAL LAP' : 'LAP ' + c.lap), c.last <= c.best ? '#b06cff' : '#fff');
    if (G.sess === 'race' && c.lap >= 3 && c.last < (G.fl || 1e9) && !c.pitDone) { const first = !G.fl; G.fl = c.last; G.flC = c; if (!first && G.mode === 'race') raceCtl('ЛУЧШИЙ КРУГ ГОНКИ', (c.human ? c.name : drvOf(c.team, c.seat)[0]) + ' · ' + fmt(c.last), 'fl'); } }
  if (c.lap > G.laps && !c.fin) {
    c.fin = true; c.finT = G.t; G.order.push(c);
    if (c.human === 'local') { banner('FINISH', '#FFC400'); G.resT = 2.6; }
  }
}
function physics(c, dt) {
  const T = G.track, tm = carStats(c), tf = tyreFx(c), P = pitOn() ? T.pit : null;
  let thr = c.thr, brk = c.brk, steer = c.steer;
  if (G.phase !== 'race' || c.pitS) { c.vx = c.vy = c.vF = c.vL = 0; return; }
  const v0F = c.vF;
  // steering → yaw
  const hum = !!c.human, A = hum ? AS() : null, kSteer = steer / (55 + Math.abs(v0F) * (hum ? .135 : .18));
  const slip = Math.atan2(Math.abs(c.vL), Math.abs(v0F) + 1);
  const push = hum && thr > .2 && !c.inPit && T.vc[c.idx] > 0 ? clamp((v0F / T.vc[c.idx] - 1) / .12, 0, 1) * .3 : 0; // over 90° on the throttle the front washes out: lift to make it
  c.push = push; c.h += v0F * kSteer * Math.max(.15, 1 - slip / .7) * (1 - .75 * push) * dt;
  const fx = Math.sin(c.h), fy = -Math.cos(c.h), rx = -fy, ry = fx;
  let vF = c.vx * fx + c.vy * fy, vL = c.vx * rx + c.vy * ry;
  // surface
  const ad = Math.abs(c.d), pa = hum ? 1 : (c.pa || 1), pv = hum ? 1 : clamp(.55 + .45 * (G.paV || 1), .88, 1); let grip = GRIP * tm.grip * tf.g * (hum ? A.grip : Math.max(1, c.skill * c.skill)) * pa, vmax = VMAX * tm.spd * tf.s * pv, drag = 0, trac = 1;
  grip *= 1 - .6 * push; c.surf = 0;
  if (ad > T.hw + 13 && !c.inPit && !(P && P.rel(c.idx) <= P.len && c.d * P.sd > 0)) {
    const ro = c.d > 0 ? T.roP[c.idx] : T.roN[c.idx];
    if (ro > 12 && ad > T.hw + 16) {
      if (inGravel(T, c.idx, c.d)) { c.surf = 2; grip *= .68; vmax *= .67; drag = 190; trac = .8; } // gravel trap: it slows the car hard
      else if (T.sand) { c.surf = 4; grip *= .5; vmax *= .78; drag = 70; trac = .74; } // desert sand: hardly slows, but the rear will not stay behind you
      else { c.surf = 1; grip *= .74; vmax *= .67; drag = 100; trac = .88; } // grass run-off
    }
    else if (T.city || T.def.zones) { c.surf = 3; grip *= .9; vmax *= .9; drag = 45; }
    else if (T.grav[c.idx] === Math.sign(c.d) && ad < T.hw + 130) { c.surf = 2; grip *= .42; vmax = 170; drag = 900; trac = .55; }
    else { c.surf = 1; grip *= .55; vmax = 330; drag = 260; trac = .75; }
  } else if (ad > T.hw - 6 && T.kerb[c.idx]) { c.surf = 3; grip *= .95; vmax *= .985; }
  const lvl = hum ? 1 : clamp(1 + (c.skill - 1) * .3, .965, 1); vmax *= lvl; // a bot never has more top speed than its car: the difficulty is made in the corners, so a tow and the battery always work
  const tw = c.tow > 0 ? c.tow : 0; vmax *= 1 + .018 * tw; // slipstream: a small help, a pass still needs a better exit
  const rb = hum ? (c.rub || 0) * A.rub : 0; vmax *= 1 + rb; grip *= 1 + rb * .6; // far behind: an unseen helping hand until the car ahead is back in reach
  if (c.inPit) vmax = Math.min(vmax, hum ? PITV_H : PITV);
  if (hum && A.guard > 0 && ad > T.hw + T.wall + (c.d > 0 ? T.roP[c.idx] : T.roN[c.idx]) - 80 && !(P && P.rel(c.idx) <= P.len && c.d * P.sd > 0)) { // wall guard: gently turns the nose away before contact
    const s = Math.sign(c.d), tg = Math.atan2(T.tx[c.idx], -T.ty[c.idx]), e = wrapA(tg - c.h);
    if (Math.abs(e) < 1.1 && (c.vx * T.nx[c.idx] + c.vy * T.ny[c.idx]) * s > 0) c.h += e * 2.4 * A.guard * (1 - push) * dt;
  }
  // longitudinal
  drag *= Math.min(1, Math.abs(vF) / 160); // run-off drag fades at walking pace: a car that stopped in the gravel can always drive out
  let a = 0; if (c.pen > 0) c.pen -= dt; if (c.lb > 0) c.lb -= dt; // pen: jump-start penalty, lb: perfect-launch bonus
  if (thr > 0 && vF > -5) { a += thr * pushA(Math.max(0, vF), vmax, tm.acc * lvl) * tf.a * pv * trac * (c.bst ? 1 + .3 * (1 - Math.min(1, Math.max(0, vF) / vmax) ** 5) : 1) * (1 + .06 * tw) * (c.pen > 0 ? 0 : c.lb > 0 ? 1.12 : 1) * (1 + rb * 1.6); }
  if (brk > 0) { if (vF > 8) a -= brk * BRAKE * tm.brk * lerp(1, tf.wg == null ? 1 : tf.wg, .7) * (c.surf === 1 ? .75 : 1); else if (thr === 0) a -= brk * 260; } // a wet road and grass lengthen the braking
  if (thr > 0 && vF < -5) a += thr * BRAKE * 1.1; // rolling backwards and on the throttle: that is a brake first
  if (thr === 0 && brk === 0 && Math.abs(vF) > 8 && !c.pitS) a -= (150 + 130 * Math.min(1, Math.abs(vF) / VMAX)) * Math.sign(vF); // engine braking off the throttle, either way: lifting really slows the car
  if (vF < -110) a = Math.max(a, 0);
  a -= 55 * Math.sign(vF) + drag * Math.sign(vF) + (vF > 0 ? (thr > 0 ? dragA(vF, vmax) : 170 * (vF / vmax) ** 2) : 0);
  if (T.sl) a -= clamp(T.sl[c.idx] * 900, -32, 32) * (thr > 0 && vF < 160 ? .35 : 1); // a hill is felt, but a car pulling away from a standstill always climbs it
  if (vF > vmax * 1.02 || c.inPit) a -= Math.max(0, vF - vmax) * (c.inPit ? 8 : 1.6);
  if (thr === 0 && brk === 0 && Math.abs(vF) < 8) vF = 0;
  vF += a * dt;
  // lateral grip
  if (c.surf === 4 && vF > 90) { const o = Math.min(1, vF / 420) * (.35 + Math.abs(steer) + thr * .6); c.h += steer * o * .9 * dt; vL += (steer || (Math.random() - .5)) * o * 260 * dt; c.slide = Math.max(c.slide || 0, o * .8); } // on sand the car steps out under power and steering
  if (tf.sl > 0 && vF > 120) { const o = tf.sl * Math.abs(steer) * Math.min(1, vF / 520); c.h += steer * o * .4 * dt; vL -= Math.sign(steer) * o * 240 * dt; } // wet track: the rear steps out
  const corr = Math.min(Math.abs(vL), grip * dt); vL -= Math.sign(vL) * corr;
  if (Math.abs(vL) > 28) vF -= Math.sign(vF) * Math.abs(vL) * .9 * dt;
  c.vF = vF; c.vL = vL; c.vx = fx * vF + rx * vL; c.vy = fy * vF + ry * vL;
  c.x += (c.vx + c.kx) * dt; c.y += (c.vy + c.ky) * dt;
  const kd = Math.exp(-dt * 4.5); c.kx *= kd; c.ky *= kd;
  c.slide = clamp((Math.abs(vL) - 40) / 120, 0, 1) + (brk > .5 && vF > 420 && c.surf === 0 ? .4 : 0) + (c.surf === 4 ? clamp(Math.abs(vL) / 160, 0, .6) : 0);
}
function collide() {
  if (G.sess === 'quali') return; // qualifying: everyone else is a ghost
  const cs = G.cars;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const A = cs[i], B = cs[j]; if (Math.abs(A.x - B.x) > 120 || Math.abs(A.y - B.y) > 120) continue;
    // Online drivers simulate their own car. A delayed opponent cannot apply an impulse.
    if (G.net === 'host' && (A.human || B.human)) continue;
    if (A.inPit || B.inPit) continue; // no jams in the pit lane
    const gi = Math.abs(A.idx - B.idx); if (Math.min(gi, G.track.N - gi) > 100) continue; // other level / other part of the lap
    const soft = G.phase === 'race' && G.t < 3.5;
    for (let p = -1; p <= 1; p += 2) for (let q = -1; q <= 1; q += 2) {
      const ax = A.x + Math.sin(A.h) * CAR_HALF * p, ay = A.y - Math.cos(A.h) * CAR_HALF * p;
      const bx = B.x + Math.sin(B.h) * CAR_HALF * q, by = B.y - Math.cos(B.h) * CAR_HALF * q;
      let dx = bx - ax, dy = by - ay; const d = Math.hypot(dx, dy);
      if (d >= CAR_R * 2 || d < 1e-3) continue;
      dx /= d; dy /= d; const ov = CAR_R * 2 - d;
      A.x -= dx * (ov / 2 + 1.5); A.y -= dy * (ov / 2 + 1.5); B.x += dx * (ov / 2 + 1.5); B.y += dy * (ov / 2 + 1.5);
      const vn = (B.vx - A.vx) * dx + (B.vy - A.vy) * dy;
      // knock: separation that grip cannot cancel, so cars spring apart instead of locking together
      const want = soft ? 22 : clamp(26 + Math.abs(vn) * .08, 26, 60), rel = (B.kx - A.kx) * dx + (B.ky - A.ky) * dy;
      if (rel < want) { const e = (want - rel) / 2; A.kx -= dx * e; A.ky -= dy * e; B.kx += dx * e; B.ky += dy * e; }
      if (vn < 0) {
        const J = -(soft ? .45 : .5) * vn; A.vx -= J * dx; A.vy -= J * dy; B.vx += J * dx; B.vy += J * dy; // the closing speed is cancelled and a little comes back: the cars part at once
        const cut = 1 - clamp(.008 + J / 3200, .008, .05) * (soft ? .5 : 1); A.vx *= cut; A.vy *= cut; B.vx *= cut; B.vy *= cut; // contact costs both a little speed
        if (A.human === 'local' || B.human === 'local') { cam.shake = Math.min(5, cam.shake + 1 + J * .04); sfx('bump', J); RP.mark('bump', A.human === 'local' ? j : i, J); } FX.bump((ax + bx) / 2, (ay + by) / 2, J);
      }
    }
  }
}
function barrier(c) {
  const T = G.track, P = pitOn() ? T.pit : null, limP = T.hw + T.wall + T.roP[c.idx] - 15, limN = T.hw + T.wall + T.roN[c.idx] - 15;
  let dmax = limP, dmin = -limN; const lim = P && P.sd < 0 ? limN : limP;
  if (P) { const r = P.rel(c.idx), ds = c.d * P.sd;
    if (r > P.len) c.inPit = false;
    else if (r < P.G || r > P.len - P.G) { c.inPit = ds > T.hw + (r < 6 || r > P.len - 6 ? 22 : 6); if (ds > 0) { const u = P.c(r) + 62 - 14; if (P.sd > 0) dmax = Math.max(lim, u); else dmin = -Math.max(lim, u); } }
    else if (c.inPit) { const dv = P.dv(r), lo = P.lo + dv, hi = P.hi + dv; if (P.sd > 0) { dmin = lo; dmax = hi; } else { dmax = -lo; dmin = -hi; } }
  } else c.inPit = false;
  if (c.d <= dmax && c.d >= dmin) return;
  const s = c.d > dmax ? 1 : -1, nx = T.nx[c.idx] * s, ny = T.ny[c.idx] * s, ex = s > 0 ? c.d - dmax : dmin - c.d;
  c.x -= nx * ex; c.y -= ny * ex;
  const kn = c.kx * nx + c.ky * ny; if (kn > 0) { c.kx -= nx * kn; c.ky -= ny * kn; }
  const vn = c.vx * nx + c.vy * ny;
  if (vn > 0) {
    const hum = !!c.human, W = hum ? AS().wall : 1, sp = Math.hypot(c.vx, c.vy), tx = T.tx[c.idx], ty = T.ty[c.idx], sg = (c.vx * tx + c.vy * ty) >= 0 ? 1 : -1, sn = vn / (sp + 1);
    const fresh = !(G.t - (c.touchT == null ? -9 : c.touchT) < .35);
    FX.hit(c, nx, ny, hum ? vn * (.4 + .6 * W) : vn);
    // a glancing touch scrubs some speed, a square hit all but stops the car; how much a person pays depends on the driving aids
    const loss = hum ? (fresh ? clamp(.03 + sn * .45, .03, .13) * (.55 + .45 * W) * 1.25 : Math.min(.01, sn * .0125)) : Math.min(.55, sn * 1.1), keep = sp * (1 - loss); // a touch costs a few km/h — enough to lose a tenth, never enough to stick
    if (!hum && vn > 45 && !c.inPit) { c.wallT = .55; for (let k = 0; k < 4; k++) puff(c.x + nx * 14, c.y + ny * 14, c, 0); }
    if (hum) { c.touchT = G.t;
      if (fresh && vn > 40) { c.hits = (c.hits || 0) + 1; c.hitV = vn; c.hitT = G.t; if (G.opts.tyres && !c.inPit) c.wear = Math.max(0, c.wear - Math.min(3, vn * .012) * W); if (c.human === 'local') sfx('crash', vn * (.35 + .65 * W)); } }
    c.vx = tx * sg * keep; c.vy = ty * sg * keep; c.vL = 0;
    c.h += wrapA(Math.atan2(tx * sg, -ty * sg) - c.h) * (hum ? .12 : .5);
    if (c.human === 'local') cam.shake = Math.min(3, Math.max(cam.shake, .3 + vn * .006 * (fresh ? 1 : .2)));
  }
  c.d = s > 0 ? dmax : dmin;
}
/* pit stop: docking, then the car stands for 4.5–5.5 s whoever drives it. A person may choose the tyres from the moment the car
   is in the lane until the new wheels go on; with no choice made the crew fits what the pit wall recommends. */
function pitTick(c, dt) {
  const T = G.track, P = pitOn() ? T.pit : null; if (!P) return;
  if (c.pitS) { const b = P.boxP[c.team], k = 1 - Math.exp(-dt * 9); c.x = lerp(c.x, b.x, k); c.y = lerp(c.y, b.y, k); c.h += wrapA(b.h - c.h) * k; c.kx = c.ky = 0;
    const left = Math.max(1, G.laps - c.lap), wait = c.pitS === 1 && c.pitSel == null;
    if (wait) { c.pitW = (c.pitW || 0) + dt; if (c.pitW > 2.4) c.pitSel = bestTyre(left); } // the crew waits for the call
    else { if (c.pitS === 1 && !c.pitSet) { c.pitSet = true; c.pitD = humanStop(c.pitW || 0); c.pitT = c.pitD - (c.pitW || 0); } c.pitT -= dt; } // the clock runs from the moment the car stopped
    if (c.pitSel == null && c.pitS === 2) c.pitSel = botTyre(left, c);
    if (c.pitT <= 0) { if (c.human === 'local' && c.pitT0 != null) raceCtl('ПИТ-СТОП · ' + (G.t - c.pitT0).toFixed(1) + ' С', TY[c.pitSel == null ? c.tyre : c.pitSel].n, 'pit'); fitTyre(c, c.pitSel == null ? c.tyre : c.pitSel); c.pitS = 0; c.pitSv = 0; c.pitSel = null; c.pitDone = true; c.warn = 0; c.stops = (c.stops || 0) + 1; if (c.ai) c.ai.pit = false; }
    return; }
  if (!c.inPit) { c.pitDone = false; c.pitPre = null; return; }
  if (c.pitDone || c.fin) return;
  if (Math.abs(P.rel(c.idx) - P.box[c.team]) <= 3 && (c.human || (c.ai && c.ai.pit))) { c.pitS = c.human ? 1 : 2; c.pitSet = false; c.pitSv = 1; c.pitD = c.pitT = (c.human ? 2.5 : pitDur()) + (!c.human && Math.random() < .05 ? rand(.8, 2.2) : 0); c.pitW = 0; c.pitT0 = G.t; c.pitSel = c.pitPre != null ? c.pitPre : null; c.pitPre = null; c.vx = c.vy = c.vF = c.vL = 0; if (c.human === 'local' || Math.hypot(c.x - cam.x, c.y - cam.y) < 900) sfx('pit'); }
}
function towCalc() {
  const N = G.track.N;
  for (const c of G.cars) { if (!c.human || G.sess !== 'race' || G.phase !== 'race' || c.fin) { c.rub = 0; continue; } let ah = Infinity; for (const o of G.cars) if (o !== c && o.prog > c.prog) ah = Math.min(ah, o.prog - c.prog); c.rub = lerp(c.rub || 0, ah === Infinity ? 0 : clamp((ah * DS - 1800) / 5200, 0, 1) * .08, .06); }
  for (const c of G.cars) {
    c.tow = 0;
    if (c.vF < 300) continue;
    for (const o of G.cars) {
      if (o === c) continue; let ds = o.idx - c.idx; if (ds < -N / 2) ds += N; if (ds > N / 2) ds -= N;
      const ld = Math.abs(o.d - c.d); if (ds > 3 && ds < 49 && ld < 52 && !o.inPit) { const t = (1 - Math.max(0, ds - 10) / 39) * (1 - Math.max(0, ld - 24) / 47); if (t > c.tow) c.tow = t; } // full tow two lengths back, fading out at ten
    }
  }
}

/* ---------- adaptive bots: the field is paced from the human's own sector times (clean and messy laps alike) ---------- */
const DIFF_K = [1.035, .985, .945]; // easy: bots ~4.5% slower than you · normal: a touch slower · pro: 2.5% quicker — you have to drive well
const PRO_FLOOR = .985; // pro bots follow you only down to this pace (× the best lap a human could drive): get close to it and you can win
const tyreM = c => G.opts.tyres ? tyreFx(c).s : 1;
function adaptSec(c, k, v) {
  if (G.sess !== 'race' && G.sess !== 'practice' || G.phase !== 'race' || !G.track || v < 1) return;
  const T = G.track, f = T.secF[k], lapEq = v / f;
  if (c.human) { if (c.rub > .012 || c.inPit || c.pitS || c.pitDone || lapEq > T.refLap * 2.2 || (G.t < 8 && k === 0)) return;
    const n = lapEq * tyreM(c); G.pRefS = carGap(c.team); G.pRef = G.pRef ? Math.min(G.pRef * 1.06, lerp(G.pRef, n, n < G.pRef ? .55 : .3)) : n; return; }
  if ((!G.pRef && S.diff !== 2) || c.inPit || c.pitDone || c.ai && c.ai.pit || (G.pRef && lapEq > G.pRef * 1.6)) return;
  const want = Math.max(G.pRef * DIFF_K[S.diff] / (G.pRefS || 1), S.diff === 2 ? humLap(T) * PRO_FLOOR : 0) * (c.spread || 1), have = lapEq * tyreM(c), r = clamp(Math.pow(have / want, .6), .98, 1.02); // small steps: one slow sector in traffic does not throw a driver's pace around
  c.pa = clamp((c.pa || 1) * r, .85, 1.15);
  const bots = G.cars.filter(q => !q.human); G.paV = bots.reduce((s, q) => s + (q.pa || 1) * q.skill, 0) / Math.max(1, bots.length); // how hard the field is cornering, against a bot's textbook corner speed
}
/* ---------- AI: no fixed line — every bot improvises each corner and sometimes gets it wrong ---------- */
function aiInit() {
  return { wan: 0, wanTo: rand(-.5, .5), wanT: rand(.5, 3), corner: 0, lineK: rand(.2, 1.1), pace: rand(.93, 1.02), look: rand(.85, 1.25),
    err: null, errT: 0, side: 0, nudge: 0, sm: 0, ph: rand(0, 7), f: rand(.3, .7), bias: rand(-.22, .22),
    nz: [rand(.985, 1.015), rand(.985, 1.015), rand(.985, 1.015), 1], pitBias: rand(-.01, .03), rev: 0 };
}
function aiError(c, a, onStraight) {
  const r = Math.random();
  if (onStraight) { a.err = 'drift'; a.errT = rand(.5, 1.1); a.side = Math.random() < .5 ? -1 : 1; }
  else if (r < .45) { a.err = 'late'; a.errT = rand(1.1, 2); a.over = rand(1.14, 1.34); }
  else if (r < .8) { a.err = 'wide'; a.errT = rand(.8, 1.5); a.side = -a.corner; }
  else { a.err = 'twitch'; a.errT = rand(.5, 1); }
}
/* a bot's battery: off the line; out of a slow corner, where the electric torque is worth most; on a straight to pass the car
   within a second ahead or to keep the one a second behind; never sitting on a full battery. Profi uses it every time it pays,
   normal most times, easy now and then. */
function botBoost(c, T) {
  const a = c.ai; if (!a || c.inPit || c.pitS || c.fin || G.phase !== 'race') return false;
  const N = T.N, en = c.en == null ? 1 : c.en, smart = [.3, .65, 1][S.diff];
  if (G.sess === 'race' && c.lap <= 1 && G.t < 4.5 && G.t > (c.react || 0)) return en > .05; // lights out: everyone deploys
  if (c.vF < 140 || c.thr < .9 || Math.abs(c.steer) > .55) { a.bU = 0; return false; }
  let long = 0; for (let k = 4; k < 84; k += 6) { if (T.vt[(c.idx + k) % N] < VMAX * .8) break; long = k; }
  const straight = Math.abs(T.k[c.idx]) < 1 / 1300 && long >= 34, exit = a.slowT != null && G.t - a.slowT < 2.4 && c.vF < VMAX * .8 && long >= 22;
  if (c.bst) return en > .02 && G.t < (a.bU || 0) && (straight || exit);
  if (G.t < (a.bNo || 0) || en < .06) return false;
  const att = (a.gA || 9) < 1, def = (a.gB || 9) < 1, fight = att || def;
  let p = 0, dur = 0;
  if (exit) { p = .45 + .5 * smart; dur = rand(1.1, 2); }
  if (straight && att) { p = Math.max(p, .5 + .5 * smart); dur = Math.max(dur, rand(1.8, 3.2)); }
  if (straight && def) { p = Math.max(p, .4 + .6 * smart); dur = Math.max(dur, rand(1.6, 2.8)); }
  if (straight && en > .82) { p = Math.max(p, .7); dur = Math.max(dur, rand(1.5, 2.6)); }
  if (!fight && en < .45 && smart > .5) p *= .3; // nobody close: keep the charge for a fight
  if (!p) return false;
  if (Math.random() < p) { a.bU = G.t + dur; return true; } a.bNo = G.t + rand(1.2, 2.4); return false;
}
function ai(c, dt) {
  const T = G.track, N = T.N, i = c.idx, v = Math.max(0, c.vF), a = c.ai || (c.ai = aiInit());
  if ((G.phase === 'race' && G.t < c.react && G.mode !== 'attract') || c.pitS) { c.thr = 0; c.brk = 0; c.steer = 0; return; }
  const P = pitOn() && !c.fin ? T.pit : null, fx = tyreFx(c), toGate = P ? (P.a - i + N) % N : 1e9;
  if (P && toGate > 200) a.chk = false;
  if (P && !a.chk && toGate < 140 && toGate > 75 && !c.inPit) { a.chk = true; if (G.laps - c.lap > 0 && G.laps < 999 && botWantsPit(c)) a.pit = true; }
  const la = Math.round((34 + v * .24 * a.look) / DS), j = (i + la) % N, kj = T.k[j], cs = Math.abs(kj) > 1 / 1500 ? Math.sign(kj) : 0;
  const errRate = clamp((1.12 - c.skill) * .45, .03, .2) * [1.1, .5, .22][S.diff];
  // a new corner = a new decision: how close to the apex, how brave on the brakes
  if (cs && cs !== a.corner) {
    const pro = S.diff === 2; a.corner = cs; a.lineK = pro ? rand(.6, 1.1) : rand(.05, 1.15); a.pace = pro ? rand(.99, 1.01) : rand(.94, 1.02); a.bias = pro ? rand(-.15, .15) : rand(-.3, .3);
    if (!a.err && G.phase === 'race' && G.t > 4 && Math.random() < errRate) aiError(c, a, false);
  } else if (!cs) { a.corner = 0; if (!a.err && G.phase === 'race' && G.t > 6 && Math.random() < dt * errRate * .08) aiError(c, a, true); }
  a.wanT -= dt; if (a.wanT <= 0) { a.wanT = rand(1.5, 5); a.wanTo = rand(-.75, .75) * [1, .55, .38][S.diff] * (T.city || !(T.roP[i] + T.roN[i]) ? .5 : 1); } // good drivers hold their line; on a street circuit nobody weaves
  a.wan = lerp(a.wan, a.wanTo, 1 - Math.exp(-dt * .9));
  if (a.err && (a.errT -= dt) <= 0) a.err = null;
  const lin = T.line[j] * a.lineK, room = T.hw * (1 - Math.min(.75, Math.abs(lin) / T.hw));
  let base = lin + (a.wan + a.bias) * room;
  // the start: flat out, straight ahead in your own lane until the first braking zone comes up; only then, gently, onto a line
  if (G.sess === 'race' && c.d0 != null && c.lap <= 1 && !a.go1) { if (G.phase === 'race' && G.t > 1.8 && (G.t > 16 || T.vt[(i + la + 50) % N] < VMAX * .78)) { a.go1 = true; a.go1T = G.t; } else base = c.d0; }
  if (a.go1 && G.t - a.go1T < 5) base = lerp(c.d0, base, ss((G.t - a.go1T) / 5));
  const settled = !(G.sess === 'race' && c.lap <= 1 && (!a.go1 || G.t - a.go1T < 4)); // no attacking while the field is still sorting itself out
  // traffic: pick the side with room, keep off a car alongside
  let block = null, bds = 99, nudge = 0, fol = null, ahd = null, gA = 9, gB = 9, beh = null;
  for (const o of G.cars) {
    if (o === c || o.pitS || o.inPit !== c.inPit) continue; let ds = o.idx - i; if (ds < -N / 2) ds += N; if (ds > N / 2) ds -= N;
    if (ds > 2 && !o.fin) { const g = ds * DS / Math.max(v, 150); if (g < gA) { gA = g; ahd = o; } } else if (ds < -2 && !o.fin) { const g = -ds * DS / Math.max(o.vF, 150); if (g < gB) { gB = g; beh = o; } }
    if (ds > 0 && ds < 32 && Math.abs(o.d - c.d) < 70 && o.vF < c.vF + 25 && ds < bds) { block = o; bds = ds; }
    if (Math.abs(ds) < 10 && Math.abs(o.d - c.d) < 78) { nudge += (c.d >= o.d ? 1 : -1) * 60; a.wan *= .9; } // a car alongside: give it room, no weaving
    if (ds < -3 && -ds * DS < Math.max(c.vF, 120) * .5 && Math.abs(o.d - c.d) < 140 && (!fol || ds > fol.ds)) fol = { o, ds }; // someone within half a second behind
  }
  a.gA = gA; a.gB = gB; if (v < VMAX * .5) a.slowT = G.t; const smart = [.3, .65, 1][S.diff], race = G.sess === 'race' && G.phase === 'race' && !c.inPit;
  // no blocking moves: a bot defends with its battery and its braking, it never swerves at the car behind
  const st0 = G.sess === 'race' && c.lap <= 1 && c.d0 != null ? (a.go1 ? clamp((G.t - a.go1T) / 2.5, 0, 1) : 0) : 1; // lights out: dead straight in its own lane to the first braking zone, then moves fade in
  let aT = nudge * st0; const slowB = block && (block.vF < 60 || block.vF < c.vF - 22), stB = slowB ? 1 : st0; // a slower car ahead — a bad start, a broken car, a worn set: around it at once, never a queue
  a.dive = 0;
  // attack: inside a second of the car ahead — sit in its tow, pull out late on the straight, or set up the inside of the next corner
  if (race && settled && ahd && gA < 1 && !block && !(a.err)) { if (a.atkO !== ahd) { a.atkO = ahd; a.atkGo = Math.random() < .3 + .7 * smart; a.atkSd = Math.random() < .5 ? -1 : 1; }
    if (a.atkGo) { const kc = T.k[(i + Math.min(140, la + 60)) % N], cs2 = Math.abs(kc) > 1 / 1100 ? Math.sign(kc) : 0, sd = cs2 || a.atkSd;
      const lane = gA > .45 && !cs2 ? ahd.d : ahd.d + sd * (gA > .45 ? 62 : 92); // far: line up in the tow · close: pull out beside it
      let ln = Math.abs(lane) < T.hw - 24 ? lane : ahd.d - sd * 92; const busy = x => G.cars.some(o => { if (o === c || o === ahd || o.inPit) return false; let q = o.idx - i; if (q < -N / 2) q += N; if (q > N / 2) q -= N; return Math.abs(q) < 14 && Math.abs(o.d - x) < 58; });
      if (busy(ln)) ln = Math.abs(ahd.d - sd * 92) < T.hw - 24 && !busy(ahd.d - sd * 92) ? ahd.d - sd * 92 : null; // never pull out into a car alongside
      if (ln != null) aT += (ln - base) * st0; } }
  else if (!ahd || gA > 1.4) a.atkO = null;
  if (block) { let sd = c.d >= block.d ? 1 : -1; const kc = T.k[(i + Math.min(60, la + 20)) % N], bold = (block.wear || 100) < (c.wear || 100) - 12 || (block.human && S.diff > 0);
    if (Math.abs(kc) > 1 / 900 && (bold || Math.random() < .5) && bds < 26) { sd = Math.sign(kc) || sd; a.dive = 1; } // dive for the inside of the next corner
    if (a.atkO === block && a.atkGo && a.atkSd && !a.dive) sd = Math.abs(block.d + a.atkSd * 95) > T.hw - 20 ? sd : a.atkSd;
    { const busy = x => Math.abs(x) > T.hw - 18 || G.cars.some(o => { if (o === c || o === block || o.inPit) return false; let q = o.idx - i; if (q < -N / 2) q += N; if (q > N / 2) q -= N; return q > -12 && q < 22 && Math.abs(o.d - x) < 62; });
      if (busy(block.d + sd * 95) && !busy(block.d - sd * 95)) sd = -sd; // the side with room
      if (busy(block.d + sd * 95) && busy(block.d - sd * 95)) aT = 0; else aT = (block.d + sd * 95 - base) * stB; }
    if (stB < 1) a.dive = 0; }
  c.avoid = lerp(c.avoid, aT, 1 - Math.exp(-dt * (slowB ? 5 : 3) * Math.max(.3, stB)));
  let off = stB < 1 ? clamp(base + c.avoid, -T.hw + 6, T.hw - 6) : clamp(base + c.avoid, -T.hw + 20, T.hw - 20);
  if (!c.inPit && !(P && a.pit && toGate < 100)) { let lo = -1e9, hi = 1e9; // a car alongside is a wall: never steer into the space it occupies, whatever the line says
    for (const o of G.cars) { if (o === c || o.inPit || o.pitS) continue; let q = o.idx - i; if (q < -N / 2) q += N; if (q > N / 2) q -= N; if (Math.abs(q) > 11) continue;
      if (o.d >= c.d) hi = Math.min(hi, o.d - 78); else lo = Math.max(lo, o.d + 78); }
    if (lo > -1e9 || hi < 1e9) off = lo <= hi ? clamp(off, lo, hi) : (Math.max(lo, -T.hw) + Math.min(hi, T.hw)) / 2; }
  if (a.err === 'wide' || a.err === 'drift') off = a.side * (T.hw + Math.min(T.wall, 30) + .6 * (a.side > 0 ? T.roP[j] : T.roN[j]));
  if (P && a.pit) { a.err = null; const rj = P.rel(j); if (rj <= P.len && (c.inPit || rj < P.G || P.rel(i) < P.G)) off = P.sd * (rj < P.G ? Math.max(P.c(rj) + 30, T.hw + T.wall) : rj > P.len - P.G ? P.c(rj) : P.dv(rj) + lerp(P.fl, P.bo, ss(1 - (Math.abs(rj - P.box[c.team]) - 5) / 24))); else if (toGate < 90) off = P.sd * (toGate < 30 ? T.hw + 4 : T.hw - 12); }
  else if (c.inPit && P) { const rj = P.rel(j); if (rj <= P.len) off = P.sd * (rj > P.len - P.G ? P.c(rj) : P.fl + P.dv(rj)); }
  else if (P) { const rj = P.rel(j); if ((rj <= P.G + 12 || toGate < 50) && off * P.sd > T.hw - 45) off = P.sd * (T.hw - 45); } // not boxing: keep clear of the pit entry
  const tx = T.x[j] + T.nx[j] * off, ty = T.y[j] + T.ny[j] * off;
  const herr = wrapA(Math.atan2(tx - c.x, -(ty - c.y)) - c.h);
  let st = herr * (2.6 + c.skill) + (a.go1 || c.lap > 1 || G.sess !== 'race' ? Math.sin(G.t * a.f + a.ph) * .025 : 0); // off the line: no weave at all
  if (a.err === 'twitch') st += Math.sin(G.t * 11 + a.ph) * .75;
  a.sm = lerp(a.sm, clamp(st, -1, 1), 1 - Math.exp(-dt * 13)); c.steer = a.sm;
  const tm = carStats(c); let target = T.vt[(i + 2) % N] * c.skill * a.pace * (.5 + .5 * tm.grip) * fx.s * Math.sqrt(fx.g / Math.max(.5, fx.s)) * (c.pa || 1);
  if (P && (c.inPit || (a.pit && toGate < 70))) target = Math.min(target, PITV - 15);
  else if (P && a.pit && toGate < 160) target = Math.min(target, PITV + 40 + toGate * 1.5);
  if (a.err === 'late') target *= a.over;
  if (a.dive && block && Math.abs(block.d - c.d) > 50) target *= 1 + .02 + .025 * smart; // a late, committed braking point on the inside
  if (c.wallT > 0) { c.wallT -= dt; target = Math.min(target, v * .8); c.steer = clamp(c.steer - Math.sign(c.d) * .6, -1, 1); }
  if (Math.abs(c.d) > T.hw + 10) target *= .85;
  if (block && bds < 18 && Math.abs(block.d - c.d) < 58 && !(slowB && st0 < 1 && Math.abs(block.d - c.d) > 30)) target = Math.min(target, block.vF < 120 && st0 >= 1 ? Math.max(block.vF + 10, bds > 9 ? 150 : 70) : block.vF + (bds > 11 ? 10 : -12)); // never through the gearbox: stay behind until there is room // stuck behind: lift instead of driving into the gearbox
  let hardB = false; if (block && Math.abs(block.d - c.d) < 62) { const dv = c.vF - block.vF; if (dv > 15 && bds * DS < dv * dv / (2 * BRAKE * .7) + 110) { target = Math.min(target, block.vF - 5); hardB = true; } } // closing fast on a car that brakes: brake in time, not into its gearbox
  if (v < target - 6) { c.thr = 1; c.brk = 0; } else if (v > target + 12) { c.thr = 0; c.brk = clamp((v - target) / 80, .25, 1); } else { c.thr = .35; c.brk = 0; }
  if (hardB && v > target) { c.thr = 0; c.brk = 1; }
  // recovery
  const wrong = Math.abs(wrapA(c.h - Math.atan2(T.tx[i], -T.ty[i]))) > 1.7;
  const atWall = Math.abs(c.d) > T.hw + T.wall + (c.d > 0 ? T.roP[i] : T.roN[i]) - 40; // stopped against the wall?
  if (G.phase === 'race' && !c.inPit && !(a.rev > 0) && ((v < 25 && (atWall || wrong)) || wrong || Math.abs(c.d) > T.hw + T.wall + Math.max(T.roP[i], T.roN[i]) + 60)) c.stuck += dt; else c.stuck = Math.max(0, c.stuck - dt * 2);
  if (c.stuck > .6 && !a.rev && G.phase === 'race' && v < 40 && atWall) a.rev = .45; // nose in the wall: a short back-off, then go
  if (a.rev > 0) { a.rev -= dt; c.thr = 0; c.brk = 1; const tg = Math.atan2(T.tx[i], -T.ty[i]); c.steer = clamp(-wrapA(tg - c.h) * 2 - Math.sign(c.d) * .4, -1, 1); if (a.rev <= 0) a.rev = -1; }
  else if (a.rev < 0) a.rev = Math.min(0, a.rev + dt);
  if (c.stuck > 2) { a.rev = 0;
    const k = (i + 2) % N; c.x = T.x[k]; c.y = T.y[k]; c.h = Math.atan2(T.tx[k], -T.ty[k]); c.vx = c.vy = c.vF = c.vL = 0; c.kx = c.ky = 0; c.stuck = 0; c.idx = k; a.err = null; c.inPit = false; a.pit = false;
  }
}

/* timing loops every 16 track points: when each car passed each one. Gaps in the tower are real seconds, like the TV graphics */
function loopT(c) {
  const b = Math.floor(c.prog / 16); if (!c.tl) { c.tl = new Float64Array(512); c.tk = new Int32Array(512).fill(-1); c.lb = b; return; }
  if (b > c.lb + 40) c.lb = b - 1; while (c.lb < b) { c.lb++; c.tl[c.lb & 511] = G.t; c.tk[c.lb & 511] = c.lb; }
}
function tGap(c, o) { // seconds c is behind o
  if (c.fin && o.fin) return c.finT - o.finT; const N = G.track.N;
  if (o.prog - c.prog > N) return null; // a lap or more
  const k = c.lb; if (o.tk && k != null && o.tk[k & 511] === k) return Math.max(0, G.t - o.tl[k & 511]); // live: how long ago the car ahead passed the point where this car is now
  return Math.max(0, (o.prog - c.prog) * DS / Math.max(c.vF, 250));
}
function simStep(dt) {
  if (G.phase === 'grid') {
    G.lt += dt;
    for (const c of G.cars) if (c.fs && G.lightsOut - G.lt < .4) { const T = G.track; c.x += T.tx[c.idx] * 60 * dt; c.y += T.ty[c.idx] * 60 * dt; } // the jump: rolling before the lights
    if (G.lt >= G.lightsOut) { G.phase = 'race'; G.t = 0; for (const c of G.cars) if (c.fs) { c.pen = .3; const n = TEAMS[c.team].code; toast('Фальстарт: ' + n); if (G.net === 'host') bcast({ t: 'fs', n }); } }
  } else G.t += dt;
  for (const c of G.cars) {
    const remote = c.human && c.human !== 'local' && !c.fin && c.pose;
    if (remote && !c.pitS) netFollow(c);
    pitTick(c, dt);
    if (G.opts.tyres && G.sess !== 'quali' && G.phase === 'race' && c.wear > 0) { const sl = Math.min(1, c.slide || 0); const off = c.surf === 1 || c.surf === 2 || c.surf === 4; c.wear = Math.max(0, c.wear - tyreFx(c).r * (Math.max(0, c.vF) * (c.surf === 2 ? 1.7 : off ? 1.35 : 1) * (1 + (off ? .5 : 2.2) * sl) + (sl > .3 && !off ? 200 * sl : 0)) * dt / G.track.len); } // slides and lock-ups chew the rubber; grass and gravel cost a little more than tarmac, never a set in one lap
    if (c.human === 'local' && !c.fin) { c.thr = In.thr; c.brk = In.brk; c.steer = In.steer; }
    else if (!c.human || c.fin) ai(c, dt);
    if (!remote) physics(c, dt);
  }
  weatherTick(dt);
  collide();
  for (const c of G.cars) { const rm = c.human && c.human !== 'local' && !c.fin && c.pose && !c.pitS; trackPos(c, rm ? (c.renderPose || c.pose)[6] : null); if (!rm) barrier(c); else c.inPit = !!(c.renderPose || c.pose)[9]; loopT(c); }
  if (G.sess === 'quali' && !G.qdone && G.net !== 'client' && (G.cars.every(c => !c.human || c.qt) || G.t > 150)) qEnd();
  if ((G.step = (G.step || 0) + 1) % 6 === 0) towCalc();
  if (G.mode === 'attract' && G.cars.some(c => c.lap > 30)) startAttract();
}

/* =====================================================================
   EFFECTS
   ===================================================================== */
function addSkid(x1, y1, x2, y2) { const k = (G.skidN++ % 2400) * 4, s = G.skids; s[k] = x1; s[k + 1] = y1; s[k + 2] = x2; s[k + 3] = y2; }
function effects(dt) {
  const T = G.track;
  if (T.boats) for (const b of T.boats) { const nx = b.x + Math.sin(b.a) * b.v * dt, ny = b.y - Math.cos(b.a) * b.v * dt;
    if (T.isSea(nx + Math.sin(b.a) * 260, ny - Math.cos(b.a) * 260)) { b.x = nx; b.y = ny; } else b.a += dt * 1.2; }
  for (const c of G.cars) {
    const fx = Math.sin(c.h), fy = -Math.cos(c.h), rx = -fy, ry = fx;
    const wx = 9.55 * CS, wy = 15 * CS, w = [c.x + rx * wx - fx * wy, c.y + ry * wx - fy * wy, c.x - rx * wx - fx * wy, c.y - ry * wx - fy * wy];
    if (c.wl && (c.slide > .25 || (c.surf === 0 && G.phase === 'race' && G.t < 1.2 && c.vF > 20 && c.vF < 260))) {
      if (c.surf !== 1) { addSkid(c.wl[0], c.wl[1], w[0], w[1]); addSkid(c.wl[2], c.wl[3], w[2], w[3]); }
      if (Math.random() < c.slide * .7) puff(w[Math.random() < .5 ? 0 : 2], w[1], c, 0);
    }
    if ((c.surf === 1 || c.surf === 2) && c.vF > 60 && Math.random() < .5) puff(w[0], w[1], c, c.surf);
    c.wl = w;
  }
  for (let i = G.parts.length - 1; i >= 0; i--) { const p = G.parts[i]; p.l -= dt; if (p.l <= 0) { G.parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 26; p.vx *= .97; p.vy *= .97; }
}
function puff(x, y, c, kind) {
  return FX.puff(x, y, c, kind);
  G.parts.push({ x, y, vx: c.vx * .25 + rand(-20, 20), vy: c.vy * .25 + rand(-20, 20), r: 5, l: kind ? .5 : 1.1, m: kind ? .5 : 1.1, k: kind });
}

/* =====================================================================
   RENDER
   ===================================================================== */
function resize() { FX.resize(); }
addEventListener('resize', resize);
addEventListener('resize', () => { if (!$('#menu').classList.contains('hidden')) refreshMenu(); });
/* phones: the part of the screen between the top panels and the controls; the car is framed in its middle */
let SZ = [0, 0, 600], szT = 0;
function safeZone() {
  if (G.mode !== 'race' || RP.on) return [0, 0, innerHeight]; const n = performance.now(); if (n - szT < 500) return SZ; szT = n;
  const r = e => e && !e.classList.contains('hidden') && e.offsetParent ? e.getBoundingClientRect() : null; let top = 0, bot = innerHeight;
  for (const e of [$('.topbar')]) { const b = r(e); if (b && b.top < innerHeight * .4) top = Math.max(top, b.bottom); }
  for (const e of isDesk ? [$('#ers'), $('#speedo')] : [$('.pedals'), $('#wheelZone'), $('#arrows')]) { const b = r(e); if (b && b.height > 10 && b.top > innerHeight * .5) bot = Math.min(bot, b.top); }
  if (bot - top < 160) { top = 0; bot = innerHeight; } SZ = [0, (top + bot) / 2 - innerHeight / 2, bot - top]; return SZ;
}
function camera(dt) {
  const c = G.cars[G.follow]; if (!c) return;
  const sp = Math.hypot(c.vx, c.vy), base = Math.min(innerHeight / 560, innerWidth / 305) * (G.mode === 'attract' ? .8 : 1) * (isDesk ? 1 : .5) * FX.zoomK();
  const sfx = S.spdFx == null ? 1 : S.spdFx; cam.z = lerp(cam.z, base * (1 - (.3 - .2 * Math.min(1, sfx)) * Math.min(1, sp / VMAX)) * (c.bst ? 1 - .05 * sfx : 1), 1 - Math.exp(-dt * (c.bst ? 4 : 1.5)));
  let lx = c.vx * .3, ly = c.vy * .3; const sz = safeZone(), lim = (isDesk || G.mode !== 'race' ? Math.min(innerWidth, innerHeight) * .36 : Math.min(innerWidth * .3, sz[2] * .3)) / cam.z, l = Math.hypot(lx, ly);
  if (l > lim) { lx *= lim / l; ly *= lim / l; }
  if (G.mode === 'race' && !RP.on) { const limY = Math.max(30, sz[2] / 2 - 95) / cam.z; if (Math.abs(ly) > limY) ly = Math.sign(ly) * limY; } // never under the top bar or the speedometer
  const k = 1 - Math.exp(-dt * 5); cam.lx = lerp(cam.lx || 0, lx, k); cam.ly = lerp(cam.ly || 0, ly, k);
  const sf = safeZone(); cam.x = c.x + cam.lx - sf[0] / cam.z; cam.y = c.y + cam.ly - sf[1] / cam.z; cam.a = 0;
  if (c.surf === 1 || c.surf === 2) cam.shake = Math.max(cam.shake, sp > 40 ? 1 + sp / VMAX * 3 : 0);
  else if (c.surf === 3) cam.shake = Math.max(cam.shake, .5 + sp / VMAX * 1.2);
  if (G.mode === 'race') cam.shake = Math.max(cam.shake, FX.speedK() * 2.2, G.phase === 'race' && c.surf === 0 ? .12 + .28 * Math.min(1, sp / VMAX) : 0);
  cam.shake *= Math.exp(-dt * 8); if (S.shake === false) cam.shake = 0;
}
function vis(b, cx, cy, r) { return b.x1 > cx - r && b.x0 < cx + r && b.y1 > cy - r && b.y0 < cy + r; }
function render() {
  const T = G.track, W = cv.width, H = cv.height, z = cam.z * DPR;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sh = cam.shake, sx = rand(-sh, sh) * DPR, sy = rand(-sh, sh) * DPR;
  ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(z, z); ctx.translate(-cam.x, -cam.y);
  const vr = Math.hypot(W, H) / 2 / z + 40, cx = cam.x, cy = cam.y;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const vc = T.chunks.filter(c => vis(c, cx, cy, vr + 300));
  if (T.city) {
    ctx.fillStyle = PAT.city; ctx.fillRect(cx - vr, cy - vr, vr * 2, vr * 2);
    ctx.lineCap = 'butt'; ctx.strokeStyle = '#3b3c3f'; ctx.lineWidth = 84; ctx.stroke(T.streets);
    ctx.strokeStyle = 'rgba(205,180,90,.55)'; ctx.lineWidth = 3; ctx.setLineDash([26, 26]); ctx.stroke(T.streets); ctx.setLineDash([]); ctx.lineCap = 'round';
    ctx.strokeStyle = PAT.tiles; ctx.lineWidth = 120; ctx.stroke(T.seaP);
    if (T.beachP) { ctx.strokeStyle = PAT.sand; ctx.lineWidth = 230; ctx.stroke(T.beachP); }
    ctx.fillStyle = PAT.water; ctx.fill(T.seaP);
    if (T.beachP) { ctx.save(); ctx.clip(T.seaP); ctx.strokeStyle = 'rgba(70,190,185,.35)'; ctx.lineWidth = 150; ctx.stroke(T.beachP); ctx.strokeStyle = 'rgba(235,250,245,.35)'; ctx.lineWidth = 10; ctx.setLineDash([30, 20]); ctx.stroke(T.beachP); ctx.setLineDash([]); ctx.restore(); }
    ctx.strokeStyle = 'rgba(190,220,230,.07)'; ctx.lineWidth = 46; ctx.stroke(T.seaP);
    ctx.strokeStyle = '#77736b'; ctx.lineWidth = 12; ctx.stroke(T.seaP);
    ctx.lineCap = 'butt'; ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 34;
    ctx.save(); ctx.translate(6, 9); ctx.stroke(T.pierP); ctx.restore();
    ctx.strokeStyle = '#8c8880'; ctx.lineWidth = 30; ctx.stroke(T.pierP); ctx.lineCap = 'round';
    for (const y of T.yachts) if (Math.abs(y.x - cx) < vr + 150 && Math.abs(y.y - cy) < vr + 150) drawYacht(y);
    for (const b of T.boats) if (Math.abs(b.x - cx) < vr + 300 && Math.abs(b.y - cy) < vr + 300) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillStyle = 'rgba(235,250,250,.18)';
      ctx.beginPath(); ctx.moveTo(-b.w / 2, b.l / 2); ctx.lineTo(-b.w * 2.5, b.l * 3.5); ctx.lineTo(b.w * 2.5, b.l * 3.5); ctx.lineTo(b.w / 2, b.l / 2); ctx.fill(); ctx.restore(); drawYacht(b); }
    for (const d of T.decor) if (Math.abs(d.x - cx) < vr + 300 && Math.abs(d.y - cy) < vr + 300) drawDecor(d);
    drawBlds(T, cx, cy, vr);
    ctx.strokeStyle = '#66625b'; ctx.lineWidth = (T.hw + T.wall) * 2 + 64; for (const c of vc) ctx.stroke(c.p);
  } else if (T.def.zones) {
    drawThemedGround(T, cx, cy, vr, vc);
  } else {
    ctx.fillStyle = PAT.grass; ctx.fillRect(cx - vr, cy - vr, vr * 2, vr * 2);
    ctx.strokeStyle = PAT.grav; ctx.lineWidth = 112;
    for (const r of T.gravel) if (vis(r, cx, cy, vr + 60)) ctx.stroke(r.p);
  }
  if (T.grassC.length) { ctx.fillStyle = T.def.night ? PAT.grassN : PAT.grass; for (const g of T.grassC) if (vis(g, cx, cy, vr + 200)) ctx.fill(g.p);
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 10; for (const g of T.grassC) if (vis(g, cx, cy, vr + 200)) ctx.stroke(g.e); }
  drawTrees(T, cx, cy, vr); if (T.palms) drawPalms(T, cx, cy, vr);
  if (T.pit) drawPitLane(T, cx, cy, vr);
  ctx.fillStyle = '#1b1c1e'; ctx.fill(T.tyres); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.5; ctx.stroke(T.tyres);
  for (const r of T.barrier) if (vis(r, cx, cy, vr)) {
    ctx.strokeStyle = 'rgba(0,0,0,.38)'; ctx.lineWidth = 12; ctx.save(); ctx.translate(4, 6); ctx.stroke(r.p); ctx.restore();
    ctx.strokeStyle = '#cdd0d4'; ctx.lineWidth = 8; ctx.stroke(r.p);
    if (T.city) { ctx.lineCap = 'butt'; ctx.setLineDash([46, 90]); ctx.strokeStyle = '#9c2229'; ctx.stroke(r.p); ctx.setLineDash([]); ctx.lineCap = 'round'; }
    ctx.strokeStyle = '#6f757c'; ctx.lineWidth = 1.5; ctx.stroke(r.p);
  }
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = T.hw * 2 + 26; for (const c of vc) ctx.stroke(c.p);
  ctx.strokeStyle = '#d3d2cb'; ctx.lineWidth = T.hw * 2 + 6; for (const c of vc) ctx.stroke(c.p);
  ctx.strokeStyle = PAT.asph; ctx.lineWidth = T.hw * 2 - 10; for (const c of vc) ctx.stroke(c.p);
  if (T.pit && pitOn()) drawPitMouth(T, cx, cy, vr);
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#d9d8d2'; ctx.fill(T.kerbW); ctx.fillStyle = '#a5252b'; ctx.fill(T.kerbR);
  ctx.fillStyle = 'rgba(235,235,228,.5)';
  for (const i of T.zebra) { if (Math.abs(T.x[i] - cx) > vr + 200 || Math.abs(T.y[i] - cy) > vr + 200) continue;
    ctx.save(); ctx.translate(T.x[i], T.y[i]); ctx.rotate(T.ang[i]); for (let y = -T.hw + 12; y < T.hw - 12; y += 24) ctx.fillRect(-16, y, 32, 13); ctx.restore(); }
  ctx.setLineDash([]); ctx.lineCap = 'round';
  drawStartGrid(T);
  ctx.strokeStyle = 'rgba(8,8,10,.32)'; ctx.lineWidth = 4; ctx.beginPath();
  const n = Math.min(G.skidN, 2400), s = G.skids;
  for (let i = 0; i < n; i++) { const k = i * 4; if (Math.abs(s[k] - cx) > vr || Math.abs(s[k + 1] - cy) > vr) continue; ctx.moveTo(s[k], s[k + 1]); ctx.lineTo(s[k + 2], s[k + 3]); }
  ctx.stroke();
  drawBuildings(T, cx, cy, vr);
  const ghost = c => G.sess === 'quali' && c !== G.cars[G.follow];
  const drawCar = c => { const sp = SPR[c.team]; ctx.save(); ctx.translate(c.rx, c.ry); ctx.rotate(c.rh); ctx.scale(CS, CS); ctx.drawImage(sp.car, -sp.W / 2, -sp.H / 2, sp.W, sp.H); ctx.restore(); };
  for (const c of G.cars) {
    if (Math.abs(c.rx - cx) > vr || Math.abs(c.ry - cy) > vr || ghost(c)) continue;
    const sp = SPR[c.team];
    ctx.save(); ctx.translate(c.rx + 6, c.ry + 9); ctx.rotate(c.rh); ctx.scale(CS, CS); ctx.drawImage(sp.sh, -sp.W / 2 - sp.P, -sp.H / 2 - sp.P, sp.W + sp.P * 2, sp.H + sp.P * 2); ctx.restore();
  }
  for (const c of G.cars) {
    if (Math.abs(c.rx - cx) > vr || Math.abs(c.ry - cy) > vr) continue;
    const sp = SPR[c.team];
    ctx.save(); ctx.globalAlpha = ghost(c) ? .5 : 1; ctx.translate(c.rx, c.ry); ctx.rotate(c.rh); ctx.scale(CS, CS); ctx.drawImage(sp.car, -sp.W / 2, -sp.H / 2, sp.W, sp.H); ctx.restore();
    if (c.human && c.human !== 'local' && G.mode === 'race') {
      ctx.save(); ctx.translate(c.rx, c.ry); ctx.font = '600 13px "Exo 2",sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.55)'; const w = ctx.measureText(c.name).width + 12; ctx.fillRect(-w / 2, -52, w, 18);
      ctx.fillStyle = '#fff'; ctx.fillText(c.name, 0, -39); ctx.restore();
    }
  }
  if (T.bridge) drawBridge(T, cx, cy, vr, drawCar);
  for (const p of G.parts) {
    const a = p.l / p.m;
    ctx.fillStyle = p.k === 2 ? `rgba(200,170,110,${a * .45})` : p.k === 1 ? `rgba(120,115,105,${a * .4})` : `rgba(225,225,228,${a * .3})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  if (T.def.zones) drawThemedTop(T, cx, cy, vr);
  if (T.tunP && vis(T.tunB, cx, cy, vr)) {
    ctx.lineCap = 'butt'; ctx.strokeStyle = 'rgba(12,13,16,.62)'; ctx.lineWidth = (T.hw + T.wall) * 2 + 150; ctx.stroke(T.tunP);
    ctx.strokeStyle = 'rgba(255,210,140,.35)'; ctx.lineWidth = 6; ctx.setLineDash([12, 80]); ctx.stroke(T.tunP); ctx.setLineDash([]); ctx.lineCap = 'round';
  }
  drawWeather();
}
const boxCol = t => ((window.ROOFC && ROOFC[TEAMS[t].id]) || [TEAMS[t].ui])[0];
function drawPitLane(T, cx, cy, vr) {
  const P = T.pit, b0 = P.boxP[5]; if (Math.abs(b0.x - cx) > vr + 1500 || Math.abs(b0.y - cy) > vr + 1500) return;
  ctx.lineCap = 'butt'; if (P.apron) { ctx.strokeStyle = '#8e9197'; ctx.lineWidth = P.apronW; ctx.stroke(P.apron); ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2; ctx.setLineDash([3, 40]); ctx.lineWidth = P.apronW - 10; ctx.stroke(P.apron); ctx.setLineDash([]); } ctx.strokeStyle = '#d3d2cb'; ctx.lineWidth = P.lw + 12; ctx.stroke(P.path); ctx.lineWidth = P.laneW + 12; ctx.stroke(P.band); ctx.strokeStyle = PAT.asph; ctx.lineWidth = P.lw; ctx.stroke(P.path); ctx.lineWidth = P.laneW; ctx.stroke(P.band);
  ctx.strokeStyle = 'rgba(255,255,255,.82)'; ctx.lineWidth = 4; ctx.stroke(P.divL); // fast lane | working lane
  ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3; ctx.setLineDash([22, 18]); ctx.stroke(P.path); ctx.setLineDash([]);
  const on = pitOn(), me = G.cars[G.me], pulse = .55 + .45 * Math.sin(performance.now() / 180);
  for (let t = 0; t < 11; t++) { const q = P.boxP[t], mine = on && me && me.team === t; if (Math.abs(q.x - cx) > vr + 100 || Math.abs(q.y - cy) > vr + 100) continue;
    const bc = boxCol(t); ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.h); ctx.fillStyle = hexA(bc, .55); ctx.fillRect(-27, -46, 54, 92); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 6; ctx.strokeRect(-27, -46, 54, 92); ctx.strokeStyle = mine ? `rgba(255,214,0,${pulse})` : bc; ctx.lineWidth = mine ? 7 : 3.5; ctx.strokeRect(-27, -46, 54, 92);
    if (!mine) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '900 13px "Exo 2",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.save(); ctx.rotate(Math.cos(q.h - Math.PI / 2) < 0 ? Math.PI / 2 : -Math.PI / 2); ctx.fillText(TEAMS[t].n, 0, 0); ctx.restore(); }
    if (mine) { ctx.fillStyle = `rgba(255,214,0,${pulse})`; ctx.font = '900 20px "Exo 2",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BOX', 0, 0); } ctx.restore(); }
  for (const r of [10, P.len - 10]) { const [x, y, i] = P.at(r, P.c(r)); if (Math.abs(x - cx) > vr || Math.abs(y - cy) > vr) continue; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(T.tx[i], -T.ty[i])); ctx.fillStyle = on ? '#FFC400' : 'rgba(255,255,255,.35)'; ctx.font = '900 34px "Exo 2",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('PIT', 0, 0); ctx.restore(); }
  if (!on) { ctx.strokeStyle = '#cdd0d4'; ctx.lineWidth = 8; ctx.stroke(P.gate); ctx.strokeStyle = '#6f757c'; ctx.lineWidth = 1.5; ctx.stroke(P.gate); }
  ctx.lineCap = 'round';
}
function drawPitMouth(T, cx, cy, vr) { // no kerb or edge line across the entry and exit, plus arrows leading in
  const P = T.pit, q = P.boxP[5]; if (Math.abs(q.x - cx) > vr + 1800 || Math.abs(q.y - cy) > vr + 1800) return;
  ctx.lineCap = 'butt'; ctx.strokeStyle = PAT.asph; ctx.lineWidth = P.lw + 6; ctx.stroke(P.mouth); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 6; ctx.stroke(P.edgeL); ctx.lineWidth = 5; ctx.stroke(P.hatch); ctx.setLineDash([26, 22]); ctx.stroke(P.tEdge); ctx.setLineDash([]); ctx.lineCap = 'round'; // the way in is painted: a solid line and white hatching
  const me = G.cars[G.me], hot = me && (me.wear <= 50 || (G.h > 30 && me.tyre !== 3)), N = T.N; ctx.fillStyle = hot ? `rgba(255,214,0,${.55 + .45 * Math.sin(performance.now() / 150)})` : 'rgba(255,214,0,.45)';
  for (let k = 8; k <= 56; k += 12) { const i = (P.a - k + N) % N, o = (T.hw - 36) * P.sd, x = T.x[i] + T.nx[i] * o, y = T.y[i] + T.ny[i] * o; if (Math.abs(x - cx) > vr || Math.abs(y - cy) > vr) continue;
    ctx.save(); ctx.translate(x, y); ctx.rotate(T.ang[i] + P.sd * .4); ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-12, -20); ctx.lineTo(-4, 0); ctx.lineTo(-12, 20); ctx.closePath(); ctx.fill(); ctx.restore(); }
}
const Rain = { p: [] };
function drawWeather() {
  const h = G.h; if (h <= 6) return; const W = cv.width, H = cv.height; ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(35,45,60,${Math.min(.34, (h - 5) * .011)})`; ctx.fillRect(0, 0, W, H);
  if (h <= 20) return; const n = Math.min(150, (h - 20) * 3.2) | 0; if (!Rain.p.length) for (let k = 0; k < 150; k++) Rain.p.push([Math.random(), Math.random(), .6 + Math.random() * .8]);
  ctx.strokeStyle = 'rgba(200,220,245,.42)'; ctx.lineWidth = 1.4 * DPR; ctx.lineCap = 'round'; ctx.beginPath(); const t = performance.now() / 1000;
  for (let k = 0; k < n; k++) { const q = Rain.p[k], x = ((q[0] - t * .25 * q[2]) % 1 + 1) % 1 * W, y = ((q[1] + t * 1.5 * q[2]) % 1) * H; ctx.moveTo(x, y); ctx.lineTo(x - 7 * DPR, y + 26 * DPR); } ctx.stroke();
}
function drawYacht(y) {
  const L = y.l, B = y.w;
  y.p = y.p || new Path2D(`M0,${-L / 2} Q${B / 2},${-L / 4} ${B / 2},${L / 2 - 3} L${-B / 2},${L / 2 - 3} Q${-B / 2},${-L / 4} 0,${-L / 2}Z`);
  ctx.save(); ctx.translate(y.x + 7, y.y + 10); ctx.rotate(y.a); ctx.fillStyle = 'rgba(0,10,15,.35)'; ctx.fill(y.p); ctx.restore();
  ctx.save(); ctx.translate(y.x, y.y); ctx.rotate(y.a);
  ctx.fillStyle = '#e7e9e8'; ctx.fill(y.p);
  ctx.save(); ctx.scale(.8, .86); ctx.fillStyle = '#b4a384'; ctx.fill(y.p); ctx.restore();
  ctx.fillStyle = '#f2f2f0'; ctx.fillRect(-B * .3, -L * .12, B * .6, L * .38);
  ctx.fillStyle = '#2a3740'; ctx.fillRect(-B * .3, -L * .12, B * .6, L * .05);
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(B * .05, -L * .12, B * .25, L * .38);
  ctx.restore();
}
function drawPalms(T, cx, cy, vr) {
  const L = T.palms.filter(p => Math.abs(p.x - cx) < vr + 80 && Math.abs(p.y - cy) < vr + 80);
  const leaf = (p, sh) => { for (let k = 0; k < 8; k++) { const a = p.a + k * .785, ca = Math.cos(a), sa = Math.sin(a), r = p.r * (k % 2 ? .85 : 1);
    if (!sh) ctx.fillStyle = k % 2 ? '#2c5627' : '#3b6d31';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + ca * r * .5 - sa * r * .22, p.y + sa * r * .5 + ca * r * .22, p.x + ca * r, p.y + sa * r);
    ctx.quadraticCurveTo(p.x + ca * r * .5 + sa * r * .12, p.y + sa * r * .5 - ca * r * .12, p.x, p.y); ctx.fill(); } };
  ctx.fillStyle = 'rgba(0,0,0,.3)'; for (const p of L) { ctx.save(); ctx.translate(p.r * .6, p.r * .85); leaf(p, 1); ctx.restore(); }
  for (const p of L) { leaf(p, 0); ctx.fillStyle = '#5e4a2e'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * .13, 0, 7); ctx.fill(); }
}
function drawDecor(d) {
  ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a);
  if (d.t === 'fountain') {
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(10, 14, 92, 0, 7); ctx.fill();
    ctx.fillStyle = '#bdb6a8'; ctx.beginPath(); ctx.arc(0, 0, 92, 0, 7); ctx.fill();
    ctx.fillStyle = '#2f7f90'; ctx.beginPath(); ctx.arc(0, 0, 74, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(220,245,250,.5)'; ctx.lineWidth = 2; for (const r of [20, 38, 56]) { ctx.beginPath(); ctx.arc(0, 0, r + (performance.now() / 60 % 18), 0, 7); ctx.stroke(); }
    ctx.fillStyle = '#e9e6dd'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.fill();
  } else if (d.t === 'heli') {
    ctx.fillStyle = '#35373b'; ctx.beginPath(); ctx.arc(0, 0, 90, 0, 7); ctx.fill(); ctx.strokeStyle = '#d9c35a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 70, 0, 7); ctx.stroke();
    ctx.fillStyle = '#eee'; ctx.fillRect(-28, -36, 12, 72); ctx.fillRect(16, -36, 12, 72); ctx.fillRect(-16, -6, 32, 12);
  } else if (d.t === 'tennis') {
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-88, -158, 190, 330); ctx.fillStyle = '#b0563a'; ctx.fillRect(-95, -165, 190, 330);
    ctx.fillStyle = '#3d6f8f'; ctx.fillRect(-70, -130, 140, 260); ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 3; ctx.strokeRect(-70, -130, 140, 260);
    ctx.beginPath(); ctx.moveTo(-70, 0); ctx.lineTo(70, 0); ctx.moveTo(0, -70); ctx.lineTo(0, 70); ctx.moveTo(-70, -70); ctx.lineTo(70, -70); ctx.moveTo(-70, 70); ctx.lineTo(70, 70); ctx.stroke();
  } else if (d.t === 'pool') {
    ctx.fillStyle = '#d7d2c7'; ctx.fillRect(-150, -90, 300, 180); ctx.fillStyle = '#2aa6c4'; ctx.fillRect(-120, -60, 240, 120);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; for (let y = -40; y <= 40; y += 20) { ctx.beginPath(); ctx.moveTo(-120, y); ctx.lineTo(120, y); ctx.stroke(); }
    ctx.fillStyle = '#f4f1ea'; for (let x = -130; x < 140; x += 26) { ctx.fillRect(x, -84, 14, 18); ctx.fillRect(x, 68, 14, 18); }
  }
  ctx.restore();
}
function drawBlds(T, cx, cy, vr) {
  const L = T.blds.filter(b => Math.abs(b.x - cx) < vr + 260 && Math.abs(b.y - cy) < vr + 320).sort((a, b) => a.y - b.y);
  ctx.fillStyle = 'rgba(6,8,12,.36)';
  for (const b of L) { if (b.d === 3) continue; ctx.save(); ctx.translate(b.x + b.H * .5, b.y + b.H * .2); ctx.rotate(b.a); ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore(); }
  const NL = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (const b of L) {
    const H = b.d === 3 ? 0 : b.H, ca = Math.cos(b.a), sa = Math.sin(b.a), W2 = b.w / 2, H2 = b.h / 2;
    if (H > 0) {
      const C = [[-W2, -H2], [W2, -H2], [W2, H2], [-W2, H2]].map(([x, y]) => [b.x + x * ca - y * sa, b.y + x * sa + y * ca]);
      for (let e = 0; e < 4; e++) {
        const nx = NL[e][0] * ca - NL[e][1] * sa, ny = NL[e][0] * sa + NL[e][1] * ca; if (ny < .08) continue;
        const p1 = C[e], p2 = C[(e + 1) % 4], len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        ctx.save(); ctx.transform(p2[0] - p1[0], p2[1] - p1[1], 0, -H, p1[0], p1[1]);
        ctx.fillStyle = shade(b.wc, -(.06 + (1 - ny) * .22 + (nx > 0 ? .12 : 0))); ctx.fillRect(0, 0, 1, 1);
        const cols = Math.max(1, Math.round(len / 15)), fl = Math.max(1, Math.round(H / 10));
        for (let f = 0; f < fl; f++) {
          const v0 = (f + .3) / fl, vh = .45 / fl;
          ctx.fillStyle = 'rgba(38,50,60,.88)'; for (let k = 0; k < cols; k++) ctx.fillRect((k + .3) / cols, v0, .4 / cols, vh);
          ctx.fillStyle = 'rgba(200,225,240,.18)'; for (let k = 0; k < cols; k++) ctx.fillRect((k + .3) / cols, v0 + vh * .55, .4 / cols, vh * .45);
          if (b.sh) { ctx.fillStyle = 'rgba(72,98,74,.85)'; for (let k = 0; k < cols; k++) { ctx.fillRect((k + .17) / cols, v0, .11 / cols, vh); ctx.fillRect((k + .72) / cols, v0, .11 / cols, vh); } }
          if (b.bal && f > 0) { ctx.fillStyle = 'rgba(242,239,232,.6)'; ctx.fillRect(.03, (f + .26) / fl, .94, .07 / fl); ctx.fillStyle = 'rgba(30,30,32,.35)'; ctx.fillRect(.03, (f + .33) / fl, .94, .03 / fl); }
        }
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 0, 1, Math.min(.2, 3 / H)); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(0, 1 - Math.min(.08, 1.5 / H), 1, Math.min(.08, 1.5 / H));
        ctx.restore();
      }
    }
    ctx.save(); ctx.translate(b.x, b.y - H); ctx.rotate(b.a);
    ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    ctx.fillStyle = 'rgba(0,0,0,.13)'; ctx.fillRect(-b.w / 2 + 5, -b.h / 2 + 5, b.w - 10, b.h - 10);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, 3); ctx.fillRect(-b.w / 2, -b.h / 2, 3, b.h);
    if (b.d === 1) { ctx.fillStyle = '#2b6f80'; ctx.fillRect(b.w * .05, -b.h * .3, b.w * .3, b.h * .22); }
    else if (b.d === 3) { ctx.fillStyle = '#38393c'; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.strokeStyle = 'rgba(240,240,235,.55)'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let x = -b.w / 2 + 5.5; x < b.w / 2; x += 17) { ctx.moveTo(x, -b.h / 2 + 4); ctx.lineTo(x, -b.h / 2 + 28); ctx.moveTo(x, b.h / 2 - 4); ctx.lineTo(x, b.h / 2 - 28); } ctx.stroke();
      for (const [x, y, col] of b.cars) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - 5, y - 8, 12, 19); ctx.fillStyle = col; rrect(ctx, x - 6, y - 10, 12, 20, 3); ctx.fill(); ctx.fillStyle = 'rgba(20,30,40,.75)'; ctx.fillRect(x - 4.5, y - 5, 9, 4); ctx.fillRect(x - 4.5, y + 4, 9, 2.5); } }
    else if (b.hip) { const W2 = b.w / 2, H2 = b.h / 2, f = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.fill(); };
      if (b.w >= b.h) { const r = W2 - H2; f([[-W2, -H2], [W2, -H2], [r, 0], [-r, 0]], 'rgba(255,230,210,.16)'); f([[-W2, H2], [W2, H2], [r, 0], [-r, 0]], 'rgba(0,0,0,.22)'); f([[-W2, -H2], [-W2, H2], [-r, 0]], 'rgba(255,230,210,.07)'); f([[W2, -H2], [W2, H2], [r, 0]], 'rgba(0,0,0,.12)'); }
      else { const r = H2 - W2; f([[-W2, -H2], [-W2, H2], [0, r], [0, -r]], 'rgba(255,230,210,.12)'); f([[W2, -H2], [W2, H2], [0, r], [0, -r]], 'rgba(0,0,0,.2)'); f([[-W2, -H2], [W2, -H2], [0, -r]], 'rgba(255,230,210,.18)'); f([[-W2, H2], [W2, H2], [0, r]], 'rgba(0,0,0,.26)'); } }
    else if (b.d === 2) { ctx.fillStyle = '#4f5256'; ctx.fillRect(-b.w * .3, -b.h * .25, b.w * .16, b.h * .12); ctx.fillRect(b.w * .08, b.h * .06, b.w * .12, b.h * .1); }
    ctx.restore();
  }
}
function drawStartGrid(T) {
  const x = T.x[0], y = T.y[0], a = T.ang[0] + Math.PI / 2;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  for (let i = 0; i < Math.ceil(T.hw * 2 / 8); i++) for (let r = 0; r < 3; r++) { ctx.fillStyle = (i + r) % 2 ? '#111' : '#f4f4f4'; ctx.fillRect(-T.hw + i * 8, -12 + r * 8, 8, 8); }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; ctx.lineCap = 'butt';
  for (let k = 0; k < 11; k++) {
    const p = slotPos(T, k); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.h);
    ctx.beginPath(); ctx.moveTo(-22, -24); ctx.lineTo(-22, -47); ctx.lineTo(22, -47); ctx.lineTo(22, -24); ctx.stroke(); ctx.restore();
  }
  ctx.lineCap = 'round';
}
function drawBuildings(T, cx, cy, vr) {
  for (const s of T.stands) {
    if (Math.abs(s.x - cx) > vr + 200 || Math.abs(s.y - cy) > vr + 200) continue;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-140 + 10, -70 + 14, 280, 150);
    ctx.fillStyle = PAT.crowd; ctx.fillRect(-140, -70, 280, 120);
    ctx.fillStyle = '#e9ebee'; ctx.fillRect(-140, 50, 280, 22); ctx.fillStyle = '#c4c8ce'; ctx.fillRect(-140, 66, 280, 6);
    ctx.fillStyle = '#FFC400'; ctx.fillRect(-140, -74, 280, 5);
    ctx.restore();
  }
  for (const p of T.pits) {
    if (Math.abs(p.x - cx) > vr + 200 || Math.abs(p.y - cy) > vr + 200) continue;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-64 + 10, -40 + 14, 136, 120);
    ctx.scale(.74, 1); ctx.fillStyle = '#d9dce0'; ctx.fillRect(-64, -40, 136, 120);
    ctx.fillStyle = '#b9bdc3'; ctx.fillRect(-64, 30, 136, 50);
    ctx.fillStyle = TEAMS[p.t].c1; ctx.fillRect(-60, -46, 128, 10);
    ctx.fillStyle = '#2a2d33'; ctx.fillRect(-56, -36, 120, 8);
    ctx.restore();
  }
}
const TREE_C = [['#22402a', '#2d5534', '#416d45'], ['#1f3b2c', '#2a5039', '#3c6a4c'], ['#2c4524', '#3a5a2d', '#52753c']];
function drawTrees(T, cx, cy, vr) {
  const list = T.trees.filter(t => Math.abs(t.x - cx) < vr + 60 && Math.abs(t.y - cy) < vr + 60);
  ctx.fillStyle = 'rgba(5,10,5,.38)';
  ctx.beginPath(); for (const t of list) { ctx.moveTo(t.x + t.r * .35 + t.r, t.y + t.r * .5); ctx.arc(t.x + t.r * .35, t.y + t.r * .5, t.r, 0, 7); } ctx.fill();
  for (const t of list) {
    const c = TREE_C[t.v];
    ctx.fillStyle = c[0]; ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 7); ctx.fill();
    ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(t.x - t.r * .18, t.y - t.r * .2, t.r * .72, 0, 7); ctx.fill();
    ctx.fillStyle = c[2]; ctx.beginPath(); ctx.arc(t.x - t.r * .36, t.y - t.r * .38, t.r * .34, 0, 7); ctx.fill();
  }
}

/* ---------- minimap ---------- */
let MINI = null;
function chequer(g, x, y, ang, len, wd) { // the start line: a little chequered strip across the road
  g.save(); g.translate(x, y); g.rotate(ang); const n = 4, c = len / n, r = wd / 2;
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(-r - 1.5, -len / 2 - 1.5, wd + 3, len + 3);
  for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) & 1 ? '#15161a' : '#fff'; g.fillRect(-r + j * r, -len / 2 + i * c, r, c); }
  g.restore();
}
function trackOutline(cvs, pad, lw, col) {
  const T = G.track, g = cvs.getContext('2d'), [x0, y0, x1, y1] = T.bbox;
  const s = Math.min((cvs.width - pad * 2) / (x1 - x0), (cvs.height - pad * 2) / (y1 - y0));
  const ox = (cvs.width - (x1 - x0) * s) / 2 - x0 * s, oy = (cvs.height - (y1 - y0) * s) / 2 - y0 * s;
  g.clearRect(0, 0, cvs.width, cvs.height); g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); for (let i = 0; i <= T.N; i += 3) { const j = i % T.N; i ? g.lineTo(T.x[j] * s + ox, T.y[j] * s + oy) : g.moveTo(T.x[j] * s + ox, T.y[j] * s + oy); } g.closePath();
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = lw + 4; g.stroke(); g.strokeStyle = col; g.lineWidth = lw; g.stroke();
  chequer(g, T.x[0] * s + ox, T.y[0] * s + oy, T.ang[0], lw * 3.4, lw * 1.7);
  return { s, ox, oy };
}
function miniPx() { return Math.max(220, Math.round(110 * (S.mapS || 1) * DPR)); }
function buildMini() {
  const px = miniPx(), k = px / 220, base = document.createElement('canvas'), c = $('#mini'); base.width = base.height = px; c.width = c.height = px;
  MINI = Object.assign(trackOutline(base, 14 * k, 5 * k, 'rgba(255,255,255,.85)'), { base, k, T: G.track });
  const d = G.track.def; $('#mapFlag').className = 'flag ' + (d.flag || 'mc'); $('#mapName').textContent = d.name;
}
function drawMini() {
  const m = MINI, c = $('#mini'), g = c.getContext('2d'); if (!m) return; const k = m.k;
  g.clearRect(0, 0, c.width, c.height); g.drawImage(m.base, 0, 0);
  const mine = G.cars[G.me], draw = (car, me, mate) => { const r = (me ? 7 : mate ? 6.5 : 5) * k, x = car.rx * m.s + m.ox, y = car.ry * m.s + m.oy;
    g.fillStyle = TEAMS[car.team].c1; g.strokeStyle = me ? '#FFC400' : mate ? '#fff' : 'rgba(0,0,0,.6)'; g.lineWidth = (me || mate ? 3 : 1.5) * k;
    g.beginPath(); if (mate) { g.moveTo(x, y - r * 1.25); g.lineTo(x + r * 1.25, y); g.lineTo(x, y + r * 1.25); g.lineTo(x - r * 1.25, y); g.closePath(); } else g.arc(x, y, r, 0, 7); g.fill(); g.stroke(); };
  const isMate = car => !!mine && G.opts.tm && car !== mine && car.team === mine.team;
  for (const car of G.cars) if (car !== mine && !isMate(car)) draw(car, false, false);
  for (const car of G.cars) if (isMate(car)) draw(car, false, true); // my team-mate: a white diamond
  if (mine) { const x = mine.rx * m.s + m.ox, y = mine.ry * m.s + m.oy, r = 9 * k, p = (performance.now() / 900) % 1; // me: an arrow pointing where I drive, inside a pulsing ring
    g.strokeStyle = `rgba(255,196,0,${(1 - p) * .9})`; g.lineWidth = 2 * k; g.beginPath(); g.arc(x, y, r * (1.2 + p * 1.6), 0, 7); g.stroke();
    g.save(); g.translate(x, y); g.rotate(mine.rh); g.beginPath(); g.moveTo(0, -r * 1.35); g.lineTo(r, r); g.lineTo(0, r * .45); g.lineTo(-r, r); g.closePath();
    g.fillStyle = '#FFC400'; g.strokeStyle = '#111'; g.lineWidth = 2 * k; g.fill(); g.stroke(); g.restore(); }
}

/* =====================================================================
   HUD
   ===================================================================== */
const fmt = t => { if (!isFinite(t) || t <= 0) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); };
function standings() { return [...G.cars].sort((a, b) => (b.fin - a.fin) || (a.fin ? a.finT - b.finT : b.prog - a.prog)); }
let hudT = 0;
/* sector colours. Practice: purple = best ever (sector or lap), green = quicker than in the best lap, yellow = slower.
   Race: purple = quickest of everyone, green = my best, yellow = slower. */
function secCol(me, k, v) {
  if (G.sess === 'practice') { if (v <= me.bs[k] + 1e-4 || (me.rec && me.rec.s && v < me.rec.s[k])) return 'pb'; const ref = me.bls || (me.rec && me.rec.s); return ref && v < ref[k] ? 'pp' : 'std'; }
  return v <= G.bs[k] + 1e-4 ? 'pb' : v <= me.bs[k] + 1e-4 ? 'pp' : 'std';
}
const pracKey = () => G.track.def.id + '@' + Math.round(G.track.tw * 100);
function pracSave(c) { const k = pracKey(), r = (S.pb || (S.pb = {}))[k]; if (!r || c.last < r.t) { S.pb[k] = { t: +c.last.toFixed(3), s: c.bls.map(x => +x.toFixed(3)), tm: c.team }; c.rec = S.pb[k]; saveS(); banner('РЕКОРД ТРАССЫ', '#b06cff'); } }
function pracHud(me) { // the practice timing screen: record, best lap, last lap, the lap in progress
  if (me.rec === undefined) me.rec = (S.pb || {})[pracKey()] || null;
  const f = v => v ? v.toFixed(3) : '—', cel = (v, k, live) => `<td class="${v ? (live ? secCol(me, k, v) : '') : 'old'}">${f(v)}</td>`, cur = G.phase === 'race' && me.lap >= 1 ? G.t - me.lapStart : 0;
  const row = (n, s, t, live, cls) => `<tr class="${cls || ''}"><th>${n}</th>${[0, 1, 2].map(k => cel(s && s[k], k, live)).join('')}<td class="lap">${t ? fmt(t) : '—'}</td></tr>`;
  $('#tower').innerHTML = `<table class="prac"><tr class="hd"><th></th><td>S1</td><td>S2</td><td>S3</td><td class="lap">КРУГ</td></tr>${row('РЕКОРД', me.rec && me.rec.s, me.rec && me.rec.t, false, 'rec')}${row('ЛУЧШИЙ', me.bls, isFinite(me.best) ? me.best : 0, false, 'best')}${row('ПРОШЛЫЙ', me.lls, me.last, true)}${row('ТЕКУЩИЙ', me.lap >= 1 ? me.sc : null, cur, true, 'now')}</table>`;
  $('#hPos').textContent = '–'; $('#hLap').textContent = Math.max(0, me.lap); $('#hTime').textContent = fmt(cur).replace('—', '0:00.000'); $('#hBest').textContent = 'BEST ' + fmt(me.best);
}
/* the timing tower: S.rows lines around the player; in a 22-car race the team-mate is always on it, marked TM */
const mateOf = me => me && G.opts.tm ? G.cars.find(c => c !== me && c.team === me.team) : null;
function towerHTML(st, me) {
  const lead = st[0], n = clamp(S.rows | 0 || 5, 3, 22), pos = st.indexOf(me), mate = mateOf(me), from = clamp(pos - (n >> 1), 0, Math.max(0, st.length - n)), to = Math.min(st.length, from + n);
  // interval to the car ahead by default; three times a lap — the first as the leader crosses the line — the gap to the leader for ~3 s
  const N = G.track.N, ph = ((lead.prog % N) + N) % N / N, wnd = 3 / Math.max(20, G.track.refLap), toLead = G.phase === 'race' && lead.lap >= 1 && (ph % (1 / 3)) < wnd;
  const gfmt = (c, o) => { const g = tGap(c, o); return g == null ? '+' + Math.max(1, Math.floor((o.prog - c.prog) / N)) + ' КР' : '+' + g.toFixed(1); };
  const row = k => { const c = st[k], gap = k === 0 ? 'LEAD' : gfmt(c, toLead ? lead : st[k - 1]);
    const ty = G.opts.tyres ? `<u style="color:${TY[c.tyre].c};border-color:${TY[c.tyre].c}">${TY[c.tyre].l}</u><s>${Math.round(c.wear)}%</s>` : '';
    return `<div class="${c === me ? 'me' : c === mate ? 'mate' : ''}${c.inPit || c.pitS ? ' pit' : ''}"><b>${k + 1}</b><i style="${teamMark(c.team)}"></i><span>${carTag(c)}${c === mate ? '<q>TM</q>' : ''}</span>${ty}<em>${c.pitS || c.inPit ? 'PIT' : gap}</em></div>`; };
  let rows = `<div class="tw-h"><em>${toLead ? 'ОТСТАВАНИЕ ОТ ЛИДЕРА' : 'ИНТЕРВАЛ'}</em></div>`; for (let k = from; k < to; k++) rows += row(k);
  if (mate) { const mk = st.indexOf(mate); if (mk >= 0 && mk < from) rows = row(mk) + '<hr>' + rows; else if (mk >= to) rows += '<hr>' + row(mk); }
  return rows;
}
/* race control: a broadcast-style message under the top bar (rain coming, track drying, fastest lap…) */
let rcT = 0;
function raceCtl(title, sub, kind) { const e = $('#rc'); if (!e) return; $('#rcT').textContent = title; $('#rcS').textContent = sub || ''; e.className = kind || ''; void e.offsetWidth; e.classList.add('show'); clearTimeout(rcT); rcT = setTimeout(() => e.classList.add('hidden'), 5200); sfx('radio'); }
function wxWatch() { // announces what the sky does: the planned change itself, then what it does to the road
  if (!(G.opts.wx >= 0) || G.phase !== 'race' || G.sess === 'quali') return; const h = G.h, band = h > 30 ? 2 : h > 18 ? 1 : 0, w = G.wxSeen || (G.wxSeen = { band, s: G.wS, mt: -99 });
  if (h > 35) G.wetRace = true;
  if (G.wS != null && G.wS !== w.s) { const a = w.s == null ? 0 : w.s, b = G.wS, wet = x => x === 2 || x === 3 || x === 5; w.s = b; let m = null;
    if (b === 1 && a === 0) m = ['СТАНОВИТСЯ ОБЛАЧНО', 'Над трассой тучи — шины изнашиваются чуть быстрее', 'cloud'];
    else if (b === 0 && a === 1) m = ['ТУЧИ РАСХОДЯТСЯ', 'Выглянуло солнце — трасса остаётся сухой', 'sun'];
    else if (b === 3 && a === 2) m = ['ДОЖДЬ УСИЛИВАЕТСЯ: ЛИВЕНЬ', 'На трассе встаёт вода — только дождевые шины', 'rain'];
    else if (b === 2 && a === 3) m = ['ЛИВЕНЬ ОСЛАБЕВАЕТ', 'Дождь идёт дальше, но уже слабее', 'rain'];
    else if (b === 3) m = ['НАЧИНАЕТСЯ ЛИВЕНЬ', 'Сильный дождь — трасса намокает очень быстро', 'rain'];
    else if (b === 2) m = ['НАЧИНАЕТСЯ ДОЖДЬ', 'Трасса намокает — слики скоро потеряют сцепление', 'rain'];
    else if (b === 5) m = ['МОРОСЬ', 'Трасса становится влажной', 'rain'];
    else if (wet(a) && b === 1) m = ['ДОЖДЬ ПРЕКРАТИЛСЯ', 'Облачно — трасса будет подсыхать медленно', 'cloud'];
    else if (wet(a) && b === 0) m = ['ДОЖДЬ ПРЕКРАТИЛСЯ', 'Выглянуло солнце — трасса быстро сохнет', 'sun'];
    if (m) { raceCtl(m[0], m[1], m[2]); w.mt = G.t; } }
  if (band !== w.band && G.t - w.mt > 7) { if (band === 2) raceCtl('ТРАССА МОКРАЯ', 'Время дождевых шин — W', 'rain'); else if (band === 0) raceCtl('ТРАССА СУХАЯ', 'Можно ставить слики', 'sun'); else if (w.band === 2) raceCtl('ТРАССА ПОДСЫХАЕТ', 'Дождевые тают — скоро время сликов', 'sun'); else raceCtl('ТРАССА ВЛАЖНАЯ', 'Слики теряют темп и держат хуже', 'rain'); w.mt = G.t; }
  w.band = band;
}
/* settings preview: the real HUD over the demo race, so every slider shows what it changes */
let CFG = false;
function hudDemo(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = .15; const f = G.cars[G.follow]; if (!f) return; if (!MINI || MINI.T !== G.track) buildMini();
  const st = standings(), v = Math.max(0, f.vF); let gear = 0; while (gear < 7 && v > GEARS[gear] * VMAX) gear++;
  $('#hPos').textContent = st.indexOf(f) + 1; $('#hPosN').textContent = '/' + st.length; $('#hLap').textContent = 1; $('#hLapN').textContent = '/' + S.laps; $('#hSpd').textContent = Math.round(v * KMH); $('#hGear').textContent = gear + 1; $('#hTime').textContent = fmt(G.t % 90 + 1); $('#hBest').textContent = 'BEST 1:02.345'; $('#hSec').innerHTML = '';
  const tm = G.opts.tm, ty = G.opts.tyres; G.opts.tm = !!S.n22; G.opts.tyres = true; $('#tower').innerHTML = towerHTML(st, f); G.opts.tm = tm; G.opts.tyres = ty;
  $('#tyreChip').classList.remove('hidden'); $('#tyL').textContent = 'S'; $('#tyL').style.borderColor = $('#tyL').style.color = TY[0].c; $('#tyW').textContent = '87%'; $('#tyB').style.width = '87%'; $('#tyB').style.background = '#24d07a'; $('#wxT').classList.add('hidden');
  drawMini();
}
function specHud() { // watching a race already under way
  const f = G.cars[G.follow]; if (!f) return; $('#specChip').classList.remove('hidden'); $('#specName').textContent = f.human ? f.name : drvOf(f.team, f.seat)[0];
  hudT -= 1 / 60; if (hudT > 0) return; hudT = .1; const st = standings(), lead = st[0];
  $('#hPos').textContent = st.indexOf(f) + 1; $('#hLap').textContent = clamp(f.lap, 1, G.laps);
  $('#tower').innerHTML = st.slice(0, 6).map((c, k) => `<div class="${c === f ? 'me' : ''}"><b>${k + 1}</b><i style="${teamMark(c.team)}"></i><span>${carTag(c)}</span><em>${k ? '+' + ((lead.prog - c.prog) * DS / 600).toFixed(1) : 'LEAD'}</em></div>`).join(''); drawMini();
}
function hud(dt) {
  if (G.mode === 'race' && G.me < 0 && G.net === 'client') return specHud();
  const me = G.cars[G.me]; if (!me || G.mode !== 'race') return;
  const v = Math.max(0, me.vF), kmh = Math.round(Math.abs(me.vF) * KMH); // reverse shows its speed too
  let gear = 0; while (gear < 7 && v > GEARS[gear] * VMAX * TEAMS[me.team].spd) gear++;
  const lo = gear ? GEARS[gear - 1] * VMAX : 0, hi = GEARS[gear] * VMAX, rpm = clamp(.42 + .58 * (v - lo) / (hi - lo), .2, 1);
  $('#hSpd').textContent = kmh; wxWatch(); const gtxt = G.phase !== 'race' ? 'N' : (me.vF < -5 ? 'R' : gear + 1); $('#hGear').textContent = gtxt; $('#wGear').textContent = gtxt;
  const lit = Math.round(rpm * 12); REVS.forEach((r, i) => r.setAttribute('opacity', i < lit ? 1 : .15));
  Snd.update(G.phase === 'race' ? rpm : .25 + In.thr * .5, In.thr, !G.paused && !RP.on && !me.pitS);
  // lights
  if (G.phase === 'grid') {
    const on = Math.min(5, Math.floor(G.lt)); if (on !== G.shownLights) { G.shownLights = on; $$('#lights i').forEach((e, i) => e.classList.toggle('on', i < on)); if (on > 0) Snd.beep(440); }
  } else if (G.shownLights !== 99) { G.shownLights = 99; const le = $('#lights'); // race start: the five reds turn green, then the panel leaves
    if (G.sess !== 'attract') { le.classList.add('go'); setTimeout(() => { if (G.shownLights === 99) le.classList.add('hidden'); le.classList.remove('go'); }, 900); } else le.classList.add('hidden');
    banner('GO!', '#24d07a'); Snd.beep(880); }
  // pit stop UI: the tyre cards come up as soon as the car is in the lane; the choice locks when the new wheels go on
  { const want = !me.fin && pitOn() && ((me.inPit && !me.pitDone) || !!me.pitS), lock = !!me.pitS && !!me.pitSet;
    if (want && !PitUI.open) { PitUI.open = true; PitUI.sel = me.pitS ? me.pitSel : me.pitPre; PitUI.rec = bestTyre(Math.max(1, G.laps - me.lap)); tyreCards($('#pitCards'), G.opts.wx >= 0, pitPick, PitUI.rec); $('#pitSheet').classList.remove('hidden'); }
    if (!want && PitUI.open) { PitUI.open = false; $('#pitSheet').classList.add('hidden'); }
    if (PitUI.open) { const ps = $('#pitSheet'), sel = me.pitS ? (me.pitSel != null ? me.pitSel : PitUI.sel) : PitUI.sel; ps.classList.toggle('lock', lock); ps.classList.toggle('stop', !!me.pitS);
      $('#pitClock').textContent = me.pitS ? (me.pitSet ? Math.max(0, me.pitT).toFixed(1) : 'выбор ' + (me.pitW || 0).toFixed(1)) : '—'; $('#pitMsg').textContent = lock ? 'СТАВИМ ' + TY[sel != null ? sel : me.tyre].n : me.pitS ? (sel != null ? 'ВЫБРАНО: ' + TY[sel].n + ' · можно сменить' : 'ВЫБИРАЙ БЫСТРЕЕ · каждая секунда стоит времени') : (sel != null ? 'ВЫБРАНО: ' + TY[sel].n : 'ВЫБЕРИ ШИНЫ ЗАРАНЕЕ');
      $('#pitFill').style.width = me.pitS ? (100 - clamp(me.pitT / (me.pitD || 5), 0, 1) * 100) + '%' : '0%';
      $$('#pitCards .tcard').forEach((b2, i) => b2.classList.toggle('on', i === sel)); } }
  $('#pitTimer').classList.add('hidden');
  hudT -= dt; if (hudT > 0) return; hudT = .1;
  const ch = $('#tyreChip'), tyOn = G.opts.tyres && G.sess !== 'quali'; ch.classList.toggle('hidden', !tyOn);
  if (tyOn) { const ty = TY[me.tyre], w = Math.round(me.wear); $('#tyL').textContent = ty.l; $('#tyL').style.borderColor = $('#tyL').style.color = ty.c; $('#tyW').textContent = w + '%'; $('#tyB').style.width = w + '%'; $('#tyB').style.background = w > 60 ? '#24d07a' : w > 40 ? '#ffc400' : '#ff3b3b'; ch.classList.toggle('low', w <= 40);
    const wxOn = G.opts.wx >= 0, hv = Math.round(G.h); $('#wxT').classList.toggle('hidden', !wxOn); if (wxOn) $('#wxT').textContent = (hv > 75 ? 'ЛИВЕНЬ ' : hv > 45 ? 'ДОЖДЬ ' : hv > 25 ? 'ВЛАЖНО ' : hv > 10 ? 'ОБЛАЧНО ' : 'СУХО ') + hv + '%';
    if ((G.sess === 'race' && me.lap < G.laps) || G.sess === 'practice') { if (w <= 50 && me.warn < 1) { me.warn = 1; banner('ШИНЫ 50%', '#ffc400'); } else if (w <= 40 && me.warn < 2) { me.warn = 2; banner('BOX BOX', '#ff3b3b'); } } }
  if (G.sess === 'practice') pracHud(me);
  { const cell = k => { const cur = me.sc[k], v = cur || me.ls[k], cl = !cur ? 'old' : secCol(me, k, cur); return `<span class="${v ? cl : 'old'}">S${k + 1} ${v ? v.toFixed(2) : '—'}</span>`; }; $('#hSec').innerHTML = cell(0) + cell(1) + cell(2); }
  { const P = pitOn() ? G.track.pit : null, pw = $('#pitWarn'); let on = false; if (P && !me.inPit && !me.pitS && !me.fin && (G.sess !== 'race' || me.lap < G.laps)) { const to = (P.a - me.idx + G.track.N) % G.track.N; if (to < 400) { on = true; const hot = me.wear <= 50 || (G.h > 30 && me.tyre !== 3) || (G.h < 20 && me.tyre === 3); pw.classList.toggle('hot', hot); pw.textContent = `${hot ? 'BOX BOX · ' : ''}ПИТ-ЛЕЙН ${P.sd > 0 ? 'СПРАВА →' : '← СЛЕВА'} · ${Math.round(to * DS * .12 / 10) * 10} М`; if (hot && !me.pwB) { me.pwB = 1; Snd.beep(660); } } else me.pwB = 0; } pw.classList.toggle('hidden', !on); }
  { const nc = $('#netChip'); if (G.net === 'client' && Net.hc) { const v = Math.round(Net.rtt || 0); nc.textContent = Net.hc.route + ' · ' + (v ? v + ' МС' : '…'); nc.style.color = v > 350 ? '#ff5a5a' : v > 180 ? '#ffc400' : '#24d07a'; nc.classList.remove('hidden'); } else if (G.net === 'host' && G.cars.some(c => c.human && c.human !== 'local')) { const m = Math.max(0, ...G.cars.filter(c => c.human && c.human !== 'local' && c.poseR).map(c => c.poseR)); nc.textContent = 'ГОСТИ · ' + (m ? m + ' МС' : '…'); nc.style.color = m > 350 ? '#ff5a5a' : m > 180 ? '#ffc400' : '#24d07a'; nc.classList.remove('hidden'); } else nc.classList.add('hidden'); }
  if (G.sess === 'quali') {
    $('#hPos').textContent = '–'; $('#hLap').textContent = 'Q'; $('#hTime').textContent = fmt(me.qt || (me.qs ? G.t - me.qs : 0)).replace('—', '0:00.000'); $('#hBest').textContent = me.qs ? 'ЗАЧЁТНЫЙ КРУГ' : 'РАЗГОН';
    const friends = G.net && G.cars.length > 1, list = [...G.cars.filter(c => c.qt).map(c => ({ code: carTag(c), team: c.team, t: c.qt, me: c === me, ty: c.tyre })), ...(friends ? [] : G.qb.filter(b => G.t > b.t + 4).map(b => ({ code: b.name, team: b.team, t: b.t, ty: b.ty || 0 })))].sort((a, b) => a.t - b.t).slice(0, 5);
    $('#tower').innerHTML = list.map((r, k) => `<div class="${r.me ? 'me' : ''}"><b>${k + 1}</b><i style="${teamMark(r.team)}"></i><span>${r.code}</span>${G.opts.tyres ? `<u style="color:${TY[r.ty | 0].c};border-color:${TY[r.ty | 0].c}">${TY[r.ty | 0].l}</u>` : ''}<em>${r.t.toFixed(2)}</em></div>`).join('') || '<div><span>НЕТ ВРЕМЁН</span></div>';
    drawMini(); return;
  }
  const st = standings(), pos = st.indexOf(me) + 1;
  if (G.sess === 'practice') { drawMini(); return; }
  $('#hPos').textContent = pos; $('#hLap').textContent = clamp(me.lap, 1, G.laps);
  $('#hTime').textContent = fmt(G.phase === 'race' ? (me.fin ? me.finT : G.t - me.lapStart) : 0).replace('—', '0:00.000');
  $('#hBest').textContent = 'BEST ' + fmt(me.best);
  const rows = towerHTML(st, me);
  $('#tower').innerHTML = rows;
  drawMini();
}
function banner(txt, col) { const b = $('#banner'); b.classList.add('hidden'); void b.offsetWidth; b.textContent = txt; b.style.color = col || '#fff'; b.classList.remove('hidden'); }
let REVS = [];
(function buildRevs() {
  const g = $('#revs'), cols = ['#24d07a', '#24d07a', '#24d07a', '#24d07a', '#24d07a', '#ff3b3b', '#ff3b3b', '#ff3b3b', '#ff3b3b', '#3d7bff', '#3d7bff', '#3d7bff'];
  cols.forEach((c, i) => { const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); r.setAttribute('x', -55 + i * 9.4); r.setAttribute('y', -62);
    r.setAttribute('width', 6.5); r.setAttribute('height', 7); r.setAttribute('rx', 2); r.setAttribute('fill', c); r.setAttribute('opacity', .15); g.appendChild(r); REVS.push(r); });
})();

/* =====================================================================
   RESULTS
   ===================================================================== */
/* the podium: top three on the steps, trophies, confetti — then the classification */
function showPodium() {
  if (Champ.on && G.sess === 'race' && !G.chDone && G.net !== 'client') { G.chDone = true; champAward(); } // the points count the moment the flag falls
  const st = standings().slice(0, 3), el = $('#podium'), d = G.track.def; if (st.length < 3) return showResults();
  $('#pdTrack').textContent = 'ГРАН-ПРИ · ' + d.name; $('#hud').classList.add('hidden');
  const order = [1, 0, 2], cup = (c1, c2) => `<svg viewBox="0 0 64 80" class="pd-cup"><path d="M14 6h36v14a18 18 0 0 1-36 0z" fill="${c1}"/><path d="M14 10H5v5a12 12 0 0 0 12 12M50 10h9v5a12 12 0 0 1-12 12" fill="none" stroke="${c1}" stroke-width="4"/><path d="M28 37h8v14h-8z" fill="${c2}"/><path d="M18 51h28l3 10H15z" fill="${c1}"/><path d="M12 61h40v9H12z" fill="${c2}"/><path d="M20 10h6v18a10 10 0 0 1-6-8z" fill="#fff" opacity=".35"/></svg>`;
  const CUP = [['#FFD54A', '#9a7412'], ['#d9dde2', '#7d8590'], ['#e0995a', '#7a4a20']];
  $('#pdStage').innerHTML = order.map(k => { const c = st[k], T = TEAMS[c.team], nm = c.human ? esc(c.name) : drvOf(c.team, c.seat)[0];
    return `<div class="pd-col p${k + 1}" style="--tc:${T.c1};--ta:${T.ui}"><div class="pd-who">${cup(...CUP[k])}<canvas width="120" height="170"></canvas><b>${nm}</b><span>${T.n}</span></div><div class="pd-step"><em>${k + 1}</em></div></div>`; }).join('');
  $$('#pdStage canvas').forEach((cv, j) => { const g = cv.getContext('2d'); g.translate(60, 85); g.scale(2.2, 2.2); try { drawCarArt(g, st[order[j]].team); } catch (e) {} });
  const conf = $('#pdConf'); conf.innerHTML = ''; const cols = ['#FFC400', '#ff3b3b', '#2a9dff', '#24d07a', '#fff', '#ff79c0'];
  for (let k = 0; k < 70; k++) { const i = document.createElement('i'); i.style.cssText = `left:${Math.random() * 100}%;background:${cols[k % cols.length]};animation-delay:${(Math.random() * 3).toFixed(2)}s;animation-duration:${(2.6 + Math.random() * 2.4).toFixed(2)}s;transform:rotate(${Math.random() * 360 | 0}deg)`; conf.appendChild(i); }
  el.classList.remove('hidden'); sfx('ui'); G.pdOn = true;
  const go = () => { if (el.classList.contains('hidden')) return; el.classList.add('hidden'); G.pdOn = false; clearTimeout(el._t); showResults(); };
  $('#pdGo').onclick = go; el._t = setTimeout(go, 9000);
}
function showResults() {
  if (Champ.on && G.sess === 'race' && !G.chDone && G.net !== 'client') { G.chDone = true; champAward(); } $('#rAgain').textContent = Champ.on ? 'ТАБЛИЦА ЧЕМПИОНАТА' : 'ЕЩЁ РАЗ';
  { const C = Champ.on ? champ() : null, RD = C ? chRounds(C) : [], nx = C && C.r < RD.length && G.net !== 'client'; $('#rNext').classList.toggle('hidden', !nx); if (nx) $('#rNext').textContent = 'СЛЕДУЮЩИЙ ЭТАП · ' + TRK[RD[C.r]].name + ' →'; $('#rAgain').classList.toggle('glass', !!Champ.on); $('#rAgain').classList.toggle('primary', !Champ.on); }
  show('results'); $('#hud').classList.add('hidden'); renderResults(); RP.start(); fitUI(); if (window.SKINS) SKINS.raceDone();
  $('#rAgain').classList.toggle('hidden', G.net === 'client');
}
/* team mode: the constructors' result, scored as in F1 (25-18-15-12-10-8-6-4-2-1 for the top ten cars, both cars count) */
const F1PTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
function teamTable(st) { const p = new Map(); st.forEach((c, k) => p.set(c.team, (p.get(c.team) || 0) + (c.fin || G.sess === 'race' ? F1PTS[k] || 0 : 0)));
  return '<tr class="hd"><td></td><td>КОМАНДЫ · ОЧКИ ЗА ГОНКУ</td><td></td><td></td><td class="t">ОЧКИ</td></tr>' + [...p].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, v], k) => `<tr class="${G.cars[G.me] && G.cars[G.me].team === t ? 'me' : ''}"><td>${k + 1}</td><td><i style="${teamMark(t)}"></i>${TEAMS[t].n}</td><td></td><td></td><td class="t">${v}</td></tr>`).join('') + '<tr class="hd"><td></td><td>ПИЛОТЫ</td><td>ШИНЫ</td><td></td><td></td></tr>'; }
function renderResults() {
  const st = standings(), me = G.cars[G.me], lead = st[0];
  $('#rTitle').textContent = me ? 'P' + (st.indexOf(me) + 1) : 'ФИНИШ';
  $('#rTable').innerHTML = (G.opts.tm ? teamTable(st) : '') + st.map((c, k) => {
    let t; if (k === 0 && c.fin) t = fmt(c.finT); else if (c.fin) t = '+' + (c.finT - lead.finT).toFixed(3); else t = c.lap < lead.lap - 1 ? '+' + (lead.lap - c.lap) + ' LAP' : 'В ГОНКЕ';
    const strat = G.opts.tyres && c.hist ? c.hist.map(q => `<b style="color:${TY[q].c}">${TY[q].l}</b>`).join('<s>›</s>') + `<small>${Math.round(c.wear)}%</small>` : '';
    return `<tr class="${c === me ? 'me' : ''}"><td>${k + 1}</td><td><i style="${teamMark(c.team)}"></i>${c.human ? esc(c.name) : drvOf(c.team, c.seat)[0]}<span class="muted"> · ${TEAMS[c.team].n}</span></td><td class="stg">${strat}</td><td class="t">${fmt(c.best)}</td><td class="t">${t}</td></tr>`;
  }).join('');
}

/* =====================================================================
   INPUT
   ===================================================================== */
const In = { gas: false, brake: false, wheel: 0, wa: false, keys: {}, mx: null, thr: 0, brk: 0, steer: 0, kst: 0 };
addEventListener('keydown', e => { if (!In.keys[e.code] && (e.code === 'KeyW' || e.code === 'ArrowUp')) In.gasT = performance.now(); In.keys[e.code] = true; Snd.init(); if (e.code === 'Escape' && G.mode === 'race') openSheet(true); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code) && G.mode === 'race') e.preventDefault(); });
addEventListener('keyup', e => { In.keys[e.code] = false; });
addEventListener('mousemove', e => { In.mx = e.clientX; In.mAcc = (In.mAcc || 0) + Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0); if (In.mAcc > 12) { In.kbd = false; document.body.classList.remove('nocur'); } });
function pedal(el, key) {
  const on = e => { el.setPointerCapture?.(e.pointerId); if (key === 'gas') In.gasT = performance.now(); In[key] = true; el.classList.add('on'); Snd.init(); };
  const off = () => { In[key] = false; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
}
pedal($('#gas'), 'gas'); pedal($('#aL'), 'left'); pedal($('#aR'), 'right'); pedal($('#brake'), 'brake');
(() => { // boost on a phone: tap the gas twice and keep it held
  const g = $('#gas'); let last = -1e9, off = () => { In.boost = false; g.classList.remove('boost'); };
  g.addEventListener('pointerdown', () => { const n = performance.now(); if (n - last < 320) { In.boost = true; g.classList.add('boost'); } last = n; });
  g.addEventListener('pointerup', off); g.addEventListener('pointercancel', off); g.addEventListener('lostpointercapture', off);
})();
(() => { // direction wheel: the wheel points where the car should go (world = screen)
  const z = $('#wheelZone'); let id = null;
  const aim = e => { const r = z.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); if (Math.hypot(dx, dy) > 14) In.wheelA = Math.atan2(dx, -dy); };
  z.addEventListener('pointerdown', e => { z.setPointerCapture?.(e.pointerId); id = e.pointerId; In.wa = true; In.wheelA = null; aim(e); Snd.init(); });
  z.addEventListener('pointermove', e => { if (e.pointerId === id) aim(e); });
  const end = e => { if (e.pointerId === id) { id = null; In.wa = false; } };
  z.addEventListener('pointerup', end); z.addEventListener('pointercancel', end); z.addEventListener('lostpointercapture', end);
})();
/* no browser zoom: double tap, pinch, ctrl+wheel */
(() => {
  let lastT = 0; const typing = e => /INPUT|TEXTAREA/.test(e.target.tagName || '');
  document.addEventListener('touchend', e => { const n = performance.now(); if (n - lastT < 400 && !typing(e)) e.preventDefault(); lastT = n; }, { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, e => e.preventDefault(), { passive: false });
  addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
})();
const wheelEl = $('#wheel');
/* keys and on-screen arrows: the lock is limited to what the grip can take, and a released key lets the nose settle along the road */
function arrowSteer(ks, dt) {
  const me = G.mode === 'race' ? G.cars[G.me] : null, v = me ? Math.max(0, me.vF) : 0, A = AS(), cap = v < 150 ? .95 : clamp(1750 * A.cap / v * (55 + v * .135) / v, .27, .95), rise = lerp(3.4, 2.5, clamp(v / 800, 0, 1));
  if (ks) { const t = ks * cap, up = Math.sign(In.kst) === -ks ? rise * 2.2 : rise; In.kst += clamp(t - In.kst, -up * dt, up * dt); return; }
  let want = 0;
  if (me && G.phase === 'race' && v > 120 && !me.inPit && !me.pitS) { const T = G.track, i = me.idx, e = wrapA(Math.atan2(T.tx[i], -T.ty[i]) - me.h); if (Math.abs(e) < 1) want = clamp(e * 1.6, -.22, .22) * cap * A.settle; if (Math.abs(me.d) > T.hw * .82) want -= Math.sign(me.d) * .1 * cap * A.settle; }
  In.kst = lerp(In.kst, want, 1 - Math.exp(-dt * 9)); if (Math.abs(In.kst) < .004) In.kst = 0;
}
function readInput(dt) {
  const K = In.keys;
  if (isDesk) {
    const ks = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
    if (ks) { In.kbd = true; In.mAcc = 0; if (G.mode === 'race') document.body.classList.add('nocur'); }
    if (In.kbd || S.ctrl === 'arrows') { arrowSteer(ks, dt); In.steer = In.kst; }
    else if (In.mx != null) { const d = (In.mx - innerWidth / 2) / (innerWidth * .2); In.steer = clamp(Math.sign(d) * Math.max(0, Math.abs(d) - .03), -1, 1); }
    wheelEl.style.transform = `rotate(${In.steer * WMAX * .8}rad)`;
  } else {
    if (S.ctrl === 'arrows') {
      const ks = (In.right ? 1 : 0) - (In.left ? 1 : 0);
      arrowSteer(ks, dt);
      In.steer = In.kst; In.wheel = 0;
    } else {
    const me = G.cars[G.me], h = me ? me.h : 0, aim = In.wa && In.wheelA != null;
    In.steer = aim ? clamp(wrapA(In.wheelA - h) * 2.8, -1, 1) : 0;
    In.wheel += wrapA((aim ? In.wheelA : h) - In.wheel) * (1 - Math.exp(-dt * 16));
    }
    wheelEl.style.transform = `rotate(${In.wheel}rad)`;
  }
  const gas = In.gas || K.KeyW || K.ArrowUp, brk = In.brake || K.KeyS || K.ArrowDown || K.Space;
  In.thr = gas ? Math.min(1, In.thr + dt * 7) : 0; In.brk = brk ? 1 : 0;
}

/* =====================================================================
   SOUND (synth engine)
   ===================================================================== */
const Snd = { // the engine: a recorded Cosworth V8, looped and re-pitched with the revs, kept soft and in the background
  ctx: null, B: {}, on: null, off: null, gear: 0, brkOn: false, last: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const A = window.AudioContext || window.webkitAudioContext, c = new A(); this.ctx = c;
      this.tone = c.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 1200; this.tone.Q.value = .4;
      this.tone2 = c.createBiquadFilter(); this.tone2.type = 'lowpass'; this.tone2.frequency.value = 2200; this.tone2.Q.value = .3; // a second, steeper cut: the hiss and the wind in the recording go
      this.hp = c.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 45; this.hp.Q.value = .5;
      this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(this.hp); this.hp.connect(this.tone); this.tone.connect(this.tone2); this.tone2.connect(c.destination);
      const E = window.ENGINE_F1 || {};
      for (const k of Object.keys(E)) c.decodeAudioData(Uint8Array.from(atob(E[k]), ch => ch.charCodeAt(0)).buffer).then(buf => { this.B[k] = buf; if (k === 'on' || k === 'off') this.loop(k); }).catch(() => {});
    } catch (e) {}
  },
  loop(k) { const c = this.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = this.B[k]; s.loop = true; g.gain.value = 0; s.connect(g); g.connect(this.master); s.start(0, Math.random() * this.B[k].duration); this[k] = { s, g }; },
  one(k, rate, gain, att) { // a one-shot through the same soft filter
    const c = this.ctx, b = this.B[k]; if (!c || !b || !S.sound) return null; const s = c.createBufferSource(), g = c.createGain(), t = c.currentTime; s.buffer = b; s.playbackRate.value = rate;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + (att || .02)); s.connect(g); g.connect(this.master); s.start(); return { s, g };
  },
  update(rpm, thr, on) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime, vol = (S.vol == null ? 1 : S.vol) * (S.volE == null ? 1 : S.volE), live = on && S.sound && G.mode === 'race';
    this.master.gain.setTargetAtTime(live ? (.09 + .05 * rpm) * vol : 0, t, .18);
    const rate = lerp(.66, 1.0, clamp(rpm, 0, 1.05)); // the "on" loop is the top of the rev range in top gear
    if (this.on) { this.on.s.playbackRate.setTargetAtTime(rate, t, .09); this.on.g.gain.setTargetAtTime(thr > .05 ? .35 + .65 * thr : 0, t, .07); }
    if (this.off) { this.off.s.playbackRate.setTargetAtTime(rate * 1.2, t, .12); this.off.g.gain.setTargetAtTime(thr > .05 ? 0 : .55, t, .1); }
    this.tone.frequency.setTargetAtTime(520 + rpm * 900 + thr * 250, t, .2); // warm and dark: the engine is a background, not a buzz
    const me = G.cars[G.me];
    if (me && live && G.phase === 'race') { // gear changes and braking with downshifts come from the same recording
      let g = 0; const v = Math.max(0, me.vF); while (g < 7 && v > GEARS[g] * VMAX * TEAMS[me.team].spd) g++;
      if (g > this.gear && thr > .6 && v > 80 && t - this.last > .25) { this.last = t; this.one('up', lerp(.85, 1, rpm), .3, .02); } this.gear = g;
      const hard = me.brk > .5 && v > 380 && !me.inPit;
      if (hard && !this.brkOn) { this.brkOn = this.one('brake', lerp(.9, 1.02, v / VMAX), .45, .06); if (this.brkOn && this.on) this.on.g.gain.setTargetAtTime(0, t, .03); }
      if (this.brkOn && (thr > .1 || me.brk < .2)) { const b = this.brkOn; b.g.gain.setTargetAtTime(0, t, .06); try { b.s.stop(t + .4); } catch (e) {} this.brkOn = null; }
      if (this.brkOn) { if (this.off) this.off.g.gain.setTargetAtTime(.12, t, .1); }
    } else if (this.brkOn) { try { this.brkOn.s.stop(); } catch (e) {} this.brkOn = null; }
  },
  beep(fr) {
    if (!this.ctx || !S.sound) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.value = fr; o.type = 'sine'; g.gain.setValueAtTime(.05, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .3);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .4);
  }
};

/* =====================================================================
   MULTIPLAYER (WebRTC P2P via PeerJS — host simulates, clients render)
   ===================================================================== */
/* Two independent signalling routes so one dead server cannot kill the lobby:
   PeerJS cloud + Nostr relays (Trystero). Whichever finds the other side first wins. */
const Net = { o: { q: false, b: true, t: true, w: false, m: 4 }, peer: null, links: [], kaT: 0, hiT: 0, lateT: 0, seen: {}, rooms: [], host: false, conns: new Map(), hc: null, players: [], me: null, code: '', laps: 3, track: 0, sendT: 0, tm: 0, fails: 0 };
function mqttLink(url, topic, onMsg, onUp) {
  const enc = new TextEncoder(), dec = new TextDecoder(), vl = n => { const o = []; do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 128; o.push(b); } while (n); return o; }, str = s => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
  const L = { url, open: false, closed: false, pub(t, obj, ret) { if (!this.open) return; const tb = str(t), pl = enc.encode(JSON.stringify(obj)), head = [ret ? 49 : 48, ...vl(tb.length + pl.length), ...tb], out = new Uint8Array(head.length + pl.length); out.set(head); out.set(pl, head.length); try { w.send(out); } catch (e) {} }, close() { this.closed = true; this.open = false; clearInterval(ping); clearTimeout(rt); try { w && w.close(); } catch (e) {} } };
  let w = null, ping = 0, rt = 0, buf = new Uint8Array(0);
  const again = () => { L.open = false; clearInterval(ping); if (!L.closed) { clearTimeout(rt); rt = setTimeout(go, 3000); } };
  const packet = a => { const ty = a[0] >> 4; let i = 1, b; do { b = a[i++]; } while (b & 128);
    if (ty === 2) { if (a[i + 1]) return; const v = [0, 1, ...str(topic), 0]; w.send(new Uint8Array([130, ...vl(v.length), ...v])); }
    else if (ty === 9) { L.open = true; onUp && onUp(L); }
    else if (ty === 3) { const tl = a[i] << 8 | a[i + 1]; i += 2 + tl; try { onMsg(JSON.parse(dec.decode(a.subarray(i))), L); } catch (e) {} } };
  const go = () => { if (L.closed) return; try { w = new WebSocket(url, 'mqtt'); } catch (e) { return again(); } w.binaryType = 'arraybuffer'; buf = new Uint8Array(0);
    const guard = setTimeout(() => { if (!L.open) try { w.close(); } catch (e) {} }, 12000);
    w.onopen = () => { const p = [...str('MQTT'), 4, 2, 0, 60, ...str('apx' + Math.random().toString(36).slice(2, 12))]; w.send(new Uint8Array([16, ...vl(p.length), ...p])); clearInterval(ping); ping = setInterval(() => { try { w.send(new Uint8Array([192, 0])); } catch (e) {} }, 25000); };
    w.onmessage = e => { const n = new Uint8Array(e.data), j = new Uint8Array(buf.length + n.length); j.set(buf); j.set(n, buf.length); buf = j;
      for (;;) { if (buf.length < 2) break; let i = 1, m = 1, len = 0, b, ok = true; do { if (i >= buf.length) { ok = false; break; } b = buf[i++]; len += (b & 127) * m; m *= 128; } while (b & 128); if (!ok || buf.length < i + len) break; packet(buf.subarray(0, i + len)); buf = buf.slice(i + len); } };
    w.onclose = () => { clearTimeout(guard); again(); }; w.onerror = () => {}; };
  go(); return L;
}
function myName() { return (S.name || 'Player').slice(0, 12); }
function netClose() {
  RaceNetwork.close();
  clearTimeout(Flow && Flow.tm);
  closeTyreUI();
  Object.assign(Net, { links: [], rooms: [], peer: null, host: false, conns: new Map(), hc: null, players: [], me: null, code: '', fails: 0, joining: null, hosting: false, cOff: null, rtt: 0, run: (Net.run || 0) + 1 }); joinBusy(false); hostBusy(false);
}
function joinBusy(on) { $('#roomList').inert=on; $('#btnHost').disabled=on; }
function hostBusy(on) { const b = $('#btnHost'); if (!b) return; b.disabled = on; b.classList.toggle('loading', on); b.textContent = on ? 'СОЗДАЁМ' : 'СОЗДАТЬ ЛОББИ'; }
function freeTeam(pref) { const cap = Net.o.tm ? 2 : 1, cnt = i => Net.players.filter(p => p.team === i).length; if (cnt(pref) < cap) return pref; return TEAMS.findIndex((_, i) => cnt(i) < cap); }
function netStatus(t) { const e = $('#fStatus'); if (e) e.textContent = t; }
function hostDrop(uid, conn) {
  if (Net.conns.get(uid) !== conn) return;
  Net.conns.delete(uid); Net.players = Net.players.filter(x => x.id !== uid);
  const car = G.cars.find(c => c.human === uid); if (car) { car.human = null; car.skill = .95; toast(car.name + ' отключился'); }
  bcastLobby();
}
function hostLobby() { return RaceNetwork.begin(null); }
function hostData(conn, uid, d) {
  if (d.t === 'ka') return;
  if (d.t === 'pg') { conn.send({ t: 'po', c: d.c }); return; }
  if (d.t === 'hi') {
    if (Net.players.some(p => p.id === uid)) { const old = Net.conns.get(uid); if (!old || (old !== conn && (old.open === false || (old.broker && !conn.broker)))) Net.conns.set(uid, conn); bcastLobby(); return; }
    const watching = G.mode === 'race' && G.net === 'host'; // a race is on: come in and watch, drive from the next one
    if (Net.players.length >= (Net.o.tm ? 22 : 11)) { conn.send({ t: 'full' }); return; }
    Net.conns.set(uid, conn);
    Net.players.push({ id: uid, name: String(d.name || 'Player').slice(0, 12), team: freeTeam(clamp(d.team | 0,0,TEAMS.length-1)), rk: /^[0-9a-f]{64}$/.test(d.rk || '') ? d.rk : '', dv: d.dv === 'm' ? 'm' : 'p', sk: clamp(d.sk | 0, 0, 7), spec: watching ? 1 : 0 });
    bcastLobby();
    if (watching && Flow) conn.send({ t: 'start', spec: 1, sess: G.sess, grid: G.cars.map(c => ({ team: c.team, seat: c.seat | 0, human: c.human === 'local' ? Net.me : c.human, name: c.name, t: c.tyre })), laps: G.laps, track: Flow.trk, opts: { ...Flow.opts, form: Flow.form, sess: G.sess } });
  } else if (d.t === 'pick') {
    const pl = Net.players.find(p => p.id === uid);
    if (pl && d.team >= 0 && d.team < 11 && Net.players.filter(p => p.team === d.team && p.id !== uid).length < (Net.o.tm ? 2 : 1)) pl.team = d.team;
    bcastLobby();
  } else if (d.t === 'tp') {
    if (Flow && Flow.order) { Flow.picks[uid] = clamp(d.k | 0, 0, 3); if (Flow.order.filter(h => h.human).every(h => Flow.picks[h.human] != null)) flowGo(); }
  } else if (d.t === 'pit') {
    const c = G.cars.find(c => c.human === uid), k = clamp(d.k | 0, 0, 3); if (c && c.pitS) { if (!c.pitSet) c.pitSel = k; } else if (c && c.inPit) c.pitPre = k;
  } else if (d.t === 'in') {
    const c = G.cars.find(c => c.human === uid);
    if (!c) return;
    const p = d.p, ts = Number.isFinite(d.ts) ? d.ts : performance.now();
    if (Array.isArray(p) && p.length >= 10 && p.every(Number.isFinite) && p[6] >= 0 && p[6] < G.track.N) {
      c.poseClock ||= {};
      c.poses ||= [];
      if (!bufferPose(c.poses, c.poseClock, ts, p, conn.route === 'HTTP')) return;
      c.pose = p;
      c.poseR = +d.r || 0;
    }
    c.thr = clamp(+d.a || 0, 0, 1); c.brk = clamp(+d.b || 0, 0, 1); c.steer = clamp(+d.s || 0, -1, 1);
  }
}
function bcast(m) { for (const c of Net.conns.values()) if (c.open) c.send(m); }
function bcastLobby() { bcast({ t: 'lobby', players: Net.players, laps: Net.laps, code: Net.code, track: Net.track, o: Net.o }); renderLobby(); }
function joinLobby(room) { return RaceNetwork.begin(room); }
function clientData(d) {
  if (d.t === 'ka') return;
  if (d.t === 'lobby') { Net.players = d.players; Net.laps = d.laps; Net.code = d.code; Net.track = d.track | 0; if (d.o) Net.o = d.o; if (G.mode !== 'race' && !['garage','tyrepick','quali'].includes(SCR)) show('lobby'); renderLobby(); }
  else if (d.t === 'busy') { toast('Гонка уже идёт — подождите'); }
  else if (d.t === 'full') { toast('Лобби заполнено'); netClose(); }
  else if (d.t === 'start') { if (d.spec) toast('Гонка уже идёт: смотришь как зритель, в следующей поедешь'); startRace(d.grid.map(g => ({ ...g, human: g.human === Net.me ? 'local' : g.human })), d.laps, 'client', d.track | 0, { sess: d.sess, ...d.opts }); }
  else if (d.t === 'qres') { showQuali(d.rows.map(r => ({ ...r, me: r.human === Net.me })), false); }
  else if (d.t === 'tpick') { openPick(d.wet, d.secs, k => Net.hc && Net.hc.send({ t: 'tp', k }), d.wx, d.rec); }
  else if (d.t === 's') pushSnap({ ...d });
  else if (d.t === 'f') { const l = G.snaps[G.snaps.length - 1]; if (l) pushSnap({ ...l, tm: d.tm, ck: d.ck, ph: d.ph, lt: d.lt, c: l.c.map((r, i) => { const f = d.c[i], n = r.slice(); if (f) { n[0] = f[0]; n[1] = f[1]; n[2] = f[2]; n[3] = f[3]; n[5] = f[4]; n[4] = f[5]; n[13] = f[6] || 0; n[14] = f[7] || 0; } return n; }) }); }
  else if (d.t === 'po') { const v = performance.now() - d.c; Net.rtt = Net.rtt ? lerp(Net.rtt, v, .25) : v; }
  else if (d.t === 'fs') toast('Фальстарт: ' + d.n);
  else if (d.t === 'sec') showSec(d, d.uid === Net.me);
  else if (d.t === 'rt') { RT.accept(d.ev); setTimeout(RT.sync, 1500); }
  else if (d.t === 'back') { G.mode = 'lobbywait'; startAttract(); show('lobby'); renderLobby(); }
}
function hostStart() { flowStart('host'); }
/* friends' rating: a race counts when at least two people drove it; the host signs the result */
function rateRace(force) {
  if (G.net !== 'host' || G.sess !== 'race' || G.rated || G.mode !== 'race') return; const hs = G.cars.filter(c => c.human), me = G.cars[G.me]; if (hs.length < 2) return;
  if (!hs.every(c => c.fin) && !(force && me && me.fin)) return; G.rated = true;
  const T = G.track, km = parseFloat(T.def.km) || 5, st = standings(), rows = st.filter(c => c.human).map((c, i) => { const p = Net.players.find(q => q.id === (c.human === 'local' ? Net.me : c.human)); return p && p.rk ? { k: p.rk, n: c.human === 'local' ? myName() : p.name, d: p.dv, tm: c.team, p: i + 1, o: st.indexOf(c) + 1, t: c.fin ? +c.finT.toFixed(3) : 0, b: isFinite(c.best) ? +c.best.toFixed(3) : 0, km: +(Math.max(0, c.prog / T.N - 1) * km).toFixed(2) } : null; }).filter(Boolean);
  if (rows.length < 2) return; RT.publishRace({ v: 1, tr: T.def.name, laps: G.laps, rl: G.opts.rl ? 1 : 0, tmode: G.opts.tm ? 1 : 0, res: rows }).then(ev => bcast({ t: 'rt', ev })).catch(e => console.warn('rating', e));
}
/* snapshots are placed on the host's own clock, so a burst of late packets never reads as a burst of motion */
// Keep sender time separate from arrival time: relay packets often arrive in bursts.
function bufferPose(samples, clock, stamp, data, http) {
  const now = performance.now(), last = samples[samples.length - 1];
  if (last && stamp <= last.st) return false;
  const gap = last ? now - last.rt : 0;
  clock.delay = clamp(Math.max(http ? 320 : 95, gap * 1.25, (clock.delay || 0) - gap * .025), 95, 1100);
  const offset = now - stamp;
  clock.offset = last ? Math.min(offset, clock.offset + gap * .001) : offset;
  data.rt = now; data.st = stamp;
  samples.push(data);
  if (samples.length > 80) samples.shift();
  return true;
}
function posePair(samples, clock) {
  const now = performance.now(), first = samples[0], last = samples[samples.length - 1];
  const target = now - clock.offset - clock.delay;
  if (clock.cursor == null || now - clock.frame > 1500 || last.st - clock.cursor > 1800) {
    clock.cursor = clamp(target, first.st, last.st);
  } else {
    const elapsed = now - clock.frame;
    const rate = clamp(1 + (target - clock.cursor - elapsed) / 350, .55, 1.35);
    clock.cursor = clamp(clock.cursor + elapsed * rate, first.st, last.st);
  }
  clock.frame = now;
  let i = samples.length - 1;
  while (i > 0 && samples[i - 1].st > clock.cursor) i--;
  const a = samples[Math.max(0, i - 1)], b = samples[i];
  return { a, b, k: a === b ? 1 : (clock.cursor - a.st) / (b.st - a.st) };
}
function pushSnap(s) {
  if (G.net !== 'client' || G.mode !== 'race') return;
  bufferPose(G.snaps, G.playback, s.ck ?? performance.now(), s, Net.hc?.route === 'HTTP');
}
function netFollow(c) {
  const {a, b, k} = posePair(c.poses, c.poseClock);
  c.x = lerp(a[0], b[0], k); c.y = lerp(a[1], b[1], k);
  c.h = a[2] + wrapA(b[2] - a[2]) * k;
  c.vx = lerp(a[3], b[3], k); c.vy = lerp(a[4], b[4], k);
  c.vF = lerp(a[5], b[5], k); c.slide = lerp(a[7], b[7], k); c.surf = k < .5 ? a[8] : b[8];
  c.renderPose = k < .5 ? a : b;
}
function netTick(dt) {
  if (G.mode !== 'race') return;
  if (G.net === 'host') {
    Net.sendT -= dt; if (Net.sendT > 0) return; const cs = [...Net.conns.values()]; Net.sendT = cs.some(c => c.broker) ? 1 / 15 : 1 / 20; const ck = Math.round(performance.now());
    const full = { t: 's', ck, bs: G.bs, h: +G.h.toFixed(1), ws: G.wS, ph: G.phase, lt: +G.lt.toFixed(2), tm: +G.t.toFixed(3), c: G.cars.map(c => [Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10, +c.h.toFixed(3), Math.round(c.vF), c.lap, c.idx, c.fin ? +c.finT.toFixed(3) : 0, +c.slide.toFixed(2), isFinite(c.best) ? +c.best.toFixed(3) : 0, c.surf, +(c.lapStart).toFixed(3), c.tyre, Math.round(c.wear), c.pitS ? (c.pitSv ? 2 : 1) : 0, +c.pitT.toFixed(1), +(c.qt || 0).toFixed(3), +c.qs.toFixed(3), c.human ? c.sc : 0, c.human ? c.ls : 0, c.human ? c.bs : 0]) };
    Net.fr = (Net.fr || 0) + 1; let fast = null;
    for (const c of cs) if (c.open) c.send(c.broker && Net.fr % 15 ? fast || (fast = { t: 'f', ck, ph: G.phase, lt: +G.lt.toFixed(2), tm: +G.t.toFixed(2), c: G.cars.map(q => { const r = [Math.round(q.x), Math.round(q.y), +q.h.toFixed(2), Math.round(q.vF), q.idx, q.lap]; if (q.pitS) r.push(q.pitSv ? 2 : 1, +q.pitT.toFixed(1)); return r; }) }) : full);
  } else if (G.net === 'client' && Net.hc && Net.hc.open) {
    Net.sendT -= dt; if (Net.sendT > 0) return; Net.sendT = Net.hc.broker ? 1 / 20 : 1 / 30; const m = G.cars[G.me], n = performance.now();
    if (n - (Net.pgAt || 0) > 1000) { Net.pgAt = n; Net.hc.send({ t: 'pg', c: n }); }
    Net.hc.send({ r: Math.round(Net.rtt || 0), ts: Math.round(n), t: 'in', a: +In.thr.toFixed(2), b: In.brk, s: +In.steer.toFixed(3), p: m ? [+m.x.toFixed(1), +m.y.toFixed(1), +m.h.toFixed(3), +m.vx.toFixed(1), +m.vy.toFixed(1), Math.round(m.vF), m.idx, +m.slide.toFixed(2), m.surf, m.inPit ? 1 : 0] : null });
  }
}
function clientStep(dt) { // the local player's car: instant response whatever the network delay
  const c = G.cars[G.me]; if (!c || c.fin || G.mode !== 'race') return; c.thr = In.thr; c.brk = In.brk; c.steer = In.steer;
  physics(c, dt); const T = G.track, N = T.N; let best = 1e18, bi = c.idx;
  for (let k = -22; k <= 22; k++) { const i = (c.idx + k + N) % N, dx = c.x - T.x[i], dy = c.y - T.y[i], d = dx * dx + dy * dy; if (d < best) { best = d; bi = i; } }
  c.idx = bi; c.d = (c.x - T.x[bi]) * T.nx[bi] + (c.y - T.y[bi]) * T.ny[bi]; barrier(c);
  if ((G.step = (G.step || 0) + 1) % 6 === 0) towCalc();
}
function applySnaps() {
  const S2 = G.snaps; if (!S2.length) return;
  const now = performance.now(), L = S2[S2.length - 1];
  const {a, b, k} = posePair(S2, G.playback);
  G.h = L.h == null ? 5 : L.h; if (L.ws != null) G.wS = L.ws; if (L.bs) G.bs = L.bs;
  if (now - L.rt > 4000) return; // stale
  const prevPhase = G.phase; G.phase = L.ph; G.lt = L.lt; G.t = L.tm;
  if (prevPhase === 'grid' && G.phase === 'race') G.t = L.tm;
  G.cars.forEach((c, i) => {
    const A = a.c[i], B = b.c[i], Lc = L.c[i]; if (!A || !B) return;
    const mine = i === G.me && !c.fin && !Lc[6];
    if (!mine) { c.x = lerp(A[0], B[0], k); c.y = lerp(A[1], B[1], k); c.h = A[2] + wrapA(B[2] - A[2]) * k; c.vF = lerp(A[3], B[3], k);
      const f = Math.sin(c.h), g = -Math.cos(c.h); c.vx = f * c.vF; c.vy = g * c.vF; c.idx = Lc[5]; c.slide = Lc[7]; c.surf = Lc[9]; }
    else if (Lc[13]) { const q = 1 - Math.exp(-.2); c.x = lerp(c.x, Lc[0], q); c.y = lerp(c.y, Lc[1], q); c.h += wrapA(Lc[2] - c.h) * q; c.vx = c.vy = c.vF = c.vL = 0; c.idx = Lc[5]; }
    c.prog = Lc[4] * G.track.N + Lc[5]; c.best = Lc[8] || Infinity; c.lapStart = Lc[10]; c.tyre = Lc[11]; c.wear = Lc[12]; c.pitS = Lc[13] ? 1 : 0; c.pitSv = Lc[13] === 2 ? 1 : 0; c.pitT = Lc[14]; if (c.pitSv && !c.pitD) c.pitD = Math.max(1, c.pitT); if (!c.pitS) c.pitD = 0; c.qt = Lc[15]; c.qs = Lc[16]; if (Lc[17]) { c.sc = Lc[17]; c.ls = Lc[18]; c.bs = Lc[19]; }
    if (Lc[4] !== c.lap) { const was = c.lap; c.lap = Lc[4]; if (c.human === 'local' && G.sess !== 'quali' && c.lap > was && c.lap >= 2 && c.lap <= G.laps) banner(c.lap === G.laps ? 'FINAL LAP' : 'LAP ' + c.lap); }
    if (Lc[6] && !c.fin) { c.fin = true; c.finT = Lc[6]; if (c.human === 'local' && G.sess === 'quali') banner(fmt(c.finT), '#FFC400'); else if (c.human === 'local') { banner('FINISH', '#FFC400'); G.resT = 2.6; } }
  });
}

/* =====================================================================
   UI / SCREENS
   ===================================================================== */
const SCREENS = ['menu', 'garage', 'friends', 'lobby', 'results', 'quali', 'tyrepick', 'rating', 'champ'];
let SCR = 'menu', bgF = 0;
function show(id) { if(id==='friends') RaceNetwork.list(); else RaceNetwork.stopList(); SCR = id; SCREENS.forEach(s => $('#' + s).classList.toggle('hidden', s !== id)); document.body.classList.toggle('menu-on', id === 'menu'); if (id === 'menu') refreshMenu(); if (id) document.body.classList.remove('nocur'); fitUI(); }
/* no page ever scrolls: a screen that does not fit the window is scaled down until it does */
function fit1(el, room) { el.style.zoom = ''; let z = 1; for (let k = 0; k < 7; k++) { const hh = room ? room / z : el.clientHeight, r = Math.min(1, hh / Math.max(1, el.scrollHeight), el.clientWidth / Math.max(1, el.scrollWidth)); if (r >= .9995) break; z = Math.max(.45, z * r * .995); el.style.zoom = z; } }
let fitQ = 0;
function fitUI() { if (fitQ) return; fitQ = requestAnimationFrame(() => { fitQ = 0; for (const el of $$('.screen')) if (!el.classList.contains('hidden')) fit1(el); if (!$('#sheet').classList.contains('hidden')) fit1($('.sheet-body'), innerHeight - 24); }); }
addEventListener('resize', () => { fitUI(); if (G.mode === 'race' && !$('#tracks').classList.contains('hidden')) tgCols(); });
function tgCols() { const g = $('#tgGrid'), n = TRK.length, r = g.getBoundingClientRect(); g.style.setProperty('--cols', clamp(Math.round(Math.sqrt(n * (r.width || innerWidth) / (r.height || innerHeight) / 1.25)), 3, 9)); }
let toastT = 0;
/* ---------- all tracks at once ---------- */
function defOutline(cvs, def, col, pad0, lw0) {
  const g = cvs.getContext('2d'), W = cvs.width, H = cvs.height, P = def.pts; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = pad0 || 12, s = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (y1 - y0)), ox = (W - (x1 - x0) * s) / 2 - x0 * s, oy = (H - (y1 - y0) * s) / 2 - y0 * s;
  g.clearRect(0, 0, W, H); g.lineJoin = g.lineCap = 'round'; g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x * s + ox, y * s + oy) : g.moveTo(x * s + ox, y * s + oy)); g.closePath();
  const lw = lw0 || 3.2; g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = lw + 4; g.stroke(); g.strokeStyle = col; g.lineWidth = lw; g.stroke();
  { const a = P[P.length - 1], b = P[1]; chequer(g, P[0][0] * s + ox, P[0][1] * s + oy, Math.atan2(b[1] - a[1], b[0] - a[0]), lw * 3.6, lw * 1.8); }
}
function openTracks(lobby) {
  const cur = lobby ? Net.track : S.track; $('#tgCount').textContent = TRK.length + ' трасс';
  let grp = -1; $('#tgGrid').innerHTML = TRK_ORDER.map(i => { const d = TRK[i], g = d.cal != null ? 0 : d.past ? 1 : 2, head = g !== grp ? ` data-h="${['КАЛЕНДАРЬ ФОРМУЛЫ-1 · 2026', 'БЫЛИ В КАЛЕНДАРЕ', 'ВЫДУМАННЫЕ'][g]}"` : ''; grp = g; return `<button class="tg-card${i === cur ? ' on' : ''}${head ? ' gh' : ''}"${head} data-i="${i}"><canvas width="240" height="160"></canvas><b><i class="flag ${d.flag || 'mc'}"></i>${d.name}</b><span>${d.mon ? d.mon + ' · ' : d.past ? d.past + ' · ' : ''}${d.km} км · ${d.sub.split('·')[0].trim()}</span>${d.night ? '<em class="night">НОЧЬ</em>' : ''}</button>`; }).join('');
  $$('#tgGrid .tg-card').forEach(b => defOutline(b.querySelector('canvas'), TRK[+b.dataset.i], +b.dataset.i === cur ? '#FFC400' : '#d9dce2'));
  $('#tgGrid').onclick = e => { const b = e.target.closest('.tg-card'); if (!b) return; const i = +b.dataset.i; $('#tracks').classList.add('hidden');
    if (lobby) { if (Net.host) { Net.track = i; bcastLobby(); } } else if (i !== S.track) { S.track = i; saveS(); startAttract(); } };
  $('#tracks').classList.remove('hidden'); tgCols();
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2600); }

const WX_CYC = [4, 0, 1, 5, 2, 3]; // the order a tap walks through: auto first
function cycleWx() { const on = S.tyres && S.weather; S.wx = on ? WX_CYC[(WX_CYC.indexOf(S.wx) + 1) % WX_CYC.length] : 4; S.weather = true; S.tyres = true; saveS(); syncSettings(); sfx('ui'); toast('Погода: ' + WXN[S.wx] + (S.wx === 4 ? ' — по климату трассы' : '')); }
const WXN = ['Сухо', 'Облачно', 'Дождь', 'Ливень', 'Авто', 'Влажно'], DIFFN = ['Лёгко', 'Норма', 'Профи'];
function refreshMenu() {
  const t = TEAMS[S.team], d = drvOf(S.team, S.seat);
  $('#mcTeam').textContent = t.n; $('#mcTeam').style.color = t.ui;
  $('#mcDriver').textContent = '#' + d[2] + ' · ' + d[0];
  const c = $('#menuCar'), g = c.getContext('2d'), cr = c.getBoundingClientRect(), cdp = Math.min(3, (devicePixelRatio || 1) * 1.5); if (cr.width > 0) { c.width = Math.round(cr.width * cdp); c.height = Math.round(cr.height * cdp); } g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high';
  g.translate(c.width / 2, c.height / 2); g.scale(Math.min(c.height / 56, c.width / 26), Math.min(c.height / 56, c.width / 26)); if (window.SKINS && S.skin) SKINS.art(g, S.team, S.skin); else drawCarArt(g, S.team);
  const td = TRK[S.track]; $('#tcName').textContent = td.name; $('#tcSub').textContent = td.sub; $('#tcFlag').className = 'flag ' + (td.flag || 'mc'); $('#tcIdx').textContent = String(S.track + 1).padStart(2, '0') + ' / ' + TRK.length;
  $$('#mLaps button').forEach(b => b.classList.toggle('on', +b.dataset.v === S.laps)); $('#mTwV').textContent = Math.round(((S.twT || {})[td.id] || 1) * 100) + '%';
  $('#tcLaps').textContent = S.laps; $('#tcLen').textContent = td.km; $('#tcCars').textContent = S.n22 ? 22 : 11; $('#tcWx').textContent = S.tyres && S.weather ? WXN[S.wx] : 'Сухо';
  $('#raceSub').textContent = S.laps + ' ' + (S.laps < 5 ? 'круга' : 'кругов') + ' · ' + (S.n22 ? '22 болида' : '11 болидов') + ' · ' + DIFFN[S.diff];
  $$('#mDiff button').forEach(b => b.classList.toggle('on', +b.dataset.v === S.diff)); $$('#mAssist button').forEach(b => b.classList.toggle('on', +b.dataset.v === S.assist));
  { const tc = $('#trackThumb'), r = tc.getBoundingClientRect(), dp = Math.min(3, devicePixelRatio || 1); // match the CSS box so the outline is never stretched
    if (r.width > 0) { tc.width = Math.round(r.width * dp); tc.height = Math.round(r.height * dp); }
    defOutline(tc, TRK[S.track], '#FFC400', 16 * dp, Math.max(3.5, r.height / 46) * dp); }
}

/* ---------- garage ---------- */
const GA = { i: 0, from: -1, t: 1, mode: 'solo', sweep: 0, num: { spd: 0, acc: 0, grip: 0 } };
function openGarage(mode) {
  GA.mode = mode; GA.i = mode === 'lobby' ? (Net.players.find(p => p.id === Net.me)?.team ?? S.team) : S.team; GA.from = -1; GA.t = 0; GA.seat = S.seat ? 1 : 0; GA.skin = S.skin | 0;
  show('garage'); $('#gDots').innerHTML = TEAMS.map(() => '<i></i>').join('');
  $('#gRings').innerHTML = ['FL', 'FR', 'RL', 'RR'].map((l, k) => `<div class="ring"><svg viewBox="0 0 40 40"><circle class="rb" cx="20" cy="20" r="16"/><circle class="rf" cx="20" cy="20" r="16"/></svg><b data-k="p${k}">0</b><span>${l}</span></div>`).join('');
  garageInfo();
}
function garageNav(d) { GA.from = GA.i; GA.i = (GA.i + d + TEAMS.length) % TEAMS.length; GA.t = 0; GA.dir = d; garageInfo(); }
function teamTaken(i) { return GA.mode === 'lobby' && Net.players.filter(p => p.team === i && p.id !== Net.me).length >= (Net.o.tm ? 2 : 1); }
function teamStats(i) {
  const t = TEAMS[i], h = k => ((i * 7919 + k * 104729) % 97) / 97;
  return { spd: VMAX * t.spd * KMH, hp: Math.round(1000 * t.acc + h(1) * 12), a100: 2.62 / t.acc, a200: 4.25 / t.acc, rpm: 14.6 + h(2) * .6,
    brk: 5.2 * t.brk + .1 * h(3), kg: 798 + Math.round(h(4) * 6), drs: 11 + h(5) * 4, lat: 5.1 * t.grip, tit: t.tit,
    p: [22.5 + h(6) * .8, 22.5 + h(7) * .8, 20.5 + h(8) * .8, 20.5 + h(9) * .8], bars: [t.acc, t.grip, t.brk, (t.acc + t.spd) / 2] };
}
function roll(el, v, dec, delay) {
  const id = el._id = (el._id || 0) + 1, t0 = performance.now() + delay, blk = el.closest('.g-block,.kv,.bar,.ring');
  if (blk) setTimeout(() => { blk.classList.remove('flash'); void blk.offsetWidth; blk.classList.add('flash'); }, delay);
  let last = 0;
  const tick = now => {
    if (el._id !== id) return; const t = (now - t0) / 850;
    if (t < 0) return requestAnimationFrame(tick);
    if (t < .55) { if (now - last > 40) { last = now; el.textContent = (v * (.7 + Math.random() * .6)).toFixed(dec); } }
    else if (t < 1) el.textContent = lerp(parseFloat(el.textContent) || v, v, .22).toFixed(dec);
    else { el.textContent = v.toFixed(dec); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function garageDrv() { // either of the team's two drivers
  $('#gDrvs').innerHTML = [0, 1].map(sx => { const d = drvOf(GA.i, sx); return `<button class="g-drvb${sx === GA.seat ? ' on' : ''}" data-s="${sx}"><i>${d[2]}</i><b>${d[0]}</b><em>${d[1]}</em></button>`; }).join('');
  $('#gDrvs').onclick = e => { const b = e.target.closest('button'); if (!b) return; GA.seat = +b.dataset.s; garageDrv(); sfx('ui'); };
}
function garageInfo() {
  const t = TEAMS[GA.i], s = teamStats(GA.i);
  $('#gTeam').textContent = t.n; $('#gFull').textContent = t.f; garageDrv(); if (window.SKINS) SKINS.ui();
  $('#gCh').textContent = t.ch; $('#gPu').textContent = t.pu; $('#gTeam').style.color = t.ui;
  const hm = $('#gHelm'); hm.classList.remove('pop'); void hm.offsetWidth; hm.src = 'cars/helmets/' + t.id + '.png'; hm.classList.add('pop');
  const lay = document.createElement('div'); lay.className = 'gbg-layer';
  lay.style.background = `radial-gradient(85% 55% at 50% 42%, ${hexA(t.bg, .95)} 0%, ${shade(t.bg, -.6)} 62%, #08090b 100%)`;
  $('#garage').prepend(lay); requestAnimationFrame(() => lay.classList.add('on'));
  setTimeout(() => $$('#garage .gbg-layer').slice(1).forEach(e => e.remove()), 700);
  $('#gIndex').textContent = String(GA.i + 1).padStart(2, '0') + ' / ' + TEAMS.length;
  $$('#gDots i').forEach((e, k) => e.classList.toggle('on', k === GA.i));
  let d = 0; const R = (k, v, dec) => $$(`[data-k="${k}"]`).forEach(el => roll(el, v, dec, (d++) * 55));
  R('spd', s.spd, 0); R('hp', s.hp, 0); R('a100', s.a100, 2); R('rpm', s.rpm, 1); R('a200', s.a200, 2); R('brk', s.brk, 1);
  R('kg', s.kg, 0); R('drs', s.drs, 1); R('lat', s.lat, 1); s.p.forEach((v, k) => R('p' + k, v, 1)); R('tit', s.tit, 0);
  ['bBrk', 'bPow', 'bAero', 'bErs'].forEach((id, k) => { const e = $('#' + id); e.style.width = '8%'; void e.offsetWidth; e.style.width = clamp(55 + (s.bars[[2, 0, 1, 3][k]] - .986) / .028 * 45, 30, 100) + '%'; });
  const gg = $('#gGauge'); gg.style.transition = 'none'; gg.style.strokeDashoffset = 157; void gg.getBoundingClientRect(); gg.style.transition = ''; gg.style.strokeDashoffset = 157 * (1 - s.rpm / 16);
  $$('.ring .rf').forEach((c, k) => { c.style.transition = 'none'; c.style.strokeDashoffset = 100.5; void c.getBoundingClientRect(); c.style.transition = '';
    c.style.strokeDashoffset = 100.5 * (1 - (k < 4 ? (s.p[k] - 17) / 7 : s.tit / 16)); });
  const taken = teamTaken(GA.i); $('#gTaken').classList.toggle('hidden', !taken);
  $('#gSelect').textContent = taken ? 'ЗАНЯТО' : 'ВЫБРАТЬ'; $('#gSelect').style.opacity = taken ? .4 : 1;
}
let gOff = null;
function drawGarage(dt) {
  const cvs = $('#gCar'), r = cvs.getBoundingClientRect(); if (!r.width) return;
  const W = Math.round(r.width * DPR), H = Math.round(r.height * DPR);
  if (cvs.width !== W || cvs.height !== H) { cvs.width = W; cvs.height = H; }
  if (!gOff) gOff = document.createElement('canvas');
  const g = cvs.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  GA.t = Math.min(1, GA.t + dt * 1.6); GA.sweep = (GA.sweep + dt * .35) % 1.6;
  const sc = Math.min(H * .8 / 54, W * .96 / (TEAMS[GA.i].pic ? 21 : 26));
  const e = 1 - Math.pow(1 - GA.t, 3), ein = GA.t * GA.t * GA.t;
  const dir = GA.dir || 1;
  const draw = (ti, oy, alpha, blur) => {
    const t = TEAMS[ti];
    gOff.width = Math.ceil(30 * sc); gOff.height = Math.ceil(60 * sc);
    const o = gOff.getContext('2d'); o.setTransform(sc, 0, 0, sc, gOff.width / 2, gOff.height / 2); if (ti === GA.i && GA.skin && window.SKINS) SKINS.art(o, ti, GA.skin); else drawCarArt(o, ti);
    // showroom light sweep
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-atop';
    const y = (GA.sweep - .3) * gOff.height * 1.4, lg = o.createLinearGradient(0, y - 80, gOff.width * .3, y + 80);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, 'rgba(255,255,255,.28)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    o.fillStyle = lg; o.fillRect(0, 0, gOff.width, gOff.height); o.globalCompositeOperation = 'source-over';
    // glow
    const gl = g.createRadialGradient(W / 2, H / 2 + oy, 10, W / 2, H / 2 + oy, Math.min(W, H) * .5);
    gl.addColorStop(0, hexA(t.ui, .3 * alpha)); gl.addColorStop(1, hexA(t.ui, 0)); g.fillStyle = gl; g.fillRect(0, 0, W, H);
    g.save(); g.globalAlpha = alpha; g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 30 * DPR; g.shadowOffsetX = 10 * DPR; g.shadowOffsetY = 18 * DPR;
    if (blur) for (let k = 4; k > 0; k--) { g.globalAlpha = alpha * .12; g.drawImage(gOff, (W - gOff.width) / 2, (H - gOff.height) / 2 + oy + k * blur * dir); }
    const locked = ti === GA.i && GA.skin && window.SKINS && !SKINS.has(GA.skin); // a locked livery: shown dimmed, with a padlock
    g.globalAlpha = alpha * (locked ? .62 : 1); g.drawImage(gOff, (W - gOff.width) / 2, (H - gOff.height) / 2 + oy); g.restore();
    if (locked && alpha > .5) { const s = Math.min(W, H) * .07, x = W / 2, y = H / 2 + oy; g.save(); g.fillStyle = 'rgba(10,11,14,.78)'; g.beginPath(); g.arc(x, y, s * 1.6, 0, 7); g.fill(); g.strokeStyle = '#FFC400'; g.lineWidth = s * .22; g.beginPath(); g.arc(x, y - s * .25, s * .55, Math.PI, 0); g.stroke(); g.fillStyle = '#FFC400'; g.fillRect(x - s * .8, y - s * .25, s * 1.6, s * 1.15); g.fillStyle = '#111'; g.fillRect(x - s * .1, y + s * .05, s * .2, s * .45); g.restore(); }
  };
  if (GA.from >= 0 && GA.t < .55) draw(GA.from, -dir * ein * H * 1.6, 1, 22 * DPR);
  draw(GA.i, dir * (1 - e) * H * 1.1 + (GA.drag || 0), Math.min(1, GA.t * 2.5), (1 - e) * 30 * DPR);
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`; }
(() => {
  const st = $('#garage'); let x0 = null;
  let y0 = 0, pid = null;
  st.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; x0 = e.clientX; y0 = e.clientY; pid = e.pointerId; st.setPointerCapture?.(e.pointerId); });
  st.addEventListener('pointermove', e => { if (x0 == null || e.pointerId !== pid) return; const dx = e.clientX - x0, dy = e.clientY - y0; GA.drag = (Math.abs(dy) > Math.abs(dx) ? dy : dx * .6) * DPR; });
  const end = e => { if (x0 == null || e.pointerId !== pid) return; const dx = e.clientX - x0, dy = e.clientY - y0, d = Math.abs(dy) > Math.abs(dx) ? dy : dx; x0 = null; GA.drag = 0; if (Math.abs(d) > 40) garageNav(d < 0 ? 1 : -1); };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  $('#gPrev').onclick = () => garageNav(-1); $('#gNext').onclick = () => garageNav(1);
  $('#gBack').onclick = () => show(GA.mode === 'lobby' ? 'lobby' : 'menu');
  $('#gSelect').onclick = () => {
    if (teamTaken(GA.i)) return toast('Этот болид уже выбран другим игроком');
    S.team = GA.i; S.seat = GA.seat | 0; if (window.SKINS) S.skin = SKINS.pick(); saveS();
    if (GA.mode === 'lobby') {
      if (Net.host) { const me = Net.players.find(p => p.id === Net.me); if (me) me.team = GA.i; bcastLobby(); }
      else if (Net.hc) Net.hc.send({ t: 'pick', team: GA.i });
      show('lobby');
    } else { G.follow = G.cars.findIndex(c => c.team === S.team); show('menu'); }
  };
  addEventListener('keydown', e => { if ($('#garage').classList.contains('hidden')) return; if (e.code === 'ArrowLeft') garageNav(-1); if (e.code === 'ArrowRight') garageNav(1); if (e.code === 'Enter') $('#gSelect').click(); });
})();

/* ---------- lobby ---------- */
function renderLobby() {
  $('#lCode').textContent = Net.players.find(p=>p.host)?.name || '—'; $('#lCount').textContent = Net.players.length;
  $('#lPlayers').innerHTML = Net.players.map(p => `<li><i style="${teamMark(p.team)}"></i><b>${esc(p.name)}${p.id === Net.me ? ' (вы)' : ''}${p.spec ? ' · зритель' : ''}</b><span>${TEAMS[p.team].n}${p.host ? ' · HOST' : ''}</span></li>`).join('');
  const lt = TRK[Net.track] || TRK[0]; $('#lTrackName').textContent = lt.name; $('#lTrack').classList.toggle('nohost', !Net.host);
  $('#lStart').classList.toggle('hidden', !Net.host); $('#lLaps').classList.toggle('hidden', !Net.host); $('#lWait').classList.toggle('hidden', Net.host);
  $$('#lLaps button').forEach(b => b.classList.toggle('on', +b.dataset.v === Net.laps));
  const lo = Net.o; for (const [id, key] of [['lQ', 'q'], ['lB', 'b'], ['lT', 't'], ['lW', 'w'], ['lTm', 'tm']]) $('#' + id).classList.toggle('on', !!lo[key]);
  { const v = Math.round((lo.tw || 1.4) * 100); $('#lTw').value = v; $('#lTwV').textContent = v + '%'; $$('#lAs button').forEach(b => b.classList.toggle('on', +b.dataset.v === (lo.as == null ? 2 : lo.as))); }
  fitUI();
  $('#lOpts').classList.toggle('nohost', !Net.host); $('#lWxRow').classList.toggle('hidden', !lo.w); $$('#lWx button').forEach(b => b.classList.toggle('on', +b.dataset.v === lo.m));
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- sheet (settings / pause) ---------- */
function openSheet(pause) {
  $('#sheetTitle').textContent = pause ? 'ПАУЗА' : 'НАСТРОЙКИ'; $('#sQuit').classList.toggle('hidden', !pause); $('#sClose').textContent = pause ? 'ПРОДОЛЖИТЬ' : 'ГОТОВО';
  $('#sheet').classList.remove('hidden'); if (pause && !G.net) G.paused = true; document.body.classList.remove('nocur');
  if (!pause && G.mode !== 'race') { CFG = true; document.body.classList.add('cfg'); $('#hud').classList.remove('hidden'); hudT = 0; } // the demo race runs behind with the real HUD on it
  syncSettings(); setTab(sTab); fitUI();
}
function closeSheet() {
  $('#sheet').classList.add('hidden'); G.paused = false;
  if (CFG) { CFG = false; document.body.classList.remove('cfg'); if (G.mode !== 'race') $('#hud').classList.add('hidden'); if (G.mode === 'attract' && G.track.tw !== twOf(S.track)) startAttract(); }
  if (!$('#menu').classList.contains('hidden')) refreshMenu(); fitUI();
}
let sTab = 'race';
function setTab(t) { if (!$$('#sTabs button').some(b => b.dataset.t === t)) t = 'race'; sTab = t; $$('#sTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); $$('.sheet-body [data-g]').forEach(r => r.classList.toggle('off', r.dataset.g !== t)); fitUI(); }
const SLIDERS = [['sTw', 'tw', 1.4], ['sMap', 'mapS', 1], ['sWheel', 'wheelS', 1], ['sPad', 'padS', 1], ['sHud', 'hudS', 1], ['sSpd', 'spdFx', 1], ['sVol', 'vol', 1], ['sVolE', 'volE', 1], ['sVolF', 'volF', 1]];
function applyUI() { const r = document.documentElement.style; r.setProperty('--mapS', S.mapS); r.setProperty('--wheelS', S.wheelS); r.setProperty('--padS', S.padS); r.setProperty('--hudS', S.hudS); if (G.track && (G.mode === 'race' || CFG) && MINI) buildMini(); for (const [id, k] of SLIDERS) { const e = $('#' + id); if (e) { const v = Math.round(S[k] * 100); e.value = v; e.nextElementSibling.textContent = v + '%'; } } }
/* drag handles on the mini-map and the wheel */
function grip(el, key, lo, hi, base, dirs) {
  el.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); el.setPointerCapture?.(e.pointerId); const x0 = e.clientX, y0 = e.clientY, s0 = S[key], d = dirs();
    const mv = v => { S[key] = clamp(s0 + ((v.clientX - x0) * d[0] + (v.clientY - y0) * d[1]) / (2 * base), lo, hi); applyUI(); };
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); saveS(); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); });
}
function syncSettings() {
  applyUI(); chSync();
  $$('#sDiff button').forEach(b => b.classList.toggle('on', +b.dataset.v === S.diff));
  $$('#sLaps button').forEach(b => b.classList.toggle('on', +b.dataset.v === S.laps));
  $('#sTyres').classList.toggle('on', S.tyres); $('#sWeather').classList.toggle('on', S.weather); $('#sQuali').classList.toggle('on', S.quali); $('#mQuali').classList.toggle('on', S.quali);
  $('#rowWx').classList.toggle('hidden', !S.weather); $$('#sWx button').forEach(b => b.classList.toggle('on', +b.dataset.v === S.wx));
  $('#sLeft').classList.toggle('on', S.lefty); $('#sSound').classList.toggle('on', S.sound);
  $('#controls').classList.toggle('lefty', S.lefty);
  $$('#sCtrl button').forEach(b => b.classList.toggle('on', b.dataset.v === S.ctrl));
  $('#wheelZone').classList.toggle('hidden', S.ctrl === 'arrows'); $('#arrows').classList.toggle('hidden', S.ctrl !== 'arrows');
  $$('#sAssist button').forEach(b => b.classList.toggle('on', +b.dataset.v === S.assist)); $('#sAssistNote').textContent = ASSIST_NOTE[S.assist] || '';
  $('#sAbs').classList.toggle('dis', S.assist < 2); $$('#sCars button').forEach(b => b.classList.toggle('on', +b.dataset.v === (S.n22 ? 1 : 0)));
  $$('#sRows button').forEach(b => b.classList.toggle('on', +b.dataset.v === (S.rows | 0))); $('#sKmh').classList.toggle('on', S.kmh !== false); $('#sShake').classList.toggle('on', S.shake !== false);
  $('#sGfxNote').textContent = GFX_NOTE[S.gfx || 'auto'] || ''; document.body.classList.toggle('nokmh', S.kmh === false); document.body.classList.toggle('brk', S.abs === false || (G.mode === 'race' ? asLvl() : S.assist) < 2);
  FX.sync(); sfx('vol');
}
const ASSIST_NOTE = ['Без помощи: держак как у соперников, машину никто не ловит. Стена или гравий — и скорости нет. Тормозишь только сам.', 'Минимум: чуть больше держака, от стен не отводит, тормозишь сам. Ошибки стоят дорого.', 'Средняя: слегка отводит от стен, можно включить автотормоз. Удар о стену и вылет заметно тормозят.', 'Полная: машина почти сама держится на трассе, удары о стену тормозят слабо. Для первых заездов.'];
const GFX_NOTE = { auto: 'Авто: игра сама подбирает качество, чтобы не тормозило.', lo: 'Лайт: для слабых телефонов — меньше частиц, без карты света и размытия.', mid: 'Средняя: все эффекты, обычная чёткость.', hi: 'Высокая: чёткая картинка, больше дыма, искр и дождя.', ultra: 'Ультра: максимум чёткости и частиц, живые детали вокруг трасс. Для мощных ПК.' };
const RATING_MEMO = `<p>В рейтинг идут только гонки <b>с друзьями</b>, где ехали минимум два человека. Гонки с ботами в одиночку не считаются.</p>
<ul><li><b>Очки за место в гонке</b> — как в Формуле-1: 25 · 18 · 15 · 12 · 10 · 8 · 6 · 4 · 2 · 1. Боты считаются: приехал 5-м — получаешь 10 очков, даже если обогнал всех друзей.</li>
<li><b>Бонус за слабую машину.</b> За каждое место выше, чем «положено» твоему болиду среди людей, даётся <b>+3</b>. Привёз Cadillac впереди Mercedes — получи бонус.</li>
<li><b>Таблицы раздельные</b>: ПК и телефоны считаются отдельно, чтобы было честно.</li>
<li>При равных очках выше тот, у кого больше побед, затем — у кого меньше гонок.</li>
<li>В колонках: очки, победы, <b>винрейт</b> (доля гонок, выигранных целиком, вместе с ботами), гонки и километры за рулём.</li></ul>
<p class="muted small">Результат подписывает хост гонки. Аккаунтов нет: твой профиль — это ник на этом устройстве.</p>`;
function memo(title, html) { $('#memoTitle').textContent = title; $('#memoText').innerHTML = html; $('#memo').classList.remove('hidden'); fitUI(); }
function wireUI() {
  $('#btnSettings').onclick = () => { const b = $('#btnSettings'); b.classList.remove('pressed'); void b.offsetWidth; b.classList.add('pressed'); openSheet(false); };
  $('#btnPause').onclick = () => openSheet(true);
  $('#sClose').onclick = () => { closeSheet(); sfx('ui'); };
  $('#sTabs').onclick = e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.t); };
  for (const [id, k] of SLIDERS) { const e = $('#' + id); e.oninput = () => { S[k] = +e.value / 100; applyUI(); if (k.startsWith('vol')) sfx('vol'); }; e.onchange = () => { saveS(); if (k === 'tw' && CFG && G.mode === 'attract') startAttract(); if (k === 'volF') sfx('test'); };
    // while a slider is held the sheet fades away so the thing being sized is in view
    const peek = on => { $('#sheet').classList.toggle('peek', on); e.closest('.row').classList.toggle('held', on); };
    e.addEventListener('pointerdown', () => peek(true)); for (const ev of ['pointerup', 'pointercancel', 'blur']) e.addEventListener(ev, () => peek(false)); }
  const seg = (id, fn2) => { const el = $(id); if (el) el.onclick = e => { const b = e.target.closest('button'); if (b && b.dataset.v != null) { fn2(b.dataset.v); saveS(); syncSettings(); if (!$('#menu').classList.contains('hidden')) refreshMenu(); sfx('ui'); } }; };
  const setAssist = v => { S.assist = clamp(+v | 0, 0, 3); S.abs = S.assist >= 2; };
  seg('#mLaps', v => { S.laps = +v; });
  seg('#sArt', v => { S.art = v; TEAMS.forEach(t => t.pic = null); buildSprites(); loadCarPNGs(); });
  const twStep = d => { const id = TRK[S.track].id, T = S.twT || (S.twT = {}); T[id] = clamp(Math.round(((T[id] || 1) + d) * 100) / 100, .7, 1.4); saveS(); refreshMenu(); sfx('ui'); clearTimeout(twStep.t); twStep.t = setTimeout(startAttract, 450); };
  $('#mTwM').onclick = () => twStep(-.05); $('#mTwP').onclick = () => twStep(.05);
  seg('#sAssist', setAssist); seg('#mAssist', setAssist); seg('#mDiff', v => { S.diff = +v; }); seg('#sCars', v => { S.n22 = v === '1'; }); seg('#sRows', v => { S.rows = +v; hudT = 0; });
  seg('#lAs', v => { if (Net.host) { Net.o.as = +v; bcastLobby(); } });
  $('#sKmh').onclick = () => { S.kmh = S.kmh === false; saveS(); syncSettings(); }; $('#sShake').onclick = () => { S.shake = S.shake === false; saveS(); syncSettings(); };
  $('#sSndTest').onclick = () => { Snd.init(); sfx('test'); };
  $('#tcLapsB').onclick = () => { const L = [3, 5, 8, 12, 20]; S.laps = L[(L.indexOf(S.laps) + 1) % L.length]; saveS(); syncSettings(); refreshMenu(); sfx('ui'); };
  $('#tcWxB').onclick = () => { cycleWx(); refreshMenu(); };
  $('#tcCarsB').onclick = () => { S.n22 = !S.n22; saveS(); syncSettings(); refreshMenu(); toast(S.n22 ? '22 болида: у тебя есть напарник' : '11 болидов: по одному от команды'); sfx('ui'); };
  $('#rtHelp').onclick = () => memo('КАК СЧИТАЕТСЯ РЕЙТИНГ', RATING_MEMO); $('#memoClose').onclick = () => $('#memo').classList.add('hidden');
  document.addEventListener('click', e => { if (e.target.closest('.btn,.tg-card,.tcard,.tc-arrow,.toggle')) sfx('ui'); }, true);
  $('#lTw').oninput = e => { if (!Net.host) return; Net.o.tw = +e.target.value / 100; $('#lTwV').textContent = e.target.value + '%'; }; $('#lTw').onchange = () => { if (Net.host) bcastLobby(); };
  grip($('#mapGrip'), 'mapS', .6, 3, 110, () => [-1, 1]);
  grip($('#wheelGrip'), 'wheelS', .5, 2, 200, () => [S.lefty ? 1 : -1, -1]);
  $('#mapbox').addEventListener('wheel', e => { e.stopPropagation(); e.preventDefault(); S.mapS = clamp(S.mapS * (e.deltaY < 0 ? 1.06 : .94), .6, 3); applyUI(); saveS(); }, { passive: false });
  $('#sQuit').onclick = () => { $('#sheet').classList.add('hidden'); if (G.net) netClose(); startAttract(); if (Champ.on) openChamp(); };
  $('#sDiff').onclick = e => { const v = e.target.dataset.v; if (v != null) { S.diff = +v; saveS(); syncSettings(); } };
  $('#sLaps').onclick = e => { const v = e.target.dataset.v; if (v != null) { S.laps = +v; saveS(); syncSettings(); } };
  $('#sCtrl').onclick = e => { const v = e.target.dataset.v; if (v) { S.ctrl = v; saveS(); syncSettings(); } };
  const setTyres = v => { S.tyres = v; if (!v) S.weather = false; saveS(); syncSettings(); }, setWx = v => { S.weather = v; if (v) S.tyres = true; saveS(); syncSettings(); };
  $('#sTyres').onclick = () => setTyres(!S.tyres); $('#sWeather').onclick = () => setWx(!S.weather);
  $('#sWx').onclick = e => { const v = e.target.dataset.v; if (v != null) { S.wx = +v; saveS(); syncSettings(); } };
  const tq = () => { S.quali = !S.quali; saveS(); syncSettings(); refreshMenu(); }; $('#sQuali').onclick = tq; $('#mQuali').onclick = tq;
  $('#btnPractice').onclick = () => { Snd.init(); startPractice(); };
  $('#qGo').onclick = () => qGo();
  for (const [id, key] of [['lQ', 'q'], ['lB', 'b'], ['lT', 't'], ['lW', 'w'], ['lTm', 'tm']]) $('#' + id).onclick = () => { if (!Net.host) return; Net.o[key] = !Net.o[key]; if (key === 't' && !Net.o.t) Net.o.w = false; if (key === 'w' && Net.o.w) Net.o.t = true; if (key === 'tm' && !Net.o.tm) { const seen = new Set(); for (const p of Net.players) { if (seen.has(p.team)) p.team = TEAMS.findIndex((_, i) => !Net.players.some(q => q.team === i)); seen.add(p.team); } } bcastLobby(); };
  $('#specChip').onclick = () => { const st = standings(), i = st.indexOf(G.cars[G.follow]); G.follow = G.cars.indexOf(st[(i + 1) % st.length]); };
  $('#tgClose').onclick = () => $('#tgWarn').classList.add('hidden'); $('#tgCopy').onclick = () => { const u = location.origin + location.pathname + location.hash; (navigator.clipboard?.writeText(u) || Promise.reject()).then(() => toast('Ссылка скопирована, вставь её в Safari или Chrome'), () => toast(u)); };
  if (/Telegram/i.test(navigator.userAgent) || window.TelegramWebviewProxy || (window.Telegram && window.Telegram.WebView)) $('#tgWarn').classList.remove('hidden');
  $('#lWx').onclick = e => { const v = e.target.dataset.v; if (v != null && Net.host) { Net.o.m = +v; bcastLobby(); } };
  addEventListener('keydown', e => { let n = '1234'.indexOf(e.key); if (n < 0) n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (n < 0) n = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'].indexOf(e.code); if (n < 0) return; const box = !$('#pitSheet').classList.contains('hidden') ? '#pitCards' : !$('#tyrepick').classList.contains('hidden') ? '#tpCards' : null; if (box) { const b = $$(box + ' .tcard')[n]; if (b) b.click(); } });
  $('#sLeft').onclick = () => { S.lefty = !S.lefty; saveS(); syncSettings(); };
  $('#sSound').onclick = () => { S.sound = !S.sound; saveS(); syncSettings(); };
  $('#carCard').onclick = () => openGarage('solo');
  $('#btnRace').onclick = () => { Snd.init(); startSolo(); };
  $('#btnFriends').onclick = () => { $('#fName').value = S.name; show('friends'); };
  $('#fBack').onclick = () => {netClose();show('menu');};
  $('#btnHost').onclick = () => { S.name = $('#fName').value.trim(); saveS(); RT.setNick(S.name); hostLobby(); };
  $('#lBack').onclick = () => { netClose(); show('menu'); };
  $('#lCar').onclick = () => openGarage('lobby');
  $('#lCopy').onclick = () => { const url = location.origin + location.pathname + '#join=' + Net.code; (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast('Ссылка скопирована'), () => toast(url)); };
  $('#lLaps').onclick = e => { const v = e.target.dataset.v; if (v != null && Net.host) { Net.laps = +v; bcastLobby(); } };
  $('#lStart').onclick = () => { Snd.init(); hostStart(); };
  $('#lTrack').onclick = () => { if (Net.host) openTracks(true); };
  let pickT = 0; const pick = d => { S.track = TRK_ORDER[(TRK_ORDER.indexOf(S.track) + d + TRK.length) % TRK.length]; saveS(); refreshMenu(); clearTimeout(pickT); pickT = setTimeout(startAttract, 420); };
  $('#tcPrev').onclick = () => pick(-1); $('#tcNext').onclick = () => pick(1);
  $('#tcAll').onclick = () => openTracks(false); $('#trackThumb').onclick = () => openTracks(false); $('#tgClose').onclick = () => $('#tracks').classList.add('hidden');
  $('#tracks').onclick = e => { if (e.target.id === 'tracks') $('#tracks').classList.add('hidden'); };
  $('#rAgain').onclick = () => { if (Champ.on) { RP.stop(); rateRace(true); if (G.net) setTimeout(netClose, 400); startAttract(); openChamp(); return; } RP.stop(); rateRace(true); if (G.net === 'host') { bcast({ t: 'back' }); startAttract(); show('lobby'); renderLobby(); } else startSolo(); };
  $('#rNext').onclick = () => { RP.stop(); rateRace(true); if (G.net) setTimeout(netClose, 400); startAttract(); openChamp(); }; // the next round's card: practice, qualifying or straight to the race
  $('#rMenu').onclick = () => { RP.stop(); rateRace(true); if (G.net) setTimeout(netClose, 400); Champ.on = false; startAttract(); };
  $('#btnRating').onclick = () => RT.open();
  $('#btnChamp').onclick = () => { sfx('ui'); openChamp(); };
  $('#btnAuthors').onclick = () => { $('#authors').classList.remove('hidden'); fitUI(); }; $('#auClose').onclick = () => $('#authors').classList.add('hidden'); $('#authors').onclick = e => { if (e.target.id === 'authors') $('#authors').classList.add('hidden'); };
  $('#chBack').onclick = () => { Champ.on = false; show('menu'); };
  $('#chReset').onclick = () => { const C = S.ch; if (C && C.r > 0 && !$('#chReset').dataset.sure) { $('#chReset').dataset.sure = 1; $('#chReset').textContent = 'ТОЧНО? ОЧКИ ОБНУЛЯТСЯ'; setTimeout(() => { delete $('#chReset').dataset.sure; $('#chReset').textContent = 'НОВЫЙ СЕЗОН'; }, 3000); return; }
    delete $('#chReset').dataset.sure; $('#chReset').textContent = 'НОВЫЙ СЕЗОН'; const keep = C ? { mode: C.mode, cnt: C.cnt, sel: C.sel, pick: C.pick } : {}; S.ch = null; Object.assign(champ(), keep); champ().list = null; saveS(); renderChamp(); };
  seg('#chMode', v => { champ().mode = v; saveS(); renderChamp(); });
  const chSeg = (id, fn2) => { $(id).onclick = e => { const b = e.target.closest('button'); if (b && b.dataset.v != null) { fn2(b.dataset.v); saveS(); syncSettings(); renderChamp(); sfx('ui'); } }; };
  chSeg('#chLaps', v => { S.laps = +v; }); chSeg('#chCars', v => { S.n22 = v === '1'; }); chSeg('#chDiff', v => { S.diff = +v; }); chSeg('#chAssist', v => setAssist(v));
  chSeg('#chCnt', v => { const C = champ(); if (!chOpen(C)) return; C.cnt = +v; C.rnd = null; C.list = null; if (C.pick && C.pick.length > C.cnt) C.pick.length = C.cnt; });
  chSeg('#chSel', v => { const C = champ(); if (!chOpen(C)) return; C.sel = v; C.rnd = null; C.list = null; if (v === 'pick' && !(C.pick && C.pick.length)) C.pick = []; });

  $('#chInvite').onclick = () => champInvite();
  $('#chCal').onclick = e => { const b = e.target.closest('button'); const C = champ(); if (!b || !chOpen(C) || C.sel !== 'pick') return; const i = +b.dataset.i, P = C.pick || (C.pick = []), k = P.indexOf(i);
    if (k >= 0) P.splice(k, 1); else if (P.length < Math.min(C.cnt || 24, TRK.length)) P.push(i); else return toast('Уже выбрано ' + P.length + ' — сними какую-нибудь или увеличь число гонок');
    C.list = null; saveS(); renderChamp(); sfx('ui'); };
  $('#chTabs').onclick = e => { const b = e.target.closest('button'); if (b) { Champ.tab = b.dataset.v; renderChamp(); } };
  $('#chPrac').onclick = () => champRun('practice'); $('#chQ').onclick = () => champRun('quali'); $('#chGo').onclick = () => champRun('race');
  syncSettings();
}

/* =====================================================================
   LOOP
   ===================================================================== */
let last = performance.now(), accT = 0, resUpd = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (G.mode === 'attract' && !CFG && G.net === 'attract') {
    const interval = SCR === 'menu' || SCR === 'garage' ? 1000 / 30 : 100;
    if (now - last < interval - 1) return;
  }
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  readInput(dt); FX.pre(dt); sfx('tick', dt);
  if (G.mode === 'race' || G.mode === 'attract' || G.mode === 'lobbywait') {
    if (G.net === 'client' && G.mode === 'race') { applySnaps(); if (G.phase === 'race') { accT += dt; let n = 0; while (accT >= STEP && n++ < 8) { clientStep(STEP); accT -= STEP; } if (n >= 8) accT = 0; } }
    else if (!G.paused) { accT += dt; let n = 0; while (accT >= STEP && n++ < 8) { simStep(STEP); accT -= STEP; } if (n >= 8) accT = 0; }
    for (const c of G.cars) { c.rx = c.x; c.ry = c.y; c.rh = c.h; }
    { const f = G.cars[G.follow]; if (f && cam.shake > .3) { f.rx += rand(-1, 1) * cam.shake * .15; f.ry += rand(-1, 1) * cam.shake * .15; f.rh += rand(-1, 1) * cam.shake * .005; } }
    if (!G.paused && G.mode === 'race') RP.rec(dt);
    const cover = (G.mode === 'attract' && !!SCR && SCR !== 'menu') || G.pdOn; // behind a full menu panel the demo race draws at a third of the rate: the panel's own animation gets the time
    if (RP.on) RP.draw(dt); else { if (!G.paused) FX.effects(dt); camera(dt); if (!cover || (bgF++ % 3) === 0) FX.render(dt); }
    hud(dt); if (CFG && G.mode !== 'race') hudDemo(dt); netTick(dt); rateRace();
    if (G.resT > 0) { G.resT -= dt; if (G.resT <= 0) { if (G.sess === 'race' && G.cars.length >= 3 && !RP.on) showPodium(); else showResults(); } }
    if (!$('#results').classList.contains('hidden') && (resUpd -= dt) < 0) { resUpd = .5; renderResults(); }
  }
  if (!$('#garage').classList.contains('hidden')) drawGarage(dt);
}

/* hidden host tab: rAF stops, so keep the race running for everyone from a timer */
setInterval(() => {
  if (!document.hidden || G.net !== 'host' || G.mode !== 'race' || G.paused) return;
  const now = performance.now(), dt = Math.min(2, (now - last) / 1000); last = now;
  for (let n = Math.round(dt / STEP); n > 0; n--) simStep(STEP);
  for (const c of G.cars) { c.rx = c.x; c.ry = c.y; c.rh = c.h; }
  Net.sendT = 0; netTick(dt);
}, 250);

/* ---------- boot ---------- */
if (!S.v6) { S.v6 = 1; S.ctrl = isDesk ? 'arrows' : 'wheel'; S.weather = true; S.tyres = true; S.wx = 4; saveS(); }
if (!S.v7) { S.v7 = 1; S.art = 'photo'; S.weather = true; S.tyres = true; S.wx = 4; saveS(); } // photo liveries and an automatic sky by default
resize(); buildPatterns(ctx); buildSprites(); loadCarPNGs();
S.track = clamp(S.track | 0, 0, TRK.length - 1); G.track = getTrack(S.track);
wireUI(); FX.ui(); RT.ui();
const joinHash = /join=/i.test(location.hash);
startAttract();
if (joinHash) { show('friends'); const room=new URLSearchParams(location.hash.slice(1)).get('join'); if (/^[0-9a-f-]{36}$/.test(room)) joinLobby(room); }
document.fonts?.ready.then(() => { refreshMenu(); fitUI(); });
requestAnimationFrame(frame);
