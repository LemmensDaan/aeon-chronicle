/* Aeon - world-generation realism harness.

   Runs AEON.createWorld only (terrain, no history: AEON.runAll is never called) for a set of
   seeds and both packs, measures every physical layer that planetgen.js builds, compares it with
   rough Earth figures, and renders each layer to PNG so problems can be seen.

     node tools/worldgen-report.js                 18 seeds, both packs, PNGs
     node tools/worldgen-report.js --seeds 7,42    chosen seeds
     node tools/worldgen-report.js --no-png        numbers only

   Output goes to tools/out/ (gitignored): metrics.json, summary.txt, seed-<n>.png (every layer
   of one seed), overview-*.png (one layer, every seed) and chart-*.png (zonal profiles).

   Units: elevation is 0..1 with the sea at 0.5, 5,000 m at 1 and -7,000 m at 0 (planetgen's
   eOfM; exact since realism fixes 4-5); temperature and rain are 0..1. Where a number is compared with Earth, the
   assumption that turns it into metres or degrees is stated next to it (EARTH below).
   Every Earth figure here is a rounded textbook value, good to a few percent, not a dataset. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const opt = (name) => { const k = args.indexOf(name); return k >= 0 ? args[k + 1] : null; };
const SEEDS = opt("--seeds") ? opt("--seeds").split(",").map(Number)
  : [1, 2, 3, 7, 11, 42, 99, 123, 256, 512, 777, 1000, 1234, 2024, 4242, 31337, 65536, 99999];
const PACKS = ["historical", "fantasy"];
const PNG = !args.includes("--no-png");
const OUT = opt("--out") || path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ Earth ---------- */
const EARTH = {
  /* zonal annual-mean surface air temperature, deg C, by |latitude| (NH-like, sea level) */
  T: [[0, 26.5], [10, 26.0], [20, 24.5], [30, 19.5], [40, 13.5], [50, 6.0], [60, -1.0], [70, -11.0], [75, -15.0]],
  /* zonal annual-mean precipitation over land, shape only (equatorial max = 1) */
  P: [[0, 1.0], [10, 0.85], [20, 0.45], [27, 0.28], [35, 0.35], [45, 0.38], [55, 0.36], [65, 0.25], [75, 0.15]],
  /* share of ice-free land per biome, %, after Olson et al. 2001 (WWF ecoregions), folded into
     Aeon's ten classes; "forest" = temperate broadleaf + conifer + tropical dry + Mediterranean */
  biomes: { desert: 20, jungle: 14, savanna: 15, forest: 16, grassland: 8, taiga: 12, tundra: 7, mountain: 4, swamp: 1, ice: 2 },
  landShare: 29,          /* % of the surface */
  contCrust: 41,          /* % of the surface (land + shelves + microcontinents) */
  shelfOfOcean: 7.5,      /* % of the ocean floor shallower than ~200 m */
  endorheic: 18,          /* % of ice-free land draining to no sea */
  lakes: 1.8,             /* % of land under lakes */
  largestBasin: 4.7,      /* Amazon, % of land */
  largestLandmass: 57,    /* Afro-Eurasia, % of land */
  plates: "7 major plates cover ~90% of the surface; Pacific ~20%; 50+ microplates",
  boundaries: "roughly a third each divergent, convergent, transform (by length)",
  /* hypsometry for an E <-> metres assumption: highest cell mean 5000 m, deepest -7000 m */
  topM: 5000, deepM: -7000,
  /* Earth's hypsographic curve: % of the surface above an elevation (m) */
  hyps: [[5000, 0.1], [4000, 0.6], [3000, 1.3], [2000, 3.2], [1000, 8.5], [500, 15], [200, 21], [0, 29],
         [-200, 34.5], [-1000, 37], [-2000, 40], [-3000, 46], [-4000, 59], [-5000, 85], [-6000, 99], [-7000, 100]],
};

/* ------------------------------------------------------------------ engine ---------- */
function loadEngine() {
  const ctx = { console: console, Math: Math, Date: Date };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ["js/rng.js", "js/core.js", "js/planetgen.js", "js/worldgen.js", "js/sketch.js", "packs/historical.js", "packs/fantasy.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return ctx.AEON;
}
const AEON = loadEngine();

/* ------------------------------------------------------------------ helpers -------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const tab = (t, d) => { if (d <= t[0][0]) return t[0][1]; for (let k = 1; k < t.length; k++) if (d <= t[k][0]) return lerp(t[k - 1][1], t[k][1], (d - t[k - 1][0]) / (t[k][0] - t[k - 1][0])); return t[t.length - 1][1]; };
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const pct = (a, b) => (b ? 100 * a / b : 0);
function wquant(vals, wts, qs) {
  const idx = vals.map((v, k) => k).sort((a, b) => vals[a] - vals[b]);
  let tot = 0; for (const w of wts) tot += w;
  const out = []; let acc = 0, q = 0;
  for (const k of idx) { acc += wts[k]; while (q < qs.length && acc >= qs[q] * tot) { out.push(vals[k]); q++; } }
  while (out.length < qs.length) out.push(vals[idx[idx.length - 1]]);
  return out;
}
const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;

/* the generator's sea-level temperature before currents, continentality and noise */
const T0 = (latDeg) => 0.02 + 0.88 * Math.pow(Math.max(0, Math.cos(latDeg * Math.PI / 180)), 1.35);
/* least-squares deg C = a + b * T0, against Earth's zonal means */
const TFIT = (function () {
  let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
  for (let d = 0; d <= 75; d += 1) { const x = T0(d), y = tab(EARTH.T, d); sx += x; sy += y; sxx += x * x; sxy += x * y; n++; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
  const res = [];
  for (let d = 0; d <= 75; d += 5) res.push([d, r1(a + b * T0(d)), tab(EARTH.T, d)]);
  return { a: a, b: b, res: res };
})();
const degC = (t) => TFIT.a + TFIT.b * t;

/* ------------------------------------------------------------------ measure -------- */
function measure(world) {
  const g = world._gen, W = world.width, H = world.height, N = W * H, R = world.regions;
  const E = g.E, T = g.T, P = g.P, M = g.M, U = g.U, V = g.V;
  const latOf = (y) => 75 * (1 - 2 * (y + 0.5) / H);
  const AREA = new Float64Array(N), LAT = new Float32Array(N);
  for (let i = 0; i < N; i++) { const y = (i / W) | 0; LAT[i] = latOf(y); AREA[i] = Math.cos(LAT[i] * Math.PI / 180); }
  const KMX = 40075 / W, KMY = (150 / H) * 111.2;
  const wx = (x) => ((x % W) + W) % W;
  const nb4 = (i) => { const x = i % W, y = (i / W) | 0, o = [y * W + wx(x + 1), y * W + wx(x - 1)]; if (y + 1 < H) o.push(i + W); if (y > 0) o.push(i - W); return o; };
  const nb8 = (i) => { const x = i % W, y = (i / W) | 0, o = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const yy = y + dy; if (yy < 0 || yy >= H) continue; o.push(yy * W + wx(x + dx)); } return o; };
  const ocean = (i) => E[i] <= 0.5;
  const land = (i) => !ocean(i);
  const dry = (i) => land(i) && !g.lake[i];   /* land that is not lake */
  let totA = 0, landA = 0, dryA = 0, oceanA = 0;
  for (let i = 0; i < N; i++) { totA += AREA[i]; if (land(i)) landA += AREA[i]; else oceanA += AREA[i]; if (dry(i)) dryA += AREA[i]; }
  const m = { seed: world.seed };
  /* distance from the sea, in cells (what planetgen calls coastDist) */
  const CD = new Float32Array(N).fill(99);
  {
    const q = [];
    for (let i = 0; i < N; i++) if (ocean(i)) { CD[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) { const c = q[h]; for (const n of nb4(c)) if (CD[n] > CD[c] + 1) { CD[n] = CD[c] + 1; q.push(n); } }
  }

  /* -- plates -- */
  const plateA = new Float64Array(g.plates.length);
  for (let i = 0; i < N; i++) plateA[g.plateOf[i]] += AREA[i];
  const shares = Array.from(plateA).map((a) => 100 * a / totA).sort((a, b) => b - a);
  let contA = 0; for (let i = 0; i < N; i++) if (g.cont[i]) contA += AREA[i];
  m.plates = { n: g.plates.length, continental: g.plates.filter((p) => p.continental).length,
    largest: r1(shares[0]), smallest: r1(shares[shares.length - 1]), top7: r1(shares.slice(0, 7).reduce((s, v) => s + v, 0)),
    under2pct: shares.filter((s) => s < 2).length, shares: shares.map(r1) };
  m.crust = { continental: r1(pct(contA, totA)) };

  /* plate boundaries by type and length (km) */
  const bLen = { convergent: 0, divergent: 0, transform: 0, quiet: 0 }, convBy = { "cont-cont": 0, "ocean-cont": 0, "ocean-ocean": 0 };
  const convCell = new Uint8Array(N), edgeType = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      if (y + dy >= H) continue;
      const j = (y + dy) * W + wx(x + dx);
      if (g.plateOf[i] === g.plateOf[j]) continue;
      const A = g.plates[g.plateOf[i]], B = g.plates[g.plateOf[j]];
      const dvx = A.vx - B.vx, dvy = A.vy - B.vy, rel = Math.hypot(dvx, dvy);
      const c = dvx * dx + dvy * dy;
      const len = dx ? KMY : KMX * Math.cos((LAT[i] + LAT[j]) / 2 * Math.PI / 180);
      let type = "quiet";
      if (rel >= 0.15) type = c > 0.5 * rel ? "convergent" : c < -0.5 * rel ? "divergent" : "transform";
      bLen[type] += len;
      if (type === "convergent") {
        const k = g.cont[i] && g.cont[j] ? "cont-cont" : g.cont[i] || g.cont[j] ? "ocean-cont" : "ocean-ocean";
        convBy[k] += len; convCell[i] = convCell[j] = 1;
      }
      edgeType.push([i, j, dx, type]);
    }
  }
  const bTot = bLen.convergent + bLen.divergent + bLen.transform + bLen.quiet;
  m.boundaries = { totalKm: Math.round(bTot), convergent: r1(pct(bLen.convergent, bTot)), divergent: r1(pct(bLen.divergent, bTot)),
    transform: r1(pct(bLen.transform, bTot)), quiet: r1(pct(bLen.quiet, bTot)),
    convKm: { cc: Math.round(convBy["cont-cont"]), oc: Math.round(convBy["ocean-cont"]), oo: Math.round(convBy["ocean-ocean"]) } };

  /* -- land, sea, crust -- */
  let landOnOcean = 0, seaOnCont = 0;
  for (let i = 0; i < N; i++) { if (land(i) && !g.cont[i]) landOnOcean += AREA[i]; if (ocean(i) && g.cont[i]) seaOnCont += AREA[i]; }
  let landCells = 0; for (let i = 0; i < N; i++) if (land(i)) landCells++;
  m.land = { cellsPct: r1(pct(landCells, N)), areaPct: r1(pct(landA, totA)), onOceanicCrustPctOfLand: r1(pct(landOnOcean, landA)),
    contCrustSubmergedPct: r1(pct(seaOnCont, contA)) };

  /* landmasses (4-neighbour, wrapping) */
  const comp = new Int32Array(N).fill(-1), masses = [];
  for (let i = 0; i < N; i++) {
    if (!land(i) || comp[i] >= 0) continue;
    const q = [i]; comp[i] = masses.length; let a = 0;
    for (let h = 0; h < q.length; h++) { const c = q[h]; a += AREA[c]; for (const n of nb4(c)) if (land(n) && comp[n] < 0) { comp[n] = masses.length; q.push(n); } }
    masses.push({ cells: q.length, area: a });
  }
  masses.sort((a, b) => b.area - a.area);
  let coastCells = 0;
  for (let i = 0; i < N; i++) if (land(i) && nb4(i).some(ocean)) coastCells++;
  m.landmasses = { count: masses.length, top: masses.slice(0, 5).map((s) => r1(pct(s.area, landA))),
    largestPct: r1(pct(masses[0].area, landA)), secondPct: masses[1] ? r1(pct(masses[1].area, landA)) : 0,
    over5pct: masses.filter((s) => s.area >= 0.05 * landA).length,
    islands1: masses.filter((s) => s.cells === 1).length, islands2to9: masses.filter((s) => s.cells >= 2 && s.cells < 10).length,
    islands10to99: masses.filter((s) => s.cells >= 10 && s.cells < 100).length,
    coastCellsPctOfLand: r1(pct(coastCells, landCells)) };

  /* seas: water bodies below sea level (E <= 0.5) */
  const oc = new Int32Array(N).fill(-1), bodies = [];
  for (let i = 0; i < N; i++) {
    if (!ocean(i) || oc[i] >= 0) continue;
    const q = [i]; oc[i] = bodies.length;
    for (let h = 0; h < q.length; h++) for (const n of nb4(q[h])) if (ocean(n) && oc[n] < 0) { oc[n] = bodies.length; q.push(n); }
    bodies.push(q.length);
  }
  const sortedB = bodies.slice().sort((a, b) => b - a);
  m.seas = { bodies: bodies.length, landlocked: bodies.length - 1, landlockedCells: sortedB.slice(1).reduce((s, v) => s + v, 0),
    landlocked1cell: sortedB.slice(1).filter((v) => v === 1).length };

  /* -- hypsometry -- */
  const hL = [], wL = [], dO = [], wO = [], dOc = [], wOc = [];
  for (let i = 0; i < N; i++) {
    if (land(i)) { hL.push((E[i] - 0.5) / 0.5); wL.push(AREA[i]); }
    else { dO.push((0.5 - E[i]) / 0.5); wO.push(AREA[i]); if (g.cont[i]) { dOc.push((0.5 - E[i]) / 0.5); wOc.push(AREA[i]); } }
  }
  const qs = [0.1, 0.25, 0.5, 0.75, 0.9, 0.99];
  const hq = wquant(hL, wL, qs), dq = wquant(dO, wO, qs);
  /* with the stated assumption: land h * 5000 m, ocean depth * 7000 m */
  let shelfA = 0; for (let k = 0; k < dO.length; k++) if (dO[k] * -EARTH.deepM <= 200) shelfA += wO[k];
  let deep4 = 0; for (let k = 0; k < dO.length; k++) if (dO[k] * -EARTH.deepM >= 4000) deep4 += wO[k];
  let wOtot = 0; for (const w of wO) wOtot += w;
  m.hypsometry = { landQuantiles: hq.map(r3), landMedianM: Math.round(hq[2] * EARTH.topM), land90M: Math.round(hq[4] * EARTH.topM),
    oceanDepthQuantiles: dq.map(r3), oceanMedianM: Math.round(-dq[2] * -EARTH.deepM), shelfPctOfOcean: r1(pct(shelfA, wOtot)),
    abyssPctOfOcean: r1(pct(deep4, wOtot)),
    shelfDepthMedianM: dOc.length ? Math.round(wquant(dOc, wOc, [0.5])[0] * EARTH.deepM) : null };

  /* coastal profile: how far from the coast the sea reaches 2000 m (assumption above) */
  {
    const cd = new Float32Array(N).fill(99), q = [];
    for (let i = 0; i < N; i++) if (land(i)) { cd[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) { const c = q[h]; if (cd[c] >= 20) continue; for (const n of nb4(c)) if (ocean(n) && cd[n] > cd[c] + 1) { cd[n] = cd[c] + 1; q.push(n); } }
    const byD = [];
    for (let i = 0; i < N; i++) if (ocean(i) && cd[i] <= 6) (byD[cd[i]] = byD[cd[i]] || []).push((0.5 - E[i]) / 0.5 * -EARTH.deepM);
    m.hypsometry.depthByCellsFromCoastM = byD.slice(1, 7).map((a) => Math.round(mean(a)));
  }

  /* -- mountains -- */
  const mtn = new Uint8Array(N);
  let mtnA = 0;
  for (let i = 0; i < N; i++) if (dry(i) && world.regions[i].biome === "mountain") { mtn[i] = 1; mtnA += AREA[i]; }
  /* distance (km) from a convergent plate boundary */
  const dConv = new Float64Array(N).fill(Infinity);
  {
    const q = []; for (let i = 0; i < N; i++) if (convCell[i]) { dConv[i] = 0; q.push(i); }
    /* Dijkstra-light: repeated relaxation over a FIFO queue (grid is small) */
    for (let h = 0; h < q.length; h++) {
      const c = q[h], cy = (c / W) | 0;
      for (const n of nb4(c)) {
        const ny = (n / W) | 0, step = ny === cy ? KMX * Math.cos(LAT[c] * Math.PI / 180) : KMY;
        if (dConv[c] + step < dConv[n] - 1e-6) { dConv[n] = dConv[c] + step; q.push(n); }
      }
    }
  }
  let near500 = 0, near1000 = 0, noUplift = 0;
  for (let i = 0; i < N; i++) if (mtn[i]) { if (dConv[i] <= 500) near500 += AREA[i]; if (dConv[i] <= 1000) near1000 += AREA[i]; if (g.uplift[i] < 0.05) noUplift += AREA[i]; }
  /* ranges: connected mountain cells (8-neighbour); length = greatest great-circle span */
  const mc = new Int32Array(N).fill(-1), ranges = [];
  const gc = (a, b) => {
    const la1 = LAT[a] * Math.PI / 180, la2 = LAT[b] * Math.PI / 180;
    const lo1 = (a % W) / W * 2 * Math.PI, lo2 = (b % W) / W * 2 * Math.PI;
    const s = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
  };
  for (let i = 0; i < N; i++) {
    if (!mtn[i] || mc[i] >= 0) continue;
    const q = [i]; mc[i] = ranges.length;
    for (let h = 0; h < q.length; h++) for (const n of nb8(q[h])) if (mtn[n] && mc[n] < 0) { mc[n] = ranges.length; q.push(n); }
    let len = 0;
    if (q.length > 1) {
      /* farthest pair: from any cell to its farthest, then from that one to its farthest */
      let a = q[0], b = a, d = 0;
      for (const c of q) { const dd = gc(a, c); if (dd > d) { d = dd; b = c; } }
      d = 0; for (const c of q) { const dd = gc(b, c); if (dd > d) d = dd; }
      len = d;
    }
    ranges.push({ cells: q.length, km: len });
  }
  ranges.sort((a, b) => b.km - a.km);
  m.mountains = { pctOfLand: r1(pct(mtnA, dryA)), within500kmOfConvergent: r1(pct(near500, mtnA)),
    within1000km: r1(pct(near1000, mtnA)), withoutTectonicUplift: r1(pct(noUplift, mtnA)),
    ranges: ranges.length, singleCellRanges: ranges.filter((r) => r.cells === 1).length,
    longestKm: ranges.slice(0, 3).map((r) => Math.round(r.km)) };
  /* how much of the convergent margin built mountains at all */
  let convLand = 0, convLandMtn = 0;
  for (let i = 0; i < N; i++) if (dry(i) && dConv[i] <= 300) { convLand++; if (mtn[i] || E[i] >= 0.5 + 0.5 * 0.4) convLandMtn++; }
  m.mountains.convergentLandHigh = r1(pct(convLandMtn, convLand));

  /* -- temperature -- */
  const tLand = [], wT = [];
  for (let i = 0; i < N; i++) if (dry(i)) { tLand.push(degC(T[i])); wT.push(AREA[i]); }
  const tq = wquant(tLand, wT, [0.05, 0.5, 0.95]);
  /* continentality and currents: land minus ocean at the same latitude band 40-60 */
  const zonal = (pred, val, lo, hi) => { let s = 0, w = 0; for (let i = 0; i < N; i++) { const a = Math.abs(LAT[i]); if (a >= lo && a < hi && pred(i)) { s += val(i) * AREA[i]; w += AREA[i]; } } return w ? s / w : NaN; };
  m.temperature = { fit: { a: r2(TFIT.a), b: r2(TFIT.b) }, landP5C: r1(tq[0]), landMedianC: r1(tq[1]), landP95C: r1(tq[2]),
    interiorMinusCoast45to60C: r1(zonal((i) => dry(i) && CD[i] >= 8, (i) => degC(T[i]), 45, 60) - zonal((i) => dry(i) && CD[i] <= 1, (i) => degC(T[i]), 45, 60)) };

  /* west coast (sea to the west) vs east coast at the same latitude, temperature and rain */
  const side = new Int8Array(N);   /* 1 = west coast, 2 = east coast */
  for (let i = 0; i < N; i++) {
    if (!dry(i)) continue;
    const x = i % W, y = (i / W) | 0;
    const wS = ocean(y * W + wx(x - 1)) || ocean(y * W + wx(x - 2)), eS = ocean(y * W + wx(x + 1)) || ocean(y * W + wx(x + 2));
    if (wS && !eS) side[i] = 1; else if (eS && !wS) side[i] = 2;
  }
  const coastCmp = (lo, hi, val) => ({ west: r2(zonal((i) => side[i] === 1, val, lo, hi)), east: r2(zonal((i) => side[i] === 2, val, lo, hi)) });
  m.coasts = { T15to35C: coastCmp(15, 35, (i) => degC(T[i])), T45to65C: coastCmp(45, 65, (i) => degC(T[i])),
    P10to35: coastCmp(10, 35, (i) => P[i]), P40to60: coastCmp(40, 60, (i) => P[i]) };

  /* -- precipitation -- */
  const pZ = [];
  for (let b = 0; b < 75; b += 5) pZ.push([b + 2.5, r3(zonal(dry, (i) => P[i], b, b + 5))]);
  m.precip = { zonalLand: pZ };
  /* decay inland: mean P by distance from the sea (cells), westerlies belt and tropics */
  const byCD = (lo, hi) => [[0, 1], [2, 3], [4, 6], [7, 10], [11, 16], [17, 99]].map(([a, b]) => r2(zonal((i) => dry(i) && CD[i] >= a && CD[i] <= b, (i) => P[i], lo, hi)));
  m.precip.inland35to60 = byCD(35, 60);
  m.precip.inland0to15 = byCD(0, 15);
  /* rain shadow: land beside mountains, windward vs leeward along the zonal wind */
  {
    let ws = 0, wn = 0, ls = 0, ln = 0;
    for (let i = 0; i < N; i++) {
      if (!dry(i) || mtn[i]) continue;
      const x = i % W, y = (i / W) | 0, up = U[i] >= 0 ? -1 : 1;  /* the wind comes from x + up */
      let upM = false, downM = false;
      for (let d = 1; d <= 3; d++) { if (mtn[y * W + wx(x + up * d)]) upM = true; if (mtn[y * W + wx(x - up * d)]) downM = true; }
      if (downM && !upM) { ws += P[i]; wn++; } else if (upM && !downM) { ls += P[i]; ln++; }
    }
    m.precip.windward = r2(ws / (wn || 1)); m.precip.leeward = r2(ls / (ln || 1)); m.precip.shadowRatio = r2((ws / (wn || 1)) / (ls / (ln || 1) || 1));
  }
  let arid = 0; for (let i = 0; i < N; i++) if (dry(i) && P[i] < 0.1) arid += AREA[i];
  m.precip.pLt01PctOfLand = r1(pct(arid, dryA));

  /* -- hydrology -- */
  let lakeA = 0, basinA = 0, riverCells = 0, dryCells = 0;
  for (let i = 0; i < N; i++) { if (g.lake[i]) lakeA += AREA[i]; if (g.basin[i]) basinA += AREA[i]; if (dry(i)) { dryCells++; if (R[i].river > 0) riverCells++; } }
  /* terminal of every land cell: "sea", "basin", via lakes (a lake spills at its lowest shore) */
  const lc = new Int32Array(N).fill(-1), lakeOut = [];
  for (let i = 0; i < N; i++) {
    if (!g.lake[i] || lc[i] >= 0) continue;
    const q = [i]; lc[i] = lakeOut.length;
    for (let h = 0; h < q.length; h++) for (const n of nb8(q[h])) if (g.lake[n] && lc[n] < 0) { lc[n] = lakeOut.length; q.push(n); }
    let best = -1;
    for (const c of q) for (const n of nb8(c)) if (!g.lake[n] && (best < 0 || E[n] < E[best])) best = n;
    lakeOut.push(best);
  }
  const term = new Int32Array(N).fill(-2);   /* -1 = sea; else id of the terminal (mouth cell or basin cell) */
  const resolve = (i0) => {
    const path = []; let i = i0, t = -3, guard = 0;
    while (guard++ < N) {
      if (term[i] !== -2) { t = term[i]; break; }
      if (ocean(i)) { t = -1; break; }
      path.push(i);
      if (g.basin[i]) { t = i; break; }
      let nx = g.lake[i] ? lakeOut[lc[i]] : R[i].flowTo;
      if (nx < 0) { t = -3; break; }
      if (ocean(nx)) { t = -100 - i; break; }   /* mouth */
      i = nx;
    }
    for (const c of path) term[c] = t;
    return t;
  };
  const basinArea = new Map();
  let endo = 0, exo = 0;
  for (let i = 0; i < N; i++) {
    if (!land(i)) continue;
    const t = resolve(i);
    const key = t <= -100 ? "m" + (-100 - t) : t >= 0 ? "b" + t : "?";
    if (t >= 0) endo += AREA[i]; else exo += AREA[i];
    basinArea.set(key, (basinArea.get(key) || 0) + AREA[i]);
  }
  /* merge basin cells of one dry basin into one catchment */
  const catch_ = Array.from(basinArea.entries()).sort((a, b) => b[1] - a[1]);
  m.hydro = { lakesPctOfLand: r1(pct(lakeA, landA)), dryBasinsPctOfLand: r1(pct(basinA, landA)),
    endorheicPctOfLand: r1(pct(endo, landA)), riverCellsPctOfLand: r1(pct(riverCells, dryCells)),
    largestCatchmentPct: catch_.slice(0, 3).map((c) => r1(pct(c[1], landA))),
    largestCatchment: r1(pct(catch_[0][1], landA)),
    catchmentsOver1pct: catch_.filter((c) => c[1] >= 0.01 * landA).length,
    riverMouths: 0, riverInDesertPct: 0, lakes: lakeOut.length };
  let mouths = 0, rD = 0;
  for (let i = 0; i < N; i++) { if (R[i].river > 0 && R[i].flowTo >= 0 && ocean(R[i].flowTo)) mouths++; if (R[i].river > 0 && R[i].biome === "desert") rD++; }
  m.hydro.riverMouths = mouths; m.hydro.riverInDesertPct = r1(pct(rD, riverCells));

  /* -- biomes -- */
  const bA = {}, bT = {}, bTw = {};
  for (let i = 0; i < N; i++) {
    if (!dry(i)) continue;
    const b = R[i].biome; bA[b] = (bA[b] || 0) + AREA[i];
    bT[b] = (bT[b] || 0) + degC(T[i]) * AREA[i];
  }
  m.biomes = {}; m.biomeMeanC = {};
  for (const b of Object.keys(bA)) { m.biomes[b] = r1(pct(bA[b], dryA)); m.biomeMeanC[b] = r1(bT[b] / bA[b]); }
  const bandShare = (biome, lo, hi) => { let s = 0, w = 0; for (let i = 0; i < N; i++) if (dry(i) && R[i].biome === biome) { w += AREA[i]; const a = Math.abs(LAT[i]); if (a >= lo && a < hi) s += AREA[i]; } return r1(pct(s, w)); };
  m.biomeBands = { junglePolewardOf23: bandShare("jungle", 23.5, 90), junglePolewardOf30: bandShare("jungle", 30, 90),
    savannaPolewardOf30: bandShare("savanna", 30, 90), desertIn15to35: bandShare("desert", 15, 35),
    desertPolewardOf40: bandShare("desert", 40, 90), taigaEquatorwardOf45: bandShare("taiga", 0, 45) };
  /* moisture is blended toward its rank, so its spread should hardly change between seeds */
  {
    const mv = [], mw = [];
    for (let i = 0; i < N; i++) if (dry(i)) { mv.push(M[i]); mw.push(AREA[i]); }
    const mqs = wquant(mv, mw, [0.1, 0.25, 0.5, 0.75, 0.9]);
    m.moisture = { quantiles: mqs.map(r2) };
  }

  /* -- the world sketch (js/sketch.js) -- */
  const sk = world.sketch;
  if (sk) {
    const lived = sk.squares.filter((s) => s.peoples.length);
    const kinds = {}, arch = {};
    for (const p of sk.peoples) { kinds[p.kind] = (kinds[p.kind] || 0) + 1; arch[p.archetype] = (arch[p.archetype] || 0) + 1; }
    const seaL = sk.links.filter((l) => l.kind === "sea");
    m.sketch = { squaresLived: lived.length, openSea: sk.squares.filter((s) => s.openSea).length, peoples: sk.peoples.length,
      nomads: kinds.nomads || 0, kingdoms: kinds.kingdom || 0, tribes: kinds.tribes || 0, archetypesUsed: Object.keys(arch).length,
      landLinks: sk.links.filter((l) => l.kind === "land").length,
      seaLinks6: seaL.filter((l) => l.lane <= 6).length, seaLinks15: seaL.filter((l) => l.lane <= 15).length,
      seaLinks40: seaL.filter((l) => l.lane <= 40).length, seaLinksAll: seaL.length,
      livedWithoutLandLink: lived.filter((s) => !sk.links.some((l) => l.kind === "land" && (sk.squares[l.a] === s || sk.squares[l.b] === s))).length };
    if (sk.contacts) {
      const C = sk.contacts, by = (k) => C.filter((c) => c.kind === k).length;
      const hostile = C.filter((c) => /invasion|raid|migration|colonisation/.test(c.kind));
      const touched = {};
      for (const c of C) if (c.kind !== "dark-age") { touched[c.from] = 1; touched[c.to] = 1; }
      const conquered = {};
      for (const c of C) if (c.outcome === "conquest") conquered[c.to] = (conquered[c.to] || 0) + 1;
      const lane = (c) => { const a = sk.squares.findIndex((s) => s.id === c.from), b = sk.squares.findIndex((s) => s.id === c.to);
        const l = sk.links.find((x) => x.kind === "sea" && x.a === Math.min(a, b) && x.b === Math.max(a, b)); return l ? l.lane : 0; };
      const ocean = C.filter((c) => c.via === "sea" && c.kind !== "trade" && lane(c) > 40);
      const ages = world.pack.ages || [];
      const medAge = (k) => { const ys = lived.map((s) => s.ageYears[k]).filter((y) => y != null).sort((a, b) => a - b); return ys.length ? ys[(ys.length / 2) | 0] : null; };
      Object.assign(m.sketch, {
        contacts: C.length, trade: by("trade"), hostile: hostile.length, invasions: by("invasion"), raids: by("raid"),
        migrations: by("migration"), colonisations: by("colonisation"), darkAges: by("dark-age"),
        conquests: C.filter((c) => c.outcome === "conquest").length, mostConquered: Math.max(0, ...Object.values(conquered)),
        untouched: lived.filter((s) => !touched[s.id]).length, firstOceanCrossing: ocean.length ? ocean[0].year : null,
        arrivals: sk.peoples.filter((p) => p.arrived != null).length,
      });
      ages.forEach((a, k) => { if (k) m.sketch["medianAge" + k + "Year"] = medAge(k); });
      m.sketch.lastAgeReached = lived.filter((s) => s.ageYears[ages.length - 1] != null).length;
    }
  }

  Object.defineProperty(m, "_x", { enumerable: false, value: { LAT, edgeType, CD } });
  return m;
}

/* ------------------------------------------------------------------ raster + PNG --- */
function Img(w, h, bg) {
  const d = new Uint8Array(w * h * 3);
  const img = { w: w, h: h, d: d };
  img.set = (x, y, c) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return; const k = (y * w + x) * 3; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; };
  img.blend = (x, y, c, a) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return; const k = (y * w + x) * 3; for (let j = 0; j < 3; j++) d[k + j] = Math.round(d[k + j] * (1 - a) + c[j] * a); };
  img.rect = (x, y, rw, rh, c) => { for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) img.set(xx, yy, c); };
  img.line = (x0, y0, x1, y1, c, t) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    const r = (t || 1) / 2;
    for (let s = 0; s <= n; s++) {
      const x = lerp(x0, x1, s / n), y = lerp(y0, y1, s / n);
      if (r <= 0.5) img.set(Math.round(x), Math.round(y), c);
      else for (let yy = Math.floor(y - r + 0.5); yy < y + r; yy++) for (let xx = Math.floor(x - r + 0.5); xx < x + r; xx++) img.set(xx, yy, c);
    }
  };
  img.blit = (src, ox, oy) => { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const k = (y * src.w + x) * 3; img.set(ox + x, oy + y, [src.d[k], src.d[k + 1], src.d[k + 2]]); } };
  if (bg) img.rect(0, 0, w, h, bg);
  return img;
}
const CRC = (function () { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function savePNG(img, file) {
  const raw = Buffer.alloc((img.w * 3 + 1) * img.h);
  for (let y = 0; y < img.h; y++) { raw[y * (img.w * 3 + 1)] = 0; Buffer.from(img.d.buffer, y * img.w * 3, img.w * 3).copy(raw, y * (img.w * 3 + 1) + 1); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
}
/* 3x5 pixel font, upper case */
const GLYPH = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", F: "111100110100100",
  G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100", Q: "010101101110011", R: "110101110101101",
  S: "011100010001110", T: "111010010010010", U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111", 0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110",
  4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
  "-": "000000111000000", ".": "000000000000010", "%": "101001010100101", ":": "000010000010000", "/": "001001010100100",
  "(": "010100100100010", ")": "010001001001010", ",": "000000000010100", "+": "000010111010000", "=": "000111000111000",
  "<": "001010100010001", ">": "100010001010100", " ": "000000000000000",
};
function text(img, x, y, s, c, sc) {
  sc = sc || 2;
  for (const ch of String(s).toUpperCase()) {
    const gl = GLYPH[ch] || GLYPH[" "];
    for (let k = 0; k < 15; k++) if (gl[k] === "1") img.rect(x + (k % 3) * sc, y + ((k / 3) | 0) * sc, sc, sc, c);
    x += 4 * sc;
  }
  return x;
}
const textW = (s, sc) => String(s).length * 4 * (sc || 2);
function label(img, s) { img.rect(0, 0, textW(s) + 8, 16, [20, 20, 20]); text(img, 4, 3, s, [240, 240, 240]); }
const ramp = (stops, v) => {
  if (v <= stops[0][0]) return stops[0][1];
  for (let k = 1; k < stops.length; k++) if (v <= stops[k][0]) { const t = (v - stops[k - 1][0]) / (stops[k][0] - stops[k - 1][0]); return [0, 1, 2].map((j) => Math.round(lerp(stops[k - 1][1][j], stops[k][1][j], t))); }
  return stops[stops.length - 1][1];
};
const hsl = (h, s, l) => { const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const C = {
  ocean: [[0, [176, 214, 232]], [0.25, [110, 165, 205]], [0.6, [45, 85, 150]], [1, [15, 30, 75]]],
  land: [[0, [72, 130, 64]], [0.12, [130, 165, 85]], [0.3, [196, 182, 112]], [0.55, [160, 118, 80]], [0.8, [190, 180, 175]], [1, [255, 255, 255]]],
  temp: [[-25, [90, 20, 130]], [-10, [50, 90, 210]], [0, [200, 230, 255]], [10, [130, 200, 110]], [20, [250, 215, 70]], [30, [200, 40, 30]]],
  wet: [[0, [235, 215, 170]], [0.2, [215, 205, 130]], [0.4, [150, 200, 110]], [0.65, [50, 150, 100]], [1, [20, 60, 140]]],
  biome: Object.fromEntries(Object.entries(AEON.packs.historical.biomes).map(([k, v]) => [k, hex(v.color)])),
};
C.biome.lake = [90, 150, 220];

/* one map layer, S pixels a cell; colour(i) gives each cell's colour */
function mapLayer(world, S, colour, opts) {
  opts = opts || {};
  const g = world._gen, W = world.width, H = world.height;
  const wx = (v) => ((v % W) + W) % W;
  const img = Img(W * S, H * S);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img.rect(x * S, y * S, S, S, colour(y * W + x));
  if (opts.coast !== false) {
    const cc = opts.coastColor || [25, 25, 25];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (g.E[i] <= 0.5) continue;
      if (g.E[y * W + wx(x + 1)] <= 0.5) img.rect(x * S + S - 1, y * S, 1, S, cc);
      if (g.E[y * W + wx(x - 1)] <= 0.5) img.rect(x * S, y * S, 1, S, cc);
      if (y + 1 < H && g.E[i + W] <= 0.5) img.rect(x * S, y * S + S - 1, S, 1, cc);
      if (y > 0 && g.E[i - W] <= 0.5) img.rect(x * S, y * S, S, 1, cc);
    }
  }
  if (opts.lats !== false) {
    for (const lat of [0, 30, -30, 60, -60]) {
      const y = Math.round((75 - lat) / 150 * H * S);
      for (let x = 0; x < W * S; x += lat === 0 ? 3 : 6) img.blend(x, y, [255, 255, 255], 0.55);
    }
  }
  return img;
}

function renderSeed(world, m) {
  const g = world._gen, W = world.width, H = world.height, N = W * H, S = 4, R = world.regions;
  const ocean = (i) => g.E[i] <= 0.5;
  const layers = [];
  const elevC = (i) => g.lake[i] ? C.biome.lake : ocean(i) ? ramp(C.ocean, (0.5 - g.E[i]) / 0.5) : ramp(C.land, (g.E[i] - 0.5) / 0.5);

  /* elevation */
  { const im = mapLayer(world, S, elevC); label(im, "ELEVATION (SEA 0-7 KM, LAND 0-5 KM ASSUMED)"); layers.push(im); }

  /* plates, crust, boundaries, hotspots, motion */
  {
    const im = mapLayer(world, S, (i) => {
      const h = (g.plateOf[i] * 0.618) % 1;
      return g.cont[i] ? hsl(h, 0.45, ocean(i) ? 0.6 : 0.72) : hsl(h, 0.35, 0.36);
    }, { coastColor: [0, 0, 0] });
    const TC = { convergent: [230, 30, 30], divergent: [40, 220, 240], transform: [255, 230, 0], quiet: [140, 140, 140] };
    for (const [i, j, dx, type] of m._x.edgeType) {
      const x = i % W, y = (i / W) | 0;
      if (dx) im.rect(x * S + S - 1, y * S, 2, S, TC[type]); else im.rect(x * S, y * S + S - 1, S, 2, TC[type]);
    }
    for (const hsp of g.hotspots) { for (let a = 0; a < 24; a++) im.set(hsp.x * S + 2 + 6 * Math.cos(a / 24 * 2 * Math.PI), hsp.y * S + 2 + 6 * Math.sin(a / 24 * 2 * Math.PI), [255, 0, 255]); }
    /* plate motion from each plate's centre (circular mean in x) */
    g.plates.forEach(function (p) {
      let sx = 0, sz = 0, sy = 0, n = 0;
      for (let i = 0; i < N; i++) if (g.plateOf[i] === p.id) { const th = (i % W) / W * 2 * Math.PI; sx += Math.cos(th); sz += Math.sin(th); sy += (i / W) | 0; n++; }
      if (!n) return;
      let cx = Math.atan2(sz, sx) / (2 * Math.PI) * W; if (cx < 0) cx += W;
      const cy = sy / n, px = cx * S, py = cy * S, ex = px + p.vx * 40, ey = py + p.vy * 40;
      im.line(px, py, ex, ey, [255, 255, 255], 3); im.line(px, py, ex, ey, [0, 0, 0], 1);
      im.rect(px - 2, py - 2, 5, 5, [0, 0, 0]);
    });
    label(im, "PLATES: RED CONVERGENT, CYAN DIVERGENT, YELLOW TRANSFORM"); layers.push(im);
  }

  /* uplift */
  { const im = mapLayer(world, S, (i) => { const u = g.uplift[i]; return u >= 0 ? ramp([[0, [235, 235, 235]], [0.15, [230, 140, 90]], [0.4, [140, 20, 20]]], u) : ramp([[0, [235, 235, 235]], [0.1, [100, 140, 220]], [0.25, [20, 30, 120]]], -u); });
    label(im, "TECTONIC UPLIFT (RED) AND SUBSIDENCE (BLUE)"); layers.push(im); }

  /* temperature */
  { const im = mapLayer(world, S, (i) => g.lake[i] ? C.biome.lake : ramp(C.temp, degC(g.T[i])));
    label(im, "ANNUAL MEAN TEMPERATURE, C (FITTED TO EARTH)"); layers.push(im); }

  /* precipitation */
  { const im = mapLayer(world, S, (i) => ocean(i) ? [55, 65, 80] : g.lake[i] ? C.biome.lake : ramp(C.wet, g.P[i]));
    label(im, "PRECIPITATION (RELATIVE, 97TH PCT = 1)"); layers.push(im); }

  /* winds */
  {
    const im = mapLayer(world, S, (i) => ocean(i) ? [150, 175, 200] : g.lake[i] ? C.biome.lake : [205, 198, 180]);
    for (let y = 2; y < H; y += 5) for (let x = 2; x < W; x += 5) {
      const i = y * W + x, u = g.U[i], v = g.V[i], sp = Math.hypot(u, v) || 1e-6;
      const px = x * S + 2, py = y * S + 2, L = 4 + 8 * Math.min(1.3, sp);
      const ex = px + u / sp * L, ey = py + v / sp * L;
      const col = sp > 0.8 ? [150, 20, 20] : sp > 0.4 ? [40, 40, 40] : [110, 110, 110];
      im.line(px, py, ex, ey, col, 1);
      const ax = -u / sp, ay = -v / sp;
      im.line(ex, ey, ex + (ax * 0.8 - ay * 0.6) * 4, ey + (ay * 0.8 + ax * 0.6) * 4, col, 1);
      im.line(ex, ey, ex + (ax * 0.8 + ay * 0.6) * 4, ey + (ay * 0.8 - ax * 0.6) * 4, col, 1);
    }
    label(im, "SURFACE WIND (RED FAST), ANNUAL, NO SEASONS"); layers.push(im);
  }

  /* moisture used by the biome classifier */
  { const im = mapLayer(world, S, (i) => ocean(i) ? [55, 65, 80] : g.lake[i] ? C.biome.lake : ramp(C.wet, g.M[i]));
    label(im, "MOISTURE FOR BIOMES (55% RANK-FORCED)"); layers.push(im); }

  /* rivers, lakes, dry basins */
  {
    const im = mapLayer(world, S, (i) => ocean(i) ? [60, 80, 110] : g.lake[i] ? [70, 140, 220] : g.basin[i] ? (R[i].features.indexOf("salt-flat") >= 0 ? [250, 250, 245] : [235, 190, 190]) : [225, 215, 190]);
    const maxR = world.maxRiver || 1;
    for (let i = 0; i < N; i++) {
      const r = R[i]; if (!(r.river > 0) || r.flowTo < 0) continue;
      const j = r.flowTo, x0 = i % W, y0 = (i / W) | 0; let x1 = j % W; const y1 = (j / W) | 0;
      if (x1 - x0 > W / 2) x1 -= W; if (x0 - x1 > W / 2) x1 += W;
      const f = Math.log(r.river / world.riverThreshold + 1) / Math.log(maxR / world.riverThreshold + 1);
      im.line(x0 * S + 2, y0 * S + 2, x1 * S + 2, y1 * S + 2, [25, 80, 200], f > 0.66 ? 3 : f > 0.33 ? 2 : 1);
    }
    label(im, "RIVERS, LAKES (BLUE), DRY BASINS (PINK), SALT FLATS (WHITE)"); layers.push(im);
  }

  /* biomes */
  const biomeC = (i) => g.lake[i] ? C.biome.lake : ocean(i) ? C.biome.barren : C.biome[R[i].biome] || [255, 0, 255];
  { const im = mapLayer(world, S, biomeC, { coastColor: [30, 40, 50] });
    label(im, "BIOMES (HISTORICAL PACK COLOURS)"); layers.push(im); }

  const cols = 3, lw = layers[0].w, lh = layers[0].h, gap = 6;
  const sheet = Img(cols * lw + (cols + 1) * gap, Math.ceil(layers.length / cols) * (lh + gap) + gap + 22, [245, 242, 235]);
  text(sheet, gap, 6, "AEON WORLDGEN, SEED " + world.seed + "  (MAP 150X95 CELLS, 75S-75N, 4 PX A CELL)", [30, 30, 30]);
  layers.forEach((im, k) => sheet.blit(im, gap + (k % cols) * (lw + gap), 22 + gap + Math.floor(k / cols) * (lh + gap)));
  savePNG(sheet, path.join(OUT, "seed-" + world.seed + ".png"));
  return { elev: mapLayer(world, 2, elevC, { lats: false }), biome: mapLayer(world, 2, biomeC, { coastColor: [30, 40, 50], lats: false }) };
}

function overview(name, tiles, seeds) {
  const cols = 3, tw = tiles[0].w, th = tiles[0].h, gap = 4;
  const img = Img(cols * tw + (cols + 1) * gap, Math.ceil(tiles.length / cols) * (th + gap + 14) + gap, [245, 242, 235]);
  tiles.forEach((t, k) => {
    const x = gap + (k % cols) * (tw + gap), y = gap + Math.floor(k / cols) * (th + gap + 14);
    text(img, x, y, "SEED " + seeds[k], [30, 30, 30]); img.blit(t, x, y + 13);
  });
  savePNG(img, path.join(OUT, "overview-" + name + ".png"));
}

/* simple line chart: series [{ pts: [[x, y]], c, w }] */
function chart(file, title, xr, yr, series, xticks, yticks, legend) {
  const w = 640, h = 380, L = 54, T = 30, Rr = 16, B = 40;
  const img = Img(w, h, [252, 250, 245]);
  text(img, 8, 8, title, [20, 20, 20]);
  const X = (v) => L + (v - xr[0]) / (xr[1] - xr[0]) * (w - L - Rr), Y = (v) => h - B - (v - yr[0]) / (yr[1] - yr[0]) * (h - T - B);
  for (const t of xticks) { for (let y = T; y < h - B; y += 3) img.set(X(t), y, [215, 210, 200]); text(img, X(t) - textW(t) / 2, h - B + 6, t, [60, 60, 60]); }
  for (const t of yticks) { for (let x = L; x < w - Rr; x += 3) img.set(x, Y(t), [215, 210, 200]); text(img, L - textW(t) - 6, Y(t) - 4, t, [60, 60, 60]); }
  img.line(L, h - B, w - Rr, h - B, [60, 60, 60]); img.line(L, T, L, h - B, [60, 60, 60]);
  for (const s of series) for (let k = 1; k < s.pts.length; k++) img.line(X(s.pts[k - 1][0]), Y(s.pts[k - 1][1]), X(s.pts[k][0]), Y(s.pts[k][1]), s.c, s.w || 2);
  let lx = L + 10;
  for (const s of legend || []) { img.rect(lx, h - 14, 12, 4, s.c); lx = text(img, lx + 16, h - 17, s.name, [40, 40, 40]) + 14; }
  savePNG(img, path.join(OUT, file));
}

/* biome share by latitude, every seed pooled */
function biomeLatChart(worlds) {
  const H = worlds[0].height, W = worlds[0].width, rows = [];
  for (let y = 0; y < H; y++) rows.push({});
  for (const w of worlds) for (let i = 0; i < W * H; i++) {
    const r = w.regions[i]; if (w._gen.E[i] <= 0.5 || w._gen.lake[i]) continue;
    const y = (i / W) | 0; rows[y][r.biome] = (rows[y][r.biome] || 0) + 1;
  }
  const order = ["ice", "tundra", "taiga", "forest", "grassland", "swamp", "jungle", "savanna", "desert", "mountain"];
  const S = 5, bw = 420, L = 50, img = Img(L + bw + 170, H * S + 50, [252, 250, 245]);
  text(img, 8, 8, "BIOME SHARE OF LAND BY LATITUDE, " + worlds.length + " SEEDS", [20, 20, 20]);
  for (let y = 0; y < H; y++) {
    const tot = Object.values(rows[y]).reduce((s, v) => s + v, 0); if (!tot) continue;
    let x = L;
    for (const b of order) { const wd = (rows[y][b] || 0) / tot * bw; img.rect(Math.round(x), 30 + y * S, Math.round(x + wd) - Math.round(x), S, C.biome[b]); x += wd; }
  }
  for (const lat of [60, 30, 0, -30, -60]) { const y = 30 + Math.round((75 - lat) / 150 * H * S); img.line(L - 4, y, L + bw, y, [30, 30, 30]); text(img, 6, y - 4, (lat > 0 ? lat + "N" : lat < 0 ? -lat + "S" : "EQ"), [40, 40, 40]); }
  order.forEach((b, k) => { img.rect(L + bw + 14, 34 + k * 18, 12, 12, C.biome[b]); text(img, L + bw + 32, 36 + k * 18, b, [40, 40, 40]); });
  savePNG(img, path.join(OUT, "chart-biome-latitude.png"));
}

/* the world sketch: grid squares, land links (green, thicker = wider border), sea links (blue:
   solid up to 6 cells, dashed up to 15, dotted up to 40), peoples' seats with their names */
function renderSketch(world) {
  const g = world._gen, sk = world.sketch, W = world.width, H = world.height, S = 6, R = world.regions;
  const ocean = (i) => g.E[i] <= 0.5;
  const base = mapLayer(world, S, (i) => {
    const c = g.lake[i] ? C.biome.lake : ocean(i) ? C.biome.barren : C.biome[R[i].biome] || [255, 0, 255];
    return c.map((v) => Math.round(v * 0.55 + 235 * 0.45));
  }, { coastColor: [90, 90, 90], lats: false });
  const img = Img(base.w, base.h + 22, [245, 242, 235]);
  text(img, 6, 5, "WORLD SKETCH, SEED " + world.seed + ": " + sk.peoples.length + " PEOPLES IN " + sk.squares.filter((s) => s.peoples.length).length + " SQUARES", [30, 30, 30]);
  img.blit(base, 0, 22);
  const oy = 22;
  for (const s of sk.squares) {
    img.rect(s.x0 * S, oy + s.y0 * S, (s.x1 - s.x0) * S, 1, [60, 60, 60]); img.rect(s.x0 * S, oy + s.y0 * S, 1, (s.y1 - s.y0) * S, [60, 60, 60]);
    text(img, s.x0 * S + 4, oy + s.y0 * S + 4, s.id + (s.openSea ? " SEA" : ""), [60, 60, 60]);
  }
  const ctr = (s) => [((s.x0 + s.x1) / 2) * S, oy + ((s.y0 + s.y1) / 2) * S];
  for (const l of sk.links) {
    const A = sk.squares[l.a], B = sk.squares[l.b];
    if (A.openSea || B.openSea) continue;
    let [ax, ay] = ctr(A), [bx, by] = ctr(B);
    if (bx - ax > img.w / 2) bx -= img.w; if (ax - bx > img.w / 2) bx += img.w;   /* across the seam: draw toward the edge */
    if (l.kind === "land") { img.line(ax, ay, bx, by, [40, 130, 50], Math.min(7, 1 + Math.round(Math.log2(l.width + 1)))); continue; }
    if (l.lane > 40) continue;
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 4), step = l.lane <= 6 ? 1 : l.lane <= 15 ? 3 : 6;
    for (let k = 0; k <= n; k++) if (k % step === 0 || step === 1) img.rect(Math.round(lerp(ax, bx, k / n)) + 3, Math.round(lerp(ay, by, k / n)) + 3, 2, 2, [30, 80, 200]);
  }
  /* hostile contacts as arrows from square to square, offset so both directions show:
     invasion red, raid purple, migration ochre, colonisation black; thick = conquest */
  if (sk.contacts) {
    const CC = { invasion: [200, 30, 30], raid: [140, 40, 170], migration: [210, 140, 0], colonisation: [10, 10, 10] };
    for (const c of sk.contacts) {
      if (!CC[c.kind] || c.outcome === "repelled") continue;
      const A = sk.squares.find((s) => s.id === c.from), B = sk.squares.find((s) => s.id === c.to);
      let [ax, ay] = ctr(A), [bx, by] = ctr(B);
      if (bx - ax > img.w / 2) bx -= img.w; if (ax - bx > img.w / 2) bx += img.w;
      const d = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / d * 8, ny = (bx - ax) / d * 8;
      ax += nx; ay += ny; bx += nx; by += ny;
      const ex = lerp(ax, bx, 0.8), ey = lerp(ay, by, 0.8);
      img.line(lerp(ax, bx, 0.2), lerp(ay, by, 0.2), ex, ey, CC[c.kind], c.outcome === "conquest" ? 3 : 1);
      const ux = (bx - ax) / d, uy = (by - ay) / d;
      img.line(ex, ey, ex - ux * 7 - uy * 4, ey - uy * 7 + ux * 4, CC[c.kind], 2);
      img.line(ex, ey, ex - ux * 7 + uy * 4, ey - uy * 7 - ux * 4, CC[c.kind], 2);
    }
  }
  const KC = { kingdom: [180, 30, 30], tribes: [120, 80, 30], nomads: [200, 140, 0] };
  for (const p of sk.peoples) {
    if (p.seat == null) continue;
    const r = R[p.seat], x = r.x * S + 3, y = oy + r.y * S + 3;
    img.rect(x - 3, y - 3, 7, 7, [20, 20, 20]); img.rect(x - 2, y - 2, 5, 5, KC[p.kind] || [0, 0, 0]);
    const label = p.name.replace(/[^A-Za-z0-9 -]/g, "");
    img.rect(x + 5, y - 4, textW(label, 1) + 3, 8, [250, 248, 240]);
    text(img, x + 6, y - 3, label, [20, 20, 20], 1);
  }
  savePNG(img, path.join(OUT, "sketch-" + world.seed + ".png"));
  if (!sk.contacts) return;
  /* the world timeline as text, and each lived square's development over time */
  fs.writeFileSync(path.join(OUT, "sketch-" + world.seed + ".txt"), sk.contacts.map((c) => c.text).join("\n") + "\n");
  const ages = world.pack.ages || [{ at: 0 }], top = ages[ages.length - 1].at * 1.15;
  const series = [];
  sk.squares.forEach((s, i) => {
    if (!s.peoples.length) return;
    const h = (i * 0.618) % 1, col = hsl(h, 0.6, 0.45);
    series.push({ pts: sk.years.map((y, t) => [y, sk.curves[i].learning[t]]), c: col, w: 1 });
  });
  for (let k = 1; k < ages.length; k++) series.push({ pts: [[sk.years[0], ages[k].at], [world.pack.endYear, ages[k].at]], c: [150, 150, 150], w: 1 });
  const y0 = world.pack.startYear, y1 = world.pack.endYear, xt = [];
  for (let y = Math.ceil(y0 / 1000) * 1000; y <= y1; y += 1000) xt.push(y);
  chart("sketch-" + world.seed + "-development.png", "SEED " + world.seed + ": DEVELOPMENT PER SQUARE (GREY: AGE THRESHOLDS)", [y0, y1], [0, top],
    series, xt, ages.slice(1).map((a) => a.at), []);
}

/* ------------------------------------------------------------------ main ----------- */
const results = [], worlds = [], tiles = { elev: [], biome: [] };
const sameTerrain = [];
const t0 = Date.now();
for (const seed of SEEDS) {
  let first = null;
  for (const packId of PACKS) {
    const ts = Date.now();
    const world = AEON.createWorld({ packId: packId, seed: seed });
    const ms = Date.now() - ts;
    if (!first) {
      first = world;
      const m = measure(world); m.genMs = world._gen.ms; m.createMs = ms;
      results.push(m); worlds.push(world);
      if (PNG) { const t = renderSeed(world, m); tiles.elev.push(t.elev); tiles.biome.push(t.biome); if (world.sketch) renderSketch(world); }
    } else {
      /* the generator only reads the pack for habitability: the terrain should be identical */
      const a = first._gen, b = world._gen; let diff = 0, hab = 0;
      for (let i = 0; i < a.E.length; i++) { if (a.E[i] !== b.E[i] || first.regions[i].biome !== world.regions[i].biome) diff++; if (first.regions[i].habitability !== world.regions[i].habitability) hab++; }
      sameTerrain.push({ seed: seed, terrainCellsDiffering: diff, habitabilityDiffering: hab });
    }
  }
  process.stdout.write(".");
}
process.stdout.write(" " + (Date.now() - t0) + " ms\n");

/* aggregate: min / median / max over seeds of every numeric leaf */
function leaves(o, pre, out) {
  for (const k of Object.keys(o)) {
    const v = o[k], key = pre ? pre + "." + k : k;
    if (typeof v === "number") (out[key] = out[key] || []).push(v);
    else if (v && typeof v === "object" && !Array.isArray(v)) leaves(v, key, out);
  }
  return out;
}
const all = {};
for (const m of results) leaves(m, "", all);
const agg = {};
for (const k of Object.keys(all)) { if (k === "seed") continue; const s = all[k].slice().sort((a, b) => a - b); agg[k] = { min: s[0], med: s[(s.length / 2) | 0], max: s[s.length - 1], n: s.length }; }
/* pooled zonal profiles */
const zonalP = results[0].precip.zonalLand.map(([lat], k) => [lat, r3(mean(results.map((m) => m.precip.zonalLand[k][1]).filter((v) => !isNaN(v))))]);
const pooled = (key) => results[0][key.split(".")[0]][key.split(".")[1]].map((v, k) => r2(mean(results.map((m) => m[key.split(".")[0]][key.split(".")[1]][k]).filter((v) => !isNaN(v)))));

const lines = [];
lines.push("Aeon worldgen realism harness - " + results.length + " seeds x " + PACKS.length + " packs, terrain only");
lines.push("Temperature fit: degC = " + r2(TFIT.a) + " + " + r2(TFIT.b) + " x T   (generator T at sea level vs Earth zonal means)");
lines.push("  lat  model/earth: " + TFIT.res.map((r) => r[0] + ":" + r[1] + "/" + r[2]).join("  "));
lines.push("  biome cut-offs in degC: ice<" + r1(degC(0.1)) + " tundra<" + r1(degC(0.22)) + " taiga<" + r1(degC(0.43)) + " temperate<" + r1(degC(0.62)) + " tropical>=" + r1(degC(0.62)) + " jungle>" + r1(degC(0.66)));
lines.push("Same terrain across packs: " + sameTerrain.every((s) => s.terrainCellsDiffering === 0) + " (habitability differs in " + mean(sameTerrain.map((s) => s.habitabilityDiffering)).toFixed(0) + " cells on average)");
lines.push("");
lines.push("metric                                         min       median    max");
for (const k of Object.keys(agg)) lines.push(k.padEnd(46) + String(agg[k].min).padStart(9) + String(agg[k].med).padStart(10) + String(agg[k].max).padStart(9));
lines.push("");
lines.push("zonal mean land precipitation (relative), pooled: " + zonalP.map((z) => z[0] + ":" + z[1]).join(" "));
lines.push("inland decay, mean P at 0-1, 2-3, 4-6, 7-10, 11-16, 17+ cells from the sea, pooled:");
lines.push("  35-60 deg: " + JSON.stringify(pooled("precip.inland35to60")) + "   0-15 deg: " + JSON.stringify(pooled("precip.inland0to15")));
lines.push("coastal depth (m, assumed scale) 1..6 cells offshore, pooled: " + JSON.stringify(pooled("hypsometry.depthByCellsFromCoastM")));
lines.push("plate shares (seed " + results[0].seed + "): " + results[0].plates.shares.join(" "));
lines.push("biomes (median % of ice-free land) vs Earth:");
for (const b of Object.keys(EARTH.biomes)) lines.push("  " + b.padEnd(10) + String(agg["biomes." + b] ? agg["biomes." + b].med : 0).padStart(6) + "  (" + (agg["biomes." + b] ? agg["biomes." + b].min + "-" + agg["biomes." + b].max : "-") + ")   Earth ~" + EARTH.biomes[b] + "   mean " + (agg["biomeMeanC." + b] ? agg["biomeMeanC." + b].med : "-") + " C");
const summary = lines.join("\n");
fs.writeFileSync(path.join(OUT, "summary.txt"), summary + "\n");
fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify({ tfit: TFIT, earth: EARTH, sameTerrain: sameTerrain, aggregate: agg, zonalP: zonalP, seeds: results }, null, 1));
console.log(summary);

if (PNG) {
  overview("elevation", tiles.elev, SEEDS);
  overview("biomes", tiles.biome, SEEDS);
  biomeLatChart(worlds);
  const latOfRow = (w, i) => 75 * (1 - 2 * (((i / w.width) | 0) + 0.5) / w.height);
  /* zonal temperature: generator at sea level (fitted) vs Earth, plus the land mean */
  const tm = [], te = [];
  for (let d = 0; d <= 75; d++) { tm.push([d, degC(T0(d))]); te.push([d, tab(EARTH.T, d)]); }
  const tl = [];
  for (let b = 0; b < 75; b += 5) {
    let s = 0, n = 0;
    for (const w of worlds) for (let i = 0; i < w.regions.length; i++) { const lat = Math.abs(latOfRow(w, i)); if (lat >= b && lat < b + 5 && w._gen.E[i] > 0.5 && !w._gen.lake[i]) { s += degC(w._gen.T[i]); n++; } }
    tl.push([b + 2.5, s / n]);
  }
  chart("chart-temperature.png", "ZONAL MEAN TEMPERATURE, C", [0, 75], [-30, 35],
    [{ pts: te, c: [20, 20, 20], w: 3 }, { pts: tm, c: [210, 40, 40] }, { pts: tl, c: [240, 150, 30] }], [0, 15, 30, 45, 60, 75], [-30, -20, -10, 0, 10, 20, 30],
    [{ name: "EARTH", c: [20, 20, 20] }, { name: "MODEL SEA LEVEL", c: [210, 40, 40] }, { name: "MODEL LAND", c: [240, 150, 30] }]);
  const pmax = Math.max.apply(null, zonalP.map((z) => z[1]));
  chart("chart-precipitation.png", "ZONAL LAND PRECIPITATION, EACH SCALED TO ITS MAXIMUM", [0, 75], [0, 1.05],
    [{ pts: EARTH.P, c: [20, 20, 20], w: 3 }, { pts: zonalP.map((z) => [z[0], z[1] / pmax]), c: [40, 90, 210] }], [0, 15, 30, 45, 60, 75], [0, 0.25, 0.5, 0.75, 1],
    [{ name: "EARTH (SHAPE)", c: [20, 20, 20] }, { name: "MODEL", c: [40, 90, 210] }]);
  /* hypsographic curve: % of the surface above each elevation */
  const curve = [];
  for (let e = 1; e >= -0.001; e -= 0.01) {
    let above = 0, tot = 0;
    for (const w of worlds) for (let i = 0; i < w.regions.length; i++) { const a = Math.cos(latOfRow(w, i) * Math.PI / 180); tot += a; if (w._gen.E[i] >= e) above += a; }
    curve.push([100 * above / tot, e >= 0.5 ? (e - 0.5) / 0.5 * EARTH.topM : (0.5 - e) / 0.5 * EARTH.deepM]);
  }
  chart("chart-hypsometry.png", "HYPSOGRAPHIC CURVE: % OF SURFACE ABOVE ELEVATION (M)", [0, 100], [-7000, 5000],
    [{ pts: EARTH.hyps.map(([z, p]) => [p, z]), c: [20, 20, 20], w: 3 }, { pts: curve, c: [160, 90, 40] }], [0, 20, 40, 60, 80, 100], [-6000, -4000, -2000, 0, 2000, 4000],
    [{ name: "EARTH", c: [20, 20, 20] }, { name: "MODEL, ALL SEEDS", c: [160, 90, 40] }]);
  console.log("PNGs in " + OUT);
}
