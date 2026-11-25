/* Aeon - realism suite: many generated worlds against the real Earth, variable by variable.

   Generates N worlds (terrain and climate only, no history), measures some 35 variables on each,
   and measures the same variables on the real Earth (tools/earth/earth-150x95.json: ETOPO1
   relief, CRU CL 2.0 climate). Earth is one draw from all possible Earths, so it need not sit
   at the middle of the worlds' spread, but it should sit inside it: a variable where Earth falls
   outside the worlds' 2.5-97.5% range is flagged.

     node tools/realism-suite.js                     100 seeds from 20001
     node tools/realism-suite.js --n 30 --from 1     30 seeds from 1

   Output in tools/out/suite/ (gitignored): summary.txt, metrics.json and report.html (a bell
   curve per variable: the worlds' histogram, a normal curve with their mean and spread, and
   Earth's value as a line). */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { koppenMonthly } = require("./lib/koppen");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const opt = (name) => { const k = args.indexOf(name); return k >= 0 ? args[k + 1] : null; };
const NSEEDS = +(opt("--n") || 100), FROM = +(opt("--from") || 20001);
const OUT = opt("--out") || path.join(__dirname, "out", "suite");
fs.mkdirSync(OUT, { recursive: true });

function loadEngine() {
  const ctx = { console: console, Math: Math, Date: Date };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ["js/rng.js", "js/core.js", "js/campaigns.js", "js/fastlayer.js", "js/tribes.js", "js/nudges.js", "js/planetgen.js", "js/worldgen.js", "packs/historical.js", "packs/fantasy.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  return ctx.AEON;
}
const AEON = loadEngine();
const EARTH = JSON.parse(fs.readFileSync(path.join(__dirname, "earth", "earth-150x95.json"), "utf8"));
const W = 150, H = 95, N = W * H;
const LAT = new Float32Array(N), AREA = new Float64Array(N);
for (let i = 0; i < N; i++) { LAT[i] = 75 - (((i / W) | 0) + 0.5) * 150 / H; AREA[i] = Math.cos(LAT[i] * Math.PI / 180); }
const wx = (x) => ((x % W) + W) % W;

/* ------------------------------------------------------------------ the variables --- */
/* one planet as seen by the measures: land(i), hm(i) metres, and for land cells with a climate
   clim(i) true and tC, range, mm, ps (summer share of rain), k (Koppen) */
const VARS = [];
const v = (key, group, label, unit, f) => VARS.push({ key, group, label, unit, f });

function measure(P) {
  const out = {};
  let tot = 0, landA = 0, ocA = 0;
  for (let i = 0; i < N; i++) { tot += AREA[i]; if (P.land(i)) landA += AREA[i]; else ocA += AREA[i]; }
  /* terrain */
  out.landPct = 100 * landA / tot;
  {
    const seen = new Int32Array(N).fill(-1), sizes = [];
    for (let i = 0; i < N; i++) {
      if (!P.land(i) || seen[i] >= 0) continue;
      const q = [i]; seen[i] = sizes.length; let a = 0;
      for (let h = 0; h < q.length; h++) {
        const c = q[h], x = c % W, y = (c / W) | 0; a += AREA[c];
        for (const n of [y * W + wx(x + 1), y * W + wx(x - 1), y > 0 ? c - W : -1, y < H - 1 ? c + W : -1])
          if (n >= 0 && P.land(n) && seen[n] < 0) { seen[n] = sizes.length; q.push(n); }
      }
      sizes.push(a);
    }
    sizes.sort((a, b) => b - a);
    out.largestLandmassPct = 100 * (sizes[0] || 0) / landA;
    out.landmassesOver1Pct = sizes.filter((s) => s > 0.01 * landA).length;
  }
  let shelf = 0, deep = 0, landH = 0, hi = 0, low = 0;
  const hs = [];
  for (let i = 0; i < N; i++) {
    const h = P.hm(i);
    if (P.land(i)) { landH += AREA[i] * Math.max(0, h); if (h > 2000) hi += AREA[i]; if (h < 200) low += AREA[i]; hs.push([h, AREA[i]]); }
    else { if (h > -200) shelf += AREA[i]; deep += AREA[i] * h; }
  }
  out.shelfPctOfOcean = 100 * shelf / ocA;
  out.oceanMeanDepthM = -deep / ocA;
  out.landMeanM = landH / landA;
  out.landAbove2000Pct = 100 * hi / landA;
  out.landUnder200Pct = 100 * low / landA;

  /* climate over land with a climate */
  const C = [];
  for (let i = 0; i < N; i++) if (P.land(i) && P.clim(i)) C.push(i);
  const wmean = (cells, f) => { let s = 0, a = 0; for (const i of cells) { s += AREA[i] * f(i); a += AREA[i]; } return a ? s / a : NaN; };
  const wshare = (cells, f) => 100 * wmean(cells, (i) => (f(i) ? 1 : 0));
  const wmed = (cells, f) => { const a = cells.map((i) => [f(i), AREA[i]]).sort((x, y) => x[0] - y[0]); let t = 0; for (const e of a) t += e[1]; let c = 0; for (const e of a) { c += e[1]; if (c >= t / 2) return e[0]; } return NaN; };
  const bandC = (lo, hi) => C.filter((i) => Math.abs(LAT[i]) >= lo && Math.abs(LAT[i]) < hi);
  out.landMeanC = wmean(C, P.tC);
  for (const [lo, hi] of [[0, 15], [15, 30], [30, 45], [45, 60], [60, 75]]) {
    const b = bandC(lo, hi);
    out["T" + lo + "_" + hi] = b.length ? wmean(b, P.tC) : NaN;
    out["P" + lo + "_" + hi] = b.length ? wmean(b, P.mm) : NaN;
  }
  out.rangeMeanC = wmean(C, P.range);
  out.range45_75 = wmean(bandC(45, 75), P.range);
  out.rainMeanMm = wmean(C, P.mm);
  out.rainMedianMm = wmed(C, P.mm);
  out.aridPct = wshare(C, (i) => P.mm(i) < 250);
  out.wetPct = wshare(C, (i) => P.mm(i) > 1500);
  out.summerShare = wmean(bandC(15, 75), P.ps);
  /* west and east coasts, 35-60 degrees: the sea on the cell's west (one or two cells) and land
     to its east, or the other way round */
  const west = [], east = [];
  for (const i of bandC(35, 60)) {
    const x = i % W, y = (i / W) | 0, at = (dx) => y * W + wx(x + dx);
    const seaW = !P.land(at(-1)) || !P.land(at(-2)), seaE = !P.land(at(1)) || !P.land(at(2));
    if (seaW && !seaE && P.land(at(1))) west.push(i);
    if (seaE && !seaW && P.land(at(-1))) east.push(i);
  }
  out.westCoastMm = west.length ? wmean(west, P.mm) : NaN;
  out.eastCoastMm = east.length ? wmean(east, P.mm) : NaN;
  for (const g of "ABCDE") out["koppen" + g] = wshare(C, (i) => P.k(i)[0] === g);
  out.koppenCs = wshare(C, (i) => /^Cs/.test(P.k(i)));
  out.koppenDw = wshare(C, (i) => /^[CD]w/.test(P.k(i)));
  return out;
}

v("landPct", "Terrain", "Land, % of surface", "%");
v("largestLandmassPct", "Terrain", "Largest landmass, % of land", "%");
v("landmassesOver1Pct", "Terrain", "Landmasses over 1% of land", "");
v("shelfPctOfOcean", "Terrain", "Shelf (< 200 m deep), % of ocean", "%");
v("oceanMeanDepthM", "Terrain", "Mean ocean depth", "m");
v("landMeanM", "Terrain", "Mean land height", "m");
v("landAbove2000Pct", "Terrain", "Land above 2,000 m", "%");
v("landUnder200Pct", "Terrain", "Land under 200 m", "%");
v("landMeanC", "Temperature", "Land mean temperature", "C");
v("T0_15", "Temperature", "Land temperature 0-15 deg", "C");
v("T15_30", "Temperature", "Land temperature 15-30 deg", "C");
v("T30_45", "Temperature", "Land temperature 30-45 deg", "C");
v("T45_60", "Temperature", "Land temperature 45-60 deg", "C");
v("T60_75", "Temperature", "Land temperature 60-75 deg", "C");
v("rangeMeanC", "Temperature", "Seasonal range, land mean", "C");
v("range45_75", "Temperature", "Seasonal range 45-75 deg", "C");
v("rainMeanMm", "Rain", "Land rain, mean", "mm");
v("rainMedianMm", "Rain", "Land rain, median", "mm");
v("P0_15", "Rain", "Land rain 0-15 deg", "mm");
v("P15_30", "Rain", "Land rain 15-30 deg", "mm");
v("P30_45", "Rain", "Land rain 30-45 deg", "mm");
v("P45_60", "Rain", "Land rain 45-60 deg", "mm");
v("P60_75", "Rain", "Land rain 60-75 deg", "mm");
v("aridPct", "Rain", "Land under 250 mm", "%");
v("wetPct", "Rain", "Land over 1,500 mm", "%");
v("summerShare", "Rain", "Summer share of rain, 15-75 deg", "");
v("westCoastMm", "Rain", "West coasts 35-60 deg, rain", "mm");
v("eastCoastMm", "Rain", "East coasts 35-60 deg, rain", "mm");
v("koppenA", "Koppen", "Koppen A (tropical), % of land", "%");
v("koppenB", "Koppen", "Koppen B (dry)", "%");
v("koppenC", "Koppen", "Koppen C (temperate)", "%");
v("koppenD", "Koppen", "Koppen D (continental)", "%");
v("koppenE", "Koppen", "Koppen E (polar)", "%");
v("koppenCs", "Koppen", "Koppen Cs (Mediterranean)", "%");
v("koppenDw", "Koppen", "Koppen Cw + Dw (dry winter)", "%");

/* ------------------------------------------------------------------ Earth ----------- */
const earthP = (function () {
  const tC = new Float32Array(N), range = new Float32Array(N), mm = new Float32Array(N), ps = new Float32Array(N), k = new Array(N).fill(null), has = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (EARTH.hm[i] <= 0 || EARTH.cruN[i] < 30 || EARTH.tMon[0][i] == null || EARTH.pMon[0][i] == null) continue;
    const t = EARTH.tMon.map((m) => m[i]), p = EARTH.pMon.map((m) => m[i]);
    const MAP = p.reduce((s, x) => s + x, 0), sumIdx = LAT[i] >= 0 ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
    tC[i] = t.reduce((s, x) => s + x, 0) / 12; range[i] = Math.max(...t) - Math.min(...t); mm[i] = MAP;
    ps[i] = MAP > 0 ? sumIdx.reduce((s, kk) => s + p[kk], 0) / MAP : 0.5; k[i] = koppenMonthly(t, p, LAT[i]); has[i] = 1;
  }
  return { land: (i) => EARTH.hm[i] > 0, hm: (i) => EARTH.hm[i], clim: (i) => has[i] === 1, tC: (i) => tC[i], range: (i) => range[i], mm: (i) => mm[i], ps: (i) => ps[i], k: (i) => k[i] };
})();
const earth = measure(earthP);
/* the model run on Earth's own relief: its gap to the observed Earth is the model's error on
   the same geography, apart from any difference in the worlds' geography */
const modelEarth = (function () {
  AEON.planetgen.terrainIn = Float32Array.from(EARTH.hm);
  const w = AEON.createWorld({ packId: "historical", seed: 1 }), g = w._gen, R = w.regions;
  delete AEON.planetgen.terrainIn;
  return measure({
    land: (i) => g.E[i] > 0.5, hm: (i) => g.Hm[i], clim: (i) => earthP.clim(i) && !R[i].lake && R[i].climate != null,
    tC: (i) => R[i].tempC, range: (i) => R[i].warmC - R[i].coldC, mm: (i) => R[i].rainMm, ps: (i) => R[i].summerRain, k: (i) => R[i].climate,
  });
})();

/* ------------------------------------------------------------------ worlds ---------- */
const worlds = [];
const t0 = Date.now();
for (let s = FROM; s < FROM + NSEEDS; s++) {
  const w = AEON.createWorld({ packId: "historical", seed: s }), g = w._gen, R = w.regions;
  const P = {
    land: (i) => g.E[i] > 0.5, hm: (i) => g.Hm[i], clim: (i) => !R[i].lake && R[i].climate != null,
    tC: (i) => R[i].tempC, range: (i) => R[i].warmC - R[i].coldC, mm: (i) => R[i].rainMm, ps: (i) => R[i].summerRain, k: (i) => R[i].climate,
  };
  const m = measure(P); m.seed = s; worlds.push(m);
  if ((s - FROM) % 10 === 9) process.stdout.write(".");
}
console.log(" " + NSEEDS + " worlds in " + ((Date.now() - t0) / 1000).toFixed(0) + " s");

/* ------------------------------------------------------------------ statistics ------ */
const rows = VARS.map(function (V) {
  const xs = worlds.map((m) => m[V.key]).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const n = xs.length, mean = xs.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) * (x - mean), 0) / Math.max(1, n - 1));
  const q = (p) => xs[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
  const e = earth[V.key];
  const below = xs.filter((x) => x < e).length, pctl = 100 * (below + 0.5 * xs.filter((x) => x === e).length) / n;
  const outside = e < q(0.025) || e > q(0.975);
  return Object.assign({}, V, { n, mean, sd, p5: q(0.05), p50: q(0.5), p95: q(0.95), p025: q(0.025), p975: q(0.975), earth: e, modelEarth: modelEarth[V.key], z: sd ? (e - mean) / sd : 0, pctl, outside, xs });
});

const fmt = (x) => (!Number.isFinite(x) ? "-" : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));
const L = [];
L.push("Aeon realism suite - " + new Date().toISOString().slice(0, 10) + " - " + NSEEDS + " worlds (seeds " + FROM + "-" + (FROM + NSEEDS - 1) + "), GEN_VERSION " + AEON.GEN_VERSION);
L.push("Earth: ETOPO1 relief and CRU CL 2.0 climate on the same grid. Flag '!!': Earth outside the worlds' 2.5-97.5% range.");
L.push("'model on Earth': the climate model run on Earth's relief; its gap to Earth is the model's own error, apart from geography.");
L.push("");
L.push("variable                              mean      sd       p5      p50      p95    Earth  model on Earth  Earth's pctl  z");
let g0 = "";
for (const r of rows) {
  if (r.group !== g0) { L.push("-- " + r.group); g0 = r.group; }
  L.push((r.outside ? "!! " : "   ") + (r.label + (r.unit ? " (" + r.unit + ")" : "")).padEnd(36) + [r.mean, r.sd, r.p5, r.p50, r.p95, r.earth].map((x) => fmt(x).padStart(8)).join(" ") + fmt(r.modelEarth).padStart(14) +
    String(Math.round(r.pctl)).padStart(14) + "  " + r.z.toFixed(1).padStart(5));
}
const flagged = rows.filter((r) => r.outside);
L.push("");
L.push("Earth inside the worlds' range on " + (rows.length - flagged.length) + " of " + rows.length + " variables" + (flagged.length ? "; outside on: " + flagged.map((r) => r.label).join("; ") : "."));
const summary = L.join("\n");
console.log(summary);
fs.writeFileSync(path.join(OUT, "summary.txt"), summary + "\n");
fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify({ earth, worlds }, null, 1));

/* ------------------------------------------------------------------ bell curves ----- */
function chart(r) {
  const Wd = 300, Hd = 150, padL = 8, padR = 8, padT = 34, padB = 26;
  const lo = Math.min(r.xs[0], r.earth, r.mean - 3 * r.sd), hi = Math.max(r.xs[r.xs.length - 1], r.earth, r.mean + 3 * r.sd);
  const span = hi - lo || 1, X = (x) => padL + (x - lo) / span * (Wd - padL - padR);
  const NB = 18, bw = span / NB, bins = new Array(NB).fill(0);
  for (const x of r.xs) bins[Math.min(NB - 1, Math.floor((x - lo) / bw))]++;
  const pdf = (x) => r.sd ? Math.exp(-0.5 * ((x - r.mean) / r.sd) ** 2) / (r.sd * Math.sqrt(2 * Math.PI)) : 0;
  const peak = Math.max(Math.max(...bins), r.n * bw * pdf(r.mean)) || 1;
  const Y = (c) => Hd - padB - c / peak * (Hd - padT - padB);
  let s = '<svg viewBox="0 0 ' + Wd + " " + Hd + '" role="img" aria-label="' + r.label + '">';
  for (let b = 0; b < NB; b++) if (bins[b]) s += '<rect class="bar" x="' + X(lo + b * bw).toFixed(1) + '" y="' + Y(bins[b]).toFixed(1) + '" width="' + Math.max(1, X(lo + bw) - X(lo) - 1).toFixed(1) + '" height="' + (Hd - padB - Y(bins[b])).toFixed(1) + '"/>';
  let d = "";
  for (let k = 0; k <= 80; k++) { const x = lo + span * k / 80; d += (k ? "L" : "M") + X(x).toFixed(1) + "," + Y(r.n * bw * pdf(x)).toFixed(1); }
  s += '<path class="bell" d="' + d + '"/>';
  s += '<line class="axis" x1="' + padL + '" x2="' + (Wd - padR) + '" y1="' + (Hd - padB) + '" y2="' + (Hd - padB) + '"/>';
  const ex = X(r.earth);
  s += '<line class="earth' + (r.outside ? " out" : "") + '" x1="' + ex.toFixed(1) + '" x2="' + ex.toFixed(1) + '" y1="' + (padT - 6) + '" y2="' + (Hd - padB) + '"/>';
  if (Number.isFinite(r.modelEarth)) { const mx = X(Math.min(hi, Math.max(lo, r.modelEarth))); s += '<path class="me" d="M' + (mx - 4).toFixed(1) + ',' + (padT - 8) + 'L' + (mx + 4).toFixed(1) + ',' + (padT - 8) + 'L' + mx.toFixed(1) + ',' + (padT - 1) + 'Z"/>'; }
  s += '<text class="tick" x="' + padL + '" y="' + (Hd - 8) + '">' + fmt(lo) + '</text><text class="tick" text-anchor="end" x="' + (Wd - padR) + '" y="' + (Hd - 8) + '">' + fmt(hi) + "</text>";
  s += '<text class="ttl" x="' + padL + '" y="13">' + r.label + (r.unit ? " (" + r.unit + ")" : "") + "</text>";
  s += '<text class="sub" x="' + padL + '" y="27">worlds ' + fmt(r.mean) + " &#177; " + fmt(r.sd) + " &#183; Earth " + fmt(r.earth) + " (pctl " + Math.round(r.pctl) + ") &#183; model on Earth " + fmt(r.modelEarth) + "</text>";
  return s + "</svg>";
}
const groups = [...new Set(rows.map((r) => r.group))];
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Realism suite</title><style>' +
  ':root{--bg:#fbfaf7;--fg:#1d1d1b;--mut:#6b6a66;--bar:#b9c6d6;--bell:#2c5d8f;--earth:#c2410c;--out:#b91c1c;--line:#d8d5cf}' +
  '@media (prefers-color-scheme:dark){:root{--bg:#161614;--fg:#ecebe7;--mut:#9a988f;--bar:#3c4b5e;--bell:#8fb6e0;--earth:#fb923c;--out:#f87171;--line:#3a3935}}' +
  'body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}main{max-width:1100px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 8px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em}' +
  'p{color:var(--mut);margin:4px 0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}.card{border:1px solid var(--line);border-radius:8px;padding:6px}.card.out{border-color:var(--out)}' +
  'svg{width:100%;height:auto;display:block}.bar{fill:var(--bar)}.bell{fill:none;stroke:var(--bell);stroke-width:1.6}.axis{stroke:var(--line)}.earth{stroke:var(--earth);stroke-width:2.2}.earth.out{stroke:var(--out);stroke-dasharray:4 3}.me{fill:var(--fg)}' +
  '.ttl{font-size:11.5px;font-weight:600;fill:var(--fg)}.sub{font-size:10px;fill:var(--mut)}.tick{font-size:9.5px;fill:var(--mut)}.key{display:inline-block;width:14px;height:3px;vertical-align:middle;margin:0 4px 0 12px}</style></head><body><main>' +
  "<h1>Realism suite</h1><p>" + NSEEDS + " generated worlds (seeds " + FROM + "&#8211;" + (FROM + NSEEDS - 1) + ", GEN_VERSION " + AEON.GEN_VERSION + ") against the real Earth (ETOPO1 relief, CRU CL 2.0 climate) on the same grid.</p>" +
  '<p><span class="key" style="background:var(--bar)"></span>worlds<span class="key" style="background:var(--bell)"></span>normal curve, same mean and spread<span class="key" style="background:var(--earth)"></span>Earth (red dashed: outside the worlds\' 2.5&#8211;97.5% range)<span class="key" style="background:var(--fg);height:6px;width:8px"></span>the model run on Earth\'s relief (its gap to the Earth line is the model\'s own error)</p>' +
  "<p>Earth inside the range on <b>" + (rows.length - flagged.length) + " of " + rows.length + "</b> variables.</p>" +
  groups.map((g) => "<h2>" + g + '</h2><div class="grid">' + rows.filter((r) => r.group === g).map((r) => '<div class="card' + (r.outside ? " out" : "") + '">' + chart(r) + "</div>").join("") + "</div>").join("") +
  "</main></body></html>";
fs.writeFileSync(path.join(OUT, "report.html"), html);
console.log("report: " + path.relative(process.cwd(), path.join(OUT, "report.html")));
