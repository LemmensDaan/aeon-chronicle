/* Aeon - the climate model on the real Earth.

   Hands Earth's relief (tools/earth/earth-150x95.json, made by tools/earth-fetch.js) to the
   generator in place of its own terrain, runs the climate exactly as for a generated world, and
   compares every land cell with the observed climate (CRU CL 2.0 station normals, 1961-1990).
   It tests the climate model on its own: the terrain is right by construction, so whatever is
   off is the climate.

     node tools/earth-climate.js                5 seeds (the seed only moves the weather noise)
     node tools/earth-climate.js --seeds 1,2    chosen seeds
     node tools/earth-climate.js --no-png       numbers only

   Output in tools/out/earth/ (gitignored): summary.txt, metrics.json and maps (observed | model
   | difference) for temperature, seasonal range, rain, the summer share of rain and Koppen.

   Three Koppen maps are compared: the observed one by the standard rules on 12 observed months;
   the observed climate put through the model's own shortcut (annual mean, range and summer
   share, as planetgen.js classifies); and the model's. Observed-standard vs observed-shortcut
   is the classifier's error, observed-shortcut vs model the climate's. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const opt = (name) => { const k = args.indexOf(name); return k >= 0 ? args[k + 1] : null; };
const SEEDS = opt("--seeds") ? opt("--seeds").split(",").map(Number) : [1, 2, 3, 4, 5];
const PNG = !args.includes("--no-png");
const OUT = opt("--out") || path.join(__dirname, "out", "earth");
fs.mkdirSync(OUT, { recursive: true });

const EARTH = JSON.parse(fs.readFileSync(path.join(__dirname, "earth", "earth-150x95.json"), "utf8"));
const W = EARTH.W, H = EARTH.H, N = W * H;
if (W !== 150 || H !== 95) throw new Error("the Earth file is for a " + W + " x " + H + " grid");

/* ------------------------------------------------------------------ engine ---------- */
function loadEngine() {
  const ctx = { console: console, Math: Math, Date: Date };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ["js/rng.js", "js/core.js", "js/campaigns.js", "js/fastlayer.js", "js/tribes.js", "js/nudges.js", "js/planetgen.js", "js/worldgen.js", "packs/historical.js", "packs/fantasy.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return ctx.AEON;
}
const AEON = loadEngine();
AEON.planetgen.terrainIn = Float32Array.from(EARTH.hm);

/* ------------------------------------------------------------------ helpers -------- */
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const LAT = new Float32Array(N), AREA = new Float64Array(N);
for (let i = 0; i < N; i++) { LAT[i] = 75 - (((i / W) | 0) + 0.5) * 150 / H; AREA[i] = Math.cos(LAT[i] * Math.PI / 180); }
const lonOf = (x) => -180 + (x + 0.5) * 360 / W;
const cellAt = (lat, lon) => Math.min(H - 1, Math.floor((75 - lat) / (150 / H))) * W + Math.min(W - 1, Math.floor((((lon + 180) % 360) + 360) % 360 / (360 / W)));

/* weighted statistics of model - observed over a set of cells */
function stats(cells, mod, obs) {
  let sw = 0, sd = 0, sd2 = 0, sm = 0, so = 0;
  for (const i of cells) { const w = AREA[i], d = mod[i] - obs[i]; sw += w; sd += w * d; sd2 += w * d * d; sm += w * mod[i]; so += w * obs[i]; }
  const mm = sm / sw, mo = so / sw;
  let cov = 0, vm_ = 0, vo = 0;
  for (const i of cells) { const w = AREA[i], a = mod[i] - mm, b = obs[i] - mo; cov += w * a * b; vm_ += w * a * a; vo += w * b * b; }
  return { bias: sd / sw, rmse: Math.sqrt(sd2 / sw), r: cov / Math.sqrt(vm_ * vo), model: mm, obs: mo, n: cells.length };
}
const BANDS = [[-75, -45], [-45, -30], [-30, -15], [-15, 0], [0, 15], [15, 30], [30, 45], [45, 60], [60, 75]];
const bandName = (b) => (b[0] < 0 ? -b[1] + "-" + -b[0] + "S" : b[0] + "-" + b[1] + "N");

/* ------------------------------------------------------------------ Koppen ---------- */
/* the standard rules (Koppen-Geiger as in Peel et al. 2007, with Koppen's -3 C between C and D,
   as planetgen uses) on 12 months; summer is April-September in the north */
function koppenMonthly(t, p, lat) {
  const MAT = t.reduce((s, v) => s + v, 0) / 12, MAP = p.reduce((s, v) => s + v, 0);
  const Thot = Math.max(...t), Tcold = Math.min(...t);
  const sumIdx = lat >= 0 ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
  const winIdx = lat >= 0 ? [9, 10, 11, 0, 1, 2] : [3, 4, 5, 6, 7, 8];
  const Ps = sumIdx.reduce((s, k) => s + p[k], 0), Pw = MAP - Ps;
  const Pdry = Math.min(...p), Psdry = Math.min(...sumIdx.map((k) => p[k])), Pwdry = Math.min(...winIdx.map((k) => p[k]));
  const Pswet = Math.max(...sumIdx.map((k) => p[k])), Pwwet = Math.max(...winIdx.map((k) => p[k]));
  if (Thot < 10) return Thot < 0 ? "EF" : "ET";
  const pth = 20 * MAT + (Ps >= 0.7 * MAP ? 280 : Pw >= 0.7 * MAP ? 0 : 140);
  if (MAP < pth) return (MAP < pth / 2 ? "BW" : "BS") + (MAT >= 18 ? "h" : "k");
  if (Tcold >= 18) return Pdry >= 60 ? "Af" : Pdry >= 100 - MAP / 25 ? "Am" : Psdry < Pwdry ? "As" : "Aw";
  const second = Psdry < 40 && Psdry < Pwwet / 3 ? "s" : Pwdry < Pswet / 10 ? "w" : "f";
  const warm10 = t.filter((v) => v >= 10).length;
  const third = Thot >= 22 ? "a" : warm10 >= 4 ? "b" : Tcold < -38 ? "d" : "c";
  return (Tcold > -3 ? "C" : "D") + second + third;
}
/* planetgen's shortcut (finish(), koppen()): annual mean, half the range, rain and its summer
   share; copied here so observed data can be put through it */
function koppenShortcut(c, amp, mm, ps) {
  const warm = c + amp, cold = c - amp, sumMm = mm * ps, winMm = mm - sumMm;
  if (warm < 10) return warm < 0 ? "EF" : "ET";
  const pth = 20 * c + (ps >= 0.7 ? 280 : ps <= 0.3 ? 0 : 140);
  if (mm < pth) return (mm < pth / 2 ? "BW" : "BS") + (c >= 18 ? "h" : "k");
  const swing = Math.abs(sumMm - winMm) * Math.PI / 24, dryMonth = Math.max(0, mm / 12 - swing), wetMonth = mm / 12 + swing;
  if (cold >= 18) return dryMonth >= 60 ? "Af" : dryMonth >= 100 - mm / 25 ? "Am" : ps >= 0.5 ? "Aw" : "As";
  const second = ps < 0.5 && dryMonth < 40 && dryMonth < wetMonth / 3 ? "s" : ps > 0.5 && dryMonth < wetMonth / 10 ? "w" : "f";
  const third = warm >= 22 ? "a" : c + amp / 2 >= 10 ? "b" : cold < -38 ? "d" : "c";
  return (cold > -3 ? "C" : "D") + second + third;
}
/* As and Aw are one class in most Koppen maps */
const kNorm = (k) => (k === "As" ? "Aw" : k);

/* ------------------------------------------------------------------ observed -------- */
const obs = { T: new Float32Array(N), range: new Float32Array(N), P: new Float32Array(N), pSum: new Float32Array(N), k: new Array(N).fill(null), kShort: new Array(N).fill(null), has: new Uint8Array(N) };
for (let i = 0; i < N; i++) {
  if (EARTH.hm[i] <= 0 || EARTH.cruN[i] < 30 || EARTH.tMon[0][i] == null || EARTH.pMon[0][i] == null) continue;
  const t = EARTH.tMon.map((m) => m[i]), p = EARTH.pMon.map((m) => m[i]);
  const MAT = t.reduce((s, v) => s + v, 0) / 12, MAP = p.reduce((s, v) => s + v, 0);
  const sumIdx = LAT[i] >= 0 ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
  obs.T[i] = MAT; obs.range[i] = Math.max(...t) - Math.min(...t); obs.P[i] = MAP;
  obs.pSum[i] = MAP > 0 ? sumIdx.reduce((s, k) => s + p[k], 0) / MAP : 0.5;
  obs.k[i] = koppenMonthly(t, p, LAT[i]);
  obs.kShort[i] = koppenShortcut(MAT, obs.range[i] / 2, MAP, obs.pSum[i]);
  obs.has[i] = 1;
}

/* a yardstick: every land cell given the observed mean climate of its own row (latitude alone,
   no continents, coasts or mountains). A model that knows geography should beat it. */
function zonalBaseline() {
  const tM = [], pM = [];
  for (let m = 0; m < 12; m++) {
    const t = new Float64Array(H), p = new Float64Array(H), c = new Float64Array(H);
    for (let i = 0; i < N; i++) if (obs.has[i]) { const y = (i / W) | 0; t[y] += EARTH.tMon[m][i]; p[y] += EARTH.pMon[m][i]; c[y]++; }
    for (let y = 0; y < H; y++) { t[y] = c[y] ? t[y] / c[y] : NaN; p[y] = c[y] ? p[y] / c[y] : NaN; }
    tM.push(t); pM.push(p);
  }
  const b = { T: new Float32Array(N), range: new Float32Array(N), P: new Float32Array(N), pSum: new Float32Array(N), k: new Array(N).fill(null), land: new Uint8Array(N), seam: 0 };
  for (let i = 0; i < N; i++) {
    if (!obs.has[i]) continue;
    const y = (i / W) | 0, t = tM.map((a) => a[y]), p = pM.map((a) => a[y]);
    const sumIdx = LAT[i] >= 0 ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2], MAP = p.reduce((s, v) => s + v, 0);
    b.land[i] = 1; b.T[i] = t.reduce((s, v) => s + v, 0) / 12; b.range[i] = Math.max(...t) - Math.min(...t); b.P[i] = MAP;
    b.pSum[i] = sumIdx.reduce((s, k) => s + p[k], 0) / MAP; b.k[i] = koppenMonthly(t, p, LAT[i]);
  }
  return b;
}

/* ------------------------------------------------------------------ the model ------- */
function runModel(seed) {
  const world = AEON.createWorld({ packId: "historical", seed: seed });
  const g = world._gen, R = world.regions;
  const m = { T: new Float32Array(N), range: new Float32Array(N), P: new Float32Array(N), pSum: new Float32Array(N), k: new Array(N).fill(null), land: new Uint8Array(N), lake: new Uint8Array(N), SST: new Float32Array(N), seam: world.seamShift };
  for (let i = 0; i < N; i++) {
    const r = R[i];
    m.land[i] = g.E[i] > 0.5 ? 1 : 0;
    m.lake[i] = r.lake ? 1 : 0;
    m.SST[i] = -22.4 + 55.6 * g.T[i];
    if (!m.land[i]) continue;
    m.T[i] = r.tempC; m.range[i] = r.warmC - r.coldC; m.P[i] = r.rainMm; m.pSum[i] = r.summerRain; m.k[i] = r.climate;
  }
  return m;
}

function measure(m) {
  const cells = [], cellsK = [];
  for (let i = 0; i < N; i++) if (obs.has[i] && m.land[i]) { cells.push(i); if (m.k[i]) cellsK.push(i); }
  const out = { cells: cells.length };
  out.T = stats(cells, m.T, obs.T);
  out.range = stats(cells, m.range, obs.range);
  const lm = new Float32Array(N), lo = new Float32Array(N);
  for (const i of cells) { lm[i] = Math.log10(m.P[i] + 10); lo[i] = Math.log10(obs.P[i] + 10); }
  out.logP = stats(cells, lm, lo);
  out.P = stats(cells, m.P, obs.P);
  /* rain: share of land within a factor of 2, too wet, too dry */
  let a2 = 0, wet = 0, dry = 0, aw = 0;
  for (const i of cells) { const q = (m.P[i] + 10) / (obs.P[i] + 10), w = AREA[i]; aw += w; if (q <= 2 && q >= 0.5) a2 += w; else if (q > 2) wet += w; else dry += w; }
  out.rainWithin2 = 100 * a2 / aw; out.rainTooWet = 100 * wet / aw; out.rainTooDry = 100 * dry / aw;
  out.pSum = stats(cells, m.pSum, obs.pSum);
  out.bands = BANDS.map((b) => {
    const c = cells.filter((i) => LAT[i] >= b[0] && LAT[i] < b[1]);
    if (!c.length) return null;
    const t = stats(c, m.T, obs.T), rg = stats(c, m.range, obs.range), p = stats(c, m.P, obs.P);
    return { band: bandName(b), cells: c.length, Tobs: r1(t.obs), Tmod: r1(t.model), rangeObs: r1(rg.obs), rangeMod: r1(rg.model), Pobs: Math.round(p.obs), Pmod: Math.round(p.model) };
  }).filter(Boolean);
  /* Koppen agreement, by area */
  const agree = (fa, fb, n) => { let s = 0, t = 0; for (const i of cellsK) { if (!fa(i) || !fb(i)) continue; t += AREA[i]; if (fa(i).slice(0, n) === fb(i).slice(0, n)) s += AREA[i]; } return 100 * s / t; };
  const K = (i) => obs.k[i] && kNorm(obs.k[i]), KS = (i) => obs.kShort[i] && kNorm(obs.kShort[i]), KM = (i) => m.k[i] && kNorm(m.k[i]);
  out.koppen = {
    modelVsObs: { group: agree(KM, K, 1), two: agree(KM, K, 2), full: agree(KM, K, 3) },
    shortcutVsObs: { group: agree(KS, K, 1), two: agree(KS, K, 2), full: agree(KS, K, 3) },
    modelVsShortcut: { group: agree(KM, KS, 1), two: agree(KM, KS, 2), full: agree(KM, KS, 3) },
  };
  /* group shares and the confusion of the groups (rows observed, columns model), % of area */
  const G = "ABCDE", conf = {}, shO = {}, shM = {};
  let tot = 0;
  for (const o of G) { conf[o] = {}; for (const c of G) conf[o][c] = 0; shO[o] = 0; shM[o] = 0; }
  for (const i of cellsK) { const o = obs.k[i][0], c = m.k[i][0], w = AREA[i]; conf[o][c] += w; shO[o] += w; shM[c] += w; tot += w; }
  for (const o of G) { shO[o] = r1(100 * shO[o] / tot); shM[o] = r1(100 * shM[o] / tot); for (const c of G) conf[o][c] = r1(100 * conf[o][c] / tot); }
  out.koppenShares = { observed: shO, model: shM };
  out.koppenConfusion = conf;
  /* land and sea: does the grid's coast match? */
  let both = 0, onlyObs = 0, onlyMod = 0;
  for (let i = 0; i < N; i++) { const a = EARTH.hm[i] > 0, b = m.land[i] === 1; if (a && b) both++; else if (a) onlyObs++; else if (b) onlyMod++; }
  out.landMask = { both: both, earthOnly: onlyObs, modelOnly: onlyMod, seam: m.seam };
  return out;
}

/* places to read off by hand */
const PLACES = [
  ["London", 51.5, -0.1], ["Moscow", 55.8, 37.6], ["Yakutsk", 62.0, 129.7], ["Cairo", 30.0, 31.2], ["Accra", 5.6, -0.2],
  ["Manaus", -3.1, -60.0], ["Mumbai", 19.1, 72.9], ["Beijing", 39.9, 116.4], ["Chicago", 41.9, -87.6], ["Seattle", 47.6, -122.3],
  ["Perth", -31.9, 115.9], ["Sydney", -33.9, 151.2], ["Lima", -12.0, -77.0], ["Nairobi", -1.3, 36.8], ["Madrid", 40.4, -3.7],
  ["Kolkata", 22.6, 88.4], ["Alice Springs", -23.7, 133.9], ["Winnipeg", 49.9, -97.1],
];

/* ------------------------------------------------------------------ run ------------- */
const runs = [];
let first = null;
const t0 = Date.now();
for (const seed of SEEDS) {
  const m = runModel(seed);
  if (!first) first = m;
  runs.push({ seed: seed, m: measure(m) });
  process.stdout.write(".");
}
console.log(" " + SEEDS.length + " runs in " + ((Date.now() - t0) / 1000).toFixed(1) + " s");

const base = measure(zonalBaseline());
const med = (f) => { const v = runs.map((r) => f(r.m)).sort((a, b) => a - b); return v[(v.length / 2) | 0]; };
const rng = (f) => { const v = runs.map((r) => f(r.m)); return [Math.min(...v), Math.max(...v)]; };
const fmt = (f, d) => { const [a, b] = rng(f), p = (v) => v.toFixed(d == null ? 1 : d); return p(med(f)) + (runs.length > 1 ? " (" + p(a) + " to " + p(b) + ")" : ""); };

const L = [];
const m0 = runs[0].m;
L.push("Aeon climate model on the real Earth - " + new Date().toISOString().slice(0, 10));
L.push("Terrain: ETOPO1 on the 150 x 95 grid. Observed: CRU CL 2.0 (1961-1990 normals). Seeds " + SEEDS.join(", ") + " (they only move the weather noise).");
L.push("Compared: " + m0.cells + " land cells that are land in both and hold >= 30 CRU points. Area-weighted. Median over seeds (range).");
L.push("Land mask: " + m0.landMask.both + " cells land in both, " + m0.landMask.earthOnly + " land only on Earth (became lake or sea), " + m0.landMask.modelOnly + " only in the model; seam shift " + m0.landMask.seam + ".");
L.push("");
L.push("ANNUAL MEAN TEMPERATURE (C)    bias " + fmt((m) => m.T.bias) + "   RMSE " + fmt((m) => m.T.rmse) + "   r " + fmt((m) => m.T.r, 3));
L.push("SEASONAL RANGE (warm-cold month) bias " + fmt((m) => m.range.bias) + "   RMSE " + fmt((m) => m.range.rmse) + "   r " + fmt((m) => m.range.r, 3));
L.push("ANNUAL RAIN (mm)               mean model " + fmt((m) => m.P.model, 0) + " vs observed " + r1(m0.P.obs).toFixed(0) + "   r(log) " + fmt((m) => m.logP.r, 3) + "   r " + fmt((m) => m.P.r, 3));
L.push("  land within a factor 2: " + fmt((m) => m.rainWithin2) + "%   too wet (>2x): " + fmt((m) => m.rainTooWet) + "%   too dry (<0.5x): " + fmt((m) => m.rainTooDry) + "%");
L.push("SUMMER SHARE OF RAIN           bias " + fmt((m) => m.pSum.bias, 2) + "   RMSE " + fmt((m) => m.pSum.rmse, 2) + "   r " + fmt((m) => m.pSum.r, 3));
L.push("");
L.push("KOPPEN AGREEMENT (% of land area)      group (1st letter) / 2 letters / full");
const kl = (name, key) => L.push("  " + name.padEnd(38) + fmt((m) => m.koppen[key].group) + " / " + fmt((m) => m.koppen[key].two) + " / " + fmt((m) => m.koppen[key].full));
kl("model vs observed", "modelVsObs");
kl("observed via the shortcut vs observed", "shortcutVsObs");
kl("model vs observed via the shortcut", "modelVsShortcut");
L.push("  (the 2nd line is the classifier's own error; the 3rd the climate's)");
L.push("");
L.push("YARDSTICK: each cell given its latitude row's observed mean climate (no geography)");
L.push("  temperature RMSE " + r1(base.T.rmse) + " C (r " + base.T.r.toFixed(3) + ");  range RMSE " + r1(base.range.rmse) + " C (r " + base.range.r.toFixed(3) + ");  rain r(log) " + base.logP.r.toFixed(3) +
  ", within a factor 2 " + r1(base.rainWithin2) + "%;  summer share r " + base.pSum.r.toFixed(3) + ";  Koppen " + r1(base.koppen.modelVsObs.group) + " / " + r1(base.koppen.modelVsObs.two) + " / " + r1(base.koppen.modelVsObs.full));
L.push("");
L.push("KOPPEN GROUPS, % of land (seed " + SEEDS[0] + ")   observed -> model");
for (const g of "ABCDE") L.push("  " + g + "  " + String(m0.koppenShares.observed[g]).padStart(5) + " -> " + String(m0.koppenShares.model[g]).padStart(5));
L.push("  confusion, rows observed, columns model (% of land):");
L.push("        A      B      C      D      E");
for (const o of "ABCDE") L.push("  " + o + " " + "ABCDE".split("").map((c) => String(m0.koppenConfusion[o][c]).padStart(6)).join(" "));
L.push("");
L.push("BY LATITUDE (seed " + SEEDS[0] + ")   T obs/model   range obs/model   rain obs/model (mm)");
for (const b of m0.bands) L.push("  " + b.band.padEnd(8) + String(b.cells).padStart(5) + " cells   " + (b.Tobs + " / " + b.Tmod).padEnd(14) + (b.rangeObs + " / " + b.rangeMod).padEnd(17) + b.Pobs + " / " + b.Pmod);
L.push("");
L.push("PLACES (seed " + SEEDS[0] + ", the grid cell holding the place)");
L.push("  place           T obs/model    range obs/model   rain obs/model   summer share   Koppen obs/model");
for (const [name, lat, lon] of PLACES) {
  const i = cellAt(lat, lon);
  if (!obs.has[i] || !first.land[i]) { L.push("  " + name.padEnd(15) + " (sea or no data in its cell)"); continue; }
  L.push("  " + name.padEnd(15) + (r1(obs.T[i]) + " / " + r1(first.T[i])).padEnd(15) + (r1(obs.range[i]) + " / " + r1(first.range[i])).padEnd(18) +
    (Math.round(obs.P[i]) + " / " + Math.round(first.P[i])).padEnd(17) + (r2(obs.pSum[i]) + " / " + r2(first.pSum[i])).padEnd(15) + obs.k[i] + " / " + first.k[i]);
}
const summary = L.join("\n");
console.log(summary);
fs.writeFileSync(path.join(OUT, "summary.txt"), summary + "\n");
fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(runs, null, 1));

/* ------------------------------------------------------------------ maps ------------ */
if (PNG) {
  const S = 4, MW = W * S, MH = H * S, GAP = 6, TOP = 18;
  const OCEAN = [38, 52, 72], NODATA = [70, 70, 70];
  function Img(w, h, bg) {
    const d = new Uint8Array(w * h * 3).fill(0);
    const img = { w: w, h: h, d: d };
    img.set = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const k = (y * w + x) * 3; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; };
    img.rect = (x, y, rw, rh, c) => { for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) img.set(xx, yy, c); };
    if (bg) img.rect(0, 0, w, h, bg);
    return img;
  }
  const GLYPH = {
    A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", F: "111100110100100",
    G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
    M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100", Q: "010101101110011", R: "110101110101101",
    S: "011100010001110", T: "111010010010010", U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
    Y: "101101010010010", Z: "111001010100111", 0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110",
    4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
    "-": "000000111000000", ".": "000000000000010", "%": "101001010100101", ":": "000010000010000", "/": "001001010100100",
    "(": "010100100100010", ")": "010001001001010", ",": "000000000010100", "+": "000010111010000", " ": "000000000000000",
  };
  const text = (img, x, y, s, c) => { for (const ch of String(s).toUpperCase()) { const gl = GLYPH[ch] || GLYPH[" "]; for (let k = 0; k < 15; k++) if (gl[k] === "1") img.rect(x + (k % 3) * 2, y + ((k / 3) | 0) * 2, 2, 2, c); x += 8; } };
  const CRC = (function () { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function savePNG(img, file) {
    const raw = Buffer.alloc((img.w * 3 + 1) * img.h);
    for (let y = 0; y < img.h; y++) Buffer.from(img.d.buffer, y * img.w * 3, img.w * 3).copy(raw, y * (img.w * 3 + 1) + 1);
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 2;
    fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
  }
  const ramp = (stops, v) => {
    if (v <= stops[0][0]) return stops[0][1];
    for (let k = 1; k < stops.length; k++) if (v <= stops[k][0]) { const [a, ca] = stops[k - 1], [b, cb] = stops[k], t = (v - a) / (b - a); return ca.map((c, j) => Math.round(c + (cb[j] - c) * t)); }
    return stops[stops.length - 1][1];
  };
  const TEMP = [[-30, [60, 40, 140]], [-15, [70, 110, 210]], [0, [190, 225, 245]], [10, [250, 240, 170]], [20, [245, 160, 70]], [30, [180, 30, 30]]];
  const RANGE = [[0, [250, 250, 220]], [10, [250, 210, 120]], [25, [230, 120, 60]], [40, [170, 40, 70]], [60, [80, 20, 90]]];
  const DIFF = [[-1, [40, 80, 200]], [-0.5, [130, 170, 235]], [0, [245, 245, 245]], [0.5, [240, 160, 120]], [1, [190, 40, 40]]];
  const RAIN = [[1.7, [150, 90, 40]], [2.4, [220, 190, 110]], [2.8, [190, 220, 120]], [3.1, [70, 170, 80]], [3.5, [30, 110, 160]], [3.7, [40, 50, 140]]];
  const SUMMER = [[0.1, [200, 120, 40]], [0.3, [240, 210, 120]], [0.5, [245, 245, 245]], [0.7, [130, 190, 230]], [0.9, [30, 80, 170]]];
  const KCOL = (function () {
    const src = fs.readFileSync(path.join(ROOT, "js", "pixelmap.js"), "utf8"), out = {}, re = /(\w+): \["(#[0-9a-f]{6})"/g;
    const block = src.slice(src.indexOf("const KOPPEN = {"), src.indexOf("AEON.koppen = KOPPEN"));
    let mt; while ((mt = re.exec(block))) out[mt[1]] = [1, 3, 5].map((k) => parseInt(mt[2].slice(k, k + 2), 16));
    return out;
  })();

  /* three panels side by side: observed, model, and a third (usually the difference) */
  function sheet(name, title, panels) {
    const img = Img(3 * MW + 2 * GAP, MH + TOP, [20, 20, 20]);
    panels.forEach(function (p, k) {
      const ox = k * (MW + GAP);
      for (let i = 0; i < N; i++) {
        const x = i % W, y = (i / W) | 0;
        const c = p.f(i);
        img.rect(ox + x * S, TOP + y * S, S, S, c || (first.land[i] ? NODATA : OCEAN));
      }
      text(img, ox + 4, 3, p.label, [235, 235, 235]);
    });
    text(img, 3 * MW + 2 * GAP - 8 * title.length - 4, 3, title, [160, 160, 160]);
    savePNG(img, path.join(OUT, name + ".png"));
  }
  const ok = (i) => obs.has[i] && first.land[i];
  sheet("earth-temperature", "annual mean C", [
    { label: "observed (CRU)", f: (i) => (ok(i) ? ramp(TEMP, obs.T[i]) : null) },
    { label: "model", f: (i) => (first.land[i] ? ramp(TEMP, first.T[i]) : null) },
    { label: "model - observed (+-10 C)", f: (i) => (ok(i) ? ramp(DIFF, (first.T[i] - obs.T[i]) / 10) : null) },
  ]);
  sheet("earth-range", "warmest - coldest month C", [
    { label: "observed", f: (i) => (ok(i) ? ramp(RANGE, obs.range[i]) : null) },
    { label: "model", f: (i) => (first.land[i] ? ramp(RANGE, first.range[i]) : null) },
    { label: "model - observed (+-20 C)", f: (i) => (ok(i) ? ramp(DIFF, (first.range[i] - obs.range[i]) / 20) : null) },
  ]);
  sheet("earth-rain", "annual rain, log scale", [
    { label: "observed", f: (i) => (ok(i) ? ramp(RAIN, Math.log10(obs.P[i] + 10)) : null) },
    { label: "model", f: (i) => (first.land[i] ? ramp(RAIN, Math.log10(first.P[i] + 10)) : null) },
    { label: "model / observed (1/4 to 4x)", f: (i) => (ok(i) ? ramp(DIFF, Math.log((first.P[i] + 10) / (obs.P[i] + 10)) / Math.log(4)) : null) },
  ]);
  sheet("earth-summer-rain", "share of rain in summer half", [
    { label: "observed", f: (i) => (ok(i) ? ramp(SUMMER, obs.pSum[i]) : null) },
    { label: "model", f: (i) => (first.land[i] ? ramp(SUMMER, first.pSum[i]) : null) },
    { label: "model - observed (+-0.4)", f: (i) => (ok(i) ? ramp(DIFF, (first.pSum[i] - obs.pSum[i]) / 0.4) : null) },
  ]);
  const kc = (k) => (k ? KCOL[k] || [255, 0, 255] : null);
  sheet("earth-koppen", "koppen", [
    { label: "observed, 12 months", f: (i) => (ok(i) ? kc(obs.k[i]) : null) },
    { label: "model", f: (i) => (first.land[i] ? kc(first.k[i]) : null) },
    { label: "exact / same group / differs", f: (i) => (ok(i) && first.k[i] ? (first.k[i][0] === obs.k[i][0] ? (kNorm(first.k[i]) === kNorm(obs.k[i]) ? [60, 170, 80] : [170, 210, 120]) : [200, 60, 60]) : null) },
  ]);
  console.log("maps in " + path.relative(process.cwd(), OUT));
}
