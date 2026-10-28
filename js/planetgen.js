/* Aeon — planet generation, physically motivated.

   Pipeline (each stage reads the ones before it):
     1. plates       irregular plates grown by noisy flood fill; each drifts
     2. crust        continental cores inside some plates; shelves at their edges
     3. tectonics    boundary type decides relief: collision ranges, subduction
                     ranges + trenches, island arcs, rifts, mid-ocean ridges,
                     plus hotspot island chains trailing behind plate motion
     4. erosion      rivers carve valleys along a drainage tree
     5. climate      temperature from latitude, altitude and ocean currents;
                     three-cell winds carry moisture; mountains wring it out
     6. hydrology    depressions become lakes or dry basins depending on the
                     water balance; rivers fed by real runoff
     7. biomes       Whittaker-style: temperature x moisture, swamps only where
                     the ground is flat and waterlogged

   The map wraps east-west, like a planet. Every random draw uses `rng`. */
(function () {
"use strict";

const AEON = window.AEON = window.AEON || {};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const r3 = (v) => Math.round(v * 1000) / 1000;

/* ---------------------------------------------------------------- noise -- */
/* Seeded 3D value noise. Sampled on a cylinder so the map wraps seamlessly. */
function makeNoise(rng) {
  const P = new Uint16Array(512), V = new Float32Array(256);
  const perm = [];
  for (let i = 0; i < 256; i++) perm.push(i);
  for (let i = 255; i > 0; i--) { const j = rng.int(0, i); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  for (let i = 0; i < 256; i++) V[i] = rng.next() * 2 - 1;
  const off = [];
  for (let k = 0; k < 8; k++) off.push([rng.range(0, 256), rng.range(0, 256), rng.range(0, 256)]);
  const sm = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function n3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const X = xi & 255, Y = yi & 255, Z = zi & 255;
    const h = (a, b, c) => V[P[P[P[a] + b] + c] & 255];
    const u = sm(xf), v = sm(yf), w = sm(zf);
    const x1 = (X + 1) & 255, y1 = (Y + 1) & 255, z1 = (Z + 1) & 255;
    return lerp(
      lerp(lerp(h(X, Y, Z), h(x1, Y, Z), u), lerp(h(X, y1, Z), h(x1, y1, Z), u), v),
      lerp(lerp(h(X, Y, z1), h(x1, Y, z1), u), lerp(h(X, y1, z1), h(x1, y1, z1), u), v), w);
  }
  function fbm(x, y, z, oct, gain) {
    let s = 0, a = 1, norm = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      const d = off[o & 7];
      s += a * n3(x * f + d[0], y * f + d[1], z * f + d[2]);
      norm += a; a *= gain; f *= 2.03;
    }
    return s / norm;
  }
  function ridged(x, y, z, oct) {
    let s = 0, a = 1, norm = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      const d = off[(o + 3) & 7];
      const r = 1 - Math.abs(n3(x * f + d[0], y * f + d[1], z * f + d[2]));
      s += a * r * r; norm += a; a *= 0.5; f *= 2.1;
    }
    return s / norm;
  }
  return { n3: n3, fbm: fbm, ridged: ridged };
}

/* ---------------------------------------------------------------- heap --- */
function Heap(n) {
  const keys = new Float64Array(n), ids = new Int32Array(n);
  let size = 0;
  const less = (a, b) => keys[a] < keys[b] || (keys[a] === keys[b] && ids[a] < ids[b]);
  const swap = (a, b) => { const k = keys[a], d = ids[a]; keys[a] = keys[b]; ids[a] = ids[b]; keys[b] = k; ids[b] = d; };
  return {
    size: () => size,
    push(k, id) {
      let i = size++; keys[i] = k; ids[i] = id;
      while (i > 0) { const p = (i - 1) >> 1; if (less(i, p)) { swap(i, p); i = p; } else break; }
    },
    topKey: () => keys[0],
    pop() {
      const top = ids[0]; size--;
      if (size > 0) {
        keys[0] = keys[size]; ids[0] = ids[size];
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < size && less(l, m)) m = l;
          if (r < size && less(r, m)) m = r;
          if (m === i) break;
          swap(i, m); i = m;
        }
      }
      return top;
    },
  };
}

/* priority-flood from the sea: Ef = depression-filled surface; parent = the downstream
   neighbour; order = pop order (low to high). Guarantees drainage. */
function floodFill(N, NB8, E, sea, runoff) {
  const Ef = new Float32Array(N), parent = new Int32Array(N).fill(-1), order = new Int32Array(N);
  const done = new Uint8Array(N), heap = Heap(N * 8 + 8);
  let o = 0;
  for (let i = 0; i < N; i++) if (E[i] <= sea) { Ef[i] = E[i]; heap.push(E[i], i); done[i] = 1; }
  while (heap.size()) {
    const c = heap.pop();
    order[o++] = c;
    for (let k = 0; k < 8; k++) {
      const n = NB8[c * 8 + k];
      if (n < 0 || done[n]) continue;
      done[n] = 1;
      Ef[n] = Math.max(E[n], Ef[c] + 1e-5);
      parent[n] = c;
      heap.push(Ef[n], n);
    }
  }
  const acc = new Float32Array(N);
  for (let k = o - 1; k >= 0; k--) {
    const c = order[k];
    if (E[c] <= sea) continue;
    acc[c] += runoff ? runoff[c] : 1;
    if (parent[c] >= 0) acc[parent[c]] += acc[c];
  }
  return { Ef: Ef, parent: parent, order: order, count: o, acc: acc };
}

/* heights: metres <-> E (the sea at 0.5; 5,000 m at 1, held there above; -7,000 m at 0) */
const TOP_M = 5000, DEEP_M = 7000;
function eOfM(h) { return h > 0 ? 0.5015 + 0.4985 * Math.min(1, h / TOP_M) : 0.5 * Math.max(0, 1 + h / DEEP_M); }
function mOfE(e) { return e > 0.5 ? Math.max(0, (e - 0.5015) / 0.4985) * TOP_M : (e / 0.5 - 1) * DEEP_M; }
/* cooling with height, in the T scale (1 = 55.6 degC): 6 degC a km, a little under the free
   air's 6.5, as sunlit ground warms the air over it */
const LAPSE_T = 6 / 55.6;
/* the treeline by latitude (degrees), in metres; above it land is "mountain": rock, alpine
   meadow and glacier. ~3,800 m in the tropics, ~2,200 m at 45 degrees, never under 500 m */
function treeline(deg) {
  return Math.max(500, deg <= 20 ? 3800 : deg <= 45 ? 3800 - (deg - 20) * 64 : 2200 - (deg - 45) * 82);
}
/* how far (m) a height h at latitude deg stands above where mountains begin: the treeline, and
   never under 1,200 m (low cold uplands above the treeline are tundra) */
function overTree(h, deg) { return Math.min(h - treeline(deg), h - 1200); }

function quantile(arr, q) {
  const s = Float32Array.from(arr).sort();
  return s[clamp(Math.floor(s.length * q), 0, s.length - 1)];
}

/* ============================================================ generate === */

function generate(world, pack, rng) {
  const W = world.width, H = world.height, N = W * H;
  const t0 = Date.now();

  /* ----- grid topology (wraps in x) ----- */
  const wx = (x) => ((x % W) + W) % W;
  const NB4 = new Int32Array(N * 4).fill(-1);
  const NB8 = new Int32Array(N * 8).fill(-1);
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    for (let k = 0; k < 8; k++) {
      const ny = y + D8[k][1];
      if (ny < 0 || ny >= H) continue;
      const j = ny * W + wx(x + D8[k][0]);
      NB8[i * 8 + k] = j;
      if (k < 4) NB4[i * 4 + k] = j;
    }
  }
  /* shortest signed x-offset from a to b on the cylinder */
  const dxw = (ax, bx) => { let d = bx - ax; if (d > W / 2) d -= W; if (d < -W / 2) d += W; return d; };

  /* The grid's metric. A column is as wide as a row at the equator and cos(latitude) of that
     further out, so every east-west distance (plate growth, the reach of uplift, blurs, distance
     from the coast and the sea floor's age, winds, currents) is scaled by KX of its row. */
  const KX = new Float32Array(H);
  for (let y = 0; y < H; y++) KX[y] = Math.max(0.2, Math.cos((0.5 - (y + 0.5) / H) * Math.PI * (75 / 90)));
  /* noise coordinates: each row a circle of circumference W cos(latitude) cells, so noise
     features have one size on the ground everywhere */
  const R = W / (2 * Math.PI);
  const CX = new Float32Array(N), CZ = new Float32Array(N), CY = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, th = (x / W) * 2 * Math.PI;
    CX[i] = Math.cos(th) * R * KX[y]; CZ[i] = Math.sin(th) * R * KX[y]; CY[i] = y;
  }
  const noise = makeNoise(rng), noise2 = makeNoise(rng), noise3 = makeNoise(rng);
  const nf = (nz, i, freq, oct, gain) => nz.fbm(CX[i] * freq, CY[i] * freq, CZ[i] * freq, oct, gain);

  const latRad = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    /* the map spans 75S..75N: a flat map that ran pole to pole would give the polar
       rows as many cells as the equator and bury a third of the land in ice */
    const lat = (0.5 - (y + 0.5) / H) * Math.PI * (75 / 90);
    for (let x = 0; x < W; x++) latRad[y * W + x] = lat;
  }

  /* ================================================== 1. plates ======== */
  const nPlates = rng.int(9, 14);
  const plateOf = new Int16Array(N).fill(-1);
  const plates = [];
  const jitter = new Float32Array(N);
  for (let i = 0; i < N; i++) jitter[i] = clamp(0.5 + nf(noise, i, 0.09, 3, 0.55) * 1.3, 0, 1);
  {
    const heap = Heap(N * 4 + 64);
    const used = {};
    for (let p = 0; p < nPlates; p++) {
      let s;
      do { s = rng.int(0, N - 1); } while (used[s]);
      used[s] = true;
      const dir = rng.range(0, 2 * Math.PI), speed = rng.range(0.35, 1);
      plates.push({ id: p, seed: s, vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed * 0.8,
                    rate: rng.range(0.6, 1.45), density: rng.next(), area: 0, continental: false });
      heap.push(0, s * 16 + p);
    }
    const cost = new Float64Array(N).fill(Infinity);
    while (heap.size()) {
      const c = heap.topKey(), v = heap.pop(), cell = v >> 4, p = v & 15;
      if (plateOf[cell] !== -1) continue;
      plateOf[cell] = p; plates[p].area++;
      for (let k = 0; k < 4; k++) {
        const n = NB4[cell * 4 + k];
        if (n < 0 || plateOf[n] !== -1) continue;
        const nc = c + (0.4 + 1.6 * jitter[n]) / plates[p].rate * (k < 2 ? KX[(cell / W) | 0] : 1);
        if (nc < cost[n]) { cost[n] = nc; heap.push(nc, n * 16 + p); }
      }
    }
  }

  /* ================================================== 2. crust ========= */
  const cont = new Uint8Array(N);
  {
    const target = N * rng.range(0.31, 0.4);
    let covered = 0;
    const order = rng.shuffle(plates.slice());
    for (const pl of order) {
      if (covered >= target) break;
      if (pl.area < N * 0.015) continue;
      pl.continental = true;
      const want = Math.min(Math.round(pl.area * rng.range(0.4, 0.88)), Math.round(target - covered + pl.area * 0.15));
      const cells = [];
      for (let i = 0; i < N; i++) if (plateOf[i] === pl.id) cells.push(i);
      /* grow a continental core from a random cell, noisily, inside the plate */
      const start = rng.pick(cells);
      const heap = Heap(cells.length * 4 + 8);
      heap.push(0, start);
      const seen = new Uint8Array(N);
      seen[start] = 1;
      let grown = 0;
      while (heap.size() && grown < want) {
        const c = heap.topKey(), cell = heap.pop();
        cont[cell] = 1; grown++;
        for (let k = 0; k < 4; k++) {
          const n = NB4[cell * 4 + k];
          if (n < 0 || seen[n] || plateOf[n] !== pl.id) continue;
          seen[n] = 1;
          heap.push(c + (0.3 + jitter[n] * 2.2 + rng.next() * 0.4) * (k < 2 ? KX[(cell / W) | 0] : 1), n);
        }
      }
      covered += grown;
    }
  }

  /* ================================================== 3. tectonics ===== */
  /* For each boundary cell, the strongest interaction with a neighbouring plate
     decides an effect: { amp, width, peak } spread inland along the plate. */
  /* effAmp is the effect's strength on the old unitless scale (what later stages read as
     `uplift`); effM is its height in metres, which builds the elevation */
  const effAmp = new Float32Array(N), effM = new Float32Array(N), effW = new Float32Array(N), effPeak = new Float32Array(N), effOther = new Int16Array(N);
  const isSource = new Uint8Array(N), ridge = new Uint8Array(N);
  const stress = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, A = plates[plateOf[i]];
    let best = 0, bm = 0, bw = 0, bp = 0, bo = 0;
    for (let k = 0; k < 4; k++) {
      const j = NB4[i * 4 + k];
      if (j < 0 || plateOf[j] === plateOf[i]) continue;
      const B = plates[plateOf[j]];
      const jx = j % W, jy = (j / W) | 0;
      const nx = dxw(x, jx), ny = jy - y;
      const c = clamp((A.vx - B.vx) * nx + (A.vy - B.vy) * ny, -1.6, 1.6);   /* + = converging */
      const ci = cont[i], cj = cont[j];
      let amp = 0, m = 0, w = 1, pk = 0;
      if (c > 0) {
        if (ci && cj) { amp = 0.44 * c; m = 4800 * c; w = 4.5; pk = 1; }                   /* collision orogeny */
        else if (ci && !cj) { amp = 0.36 * c; m = 4400 * c; w = 2.6; pk = 2; }             /* andean margin */
        else if (!ci && cj) { amp = -0.17 * c; m = -2500 * c; w = 1.2; pk = 0; }           /* trench, subducting */
        else if (A.density < B.density) { amp = 0.3 * c; m = 5600 * c; w = 1.5; pk = 1; }  /* island arc */
        else { amp = -0.15 * c; m = -2500 * c; w = 1.2; pk = 0; }
      } else if (c < 0) {
        if (ci) { amp = 0.12 * c; m = 1400 * c; w = 1.6; pk = 0; }                          /* continental rift */
        else { amp = -0.08 * c; m = 0; w = 2.6; pk = 0; }       /* mid-ocean ridge: its height is the young floor's (below) */
      }
      if (Math.abs(amp) > Math.abs(best)) { best = amp; bm = m; bw = w; bp = pk; bo = plateOf[j]; }
      stress[i] = Math.max(stress[i], Math.abs(c));
      if (c < 0 && !ci && !cj) ridge[i] = 1;
    }
    if (best !== 0) { isSource[i] = 1; effAmp[i] = best; effM[i] = bm; effW[i] = bw; effPeak[i] = bp; effOther[i] = bo; }
  }
  /* spread each effect inland within its own plate (multi-source BFS) */
  const srcOf = new Int32Array(N).fill(-1), dist = new Float32Array(N).fill(Infinity);
  {
    const heap = Heap(N * 5 + 8);
    for (let i = 0; i < N; i++) if (isSource[i]) { srcOf[i] = i; dist[i] = 0; heap.push(0, i); }
    while (heap.size()) {
      const d0 = heap.topKey(), c = heap.pop();
      if (d0 > dist[c] || d0 > 12) continue;
      const kx = KX[(c / W) | 0];
      for (let k = 0; k < 4; k++) {
        const n = NB4[c * 4 + k];
        if (n < 0 || plateOf[n] !== plateOf[c]) continue;
        const nd = d0 + (k < 2 ? kx : 1);
        if (nd < dist[n]) { dist[n] = nd; srcOf[n] = srcOf[c]; heap.push(nd, n); }
      }
    }
  }
  const uplift = new Float32Array(N), upliftM = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const s = srcOf[i];
    if (s < 0) continue;
    const d = dist[i], w = effW[s], pk = effPeak[s], f = Math.exp(-((d - pk) * (d - pk)) / (w * w));
    uplift[i] = effAmp[s] * f;
    upliftM[i] = effM[s] * f;
  }

  /* hotspots: volcanic chains dragged out behind the moving plate */
  const hotspots = [];
  const nHot = rng.int(1, 3);
  for (let h = 0; h < nHot; h++) {
    const s = rng.int(0, N - 1), pl = plates[plateOf[s]];
    const sp = Math.hypot(pl.vx, pl.vy) || 1, dx = -pl.vx / sp, dy = -pl.vy / sp;
    const len = rng.int(4, 9), sx = s % W, sy = (s / W) | 0;
    hotspots.push({ x: sx, y: sy });
    for (let k = 0; k <= len; k++) {
      const cy = sy + dy * k * 2.3, kh = KX[clamp(Math.round(cy), 0, H - 1)], cx = sx + dx * k * 2.3 / kh, ex = Math.ceil(2 / kh);
      const amp = 0.27 * Math.exp(-k * 0.33) * (cont[s] ? 0.4 : 1);
      const ampM = 6500 * Math.exp(-k * 0.33) * (cont[s] ? 0.35 : 1);
      for (let oy = -2; oy <= 2; oy++) for (let ox = -ex; ox <= ex; ox++) {
        const yy = Math.round(cy) + oy;
        if (yy < 0 || yy >= H) continue;
        const i = yy * W + wx(Math.round(cx) + ox);
        const r2 = ox * kh * ox * kh + oy * oy;
        uplift[i] += amp * Math.exp(-r2 / 1.4);
        upliftM[i] += ampM * Math.exp(-r2 / 1.4);
      }
    }
  }

  /* a straight plate boundary can leave a one-cell-wide wall; belts should be broad */
  for (const u of [uplift, upliftM]) {
    const soft = blurWrap(u, W, H, 1, KX);
    for (let i = 0; i < N; i++) u[i] = u[i] * 0.45 + soft[i] * 0.55;
  }

  /* ----- assemble elevation, in metres above sea level -----
     The sea is at 0 m for every world and the crust decides what lies above it
     (docs/WORLDGEN_REALISM.md, fixes 4 and 5):
     - continental crust stands a few hundred metres up, lower toward its edges, so about a
       quarter of it is shelf sea 40-220 m deep (marginal seas, shelf islands)
     - the ocean floor deepens as it ages and cools, from 2.6 km at the ridges to ~5 km at
       100 million years, levelling off near 5.5 km (a cell is ~267 km, sea floor spreads ~25 km
       a million years: ~10.7 Myr a cell), with
       the continental slope at the foot of every shelf
     - the plate boundaries add their heights in metres: ranges, arcs, trenches, rifts */
  /* distance in cells over 8 neighbours (diagonals sqrt 2), so the floor's age lines run round,
     not in diamonds */
  const bfs = function (from, through, cap) {
    const d = new Float32Array(N).fill(cap), heap = Heap(N * 8 + 8);
    for (let i = 0; i < N; i++) if (from(i)) { d[i] = 0; heap.push(0, i); }
    while (heap.size()) {
      const k0 = heap.topKey(), c = heap.pop();
      if (k0 > d[c]) continue;
      for (let k = 0; k < 8; k++) {
        const kx = KX[(c / W) | 0], n = NB8[c * 8 + k], nd = d[c] + (k < 2 ? kx : k < 4 ? 1 : Math.hypot(kx, 1));
        if (n >= 0 && through(n) && nd < d[n]) { d[n] = nd; heap.push(nd, n); }
      }
    }
    return d;
  };
  const dCont = bfs((i) => !cont[i], (i) => cont[i], 30);         /* 1 on a continent's edge */
  const dFoot = bfs((i) => cont[i], (i) => !cont[i], 30);         /* 1 at the foot of its slope */
  const dRidge = bfs((i) => ridge[i], (i) => !cont[i], 40);       /* cells of sea floor from a ridge */
  /* behind the ranges the crust stands higher: uplands and plateaus */
  const halo = blurWrap(upliftM.map(function (v) { return Math.max(0, v); }), W, H, 3, KX);
  /* ----- continental geology -----
     A continent is a patchwork of provinces welded together over its history: old shields (a
     few hundred metres, worn flat), sedimentary platforms (the great lowland plains) and a few
     broad swells (East Africa). Where two provinces were welded an old range has worn down to
     hills (Appalachians, Urals). Behind a young collision the overriding plate is pushed up into
     a plateau (Tibet, the Altiplano behind the Andes), and in front of each young range a
     foreland basin sinks under its debris (Ganges, Po, Chaco). */
  const geoBase = new Float32Array(N).fill(300), suture = new Float32Array(N), plateau = new Float32Array(N), foreland = new Float32Array(N);
  {
    const prov = new Int32Array(N).fill(-1), cells = [];
    for (let i = 0; i < N; i++) if (cont[i]) cells.push(i);
    const nProv = clamp(Math.round(cells.length / 110), 3, 120), base = [];
    const heap = Heap(N * 8 + 256), cost = new Float32Array(N).fill(Infinity);
    for (let p = 0; p < nProv && cells.length; p++) {
      const s = rng.pick(cells), r = rng.next();
      base.push(r < 0.5 ? rng.range(10, 160) : r < 0.87 ? rng.range(220, 500) : rng.range(700, 1200));
      cost[s] = 0; heap.push(0, s * 128 + p);
    }
    while (heap.size()) {
      const c0 = heap.topKey(), v = heap.pop(), c = (v / 128) | 0, p = v % 128;
      if (prov[c] >= 0) continue;
      prov[c] = p;
      for (let k = 0; k < 4; k++) {
        const n = NB4[c * 4 + k];
        if (n < 0 || !cont[n] || prov[n] >= 0) continue;
        const nc = c0 + 0.5 + jitter[n] * 1.5;
        if (nc < cost[n]) { cost[n] = nc; heap.push(nc, n * 128 + p); }
      }
    }
    for (let i = 0; i < N; i++) geoBase[i] = prov[i] >= 0 ? base[prov[i]] : cont[i] ? 300 : 150;
    geoBase.set(blurWrap(geoBase, W, H, 2, KX));
    /* about half the provinces' seams are old ranges, each worn to its own height */
    const seam = new Map();
    for (let i = 0; i < N; i++) {
      if (prov[i] < 0) continue;
      for (let k = 0; k < 4; k++) {
        const n = NB4[i * 4 + k];
        if (n < 0 || prov[n] < 0 || prov[n] === prov[i]) continue;
        const key = Math.min(prov[i], prov[n]) * 128 + Math.max(prov[i], prov[n]);
        if (!seam.has(key)) seam.set(key, rng.next() < 0.5 ? rng.range(500, 1400) : 0);
        suture[i] = Math.max(suture[i], seam.get(key));
      }
    }
    suture.set(blurWrap(suture, W, H, 1, KX));
    /* plateaus and foreland basins from the young ranges, by distance from their plate boundary */
    for (let i = 0; i < N; i++) {
      const s = srcOf[i];
      if (s < 0 || !cont[i] || effM[s] < 1500) continue;
      const d = dist[i], pk = effPeak[s], w = effW[s];
      const over = pk === 2 || plates[plateOf[i]].density < plates[effOther[s]].density;
      if (over) {
        const far = pk + 1.3 * w;
        plateau[i] = effM[s] * (pk === 2 ? 0.35 : 0.5) * (d <= far ? 1 : Math.exp(-((d - far) * (d - far)) / (0.6 * w * w)));
      }
      const c0 = over ? pk + 2.4 * w : pk + 1.1 * w;
      foreland[i] = -350 * Math.exp(-((d - c0) * (d - c0)) / 2.5);
    }
  }
  const hm = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let h;
    if (cont[i]) {
      /* the province's level, its old ranges (worn, ridged), plateau and foreland, a gentle swell
         over all so the plains drain, and the drop toward the continent's edge */
      const worn = suture[i] * (0.5 + 0.9 * noise2.ridged(CX[i] * 0.3, CY[i] * 0.3, CZ[i] * 0.3, 3));
      h = geoBase[i] + worn + plateau[i] * (1 - clamp(upliftM[i] / Math.max(1, plateau[i] * 2), 0, 1) * 0.5) + foreland[i]
          + 0.1 * halo[i] + 260 * nf(noise, i, 0.035, 4, 0.5) + 140 * nf(noise3, i, 0.14, 3, 0.5) - 900 * Math.exp(-(dCont[i] - 1) / 1.6);
    } else {
      h = -(2600 + 2900 * (1 - Math.exp(-dRidge[i] * 10.7 / 60)));
      if (dFoot[i] <= 1) h = Math.max(h, -3000);
      h += 250 * nf(noise3, i, 0.14, 3, 0.5);
    }
    const mtn = clamp(upliftM[i] / 1500, 0, 1);
    h += upliftM[i] + (noise2.ridged(CX[i] * 0.16, CY[i] * 0.16, CZ[i] * 0.16, 4) - 0.55) * 1800 * mtn;
    /* the highest ranges grow more slowly than the push under them (erosion, gravity) */
    if (h > 5000) h = 5000 + (h - 5000) * 0.4;
    /* continental crust below the sea is shelf (a rift may sink deeper) */
    if (cont[i] && h < 0 && upliftM[i] > -300) h = -40 - 180 * (1 - Math.exp(h / 400));
    hm[i] = h;
  }

  /* ================================================== 4. erosion ======= */
  for (let pass = 0; pass < 3; pass++) {
    const f = floodFill(N, NB8, hm, 0, null);
    for (let k = 0; k < f.count; k++) {
      const c = f.order[k], p = f.parent[c];
      if (hm[c] <= 0 || p < 0) continue;
      const drop = hm[c] - hm[p];
      if (drop <= 0) continue;
      const cut = 0.011 * Math.sqrt(f.acc[c]) * drop;
      hm[c] = Math.max(hm[p] + 0.5, hm[c] - cut);
    }
  }

  /* big rivers grade their beds: they run down a gentle slope to the sea (the Amazon falls about
     10 m in 270 km) and lay a floodplain either side; where one meets a shallow shelf it builds
     a delta out into the sea. Young ranges keep their gorges. geo marks what is left for the
     regions: 1 delta, 2 floodplain, 4 plateau, 8 old worn range */
  const geo = new Uint8Array(N);
  {
    const f = floodFill(N, NB8, hm, 0, null);
    for (let k = 0; k < f.count; k++) {
      const c = f.order[k], p = f.parent[c];
      if (hm[c] <= 0 || p < 0 || f.acc[c] < 12 || upliftM[c] >= 1000) continue;
      const bed = Math.max(0, hm[p]) + 8 + 700 / f.acc[c];
      if (hm[c] > bed) hm[c] = bed;
    }
    for (let k = 0; k < f.count; k++) {
      const c = f.order[k], p = f.parent[c];
      if (hm[c] <= 0 || p < 0 || f.acc[c] < 40 || upliftM[c] >= 1000) continue;
      geo[c] |= 2;
      for (let j = 0; j < 8; j++) {
        const n = NB8[c * 8 + j];
        if (n < 0 || hm[n] <= 0 || upliftM[n] >= 600 || hm[n] > hm[c] + 400) continue;
        if (hm[n] > hm[c] + 60) { hm[n] = hm[c] + 60; geo[n] |= 2; }
      }
      if (hm[p] <= 0 && hm[p] > -250 && f.acc[c] >= 60) { hm[p] = 4; geo[p] |= 1; geo[c] |= 1; }
    }
    for (let i = 0; i < N; i++) {
      if (hm[i] <= 0) continue;
      if (plateau[i] > 1200 && hm[i] > 2000 && upliftM[i] < plateau[i]) geo[i] |= 4;
      if (suture[i] > 350 && upliftM[i] < 500 && hm[i] > geoBase[i] + 300) geo[i] |= 8;
    }
  }

  /* E, the 0..1 scale every later stage reads: the sea at 0.5, 5,000 m at 1 (higher is held at 1),
     -7,000 m at 0; the same scale for every world */
  const E = new Float32Array(N);
  for (let i = 0; i < N; i++) E[i] = eOfM(hm[i]);
  /* water below sea level that does not reach the ocean is no sea: a closed basin under 40 cells
     (a rift valley, a sunken plain) becomes land below sea level, and the hydrology fills it
     with a lake or leaves it dry by its water balance (Caspian, Dead Sea, Tanganyika, Turpan).
     E stays just above the sea with a slight bowl, the metres keep the true depth. */
  {
    const seen = new Int32Array(N).fill(-1), comps = [];
    for (let i = 0; i < N; i++) {
      if (E[i] > 0.5 || seen[i] >= 0) continue;
      const cells = [i]; seen[i] = comps.length;
      for (let h = 0; h < cells.length; h++) for (let k = 0; k < 4; k++) {
        const n = NB4[cells[h] * 4 + k];
        if (n >= 0 && E[n] <= 0.5 && seen[n] < 0) { seen[n] = comps.length; cells.push(n); }
      }
      comps.push(cells);
    }
    const ocean = comps.reduce((a, c) => (c.length > a.length ? c : a), []);
    for (const c of comps) if (c !== ocean && c.length < 40) for (const i of c) E[i] = 0.5016 + 0.002 * clamp(1 + hm[i] / 3000, 0, 1);
  }
  const isOcean = (i) => E[i] <= 0.5;

  /* ----- seam: the map wraps east-west, so turn the planet until the left/right edge runs
     through the widest stretch of open water instead of cutting a continent in two. Every
     per-cell layer that later stages read is rolled by the same number of columns. ----- */
  const srcAmp = new Float32Array(N);
  for (let i = 0; i < N; i++) srcAmp[i] = srcOf[i] >= 0 ? effAmp[srcOf[i]] : 0;
  {
    const colLand = new Float32Array(W);
    for (let i = 0; i < N; i++) if (!isOcean(i)) colLand[i % W]++;
    /* the seam sits between columns c-1 and c; columns nearest it count most */
    const WT = [[-3, 1], [-2, 2], [-1, 3], [0, 3], [1, 2], [2, 1]];
    let best = 0, bestScore = Infinity;
    for (let c = 0; c < W; c++) {
      let s = 0;
      for (const [d, wgt] of WT) s += colLand[wx(c + d)] * wgt;
      if (s < bestScore) { bestScore = s; best = c; }
    }
    const off = (W - best) % W;
    if (off) {
      const roll = function (a) {
        const src = a.slice();
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + wx(x + off)] = src[y * W + x];
      };
      [E, hm, plateOf, cont, uplift, stress, srcAmp, geo].forEach(roll);
      const at = (i) => ((i / W) | 0) * W + wx(i % W + off);
      plates.forEach(function (p) { p.seed = at(p.seed); });
      hotspots.forEach(function (h) { h.x = wx(h.x + off); });
    }
    world.seamShift = off;
  }

  /* distance from the sea (for continentality) */
  const coastDist = new Float32Array(N).fill(99);
  {
    const q = [];
    for (let i = 0; i < N; i++) if (isOcean(i)) { coastDist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (coastDist[c] >= 30) continue;
      for (let k = 0; k < 4; k++) {
        const n = NB4[c * 4 + k];
        const st = k < 2 ? KX[(c / W) | 0] : 1;
        if (n >= 0 && coastDist[n] > coastDist[c] + st + 1e-6) { coastDist[n] = coastDist[c] + st; q.push(n); }
      }
    }
  }

  /* ================================================== 5. climate ======= */
  const CT = 1 / 55.6;                       /* one degree C in T units (deg C = -22.4 + 55.6 T) */
  const T0 = (lat) => 0.02 + 0.88 * Math.pow(Math.max(0, Math.cos(lat)), 1.35);
  /* 0 below a, rising to 1 at b, 1 to c, falling to 0 at d */
  const band = (v, a, b, c, d) => (v <= a || v >= d ? 0 : v < b ? (v - a) / (b - a) : v <= c ? 1 : (d - v) / (d - c));
  const sinLat = new Float32Array(N), DEGL = new Float32Array(N);
  for (let i = 0; i < N; i++) { sinLat[i] = Math.abs(Math.sin(latRad[i])); DEGL[i] = latRad[i] * 180 / Math.PI; }

  /* winds: three-cell circulation, as a table over |latitude| (degrees) */
  const U_TAB = [[0, -0.75], [15, -0.95], [30, 0], [45, 1], [60, 0], [75, -0.6], [90, -0.3]];
  const V_TAB = [[0, 0], [15, -0.45], [30, 0], [45, 0.35], [60, 0], [75, -0.35], [90, 0]]; /* + = poleward */
  const RAIN_TAB = [[0, 2.3], [8, 2.0], [15, 1.0], [25, 0.32], [35, 0.45], [45, 0.95], [58, 1.1], [70, 0.7], [90, 0.4]];
  const tab = (t, d) => { for (let k = 1; k < t.length; k++) if (d <= t[k][0]) return lerp(t[k - 1][1], t[k][1], (d - t[k - 1][0]) / (t[k][0] - t[k - 1][0])); return t[t.length - 1][1]; };
  const nU = new Float32Array(N), nV = new Float32Array(N);
  for (let i = 0; i < N; i++) { nU[i] = nf(noise2, i, 0.05, 2, 0.5) * 0.3; nV[i] = nf(noise3, i, 0.05, 2, 0.5) * 0.2; }
  /* the belts at a season: the whole pattern follows the sun, `shift` degrees north in July and
     south in January; in the summer hemisphere the hot land draws the air in from the sea (the
     monsoon), in winter the cold land pushes it out */
  const landF = blurWrap(Float32Array.from(E, (e) => (e > 0.5 ? 1 : 0)), W, H, 5, KX);
  const winds = function (shift, U, V, rainF) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, lat = DEGL[i] - shift, deg = Math.abs(lat), sgn = lat >= 0 ? -1 : 1; /* poleward = -y in north */
      U[i] = tab(U_TAB, deg) + nU[i];
      V[i] = tab(V_TAB, deg) * sgn + nV[i];
      rainF[i] = tab(RAIN_TAB, deg);
      const mon = shift * Math.sign(DEGL[i]) / 6 * band(Math.abs(DEGL[i]), 0, 6, 18, 30);
      if (mon) {
        U[i] += mon * 6 * (landF[y * W + wx(x + 1)] - landF[y * W + wx(x - 1)]) / 2;
        V[i] += mon * 6 * (landF[Math.min(H - 1, y + 1) * W + x] - landF[Math.max(0, y - 1) * W + x]) / 2;
      }
    }
  };
  const U = new Float32Array(N), Vv = new Float32Array(N), rainF = new Float32Array(N);
  winds(0, U, Vv, rainF);

  /* ocean gyres. Along each row: land close to the east is an eastern boundary (cold upwelling
     in the subtropics, Canary and California; the warm drift in the subpolar gyre, Norway and
     Alaska); land close to the west a western boundary (the warm Gulf Stream and Kuroshio in
     the subtropics; the cold Labrador and Oyashio currents further poleward) */
  const T = new Float32Array(N), SST = new Float32Array(N), sstA = new Float32Array(N);
  for (let i = 0; i < N; i++) T[i] = T0(latRad[i]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!isOcean(i)) continue;
    let dE = 0, dW = 0;
    const kx = KX[y];
    for (let d = 1; d <= Math.min(60, Math.ceil(16 / kx)) && !dE; d++) if (!isOcean(y * W + wx(x + d))) dE = d;
    for (let d = 1; d <= Math.min(40, Math.ceil(10 / kx)) && !dW; d++) if (!isOcean(y * W + wx(x - d))) dW = d;
    const e = dE ? Math.exp(-(dE - 1) * kx / 6) : 0, w = dW ? Math.exp(-(dW - 1) * kx / 3) : 0;
    const deg = Math.abs(DEGL[i]), sub = band(deg, 10, 20, 34, 42), pol = band(deg, 38, 48, 62, 72);
    sstA[i] = CT * (sub * (-6 * e + 4 * w) + pol * (10 * e - 6 * w));
    SST[i] = T[i] + sstA[i];
  }

  /* sea air carried inland on the wind: `marine` is how much of it a cell still feels (1 at sea,
     fading over ~10 cells (6% a cell the wind blows) and faster up a rising slope), `anom` the warmth or cold of the water it
     came from. Continentality and the current effects on land both come from it. */
  const Eg = new Float32Array(N);
  for (let i = 0; i < N; i++) Eg[i] = Math.max(0.5, E[i]);
  const Es = blurWrap(Eg, W, H, 1, KX);
  const MIX_TAB = [[0, 0.06], [25, 0.06], [35, 0.45], [60, 0.45], [70, 0.15], [90, 0.1]];
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = tab(MIX_TAB, Math.abs(DEGL[i]));
  const sampleWrap = function (arr, fx, fy) {
    fy = clamp(fy, 0, H - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const xa = wx(x0), xb = wx(x0 + 1), y1 = Math.min(y0 + 1, H - 1);
    return lerp(lerp(arr[y0 * W + xa], arr[y0 * W + xb], tx), lerp(arr[y1 * W + xa], arr[y1 * W + xb], tx), ty);
  };
  const nbMean = (arr, i) => { let s = 0, n = 0; for (let k = 0; k < 4; k++) { const j = NB4[i * 4 + k]; if (j >= 0) { s += arr[j]; n++; } } return s / n; };
  const marine = new Float32Array(N), anom = new Float32Array(N);
  /* sea that freezes in winter moderates little: arctic coasts are nearly continental */
  const frozen = (i) => (SST[i] - CT * (1 + 4 * Math.pow(sinLat[i], 1.5))) / CT - 22.4 < -8;
  {
    let m1 = new Float32Array(N), a1 = new Float32Array(N), m2 = new Float32Array(N), a2 = new Float32Array(N);
    for (let it = 0; it < 40; it++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (isOcean(i)) { m2[i] = frozen(i) ? 0.3 : 1; a2[i] = sstA[i]; continue; }
        const ux = x - U[i] / KX[y], uy = y - Vv[i], mx = Math.max(0.3, mix[i]);
        const keep = Math.exp(-0.01 - 0.06 * Math.hypot(U[i], Vv[i]) - Math.max(0, Es[i] - sampleWrap(Es, ux, uy)) * 2);
        m2[i] = lerp(sampleWrap(m1, ux, uy), nbMean(m1, i), mx) * keep;
        a2[i] = lerp(sampleWrap(a1, ux, uy), nbMean(a1, i), mx) * keep;
      }
      let s = m1; m1 = m2; m2 = s; s = a1; a1 = a2; a2 = s;
    }
    marine.set(m1); anom.set(a1);
  }

  for (let i = 0; i < N; i++) {
    if (isOcean(i)) { T[i] = SST[i]; continue; }
    T[i] = T[i] - LAPSE_T * Math.max(0, hm[i]) / 1000 - 0.06 * (1 - marine[i]) * sinLat[i] + anom[i];
  }
  /* weather does not follow the parallels: broad warm and cold tongues, plus a little local
     variety, so the tundra and the deserts get ragged edges instead of straight ones */
  for (let i = 0; i < N; i++) if (!isOcean(i)) T[i] += nf(noise3, i, 0.022, 3, 0.5) * 0.11 + nf(noise2, i, 0.09, 2, 0.5) * 0.03;
  for (let i = 0; i < N; i++) T[i] = clamp(T[i], 0, 1);

  /* seasons: half the year's range (warmest minus coldest month), small at sea and by it, large
     deep inside a continent at high latitude (Yakutsk: 58 C between January and July) */
  const Tamp = new Float32Array(N), seaIce = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const s = Math.pow(sinLat[i], 1.5);
    if (isOcean(i)) {
      Tamp[i] = CT * (1 + 4 * s);
      /* pack ice in winter: the water stays warmer than the air above it, so the ice edge lies
         where the winter air is about -8 C */
      if ((T[i] - Tamp[i]) / CT - 22.4 < -8) seaIce[i] = 1;
      continue;
    }
    Tamp[i] = CT * lerp(2 + 24 * s, 1 + 6 * s, marine[i]);
  }

  /* moisture transport: semi-Lagrangian advection to a steady state, once for July and once
     for January. Lift is read from smoothed ground with the sea at sea level, so only sustained
     ascent rains out (not every noise bump, nor the step up from the sea floor); land hands part
     of its rain back to the air (evapotranspiration, less in the cold); and in the storm belts
     moisture also mixes sideways, since passing cyclones bring it from every direction, east
     coasts included. */
  const recycle = new Float32Array(N), Ts = new Float32Array(N);
  const Us = new Float32Array(N), Vs = new Float32Array(N), rFs = new Float32Array(N);
  /* the upwind point of every cell is fixed for a season, so its four corners and weights, the
     share that rains out and the cap are worked out once, before the 90 steps */
  const UPI = new Int32Array(N * 4), UPW = new Float32Array(N * 4), FRAC = new Float32Array(N), CAP = new Float32Array(N);
  const season = function (sgn, out) {
    winds(6 * sgn, Us, Vs, rFs);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      Ts[i] = clamp(T[i] + sgn * Math.sign(DEGL[i]) * Tamp[i], 0, 1);
      recycle[i] = 0.65 * clamp(Ts[i] * 1.5, 0.2, 1);
      CAP[i] = 0.12 + 0.88 * Ts[i];
      const ux = x - Us[i] / KX[y], uy = clamp(y - Vs[i], 0, H - 1);
      const x0 = Math.floor(ux), y0 = Math.floor(uy), tx = ux - x0, ty = uy - y0, y1 = Math.min(y0 + 1, H - 1);
      UPI[i * 4] = y0 * W + wx(x0); UPI[i * 4 + 1] = y0 * W + wx(x0 + 1); UPI[i * 4 + 2] = y1 * W + wx(x0); UPI[i * 4 + 3] = y1 * W + wx(x0 + 1);
      UPW[i * 4] = (1 - tx) * (1 - ty); UPW[i * 4 + 1] = tx * (1 - ty); UPW[i * 4 + 2] = (1 - tx) * ty; UPW[i * 4 + 3] = tx * ty;
      const rise = Math.max(0, Es[i] - sampleWrap(Es, ux, uy));
      FRAC[i] = clamp(0.045 * rFs[i] + rise * 3.5, 0, 0.8);
    }
    let q1 = new Float32Array(N), q2 = new Float32Array(N);
    for (let it = 0; it < 90; it++) {
      for (let i = 0; i < N; i++) {
        if (isOcean(i)) { q2[i] = clamp(0.85 * CAP[i], 0, 1); out[i] = 0; continue; }
        const k = i * 4;
        let q = q1[UPI[k]] * UPW[k] + q1[UPI[k + 1]] * UPW[k + 1] + q1[UPI[k + 2]] * UPW[k + 2] + q1[UPI[k + 3]] * UPW[k + 3];
        if (mix[i] > 0) q = lerp(q, nbMean(q1, i), mix[i]);
        let p = 0;
        if (q > CAP[i]) { p += q - CAP[i]; q = CAP[i]; }
        p += q * FRAC[i];
        q = q - q * FRAC[i] + recycle[i] * p;   /* plants and wet ground hand part of it back */
        q2[i] = clamp(q, 0, 1);
        out[i] = p;
      }
      const s = q1; q1 = q2; q2 = s;
    }
  };
  const pJul = new Float32Array(N), pJan = new Float32Array(N);
  season(1, pJul);
  season(-1, pJan);
  /* the year's rain, and the share of it that falls in the local summer half */
  const precip = new Float32Array(N), pSum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    precip[i] = (pJul[i] + pJan[i]) / 2;
    const s = DEGL[i] >= 0 ? pJul[i] : pJan[i];
    pSum[i] = precip[i] > 0 ? s / (pJul[i] + pJan[i]) : 0.5;
  }

  const fin = finish(world, pack, {
    W: W, H: H, N: N, NB4: NB4, NB8: NB8, E: E, Hm: hm, T: T, Tamp: Tamp, precip: precip, pSum: pSum, coastDist: coastDist, latRad: latRad,
    uplift: uplift, stress: stress, srcAmp: srcAmp, plateOf: plateOf, cont: cont, geo: geo,
    nf2: (i, f, o, g) => nf(noise2, i, f, o, g), nf3: (i, f, o, g) => nf(noise3, i, f, o, g),
    K: 1, area: 1, minLen: 4, inflow: null, mtnOffset: 0,
  });

  /* debug layers for the inspector page; not enumerable so nothing copies them */
  Object.defineProperty(world, "_gen", {
    enumerable: false, configurable: true,
    value: { plateOf, plates, cont, uplift, geo, E, Hm: hm, T, Tamp, SST, seaIce, marine, pSum, pJul, pJan, P: fin.P, M: fin.M, U, V: Vv, acc: fin.acc, lake: fin.lake, basin: fin.basin, terminal: fin.terminal, hotspots,
             riverT: fin.riverT, mtnOffset: fin.mtnOffset, precip, stress, srcAmp, ms: Date.now() - t0 },
  });
}

/* Hydrology, biomes and the regions, on any grid: the planet's (wrapping, a planet cell a cell)
   or a region's (not wrapping, K x K cells a planet cell). L carries the grid and the layers
   made before this point: W, H, N, NB4, NB8, E, T, precip, coastDist (in planet cells), latRad,
   uplift, stress, srcAmp, plateOf, cont; nf2 and nf3, noise at a cell; K (cells a planet cell
   across), area (planet cells a cell, 1 / K^2), minLen (shortest river kept, in cells), inflow
   (runoff entering from outside the grid, or null), mtnOffset (metres above the treeline where
   "mountain" begins: 0 on the planet) and riverT (null: 0.96, the planet's); minLake, the fewest
   cells a lake or basin has (null: 1). The
   regions go on target.regions; the debug layers are returned. */
function finish(world, pack, L) {
  const W = L.W, H = L.H, N = L.N, NB4 = L.NB4, NB8 = L.NB8, E = L.E, T = L.T, precip = L.precip;
  const coastDist = L.coastDist, latRad = L.latRad, uplift = L.uplift, stress = L.stress, srcAmp = L.srcAmp;
  const plateOf = L.plateOf, cont = L.cont;
  const isOcean = (i) => E[i] <= 0.5;

  /* ================================================== 6. hydrology ===== */
  /* roughen cold lowlands slightly: glacial scour leaves lake districts; and give every plain
     a few metres of swell, so water gathers into rivers instead of running down a flat slope
     in parallel lines */
  const Eh = Float32Array.from(E);
  for (let i = 0; i < N; i++) {
    if (isOcean(i)) continue;
    if (T[i] < 0.4 && E[i] < eOfM(1100)) Eh[i] += (L.nf3(i, 0.5, 2, 0.5) + 0.5) * 0.012 * clamp((0.4 - T[i]) / 0.06, 0, 1);
    Eh[i] += (L.nf2(i, 0.3, 3, 0.5) + 0.5) * 0.012;
  }
  /* rain on one fixed scale for every world (the median wettest-3% level over many seeds),
     so a dry world stays dry and a wet one wet */
  const pRef = 0.097;
  const P = new Float32Array(N);
  for (let i = 0; i < N; i++) P[i] = isOcean(i) ? 1 : clamp(precip[i] / pRef, 0, 1);
  const runoff = new Float32Array(N);
  for (let i = 0; i < N; i++) runoff[i] = isOcean(i) ? 0 : Math.max(0.002, P[i] * (1.05 - 0.75 * T[i]));
  if (L.area !== 1) for (let i = 0; i < N; i++) runoff[i] *= L.area;
  if (L.inflow) for (let i = 0; i < N; i++) if (!isOcean(i)) runoff[i] += L.inflow[i];
  const hyd = floodFill(N, NB8, Eh, 0.5, runoff);

  /* depressions hold water up to the level where what evaporates from the lake matches what flows
     in: the lowest cells fill first. A depression that more than fills spills over its rim and
     its rivers run on; one that holds a smaller lake is a terminal lake (Caspian, Aral, Chad), the
     water ends there and the rest of the hollow is dry basin around it; one too dry for a single
     cell of lake is a dry basin (salt flat when the rain is low) */
  const lake = new Uint8Array(N), basin = new Uint8Array(N), terminal = new Uint8Array(N);
  const lakeLevel = new Float32Array(N);
  {
    const dep = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (!isOcean(i) && hyd.Ef[i] - Eh[i] > 0.0025) dep[i] = 1;
    const comp = new Int32Array(N).fill(-1), DEEP = 0.01;
    let nc = 0;
    for (let i = 0; i < N; i++) {
      if (!dep[i] || comp[i] >= 0) continue;
      const cells = [i]; comp[i] = nc;
      for (let h = 0; h < cells.length; h++) {
        const c = cells[h];
        for (let k = 0; k < 8; k++) {
          const n = NB8[c * 8 + k];
          if (n >= 0 && dep[n] && comp[n] < 0) { comp[n] = nc; cells.push(n); }
        }
      }
      nc++;
      /* a hollow smaller than minLake cells is a pond the rivers fill and run on through */
      if (cells.length < (L.minLake || 1)) continue;
      let inflow = 0, level = 0;
      for (const c of cells) {
        level = Math.max(level, hyd.Ef[c]);
        const p = hyd.parent[c];
        if (p < 0 || comp[p] !== comp[i]) inflow = Math.max(inflow, hyd.acc[c]);
      }
      /* a region follows the planet: a lake or dry basin only where the planet has one */
      if (L.lakeHint) {
        let lh = 0, bh = 0;
        for (const c of cells) { lh += L.lakeHint[c]; bh += L.basinHint[c]; }
        if (lh / cells.length >= 0.25) {
          for (const c of cells) if (L.lakeHint[c] > 0.2) { lake[c] = 1; lakeLevel[c] = level; if (L.termHint[c]) terminal[c] = 1; }
        } else if (bh / cells.length >= 0.25) {
          for (const c of cells) if (L.basinHint[c] > 0.2) { basin[c] = 1; terminal[c] = 1; }
        }
        continue;
      }
      cells.sort((a, b) => Eh[a] - Eh[b]);
      let evap = 0, n = 0;
      while (n < cells.length && evap < inflow) { evap += L.area * Math.max(0.03, 1.3 * T[cells[n]] - 0.4); n++; }
      if (evap < inflow) {                                   /* spills: an open lake */
        /* unless it is shallow: at this scale a cell of lake is the size of Lake Victoria, so a
           hollow under DEEP the rivers just fill and run on through */
        if (level - Eh[cells[0]] >= DEEP) for (const c of cells) { lake[c] = 1; lakeLevel[c] = level; }
        continue;
      }
      if (n < (L.minLake || 1)) n = 0;
      const top = n ? Eh[cells[n - 1]] + 1e-4 : 0;
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k];
        if (k < n) { lake[c] = 1; lakeLevel[c] = top; } else basin[c] = 1;
        terminal[c] = 1;
      }
    }
  }

  /* the planet's lake cells the region's terrain left without a hollow are lake all the same */
  if (L.lakeHint) for (let i = 0; i < N; i++) {
    if (isOcean(i) || lake[i] || L.lakeHint[i] <= 0.5) continue;
    lake[i] = 1; lakeLevel[i] = Eh[i]; basin[i] = 0;
    if (L.termHint[i]) terminal[i] = 1;
  }

  /* Basins and terminal lakes are dead ends: what flows in evaporates. Re-accumulate with them
     absorbing their inflow, otherwise the router draws parallel fake rivers across the flat
     filled floor and out to the sea. */
  {
    const acc2 = new Float32Array(N);
    for (let k = hyd.count - 1; k >= 0; k--) {
      const c = hyd.order[k];
      if (isOcean(c)) continue;
      acc2[c] += runoff[c];
      if (!terminal[c] && hyd.parent[c] >= 0) acc2[hyd.parent[c]] += acc2[c];
    }
    hyd.acc = acc2;
  }

  /* rivers: land cells that gather enough runoff, on one fixed scale (about the top 6.5% of land
     in a typical world), so a dry world has fewer rivers and a wet one more */
  const riverT = L.riverT != null ? L.riverT : 0.96;
  const isRiver = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (!isOcean(i) && !lake[i] && !basin[i] && hyd.acc[i] >= riverT) isRiver[i] = 1;
  /* Prune short channels. A wet mountain coast gives every shoreline cell its own
     torrent straight to the sea; at map scale those read as hatching, not rivers.
     Keep a system only if its longest chain, mouth to source, is 4+ planet cells long. */
  {
    const len = new Uint16Array(N), ups = new Array(N);
    for (let k = hyd.count - 1; k >= 0; k--) {
      const c = hyd.order[k];
      if (!isRiver[c]) continue;
      if (len[c] < 1) len[c] = 1;
      const p = hyd.parent[c];
      if (p >= 0 && isRiver[p]) {
        if (len[c] + 1 > len[p]) len[p] = len[c] + 1;
        (ups[p] || (ups[p] = [])).push(c);
      }
    }
    for (let i = 0; i < N; i++) {
      if (!isRiver[i]) continue;
      const p = hyd.parent[i];
      if (p >= 0 && isRiver[p]) continue;          /* not a mouth */
      if (len[i] >= L.minLen) continue;
      const stack = [i];
      while (stack.length) {
        const c = stack.pop();
        isRiver[c] = 0;
        if (ups[c]) for (const u of ups[c]) stack.push(u);
      }
    }
  }
  let maxRiver = 0;
  for (let i = 0; i < N; i++) if (isRiver[i] && hyd.acc[i] > maxRiver) maxRiver = hyd.acc[i];
  world.riverThreshold = r3(riverT);
  world.maxRiver = r3(maxRiver);
  world.seaLevel = 0.5;

  /* effective moisture for vegetation: rain, plus wet ground near water */
  const M = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (isOcean(i)) { M[i] = 1; continue; }
    let m = P[i];
    if (!basin[i] && hyd.acc[i] >= riverT) m += 0.12 + 0.08 * Math.min(1, Math.log(hyd.acc[i] / riverT + 1) / 2);
    for (let k = 0; k < 8; k++) { const j = NB8[i * 8 + k]; if (j >= 0 && lake[j]) { m += 0.1; break; } }
    /* rain is skewed (most land gets little, wet coasts a lot): a power spreads it out so
       the biome cut-offs fall at a typical world's old shares, without ranking each world */
    M[i] = Math.pow(clamp(m, 0, 1), 0.47);
  }

  /* ================================================== 7. biomes ======== */
  /* mountains are the land above the treeline (plus the grid's offset), so a world gets as many
     as its tectonics raise, not a fixed share */
  const mtnOffset = L.mtnOffset || 0;
  const aboveTree = (i) => overTree(mOfE(E[i]), Math.abs(latRad[i]) * 180 / Math.PI) - mtnOffset;
  const lowland = eOfM(200);

  const slope = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let m = 0;
    for (let k = 0; k < 4; k++) { const j = NB4[i * 4 + k]; if (j >= 0) m = Math.max(m, Math.abs(E[i] - E[j])); }
    slope[i] = m * L.K;                   /* per planet cell, whatever the grid */
  }

  /* physical units for the classifier: annual mean temperature in deg C (T fitted to Earth's
     zonal means at sea level, within 1.5 C) and annual rain in mm (fitted to the spread of
     Earth's land rainfall: quartiles 250 / 580 / 1100 mm, mean ~800) */
  const tempC = new Float32Array(N), rainMm = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    tempC[i] = -22.4 + 55.6 * T[i];
    rainMm[i] = isOcean(i) ? 0 : 3480 * Math.pow(precip[i] / pRef, 1.025);
  }

  /* Koppen's climates from the two seasons: warmest and coldest month (the annual mean plus and
     minus half the range) and how the rain splits between the summer and winter halves. The
     aridity line is 20 x T + 280 mm with summer rain, + 140 when it is even, + 0 with winter
     rain; desert below half of it. The months follow a sine through the year, so the driest and wettest month come
     from the two halves: the mean month, minus or plus pi / 24 of the difference. */
  const ampC = (i) => (L.Tamp ? L.Tamp[i] * 55.6 : 0);
  const aridLine = (i) => { const ps = L.pSum ? L.pSum[i] : 0.5; return 20 * tempC[i] + (ps >= 0.7 ? 280 : ps <= 0.3 ? 0 : 140); };
  function koppen(i) {
    const c = tempC[i], mm = rainMm[i], amp = ampC(i), warm = c + amp, cold = c - amp;
    const ps = L.pSum ? L.pSum[i] : 0.5, sumMm = mm * ps, winMm = mm - sumMm;
    if (warm < 10) return warm < 0 ? "EF" : "ET";
    const pth = aridLine(i);
    if (mm < pth) return (mm < pth / 2 ? "BW" : "BS") + (c >= 18 ? "h" : "k");
    const swing = Math.abs(sumMm - winMm) * Math.PI / 24, dryMonth = Math.max(0, mm / 12 - swing), wetMonth = mm / 12 + swing;
    if (cold >= 18) return dryMonth >= 60 ? "Af" : dryMonth >= 100 - mm / 25 ? "Am" : ps >= 0.5 ? "Aw" : "As";
    const second = ps < 0.5 && dryMonth < 40 && dryMonth < wetMonth / 3 ? "s" : ps > 0.5 && dryMonth < wetMonth / 10 ? "w" : "f";
    const third = warm >= 22 ? "a" : c + amp / 2 >= 10 ? "b" : cold < -38 ? "d" : "c";
    return (cold > -3 ? "C" : "D") + second + third;
  }

  /* the biomes from the climates (Whittaker's by temperature and rain, with seasons): a wet
     tropic is jungle, one with a dry season savanna unless it still gets 1,300 mm; desert takes
     the driest steppe too (xeric shrubland, as the biome maps count it), the rest of the hot
     steppe is savanna and of the cool steppe grassland; Mediterranean and humid temperate climates are forest,
     or grassland (prairie, steppe) under 30 x C + 200 mm; continental ones the same with a long
     summer and taiga with a short one. Rivers do not turn a desert green at this
     scale (the Nile valley is a desert with a river in it); they only make wet lowland swamp. */
  function classify(i, k) {
    const c = tempC[i], mm = rainMm[i], e = E[i];
    if (aboveTree(i) >= 0) return c < -14.5 ? "ice" : "mountain";
    if (k === "EF") return "ice";
    if (k === "ET") return "tundra";
    if (k[0] === "B") return mm < 0.65 * aridLine(i) ? "desert" : k[2] === "h" ? "savanna" : "grassland";
    const soggy = slope[i] < 0.008 && e < lowland &&
                  (hyd.acc[i] >= riverT || coastDist[i] <= 2 || basin[i]);
    if (k[0] === "A") {
      if (k === "Af" || k === "Am") return soggy ? "swamp" : "jungle";
      return mm >= 1300 ? "jungle" : "savanna";
    }
    if (k[0] === "D" && (k[2] === "c" || k[2] === "d")) return soggy && mm > 500 ? "swamp" : "taiga";
    if (mm < 30 * c + 200) return "grassland";       /* prairie and steppe short of desert */
    return soggy && mm > 1000 ? "swamp" : "forest";
  }

  const hab = (key) => {
    const b = pack && pack.biomes && pack.biomes[key];
    return b && typeof b.habitability === "number" ? b.habitability : 0.5;
  };

  /* ================================================== regions ========== */
  const regions = world.regions = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const reg = {
      id: i, x: x, y: y, name: null,
      elevation: r3(lake[i] ? Math.max(E[i], lakeLevel[i]) : E[i]),
      heightM: Math.round(lake[i] ? mOfE(Math.max(E[i], lakeLevel[i])) : L.Hm ? L.Hm[i] : mOfE(E[i])),
      temperature: r3(T[i]), moisture: r3(M[i]),
      precipitation: r3(P[i]),
      tempC: Math.round(tempC[i] * 10) / 10, rainMm: Math.round(rainMm[i]),
      warmC: Math.round((tempC[i] + ampC(i)) * 10) / 10, coldC: Math.round((tempC[i] - ampC(i)) * 10) / 10,
      summerRain: r3(L.pSum ? L.pSum[i] : 0.5), climate: null,
      biome: "barren", habitability: 0,
      resources: { food: 0, metal: 0, exotic: 0 },
      barren: true, lake: false, owner: null, population: 0, settlement: null,
      features: [], neighbors: [],
      river: 0, flowTo: -1,
      plate: plateOf[i], crust: cont[i] ? "continental" : "oceanic",
    };
    for (let k = 0; k < 4; k++) if (NB4[i * 4 + k] >= 0) reg.neighbors.push(NB4[i * 4 + k]);

    let coastal = false;
    for (let k = 0; k < 4; k++) { const j = NB4[i * 4 + k]; if (j >= 0 && isOcean(j)) coastal = true; }

    if (isOcean(i) || lake[i]) {
      reg.lake = !!lake[i];
      reg.resources = { food: r3(coastal || lake[i] ? 0.25 : 0.05), metal: 0, exotic: 0 };
      if (lake[i]) reg.features.push("lake");
      else if (uplift[i] < -0.08) reg.features.push("trench");
      regions.push(reg);
      continue;
    }

    reg.barren = false;
    reg.climate = koppen(i);
    const biome = classify(i, reg.climate);
    reg.biome = biome;
    let h = hab(biome);
    if (isRiver[i]) {
      reg.river = r3(hyd.acc[i]);
      reg.flowTo = hyd.parent[i];
      h += 0.1 + 0.05 * Math.min(1, Math.log(hyd.acc[i] / riverT) / Math.log(8));
      if (biome === "desert") h += 0.3;          /* a floodplain in the desert: Egypt, Sumer */
    } else if (hyd.parent[i] >= 0) {
      reg.flowTo = hyd.parent[i];
    }
    let lakeside = false;
    for (let k = 0; k < 8; k++) { const j = NB8[i * 8 + k]; if (j >= 0 && lake[j]) lakeside = true; }
    if (coastal) h += 0.04;
    if (lakeside) h += 0.06;
    h -= 0.12 * Math.pow(Math.abs(latRad[i]) / (Math.PI / 2), 3);
    reg.habitability = r3(clamp(h, 0, 1));

    if (basin[i] && P[i] < 0.3) reg.features.push("salt-flat");
    if (uplift[i] > 0.2 && stress[i] > 0) reg.features.push("fault");
    if (srcAmp[i] < -0.05 && cont[i]) reg.features.push("rift");
    if (L.geo) {
      if (L.geo[i] & 1) reg.features.push("delta");
      else if (L.geo[i] & 2) reg.features.push("floodplain");
      if (L.geo[i] & 4) reg.features.push("plateau");
      if (L.geo[i] & 8) reg.features.push("old mountains");
    }

    const nr = L.nf3(i, 0.12, 3, 0.5);
    const foodBase = { grassland: 0.78, forest: 0.6, jungle: 0.58, savanna: 0.55, swamp: 0.42, taiga: 0.32, tundra: 0.14, desert: 0.08, mountain: 0.12, ice: 0.02 };
    let food = (foodBase[biome] !== undefined ? foodBase[biome] : 0.4) + 0.12 * nr;
    if (reg.river) food += biome === "desert" ? 0.45 : 0.2;
    if (coastal || lakeside) food += 0.08;
    const metal = (biome === "mountain" ? 0.6 : E[i] > eOfM(1200) ? 0.28 : 0.06) + 0.25 * clamp(uplift[i] / 0.3, 0, 1) + 0.15 * nr;
    const exo = clamp((L.nf2(i, 0.08, 3, 0.5) - 0.1) * 1.8, 0, 1) + (stress[i] > 0.8 ? 0.2 : 0) + (biome === "desert" || biome === "jungle" ? 0.06 : 0);
    reg.resources = { food: r3(clamp(food, 0, 1)), metal: r3(clamp(metal, 0, 1)), exotic: r3(clamp(exo, 0, 1)) };
    regions.push(reg);
  }
  /* rivers only flow into land/lake/sea cells that exist; drop flowTo for non-rivers
     that drain into the sea directly — the renderer only draws river cells anyway */

  return { acc: hyd.acc, lake: lake, basin: basin, terminal: terminal, riverT: riverT, mtnOffset: mtnOffset, P: P, M: M, isRiver: isRiver };
}

/* ============================================================== region === */
/* A region (docs/REGION_PROTOTYPE.md): one square of the world sketch made RK times finer, with
   a margin of MARGIN planet cells of the squares around it ("beyond"). The planet decides
   everything at its own scale and the region only adds what lies below it:
   - elevation: the planet's, smoothly upsampled, plus fine noise, ridged under the mountain
     belts so a mountain cell becomes ranges and valleys; coasts get their wiggle from it
   - temperature and rain: the planet's, from its land cells, with temperature corrected for the
     finer relief (the planet's own height term); no climate run of its own
   - rivers, lakes, biomes, habitability, resources: finish() on the fine grid, with the rivers
     that rise outside the window flowing in at its edge
   It has its own random stream (seed + ":region:" + square), so it never changes the planet. */
const RK = 5, MARGIN = 2;
function region(world, si) {
  const t0 = Date.now();
  const g = world._gen, sq = world.sketch.squares[si], PW = world.width, PH = world.height;
  const pwx = (x) => ((x % PW) + PW) % PW;
  const K = RK;
  const px0 = sq.x0 - MARGIN, px1 = sq.x1 + MARGIN;
  const py0 = Math.max(0, sq.y0 - MARGIN), py1 = Math.min(PH, sq.y1 + MARGIN);
  const W = (px1 - px0) * K, H = (py1 - py0) * K, N = W * H;
  const rng = AEON.RNG(world.seed + ":region:" + sq.id);

  /* the planet position of a cell's centre, in planet cells (planet cell x has its centre at x) */
  const FX = new Float32Array(N), FY = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    FX[y * W + x] = px0 - 0.5 + (x + 0.5) / K;
    FY[y * W + x] = py0 - 0.5 + (y + 0.5) / K;
  }
  const near = (i) => clamp(Math.round(FY[i]), 0, PH - 1) * PW + pwx(Math.round(FX[i]));

  /* grid topology: no wrap */
  const NB4 = new Int32Array(N * 4).fill(-1), NB8 = new Int32Array(N * 8).fill(-1);
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    for (let k = 0; k < 8; k++) {
      const nx = x + D8[k][0], ny = y + D8[k][1];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      NB8[i * 8 + k] = ny * W + nx;
      if (k < 4) NB4[i * 4 + k] = ny * W + nx;
    }
  }

  /* samplers over the planet's layers: Catmull-Rom for smooth fields, and one over land cells
     only for the fields the sea does not share (rain is 0 at sea) */
  const at = (arr, x, y) => arr[clamp(y, 0, PH - 1) * PW + pwx(x)];
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const cubic = function (arr, fx, fy) {
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, row = [];
    for (let k = -1; k <= 2; k++) row.push(cr(at(arr, x0 - 1, y0 + k), at(arr, x0, y0 + k), at(arr, x0 + 1, y0 + k), at(arr, x0 + 2, y0 + k), tx));
    return cr(row[0], row[1], row[2], row[3], ty);
  };
  const landP = (x, y) => at(g.E, x, y) > 0.5;
  /* a field over the window (plus a pad) where every sea cell holds the mean of the land within
     3 cells, and NaN where there is none; sampled bilinearly, skipping the NaNs */
  const PAD = 3, cx0 = px0 - PAD, cy0 = py0 - PAD, cw = px1 - px0 + 2 * PAD, chh = py1 - py0 + 2 * PAD;
  const overLandField = function (arr) {
    const out = new Float32Array(cw * chh);
    for (let cy = 0; cy < chh; cy++) for (let cx = 0; cx < cw; cx++) {
      const X = cx0 + cx, Y = cy0 + cy;
      if (landP(X, Y)) { out[cy * cw + cx] = at(arr, X, Y); continue; }
      let s = 0, ws = 0;
      for (let y = Y - 3; y <= Y + 3; y++) for (let x = X - 3; x <= X + 3; x++) {
        if (y < 0 || y >= PH || !landP(x, y)) continue;
        const w = (1 - Math.abs(x - X) / 4) * (1 - Math.abs(y - Y) / 4);
        s += w * at(arr, x, y); ws += w;
      }
      out[cy * cw + cx] = ws > 0 ? s / ws : NaN;
    }
    return out;
  };
  const overLand = function (F, fx, fy) {
    const gx = fx - cx0, gy = clamp(fy - cy0, 0, chh - 1.001), x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
    let s = 0, ws = 0;
    for (const [x, y, w] of [[x0, y0, (1 - tx) * (1 - ty)], [x0 + 1, y0, tx * (1 - ty)], [x0, y0 + 1, (1 - tx) * ty], [x0 + 1, y0 + 1, tx * ty]]) {
      const v = F[clamp(y, 0, chh - 1) * cw + clamp(x, 0, cw - 1)];
      if (v === v && w > 0) { s += w * v; ws += w; }
    }
    return ws > 0 ? s / ws : null;
  };

  /* noise on the planet's cylinder, so it lines up with the planet's coordinates */
  const nzA = makeNoise(rng), nzB = makeNoise(rng), nzC = makeNoise(rng);
  const CR = PW / (2 * Math.PI), CX = new Float32Array(N), CZ = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const th = (FX[i] / PW) * 2 * Math.PI, cl = Math.max(0.2, Math.cos((0.5 - (FY[i] + 0.5) / PH) * Math.PI * (75 / 90)));
    CX[i] = Math.cos(th) * CR * cl; CZ[i] = Math.sin(th) * CR * cl;
  }
  const nfr = (nz, i, f, o, gn) => nz.fbm(CX[i] * f, FY[i] * f, CZ[i] * f, o, gn);

  /* ----- elevation ----- */
  const Ec = new Float32Array(N), E = new Float32Array(N), MT = new Float32Array(N), RG = new Float32Array(N);
  const landInd = new Float32Array(PW * PH);
  const mtnInd = new Float32Array(PW * PH);
  for (let i = 0; i < PW * PH; i++) { landInd[i] = g.E[i] > 0.5 ? 1 : 0; mtnInd[i] = g.E[i] > 0.5 && overTree(g.Hm[i], Math.abs(world.regions[i].y + 0.5 - PH / 2) / PH * 150) >= 0 ? 1 : 0; }
  let rs = 0, rw = 0;
  for (let i = 0; i < N; i++) {
    const ec = cubic(g.E, FX[i], FY[i]), up = cubic(g.uplift, FX[i], FY[i]);
    MT[i] = Math.max(clamp((ec - 0.6) / 0.12, 0, 1), clamp(up / 0.22, 0, 1));
    RG[i] = nzC.ridged(CX[i] * 0.35, FY[i] * 0.35, CZ[i] * 0.35, 4);
    rs += RG[i] * MT[i]; rw += MT[i];
    Ec[i] = ec;
  }
  /* ridges centred on their mean, so the belts get peaks and valleys but no more mountain land
     than the planet gives them */
  const rMean = rw > 0 ? rs / rw : 0.55;
  for (let i = 0; i < N; i++) {
    /* the planet's land and sea hold away from their shores: a shallow sea does not break up
       into puddles, nor a low plain into ponds; at the shore the noise draws the coast */
    const side = (cubic(landInd, FX[i], FY[i]) - 0.5) * Math.max(0, 1 - Math.abs(Ec[i] - 0.5) / 0.06);
    E[i] = clamp(Ec[i] + side * 0.05 + nfr(nzA, i, 0.45, 4, 0.5) * 0.06 + nfr(nzB, i, 1.3, 3, 0.5) * 0.018
                 + (RG[i] - rMean) * 0.16 * MT[i]
                 /* the planet's mountains stand a little above the plateaus around them */
                 + (Ec[i] > 0.55 ? (cubic(mtnInd, FX[i], FY[i]) - 0.3) * 0.05 : 0), 0, 1);
  }
  /* the rivers cut their valleys, the bigger the deeper */
  for (let pass = 0; pass < 2; pass++) {
    const f = floodFill(N, NB8, E, 0.5, null);
    for (let k = 0; k < f.count; k++) {
      const c = f.order[k], p = f.parent[c];
      if (E[c] <= 0.5 || p < 0) continue;
      const drop = E[c] - E[p];
      if (drop <= 0) continue;
      E[c] = Math.max(E[p] + 2e-4, E[c] - 0.03 * Math.sqrt(f.acc[c] / (K * K)) * drop);
    }
  }

  /* the planet's lakes and dry basins hold in the region: each planet lake becomes a flat floor
     just under its surface where the planet has it (the outline of its cells, upsampled), and
     finish() keeps lakes and basins only there; the region's own hollows elsewhere are ponds the
     rivers fill and run through */
  const lakeHint = new Float32Array(N), basinHint = new Float32Array(N), termHint = new Uint8Array(N);
  {
    const lin = (arr, fx, fy) => {
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      return (1 - ty) * ((1 - tx) * at(arr, x0, y0) + tx * at(arr, x0 + 1, y0)) + ty * ((1 - tx) * at(arr, x0, y0 + 1) + tx * at(arr, x0 + 1, y0 + 1));
    };
    const LK = Float32Array.from(g.lake), BS = Float32Array.from(g.basin);
    for (let i = 0; i < N; i++) {
      lakeHint[i] = lin(LK, FX[i], FY[i]); basinHint[i] = lin(BS, FX[i], FY[i]);
      termHint[i] = g.terminal ? g.terminal[near(i)] : 0;
      if (lakeHint[i] <= 0.5 || E[i] <= 0.5) continue;
      let lev = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const y = Math.round(FY[i]) + dy, c = clamp(y, 0, PH - 1) * PW + pwx(Math.round(FX[i]) + dx);
        if (g.lake[c]) lev = Math.max(lev, world.regions[c].elevation);
      }
      if (lev > 0.5) E[i] = Math.max(0.5003, Math.min(E[i], lev - 0.0015));
    }
  }

  /* ----- climate from the planet ----- */
  const T = new Float32Array(N), precip = new Float32Array(N), latRad = new Float32Array(N);
  const Tamp = new Float32Array(N), pSum = new Float32Array(N).fill(0.5);
  const LT = overLandField(g.T), LE = overLandField(g.E), LP = overLandField(g.precip);
  const LA = overLandField(g.Tamp), LS = overLandField(g.pSum);
  for (let i = 0; i < N; i++) {
    latRad[i] = (0.5 - (FY[i] + 0.5) / PH) * Math.PI * (75 / 90);
    if (E[i] <= 0.5) { T[i] = clamp(cubic(g.T, FX[i], FY[i]), 0, 1); Tamp[i] = Math.max(0, cubic(g.Tamp, FX[i], FY[i])); continue; }
    const al = overLand(LA, FX[i], FY[i]), sl = overLand(LS, FX[i], FY[i]);
    Tamp[i] = al != null ? al : cubic(g.Tamp, FX[i], FY[i]);
    if (sl != null) pSum[i] = sl;
    const tl = overLand(LT, FX[i], FY[i]), el = overLand(LE, FX[i], FY[i]), pl = overLand(LP, FX[i], FY[i]);
    T[i] = clamp((tl != null ? tl : cubic(g.T, FX[i], FY[i])) - LAPSE_T * (mOfE(E[i]) - mOfE(Math.max(0.5015, el != null ? el : 0.5015))) / 1000, 0, 1);
    precip[i] = pl != null ? pl : 0.03;
    /* local weather the planet cannot hold: ragged edges to its climate belts */
    T[i] = clamp(T[i] + nfr(nzC, i, 0.9, 2, 0.5) * 0.02, 0, 1);
    precip[i] *= 1 + nfr(nzA, i, 0.7, 3, 0.5) * 0.3;
  }

  /* distance from the sea, in planet cells */
  const coastDist = new Float32Array(N).fill(99);
  {
    const q = [], d = new Int32Array(N).fill(1 << 20);
    for (let i = 0; i < N; i++) if (E[i] <= 0.5) { d[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (d[c] >= 30 * K) continue;
      for (let k = 0; k < 4; k++) { const n = NB4[c * 4 + k]; if (n >= 0 && d[n] > d[c] + 1) { d[n] = d[c] + 1; q.push(n); } }
    }
    for (let i = 0; i < N; i++) if (d[i] < (1 << 20)) coastDist[i] = d[i] / K;
  }

  /* rivers that rise outside the window flow in where the planet's rivers cross its edge */
  const inflow = new Float32Array(N);
  const inWin = (x, y) => { const lx = pwx(x - px0); return lx < px1 - px0 && y >= py0 && y < py1; };
  for (let y = Math.max(0, py0 - 1); y < Math.min(PH, py1 + 1); y++) for (let x = px0 - 1; x <= px1; x++) {
    if (inWin(x, y)) continue;
    const c = y * PW + pwx(x), to = world.regions[c].flowTo;
    if (to < 0 || world.regions[c].barren) continue;
    const tx = to % PW, ty = (to / PW) | 0;
    if (!inWin(tx, ty)) continue;
    const fx = pwx(tx - px0) * K + (K >> 1), fy = (ty - py0) * K + (K >> 1);
    inflow[fy * W + fx] += g.acc[c];
  }

  const uplift = new Float32Array(N), stress = new Float32Array(N), srcAmp = new Float32Array(N);
  const plateOf = new Int16Array(N), cont = new Uint8Array(N), geo = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const c = near(i);
    geo[i] = g.geo ? g.geo[c] : 0;
    uplift[i] = g.uplift[c]; stress[i] = g.stress[c]; srcAmp[i] = g.srcAmp[c]; plateOf[i] = g.plateOf[c]; cont[i] = g.cont[c];
  }

  /* how far above the treeline mountains begin here, so the square gets as much mountain land
     as the planet gives it: the noise makes peaks and valleys, not more mountains (a plateau
     just under the treeline would otherwise break out in peaks all over) */
  const ix0 = (sq.x0 - px0) * K, ix1 = (sq.x1 - px0) * K, iy0 = (sq.y0 - py0) * K, iy1 = (sq.y1 - py0) * K;
  let mtnOffset = 0;
  {
    let pl = 0, pm = 0;
    for (let y = sq.y0; y < sq.y1; y++) for (let x = sq.x0; x < sq.x1; x++) { const c = y * PW + pwx(x); if (g.E[c] > 0.5) { pl++; if (mtnInd[c]) pm++; } }
    const fe = [];
    for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) {
      const i = y * W + x;
      if (E[i] > 0.5) fe.push(overTree(mOfE(E[i]), Math.abs(latRad[i]) * 180 / Math.PI));
    }
    if (pl && fe.length) mtnOffset = pm ? Math.max(-800, quantile(fe, 1 - pm / pl)) : Math.max(0, quantile(fe, 1) + 1);
  }

  const out = { square: sq.id, squareIndex: si, K: K, margin: MARGIN, px0: px0, py0: py0, width: W, height: H, regions: [] };
  const fin = finish(out, world.pack, {
    W: W, H: H, N: N, NB4: NB4, NB8: NB8, E: E, T: T, Tamp: Tamp, precip: precip, pSum: pSum, coastDist: coastDist, latRad: latRad,
    uplift: uplift, stress: stress, srcAmp: srcAmp, plateOf: plateOf, cont: cont, geo: geo,
    nf2: (i, f, o, gn) => nfr(nzA, i, f, o, gn), nf3: (i, f, o, gn) => nfr(nzB, i, f, o, gn),
    K: K, area: 1 / (K * K), minLen: 2 * K, inflow: inflow, mtnOffset: mtnOffset, riverT: 0.35, minLake: K * K,
    lakeHint: lakeHint, basinHint: basinHint, termHint: termHint,
  });
  /* the square itself; the margin around it is "beyond", the neighbours' land */
  for (const r of out.regions) {
    r.beyond = !(r.x >= ix0 && r.x < ix1 && r.y >= iy0 && r.y < iy1);
    r.planet = near(r.id);
  }
  Object.defineProperty(out, "_gen", {
    enumerable: false, configurable: true,
    value: { E: E, Ec: Ec, T: T, P: fin.P, M: fin.M, acc: fin.acc, lake: fin.lake, basin: fin.basin, terminal: fin.terminal, riverT: fin.riverT,
             mtnOffset: fin.mtnOffset, precip: precip, inflow: inflow, ms: Date.now() - t0 },
  });
  return out;
}

/* separable box blur that wraps in x; with kx (a row's column width) it reaches r / kx columns
   east and west, the same distance on the ground in every row */
function blurWrap(src, W, H, r, kx) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    const rx = kx ? Math.min((W >> 1) - 1, Math.round(r / kx[y])) : r, nx = 2 * rx + 1;
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -rx; k <= rx; k++) s += src[y * W + (((x + k) % W) + W) % W];
      tmp[y * W + x] = s / nx;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[clamp(y + k, 0, H - 1) * W + x];
    out[y * W + x] = s / n;
  }
  return out;
}

AEON.planetgen = { generate: generate, region: region };
AEON.regiongen = region;

})();
