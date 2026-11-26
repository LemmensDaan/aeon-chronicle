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
/* outlet (optional): land cells the water leaves by, as it leaves by the sea */
function floodFill(N, NB8, E, sea, runoff, outlet) {
  const Ef = new Float32Array(N), parent = new Int32Array(N).fill(-1), order = new Int32Array(N);
  const done = new Uint8Array(N), heap = Heap(N * 8 + 8);
  let o = 0;
  for (let i = 0; i < N; i++) if (E[i] <= sea || (outlet && outlet[i])) { Ef[i] = E[i]; heap.push(E[i], i); done[i] = 1; }
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
/* cooling with height, in the T scale (1 = 55.6 degC): 4.9 degC a km, well under the free air's
   6.5, as high ground heats the air over it (a plateau is a raised heat source). Fitted on
   Earth's land: CRU station normals against height, latitude and distance from the sea
   (docs/EARTH_CLIMATE_TEST.md) */
const LAPSE_T = 4.9 / 55.6;
/* the treeline by latitude (degrees), in metres; above it land is "mountain": rock, alpine
   meadow and glacier. ~3,800 m in the tropics, ~2,200 m at 45 degrees, never under 500 m */
function treeline(deg) {
  return Math.max(500, deg <= 20 ? 3800 : deg <= 45 ? 3800 - (deg - 20) * 64 : 2200 - (deg - 45) * 82);
}
/* how far (m) a height h at latitude deg stands above where mountains begin: the treeline, and
   never under 1,200 m (low cold uplands above the treeline are tundra) */
/* the model's rain (a share of the air's water per step) in mm a year: matched to Earth's land
   rainfall, quantile by quantile, on Earth's own relief (tools/earth-climate.js) */
function rainMmOf(p) { return 2675 * Math.pow(Math.max(0, p) / 0.097, 0.887); }
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
  const isSource = new Uint8Array(N), ridge = new Uint8Array(N), effArc = new Uint8Array(N);
  const stress = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, A = plates[plateOf[i]];
    let best = 0, bm = 0, bw = 0, bp = 0, bo = 0, ba = 0;
    for (let k = 0; k < 4; k++) {
      const j = NB4[i * 4 + k];
      if (j < 0 || plateOf[j] === plateOf[i]) continue;
      const B = plates[plateOf[j]];
      const jx = j % W, jy = (j / W) | 0;
      const nx = dxw(x, jx), ny = jy - y;
      const c = clamp((A.vx - B.vx) * nx + (A.vy - B.vy) * ny, -1.6, 1.6);   /* + = converging */
      const ci = cont[i], cj = cont[j];
      let amp = 0, m = 0, w = 1, pk = 0, arc = 0;
      if (c > 0) {
        /* the ranges' heights and widths are fitted so the worlds' land heights match Earth's (a
           belt ~900 km across for a collision, ~500 km for an Andean margin); a physical version,
           from the crust's thickness, its floating (isostasy), its strength under the planet's
           gravity, its age and erosion by rain, belongs to the deep-time plates
           (docs/ROADMAP_WORLDGEN.md) */
        if (ci && cj) { amp = 0.44 * c; m = 4000 * c; w = 3.4; pk = 1; }                   /* collision orogeny */
        else if (ci && !cj) { amp = 0.36 * c; m = 3800 * c; w = 2.0; pk = 2; }             /* andean margin */
        else if (!ci && cj) { amp = -0.17 * c; m = -2500 * c; w = 1.2; pk = 0; }           /* trench, subducting */
        /* island arc: its volcanoes stand about as high whatever the plates' speed (Japan, the
           Aleutians, the Lesser Antilles), so the arc rises from the deep floor to near the sea and
           its peaks break the surface as a chain of islands (below) */
        else if (A.density < B.density) { amp = 0.3 * c; m = 3800 + 2600 * Math.min(c, 1); w = 1.6 + 0.6 * Math.min(c, 1); pk = 1; arc = 1; }
        else { amp = -0.15 * c; m = -2500 * c; w = 1.2; pk = 0; }
      } else if (c < 0) {
        if (ci) { amp = 0.12 * c; m = 1400 * c; w = 1.6; pk = 0; }                          /* continental rift */
        else { amp = -0.08 * c; m = 0; w = 2.6; pk = 0; }       /* mid-ocean ridge: its height is the young floor's (below) */
      }
      if (Math.abs(amp) > Math.abs(best)) { best = amp; bm = m; bw = w; bp = pk; bo = plateOf[j]; ba = arc; }
      stress[i] = Math.max(stress[i], Math.abs(c));
      if (c < 0 && !ci && !cj) ridge[i] = 1;
    }
    if (best !== 0) { isSource[i] = 1; effAmp[i] = best; effM[i] = bm; effW[i] = bw; effPeak[i] = bp; effOther[i] = bo; effArc[i] = ba; }
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
  /* 3 to 5: Earth has some 40 to 50, but each chain here runs over many cells, and more would
     crowd the sea with them */
  const nHot = rng.int(3, 5);
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
    /* an island arc is a chain, not a wall: its height rises and falls along it, so it breaks
       into islands of mixed sizes with straits between them */
    if (srcOf[i] >= 0 && effArc[srcOf[i]]) h += upliftM[i] * (clamp(0.8 + 1.5 * nf(noise3, i, 0.3, 2, 0.5), 0.3, 1.4) - 1);
    h += upliftM[i] + (noise2.ridged(CX[i] * 0.16, CY[i] * 0.16, CZ[i] * 0.16, 4) - 0.55) * 1800 * mtn;
    /* the highest ranges grow more slowly than the push under them (erosion, gravity) */
    if (h > 5000) h = 5000 + (h - 5000) * 0.4;
    /* continental crust below the sea is shelf (a rift may sink deeper) */
    if (cont[i] && h < 0 && upliftM[i] > -300) {
      h = -40 - 180 * (1 - Math.exp(h / 400));
      /* a cell is ~270 km and a shelf averages ~80 km: where the crust meets the ocean floor the
         cell holds the shelf break and the slope too, so it averages deeper than 200 m; where
         the noise is high the shelf runs wide (Siberia, Sunda, Patagonia) and stays shallow */
      const edge = clamp(2 - dCont[i], 0, 1), wide = clamp(0.5 + nf(noise2, i, 0.08, 2, 0.5), 0, 1);
      h -= edge * (1 - wide) * 1500;
    }
    hm[i] = h;
  }

  /* ----- the world's sea level -----
     Most worlds keep the sea near Earth's; some have a higher sea that floods the lowlands and
     shelves into island seas (an archipelago world), a few a lower one that joins the shelves to
     the land. Its own stream of draws, so the rest of the world stays as it was. */
  {
    const sr = AEON.RNG(world.seed + ":sealevel"), r = sr.next();
    const rise = r < 0.6 ? sr.range(-40, 40) : r < 0.85 ? sr.range(90, 220) : sr.range(-130, -70);
    for (let i = 0; i < N; i++) hm[i] -= rise;
    world.seaRise = Math.round(rise);
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

  /* a test can hand in a whole planet's relief in metres (tools/earth-climate.js runs the climate
     on Earth's): it replaces the generated terrain here, and the seam is left where it is */
  const terrainIn = AEON.planetgen && AEON.planetgen.terrainIn;
  if (terrainIn) { for (let i = 0; i < N; i++) hm[i] = terrainIn[i]; geo.fill(0); }

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
    const off = terrainIn ? 0 : (W - best) % W;
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
  /* the planet's axial tilt: Earth's 23.4 degrees, give or take 1.5 (its own stream of draws, so
     the rest of the world stays as it was). Day length and size are Earth's for now; later they
     come from the planet's settings (docs/ROADMAP_WORLDGEN.md). A test may set tiltIn. */
  const tilt = (AEON.planetgen && AEON.planetgen.tiltIn) || Math.round(AEON.RNG(world.seed + ":orbit").range(21.9, 24.9) * 100) / 100;
  world.planet = { tilt: tilt, dayHours: 24, radiusKm: 6371 };
  const T0 = (lat) => 0.02 + 0.88 * Math.pow(Math.max(0, Math.cos(lat)), 1.35);
  /* 0 below a, rising to 1 at b, 1 to c, falling to 0 at d */
  const band = (v, a, b, c, d) => (v <= a || v >= d ? 0 : v < b ? (v - a) / (b - a) : v <= c ? 1 : (d - v) / (d - c));
  const sinLat = new Float32Array(N), DEGL = new Float32Array(N);
  for (let i = 0; i < N; i++) { sinLat[i] = Math.abs(Math.sin(latRad[i])); DEGL[i] = latRad[i] * 180 / Math.PI; }

  /* winds: three-cell circulation, as tables over the distance from the tropical rain belt, in
     Earth's degrees (0 the rain belt, 30 the Hadley cell's edge, 60 the polar front, 90 the pole);
     the circulation below maps each planet's own belts onto them */
  const U_TAB = [[0, -0.75], [15, -0.95], [30, 0], [45, 1], [60, 0], [75, -0.6], [90, -0.3]];
  const V_TAB = [[0, 0], [15, -0.45], [30, 0], [45, 0.35], [60, 0], [75, -0.35], [90, 0]]; /* + = poleward */
  /* how readily the air rains out by latitude (its rising and sinking): the narrow belt of the
     tropical rains, the sinking subtropical air that keeps the deserts dry all year, the storm
     tracks. Fitted on Earth's land (tools/earth-climate.js) */
  const RAIN_TAB = [[0, 2.3], [6, 2.0], [11, 1.1], [16, 0.35], [22, 0.08], [28, 0.1], [34, 0.4], [42, 0.85], [50, 1.05], [58, 1.1], [70, 0.7], [90, 0.4]];
  const tab = (t, d) => { for (let k = 1; k < t.length; k++) if (d <= t[k][0]) return lerp(t[k - 1][1], t[k][1], (d - t[k - 1][0]) / (t[k][0] - t[k - 1][0])); return t[t.length - 1][1]; };
  const nU = new Float32Array(N), nV = new Float32Array(N);
  for (let i = 0; i < N; i++) { nU[i] = nf(noise2, i, 0.05, 2, 0.5) * 0.3; nV[i] = nf(noise3, i, 0.05, 2, 0.5) * 0.2; }
  /* ----- the circulation, from the heat budget (docs/WINDS.md) -----
     A first, coarse run of the heat budget (every third column, the sea air's reach guessed from
     the distance to the coast) gives the temperature of the air over each latitude, month by
     month. The wind belts follow from it:
     - the tropical rain belt (the ITCZ) lies where the air is warmest. There the air's poleward
       heat transport is zero: the air rises and the trade winds of both sides meet (the
       energy-flux equator). It follows the sun, further over a hemisphere with more land;
     - the Hadley cells reach about 30 degrees from it on Earth. Their width grows with the
       equator-to-pole contrast to the 1/4 power and shrinks with (rotation x radius)^1/2 (Held
       2000), so a faster or larger planet has narrower belts. The westerlies and the storms lie
       between the Hadley cell's edge and twice that distance;
     - the westerlies blow as hard as the temperature contrast across the mid-latitudes allows
       (the thermal wind), divided by the rotation. The storms that carry their rain grow with
       its square, so each hemisphere's winter storms outdo its summer ones by its own contrast. */
  const circ = (function () {
    const S = 3, Wc = Math.ceil(W / S), Nc = Wc * H, oc = new Uint8Array(Nc), mc = new Float32Array(Nc);
    for (let y = 0; y < H; y++) for (let xc = 0; xc < Wc; xc++) {
      const i = y * W + Math.min(W - 1, xc * S), c = y * Wc + xc;
      oc[c] = isOcean(i) ? 1 : 0; mc[c] = Math.exp(-coastDist[i] / 6);
    }
    const e = energyBalance({ W: Wc, H: H, N: Nc, ocean: (c) => oc[c] === 1, marine: mc, seaAnom: new Float32Array(Nc), tilt: tilt, months: true });
    const R = e.R, L = e.latR;
    const series = (src, m) => {
      const a = new Float64Array(R);
      for (let k = 0; k < 12; k++) if (m < 0 || k === m) for (let r = 0; r < R; r++) a[r] += src[k * R + r] / (m < 0 ? 12 : 1);
      return a;
    };
    const air = (m) => series(e.air, m), ground = (m) => series(e.ground, m);
    const at = (a, lat) => {   /* the rows run north to south */
      const f = clamp((L[0] - lat) / (L[0] - L[R - 1]) * (R - 1), 0, R - 1), r0 = Math.min(R - 2, Math.floor(f));
      return lerp(a[r0], a[r0 + 1], f - r0);
    };
    const warmest = (a) => {   /* the warmest air within 25 degrees of the equator, refined between rows */
      let b = -1;
      for (let r = 1; r < R - 1; r++) if (Math.abs(L[r]) <= 25 && (b < 0 || a[r] > a[b])) b = r;
      const d = a[b - 1] - 2 * a[b] + a[b + 1], off = d < 0 ? clamp(0.5 * (a[b - 1] - a[b + 1]) / d, -0.5, 0.5) : 0;
      return L[b] + off * (L[b + 1] - L[b]);
    };
    const grad = (a, h) => at(a, 30 * h) - at(a, 60 * h);
    const spin = 24 / world.planet.dayHours, size = world.planet.radiusKm / 6371;
    const A = air(-1), delta = at(A, warmest(A)) - (at(A, 70) + at(A, -70)) / 2;
    const hadley = clamp(WIND.HADLEY * Math.pow(delta / WIND.DELTA_E, 0.25) / Math.sqrt(spin * size), 12, 40);
    const G = ground(-1), gA = { 1: grad(G, 1), "-1": grad(G, -1) };
    /* the rain belt over each longitude: the zonal one, pulled towards the latitude where that
       stretch of the planet's surface is warmest in the season (the summer continents' heat draws
       the monsoon rains towards it: over Africa, South America and Australia in January, over
       India and the Sahel in July). The pull is WIND.LOCAL of the gap, smoothed along the
       longitudes, and the belt stays within 25 degrees of the equator */
    const local = function (m, itcz) {
      const out = new Float32Array(W), gm = ground(m);
      const warmRow = (val) => { let b = -1, bv = -1e9; for (let y = 0; y < H; y++) { const lat = DEGL[y * W]; if (Math.abs(lat) <= 30 && val(y) > bv) { bv = val(y); b = y; } } return DEGL[b * W]; };
      const zon = warmRow((y) => gm[y + (R - H) / 2]);
      const col = new Float32Array(Wc);
      for (let xc = 0; xc < Wc; xc++) col[xc] = warmRow((y) => { let s = 0; for (let k = -2; k <= 2; k++) s += e.months[m * Nc + y * Wc + ((xc + k + Wc) % Wc)]; return s; });
      for (let x = 0; x < W; x++) { const f = x / S, x0 = Math.floor(f) % Wc, x1 = (x0 + 1) % Wc; out[x] = lerp(col[x0], col[x1], f - Math.floor(f)); }
      const sm = blurWrap(out, W, 1, 4, new Float32Array([1]));
      for (let x = 0; x < W; x++) out[x] = clamp(itcz + WIND.LOCAL * (sm[x] - zon), -25, 25);
      return out;
    };
    const make = function (m, belt) {
      const itcz = m < 0 ? warmest(A) : warmest(air(m));
      if (!belt) belt = local(m, itcz);
      const gain = {};
      for (const h of [1, -1]) {
        const base = clamp((gA[1] + gA[-1]) / 2 / WIND.GRAD_E / spin, 0.6, 1.5);
        gain[h] = m < 0 ? base : base * clamp(Math.pow(grad(ground(m), h) / gA[h], 2), 0.5, 1.6);
      }
      const d = new Float32Array(N), g = new Float32Array(N);
      const uT = new Float32Array(N), vT = new Float32Array(N), rT = new Float32Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, it = belt[x], lat = DEGL[i], sd = lat >= it ? 1 : -1, dist = Math.abs(lat - it);
        const span = 90 - sd * it, front = Math.min(2 * hadley, span - 5);
        d[i] = dist <= hadley ? 30 * dist / hadley : dist <= front ? 30 + 30 * (dist - hadley) / (front - hadley) : 60 + 30 * (dist - front) / (span - front);
        /* the westerlies' gain, by the hemisphere the cell is in, between table degrees 28 and 70 */
        const w = clamp((d[i] - 28) / 10, 0, 1) * clamp((70 - d[i]) / 10, 0, 1);
        g[i] = 1 + (gain[lat >= 0 ? 1 : -1] - 1) * w;
        uT[i] = tab(U_TAB, d[i]) * g[i]; vT[i] = tab(V_TAB, d[i]) * g[i] * (sd > 0 ? -1 : 1); rT[i] = tab(RAIN_TAB, d[i]);
      }
      return { itcz: itcz, belt: belt, gainN: gain[1], gainS: gain[-1], d: d, g: g, uT: uT, vT: vT, rT: rT };
    };
    const jan = make(0), jul = make(6), mid = new Float32Array(W);
    for (let x = 0; x < W; x++) mid[x] = (jan.belt[x] + jul.belt[x]) / 2 + warmest(A) - (jan.itcz + jul.itcz) / 2;
    return { hadley: hadley, delta: delta, gradN: gA[1], gradS: gA[-1], ann: make(-1, mid), jan: jan, jul: jul, air: A, latR: L, R: R };
  })();
  const r1 = (v) => Math.round(v * 10) / 10;
  world.planet.itcz = { jan: r1(circ.jan.itcz), jul: r1(circ.jul.itcz), mean: r1(circ.ann.itcz) };
  world.planet.hadleyDeg = r1(circ.hadley);
  /* the belts at a season (s: +1 July, -1 January, 0 the year); with a season's pressure P
     (below) the wind also turns round its highs and lows, which makes the monsoons */
  const winds = function (s, U, V, rainF, P) {
    const c = s > 0 ? circ.jul : s < 0 ? circ.jan : circ.ann;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      U[i] = c.uT[i] + nU[i];
      V[i] = c.vT[i] + nV[i];
      rainF[i] = c.rT[i];
      if (P) {
        /* the wind around the season's highs and lows: along the isobars (clockwise round a
           high in the north, the Coriolis turn), and part across them, down the gradient
           (friction at the ground); near the equator, where the turn fades, mostly down it */
        const gx = (P[y * W + wx(x + 1)] - P[y * W + wx(x - 1)]) / (2 * KX[y]);
        const gn = (P[Math.max(0, y - 1) * W + x] - P[Math.min(H - 1, y + 1) * W + x]) / 2;
        const f = Math.sin(DEGL[i] * Math.PI / 180), af = Math.max(Math.abs(f), 0.25), s = f >= 0 ? 1 : -1;
        let ue = 60 * (-gn * s - 0.6 * gx) / af;
        let vn = 60 * (gx * s - 0.6 * gn) / af;
        const mg = Math.hypot(ue, vn);
        if (mg > 1.2) { ue *= 1.2 / mg; vn *= 1.2 / mg; }
        /* thermal highs and lows are shallow: they steer the winds in the tropics (the
           monsoons) but the moving storms of the westerlies outweigh them from 25 to 50 degrees,
           down to a fifth (the winter continent is a high, yet sea air still reaches it) */
        const wq = clamp((Math.abs(DEGL[i]) - 25) / 25, 0, 1), gq = 1 - 0.8 * wq * wq * (3 - 2 * wq);
        ue *= gq; vn *= gq;
        U[i] += ue; V[i] -= vn;
        /* rising air in the lows rains more, sinking air in the highs less */
        rainF[i] *= clamp(1 - 5 * P[i], 0.25, 2.5);
      }
    }
  };
  const U = new Float32Array(N), Vv = new Float32Array(N), rainF = new Float32Array(N);
  winds(0, U, Vv, rainF);

  /* ----- ocean currents (docs/OCEAN_CURRENTS.md): this world's own, from its winds, coasts and
     sea floor, and the warmth or cold they carry ----- */
  const T = new Float32Array(N), SST = new Float32Array(N), sstA = new Float32Array(N), curA = new Float32Array(N), qOcean = new Float32Array(N);
  /* a first guess from latitude (Earth's zonal means), for the currents to carry; the heat they
     bring goes into the heat budget below, which sets the real temperature */
  for (let i = 0; i < N; i++) T[i] = T0(latRad[i]);
  const cur = oceanCurrents(W, H, N, KX, DEGL, wx, isOcean, hm, U, Vv, blurWrap);
  const CU = cur.U, CV = cur.V, upwell = cur.up;
  /* the water's temperature: each step a sea cell takes the water from upstream on the current,
     mixes a little with its neighbours, and gives part of its warmth or cold to the air (falls
     back towards its latitude's level); where the wind drives the surface water off the coast,
     cold water wells up from below. Run to a steady state, so a fast current carries tropical
     warmth far poleward (Gulf Stream, Kuroshio) and one from high latitudes carries cold the
     other way (Canary, California, Humboldt, Labrador). */
  {
    const base = new Float32Array(N), seaL = [];
    for (let i = 0; i < N; i++) { base[i] = T[i] - CUR_UP * CT * upwell[i]; if (isOcean(i)) seaL.push(i); }
    /* the upstream point of every sea cell is fixed, so its corners and weights are worked out
       once; water only comes from water: a land corner stands for the cell itself */
    const S = seaL.length, UPI = new Int32Array(S * 4), UPW = new Float32Array(S * 4), NBI = new Int32Array(S * 4).fill(-1);
    for (let s = 0; s < S; s++) {
      const i = seaL[s], x = i % W, y = (i / W) | 0;
      const ux = x - CU[i] * CUR_DT / KX[y], uy = clamp(y - CV[i] * CUR_DT, 0, H - 1);
      const x0 = Math.floor(ux), y0 = Math.floor(uy), tx = ux - x0, ty = uy - y0, y1 = Math.min(y0 + 1, H - 1);
      const cs = [y0 * W + wx(x0), y0 * W + wx(x0 + 1), y1 * W + wx(x0), y1 * W + wx(x0 + 1)];
      const ws = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
      for (let k = 0; k < 4; k++) { UPI[s * 4 + k] = isOcean(cs[k]) ? cs[k] : i; UPW[s * 4 + k] = ws[k]; }
      let n = 0;
      for (let k = 0; k < 4; k++) { const j = NB4[i * 4 + k]; if (j >= 0 && isOcean(j)) NBI[s * 4 + n++] = j; }
    }
    let a = Float32Array.from(base), b = Float32Array.from(base);
    for (let it = 0; it < CUR_HEAT_STEPS; it++) {
      for (let s = 0; s < S; s++) {
        const i = seaL[s], k = s * 4;
        let v = a[UPI[k]] * UPW[k] + a[UPI[k + 1]] * UPW[k + 1] + a[UPI[k + 2]] * UPW[k + 2] + a[UPI[k + 3]] * UPW[k + 3];
        let sm = 0, n = 0;
        for (let m = 0; m < 4; m++) { const j = NBI[k + m]; if (j < 0) break; sm += a[j]; n++; }
        if (n) v += (sm / n - v) * CUR_MIX;
        b[i] = v + (base[i] - v) * CUR_XCHG;
      }
      const t = a; a = b; b = t;
    }
    /* T0 is fitted to Earth's zonal means, which already hold the ocean's poleward heat
       transport; so the currents only decide where along each latitude the water is warm or
       cold: each row's mean anomaly (over the rows either side, so a row with little sea
       does not swing) is taken out. Then the open sea's own zonal level goes back on: at high
       latitudes it is warmer than the air's zonal mean (it keeps the summer's warmth through
       the winter), a little cooler in the trade-wind belt (CUR_ZONAL, deg C) */
    /* the heat the currents carry, as a source on each sea cell for the heat budget: the
       warmth or cold the water brings, at CUR_LAMBDA W/m2 a degree (the heat that keeps that
       anomaly against the loss to the air and to space). Summed over the sea it is nil: the
       currents move heat, they do not make it */
    {
      let sq = 0, sa = 0;
      for (const i of seaL) { const w = Math.cos(latRad[i]); qOcean[i] = CUR_LAMBDA * (a[i] - T[i]) / CT; sq += w * qOcean[i]; sa += w; }
      for (const i of seaL) qOcean[i] -= sq / sa;
      /* along each row the heat stays where the currents put it; across the rows the ocean's
         eddies spread it, so each row's mean is smoothed over CUR_SPREAD rows either side */
      const rq = new Float64Array(H), rc = new Float64Array(H);
      for (const i of seaL) { const y = (i / W) | 0; rq[y] += qOcean[i]; rc[y]++; }
      for (let y = 0; y < H; y++) {
        if (!rc[y]) continue;
        let s2 = 0, n2 = 0;
        for (let k = -CUR_SPREAD; k <= CUR_SPREAD; k++) { const yy = y + k; if (yy >= 0 && yy < H) { s2 += rq[yy]; n2 += rc[yy]; } }
        const sh = s2 / n2 - rq[y] / rc[y];
        for (let x = 0; x < W; x++) { const i = y * W + x; if (isOcean(i)) qOcean[i] += sh; }
      }
    }
    const rs = new Float32Array(H), rn = new Float32Array(H);
    for (const i of seaL) { const y = (i / W) | 0; rs[y] += a[i] - T[i]; rn[y]++; }
    for (let y = 0; y < H; y++) {
      let s = 0, n = 0;
      for (let k = -2; k <= 2; k++) { const yy = clamp(y + k, 0, H - 1); s += rs[yy]; n += rn[yy]; }
      const m = n ? s / n : 0, zl = CT * tab(CUR_ZONAL, Math.abs(DEGL[y * W]));
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!isOcean(i)) continue;
        curA[i] = CUR_GAIN * (a[i] - T[i] - m);
        sstA[i] = curA[i] + zl;
        SST[i] = T[i] + sstA[i];
      }
    }
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
  const marine = new Float32Array(N), anom = new Float32Array(N), anomC = new Float32Array(N);
  /* sea that freezes in winter moderates little: arctic coasts are nearly continental */
  const frozen = (i) => (SST[i] - CT * (1 + 4 * Math.pow(sinLat[i], 1.5))) / CT - 22.4 < -8;
  {
    let m1 = new Float32Array(N), a1 = new Float32Array(N), m2 = new Float32Array(N), a2 = new Float32Array(N);
    let c1 = new Float32Array(N), c2 = new Float32Array(N);
    for (let it = 0; it < 40; it++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (isOcean(i)) { m2[i] = frozen(i) ? 0.3 : 1; a2[i] = sstA[i]; c2[i] = curA[i]; continue; }
        const ux = x - U[i] / KX[y], uy = y - Vv[i], mx = Math.max(0.3, mix[i]);
        const keep = Math.exp(-0.01 - 0.06 * Math.hypot(U[i], Vv[i]) - Math.max(0, Es[i] - sampleWrap(Es, ux, uy)) * 2);
        m2[i] = lerp(sampleWrap(m1, ux, uy), nbMean(m1, i), mx) * keep;
        a2[i] = lerp(sampleWrap(a1, ux, uy), nbMean(a1, i), mx) * keep;
        c2[i] = lerp(sampleWrap(c1, ux, uy), nbMean(c1, i), mx) * keep;
      }
      let s = m1; m1 = m2; m2 = s; s = a1; a1 = a2; a2 = s; s = c1; c1 = c2; c2 = s;
    }
    marine.set(m1); anom.set(a1); anomC.set(c1);
  }

  /* the heat budget through the year: each cell's mean and seasonal range at sea level. The land
     feels the sea air upwind of it: air off a cold current is stable, its chill stays in a shallow
     layer by the coast, so half of the water's cold anomaly counts (California and Portugal stay
     Mediterranean); air off warm water mixes and carries its warmth inland in full (London) */
  const seaAnom = new Float32Array(N);
  for (let i = 0; i < N; i++) seaAnom[i] = (anomC[i] < 0 ? 0.5 : 1) * anomC[i] / CT;
  /* the air's share of the poleward heat transport (Bjerknes compensation): the first pass gave
     the transport of air and sea together; where the currents carry part of it across a latitude,
     the air carries that much less (up to 70%), so the total stays what the sun's heating asks.
     The first pass's diffusion moves more heat than Earth's air and sea really do, so the currents'
     share of it is taken CUR_SHARE times (on Earth's map: about half at 20-30 degrees, a few
     percent beyond 60, near the observed split).
     Returned as the air's D at each boundary between the heat budget's rows */
  const airShare = function () {
    const R = circ.R, L = circ.latR, A = circ.air, ext = (R - H) / 2, rad = Math.PI / 180;
    const Drow = new Float64Array(R - 1).fill(EBM.D), share = new Float64Array(R - 1);
    let Fo = 0;   /* northward heat carried by the currents across the boundary, W (x 1 / (2 pi r^2)) */
    for (let y = 0; y < H - 1; y++) {
      /* heat the currents bring into row y, per unit of sin(latitude) and 2 pi r^2 */
      const yl = DEGL[y * W], dxs = Math.sin((yl + 75 / H) * rad) - Math.sin((yl - 75 / H) * rad);
      let q = 0;
      for (let x = 0; x < W; x++) q += qOcean[y * W + x];
      Fo += q / W * dxs;
      const r = y + ext, xe = Math.sin((L[r] + L[r + 1]) / 2 * rad);
      const Ff = -EBM.D * (1 - xe * xe) * (A[r] - A[r + 1]) / (Math.sin(L[r] * rad) - Math.sin(L[r + 1] * rad));
      const floor = 0.05 * EBM.D;   /* near the equator the total transport is near nil */
      share[r] = clamp(CUR_SHARE * Fo * Ff / Math.max(Ff * Ff, floor * floor), 0, 0.7);
    }
    for (let r = 0; r < R - 1; r++) {
      let sm = 0, n = 0;
      for (let k = -3; k <= 3; k++) { const rr = r + k; if (rr >= 0 && rr < R - 1) { sm += share[rr]; n++; } }
      Drow[r] = EBM.D * (1 - sm / n);
    }
    world.planet.oceanShare = Math.round(100 * (1 - Drow.reduce((s, v) => s + v, 0) / (R - 1) / EBM.D)) / 100;
    return Drow;
  };
  const eb = energyBalance({ W: W, H: H, N: N, ocean: isOcean, marine: marine, seaAnom: seaAnom, tilt: tilt, qOcean: qOcean, Drow: airShare() });
  world.planet.polarC = eb.polar;
  for (let i = 0; i < N; i++) {
    const t = (eb.mean[i] + 22.4) * CT;
    /* the sea: the heat budget's own, which holds the heat its current brings */
    if (isOcean(i)) { T[i] = t; SST[i] = T[i]; continue; }
    T[i] = t - LAPSE_T * Math.max(0, hm[i]) / 1000;
  }
  /* weather does not follow the parallels: broad warm and cold tongues, plus a little local
     variety, so the tundra and the deserts get ragged edges instead of straight ones */
  for (let i = 0; i < N; i++) if (!isOcean(i)) T[i] += nf(noise3, i, 0.022, 3, 0.5) * 0.06 + nf(noise2, i, 0.09, 2, 0.5) * 0.02;
  for (let i = 0; i < N; i++) T[i] = clamp(T[i], 0, 1);

  /* seasons: half the year's range (warmest minus coldest month), small at sea and by it, large
     deep inside a continent at high latitude (Yakutsk: 58 C between January and July) */
  const Tamp = new Float32Array(N), seaIce = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    Tamp[i] = CT * eb.amp[i];
    /* pack ice in winter: the water stays warmer than the air above it, so the ice edge lies
       where the winter air is about -8 C */
    if (isOcean(i) && (T[i] - Tamp[i]) / CT - 22.4 < -8) seaIce[i] = 1;
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
  const Pp = new Float32Array(N), Ta = new Float32Array(N);
  const season = function (sgn, out) {
    for (let i = 0; i < N; i++) Ts[i] = clamp(T[i] + sgn * Math.sign(DEGL[i]) * Tamp[i], 0, 1);
    /* the season's pressure, from heat: ground warmer than its latitude's mean heats the air
       over it into a low (the summer continents, the Asian monsoon's), colder ground cools it
       into a high (Siberia in winter, the cool summer oceans' subtropical highs). The heat is
       taken as at sea level, so a high plateau in summer is a heat source, not a cold dome;
       smoothed to the scale of the weather systems. */
    for (let i = 0; i < N; i++) Ta[i] = Ts[i] + (isOcean(i) ? 0 : LAPSE_T * Math.max(0, hm[i]) / 1000);
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = 0; x < W; x++) s += Ta[y * W + x];
      const m = s / W;
      /* a winter continent's cold high is a shallow dome: the storms and the sea air pass over
         it, so it counts a quarter (the summer heat lows of the monsoons count in full) */
      for (let x = 0; x < W; x++) { const k = y * W + x; Ta[k] = m - Ta[k]; if (Ta[k] > 0 && sgn * DEGL[k] < 0) Ta[k] *= 0.25; }
    }
    Pp.set(blurWrap(Ta, W, H, 6, KX));
    winds(sgn, Us, Vs, rFs, Pp);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      recycle[i] = 0.65 * clamp(Ts[i] * 1.5, 0.2, 1);
      /* the water the air can hold follows the air mass as much as the ground under it: the
         sea air over a winter continent cools only gradually, so it carries snow inland
         instead of dropping all its water on the first cold coast */
      CAP[i] = 0.12 + 0.88 * lerp(Ts[i], T[i], 0.5);
      const ux = x - Us[i] / KX[y], uy = clamp(y - Vs[i], 0, H - 1);
      const x0 = Math.floor(ux), y0 = Math.floor(uy), tx = ux - x0, ty = uy - y0, y1 = Math.min(y0 + 1, H - 1);
      UPI[i * 4] = y0 * W + wx(x0); UPI[i * 4 + 1] = y0 * W + wx(x0 + 1); UPI[i * 4 + 2] = y1 * W + wx(x0); UPI[i * 4 + 3] = y1 * W + wx(x0 + 1);
      UPW[i * 4] = (1 - tx) * (1 - ty); UPW[i * 4 + 1] = tx * (1 - ty); UPW[i * 4 + 2] = (1 - tx) * ty; UPW[i * 4 + 3] = tx * ty;
      const rise = Math.max(0, Es[i] - sampleWrap(Es, ux, uy));
      /* air off a cold current is stable and keeps its water (the Atacama, the Namib, Baja),
         air off a warm one rains readily: each degree of the water's anomaly it carries moves
         the rain-out by a fifth, between 0.2 and 1.6 times */
      let stab = clamp(1 + anom[i] / (CT * 5), 0.2, 1.6);
      /* in winter the storms' fronts lift the air whatever its stability, so in the storm belt
         the cold water's damping is half lifted (Perth, Chile and California get winter rain) */
      if (sgn * DEGL[i] < 0) {
        const dg = Math.abs(DEGL[i]), wb = clamp((dg - 28) / 10, 0, 1) * clamp((70 - dg) / 10, 0, 1);
        stab = lerp(stab, Math.max(1, stab), 0.5 * wb);
      }
      FRAC[i] = clamp((0.045 * rFs[i] + rise * 2) * stab, 0, 0.8);
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
  /* the year's rain, and the share of it that falls in the local summer half. July and January
     are the extreme months, not the halves: with the rain following a sine through the year,
     the six summer months hold 0.5 + (2 / pi) x (the peak month's share - 0.5) of it */
  const precip = new Float32Array(N), pSum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    precip[i] = (pJul[i] + pJan[i]) / 2;
    const s = DEGL[i] >= 0 ? pJul[i] : pJan[i];
    pSum[i] = precip[i] > 0 ? 0.5 + (2 / Math.PI) * (s / (pJul[i] + pJan[i]) - 0.5) : 0.5;
  }
  /* dry ground runs hot: with little water to evaporate and clear skies, the sun's heat goes
     into the air (the Sahara's annual mean is some 5 C above its latitude's). Up to 4.2 C x
     cos(latitude) where the year's rain is near nil, none from 1,000 mm; fitted on Earth's land */
  for (let i = 0; i < N; i++) {
    if (isOcean(i)) continue;
    const mm = rainMmOf(precip[i]);
    T[i] = clamp(T[i] + CT * 4.2 * Math.max(0, 1 - mm / 1000) * Math.cos(latRad[i]), 0, 1);
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
    value: { plateOf, plates, cont, uplift, geo, E, Hm: hm, T, Tamp, SST, ebMean: eb.mean, ebAmp: eb.amp, eb: eb, circ, qOcean, curA, seaIce, marine, pSum, pJul, pJan, P: fin.P, M: fin.M, U, V: Vv, CU, CV, psi: cur.psi, upwell, sstA, acc: fin.acc, lake: fin.lake, basin: fin.basin, terminal: fin.terminal, hotspots,
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
    /* (not on a planet river's course in a region, where the swell would dam it) */
    const calm = L.bed ? (L.bed[i] >= 0.5 ? 0 : 1 - L.bed[i]) : 1;
    if (T[i] < 0.4 && E[i] < eOfM(1100)) Eh[i] += (L.nf3(i, 0.5, 2, 0.5) + 0.5) * 0.012 * clamp((0.4 - T[i]) / 0.06, 0, 1) * calm;
    Eh[i] += (L.nf2(i, 0.3, 3, 0.5) + 0.5) * 0.012 * calm;
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
  const hyd = floodFill(N, NB8, Eh, 0.5, runoff, L.outlet);

  /* depressions hold water up to the level where what evaporates from the lake matches what flows
     in: the lowest cells fill first. A depression that more than fills spills over its rim and
     its rivers run on; one that holds a smaller lake is a terminal lake (Caspian, Aral, Chad), the
     water ends there and the rest of the hollow is dry basin around it; one too dry for a single
     cell of lake is a dry basin (salt flat when the rain is low) */
  const lake = new Uint8Array(N), basin = new Uint8Array(N), terminal = new Uint8Array(N);
  const lakeLevel = new Float32Array(N);
  {
    const dep = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (!isOcean(i) && (hyd.Ef[i] - Eh[i] > 0.0025 || (L.lakeHint && L.lakeHint[i] > 0.35 && hyd.Ef[i] - Eh[i] > 1e-4))) dep[i] = 1;
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
      /* in a region, a hollow that holds part of a planet lake fills as far as that lake reaches;
         the rest of it is the dry flat around a closed lake, or nothing round an open one. Hollows
         without one follow their water balance below. */
      if (L.lakeHint) {
        let hinted = 0, term = 0;
        for (const c of cells) if (L.lakeHint[c] > 0.35) { hinted++; if (L.termHint[c]) term++; }
        if (hinted >= Math.max(4, (L.minLake || 1) / 4)) {
          for (const c of cells) {
            if (L.lakeHint[c] > 0.35) { lake[c] = 1; lakeLevel[c] = level; }
            /* (a planet river's course into it stays river, not salt flat) */
            else if (term && !(L.bed && L.bed[c] >= 0.5)) basin[c] = 1;
            if (term) terminal[c] = 1;
          }
          continue;
        }
      }
      /* a hollow of the region's own on a planet river's course is no dead end: the planet's
         river runs on through it (unless the planet ends that river in a closed lake here) */
      if (L.bed && cells.some((c) => L.bed[c] >= 0.5 && !L.termHint[c])) continue;
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

  /* the heart of a planet lake is lake in the region even where its terrain left no hollow (the
     outline is the noisy hint's, so it stays ragged) */
  if (L.lakeHint) for (let i = 0; i < N; i++) {
    if (isOcean(i) || lake[i] || L.lakeHint[i] <= 0.55) continue;
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
      /* (a planet river's course runs on through the dry floor round a closed lake, into the lake) */
      const runsOn = !terminal[c] || (L.bed && L.bed[c] >= 0.5 && !lake[c]);
      if (runsOn && hyd.parent[c] >= 0) acc2[hyd.parent[c]] += acc2[c];
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
    rainMm[i] = isOcean(i) ? 0 : rainMmOf(precip[i]);
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
    /* broad relief is strong in the hills and at the shore (where it draws the coast), gentle on
       the plains, which the planet has already graded */
    const relief = 0.02 + 0.04 * Math.max(MT[i], Math.max(0, 1 - Math.abs(Ec[i] - 0.5) / 0.03));
    E[i] = clamp(Ec[i] + side * 0.05 + nfr(nzA, i, 0.45, 4, 0.5) * relief + nfr(nzB, i, 1.3, 3, 0.5) * 0.018
                 + (RG[i] - rMean) * 0.16 * MT[i]
                 /* the planet's mountains stand a little above the plateaus around them */
                 + (Ec[i] > 0.55 ? (cubic(mtnInd, FX[i], FY[i]) - 0.3) * 0.05 : 0), 0, 1);
  }
  /* sea only where it joins the planet's sea: a pocket the noise dug under sea level on a low
     plain is land (the water drained into such pockets and big rivers ended far inland) */
  {
    const sea = new Uint8Array(N), q = [];
    for (let i = 0; i < N; i++) if (E[i] <= 0.5 && g.E[near(i)] <= 0.5) { sea[i] = 1; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      for (let k = 0; k < 4; k++) { const n = NB4[c * 4 + k]; if (n >= 0 && !sea[n] && E[n] <= 0.5) { sea[n] = 1; q.push(n); } }
    }
    for (let i = 0; i < N; i++) if (E[i] <= 0.5 && !sea[i]) E[i] = 0.5003;
  }

  /* the planet's rivers run where the planet has them: each river cell's course to the next is a
     valley in the region, meandering with noise, its floor falling from the one cell's height to
     the next and its sides rising with distance, so the region's water finds the same way down */
  const bed = new Float32Array(N);         /* 1 on a planet river's course, fading over half a cell */
  /* each planet river cell's course to the next, and which of them a region cell lies on */
  const segs = [], segOf = new Int32Array(N).fill(-1), segT = new Float32Array(N);
  {
    for (let y = Math.max(0, py0 - 1); y < Math.min(PH, py1 + 1); y++) for (let x = px0 - 1; x <= px1; x++) {
      const c = y * PW + pwx(x), r = world.regions[c];
      if (!(r.river > 0) || r.flowTo < 0) continue;
      const t = world.regions[r.flowTo];
      let d = t.x - pwx(x); if (d > PW / 2) d -= PW; if (d < -PW / 2) d += PW;
      segs.push([x, y, x + d, t.y, r.elevation, t.barren && !t.lake ? 0.5 : t.elevation, c, r.flowTo]);
    }
    if (segs.length) for (let i = 0; i < N; i++) {
      if (E[i] <= 0.5) continue;
      const mx = FX[i] + nfr(nzC, i, 0.6, 2, 0.5) * 0.5, my = FY[i] + nfr(nzB, i, 0.6, 2, 0.5) * 0.5;
      let best = 4, floor = 0, bs = -1, bt = 0;
      for (let k = 0; k < segs.length; k++) {
        const s = segs[k];
        const vx = s[2] - s[0], vy = s[3] - s[1], t = clamp(((mx - s[0]) * vx + (my - s[1]) * vy) / (vx * vx + vy * vy || 1), 0, 1);
        const ex = s[0] + vx * t - mx, ey = s[1] + vy * t - my, d2 = ex * ex + ey * ey;
        if (d2 < best) { best = d2; floor = lerp(s[4], s[5], t); bs = k; bt = t; }
      }
      if (best < 1) E[i] = Math.min(E[i], Math.max(0.5003, floor - 0.002) + 0.06 * best);
      bed[i] = clamp(1 - Math.sqrt(best) / 0.5, 0, 1);
      if (bed[i] >= 0.5) { segOf[i] = bs; segT[i] = bt; }
    }
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

  /* the planet's lakes hold in the region: where the planet has a lake (its cells upsampled, the
     outline roughened with noise) the ground sinks into a bowl ~140 m deep, so the region's
     own terrain shapes the shore, and finish() fills it. Hollows elsewhere follow their
     own water balance, as on the planet. */
  const lakeHint = new Float32Array(N), termHint = new Uint8Array(N);
  {
    const lin = (arr, fx, fy) => {
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      return (1 - ty) * ((1 - tx) * at(arr, x0, y0) + tx * at(arr, x0 + 1, y0)) + ty * ((1 - tx) * at(arr, x0, y0 + 1) + tx * at(arr, x0 + 1, y0 + 1));
    };
    const LK = Float32Array.from(g.lake);
    for (let i = 0; i < N; i++) {
      lakeHint[i] = clamp(lin(LK, FX[i], FY[i]) + nfr(nzB, i, 0.9, 3, 0.5) * 0.5, 0, 1);
      termHint[i] = g.terminal ? g.terminal[near(i)] : 0;
      const bowl = clamp((lakeHint[i] - 0.3) / 0.3, 0, 1);
      /* (a planet lake below sea level sits on land just above the sea: its bowl stays land) */
      if (bowl) E[i] = Math.max(0.5003, E[i] - 0.014 * bowl * bowl * (3 - 2 * bowl));
    }
  }

  /* the planet's rivers keep their whole course: along each one a channel a little lower than
     the land beside it and never rising downstream, so the region's water cannot leave it for a
     lower way of its own (in flat lowlands the noise can drop beside the valley floor, and the
     river's lower course was lost). Worked from the sources down, segment by segment. */
  if (segs.length) {
    const cells = segs.map(() => []);
    for (let i = 0; i < N; i++) if (segOf[i] >= 0 && E[i] > 0.5) cells[segOf[i]].push(i);
    const segAt = new Map(), ups = segs.map(() => []);
    segs.forEach((s, k) => segAt.set(s[6], k));
    segs.forEach((s, k) => { const d = segAt.get(s[7]); if (d != null) ups[d].push(k); });
    /* steps to the river's end, so the sources come first */
    const steps = new Int32Array(segs.length).fill(-1);
    for (let k = 0; k < segs.length; k++) {
      const path = []; let j = k;
      while (j != null && steps[j] < 0 && path.length <= segs.length) { path.push(j); j = segAt.get(segs[j][7]); }
      let n = j != null && steps[j] >= 0 ? steps[j] : 0;
      for (let p = path.length - 1; p >= 0; p--) steps[path[p]] = ++n;
    }
    const order = segs.map((s, k) => k).sort((a, b) => steps[b] - steps[a]);
    const endLevel = new Float32Array(segs.length).fill(1);
    for (const k of order) {
      let m = 1;
      for (const u of ups[k]) m = Math.min(m, endLevel[u]);
      cells[k].sort((a, b) => segT[a] - segT[b]);
      for (const i of cells[k]) {
        let side = 1;
        for (let q = 0; q < 8; q++) { const n = NB8[i * 8 + q]; if (n >= 0 && segOf[n] < 0 && E[n] > 0.5) side = Math.min(side, E[n]); }
        m = Math.max(0.50005, Math.min(m, E[i], side - 2e-4));
        E[i] = m;
      }
      endLevel[k] = m;
    }
  }
  /* where a planet river leaves the window its channel is an outlet, as the sea is (otherwise
     the window's edge dams it and its water spills out some other way) */
  const outlet = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (segOf[i] < 0) continue;
    const x = i % W, y = (i / W) | 0;
    if (x > 0 && y > 0 && x < W - 1 && y < H - 1) continue;
    const s = segs[segOf[i]], tx = s[2], ty = s[3];
    if (tx < px0 || tx >= px1 || ty < py0 || ty >= py1) outlet[i] = 1;
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
    lakeHint: lakeHint, termHint: termHint, bed: bed, outlet: outlet,
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

/* ======================================================= ocean currents === */
/* The planet's heat budget through the year (docs/ENERGY_BALANCE.md): a seasonal energy-balance
   model in the line of North & Coakley (1979), with the air as a second layer. Each cell takes the
   sun's daily-mean light for its latitude and day (from the axial tilt), reflects part of it (more
   towards the poles, where the sun is low and clouds thick; much more off snow and sea ice), loses
   heat to space as A + B T, and stores it in the sea's mixed layer (slow) or the land (fast). The
   air over each latitude row carries heat towards the poles (diffusion in sin(latitude), with
   rows of polar sea added beyond 75 degrees, where the map stops) and trades it with the ground
   under it: readily where the ground is warmer (convection), little where it is colder (a stable
   inversion, the Siberian winter). Land near the sea also takes the sea air upwind of it (marine),
   and the sea takes the heat its currents bring (qOcean, W/m2; docs/OCEAN_HEAT.md).
   Fitted on Earth's land with tools/earth-climate.js. Returns each cell's annual mean and half its
   range (warmest minus coldest month), deg C at sea level, and the polar rows' means.
   o: { W, H, N, ocean(i), marine, seaAnom (deg C the sea upwind is off its row's mean),
   tilt (degrees), qOcean (or none), Drow (the air's transport at each boundary between the rows;
   EBM.D throughout when not given), months } */
const EBM = {
  S0: 1361,          /* sunlight at the planet's distance, W/m2 */
  A: 203, B: 2.09,   /* heat lost to space: A + B T (T in deg C), W/m2 */
  D: 1.8,            /* poleward transport by the air and sea together, W/m2/K (diffusion in
                        sin(latitude)); the air's own share is less where the currents carry heat */
  ALB0: 0.24, ALB2: 0.24,  /* albedo of snow-free ground and open sea: ALB0 + ALB2 sin^2(lat) */
  SNOW: 0.55, ICE: 0.6,    /* albedo of snow-covered land and of sea ice */
  CSEA: 2.1e8,       /* heat capacity of the sea's mixed layer (50 m), J/m2/K */
  CLAND: 1.0e7,      /* of land: the top of the soil */
  CAIR: 1.0e7,       /* of the air column over a row */
  KAIR: 15,          /* W/m2/K: heat traded between the ground or sea and the air, air colder */
  KSTABLE: 3,        /* the same where the ground is colder than the air (a stable inversion) */
  MIXSEA: 10,        /* W/m2/K: a land cell tied to the sea air upwind of it, at marine = 1 */
  STEPS: 36, YEARS: 4,
};
/* the wind belts on Earth, for scaling another planet's (docs/WINDS.md): the Hadley cell's reach
   from the tropical rain belt (degrees), and the heat budget's equator-to-pole contrast and
   30-60 degree contrast of the air on Earth's map (deg C) */
const WIND = { HADLEY: 30, DELTA_E: 23.4, GRAD_E: 14.8, LOCAL: 0.3 };
function energyBalance(o) {
  const P = EBM, W = o.W, H = o.H, N = o.N, YEAR = 365.25 * 86400, dt = YEAR / P.STEPS;
  const dLat = 150 / H, EXT = 9, R = H + 2 * EXT;
  /* rows north to south: EXT polar rows, the map's H rows, EXT polar rows */
  const latR = new Float64Array(R), top = new Float64Array(R), bot = new Float64Array(R);
  for (let r = 0; r < R; r++) {
    latR[r] = 75 - (r - EXT + 0.5) * dLat;
    top[r] = r === 0 ? 90 : latR[r] + dLat / 2;
    bot[r] = r === R - 1 ? -90 : latR[r] - dLat / 2;
  }
  const rad = Math.PI / 180, sinR = (d) => Math.sin(d * rad);
  const dx = new Float64Array(R), coef = new Float64Array(R);
  for (let r = 0; r < R; r++) dx[r] = sinR(top[r]) - sinR(bot[r]);
  const qO = o.qOcean || null;
  for (let r = 0; r < R - 1; r++) { const xe = sinR(bot[r]); coef[r] = (o.Drow ? o.Drow[r] : P.D) * (1 - xe * xe) / (sinR(latR[r]) - sinR(latR[r + 1])); }
  /* the sun's daily mean at each row and step (no eccentricity) */
  const eps = o.tilt * rad, Q = new Float64Array(R * P.STEPS);
  for (let k = 0; k < P.STEPS; k++) {
    const day = (k + 0.5) * 365.25 / P.STEPS, L = 2 * Math.PI * (day - 80) / 365.25;
    const dec = Math.asin(Math.sin(eps) * Math.sin(L));
    for (let r = 0; r < R; r++) {
      const phi = latR[r] * rad, c = -Math.tan(phi) * Math.tan(dec);
      const h0 = c >= 1 ? 0 : c <= -1 ? Math.PI : Math.acos(c);
      Q[r * P.STEPS + k] = Math.max(0, (P.S0 / Math.PI) * (h0 * Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.sin(h0)));
    }
  }
  const sea = new Uint8Array(N), C = new Float64Array(N), base = new Float64Array(R);
  const gmA = new Float64Array(N), gaA = new Float64Array(N);   /* the sea air's pull on land */
  for (let i = 0; i < N; i++) {
    sea[i] = o.ocean(i) ? 1 : 0; C[i] = sea[i] ? P.CSEA : P.CLAND;
    if (!sea[i]) { gmA[i] = P.MIXSEA * o.marine[i]; gaA[i] = gmA[i] * o.seaAnom[i]; }
  }
  for (let r = 0; r < R; r++) { const x = sinR(latR[r]); base[r] = P.ALB0 + P.ALB2 * x * x; }
  const ramp = (t, a, b) => clamp((a - t) / (a - b), 0, 1);   /* 0 above a, 1 below b */
  const albedo = (b, t, isSea) => (isSea ? lerp(b, Math.max(b, P.ICE), ramp(t, -1.5, -6)) : lerp(b, Math.max(b, P.SNOW), ramp(t, 1, -9)));
  /* start each row near its annual balance */
  const T = new Float64Array(N), Tp = new Float64Array(2 * EXT);
  const startT = (r) => { let q = 0; for (let k = 0; k < P.STEPS; k++) q += Q[r * P.STEPS + k]; q /= P.STEPS; return (q * (1 - base[r]) - P.A) / P.B * 0.6 + 6; };
  for (let i = 0; i < N; i++) T[i] = startT(((i / W) | 0) + EXT);
  for (let e = 0; e < 2 * EXT; e++) Tp[e] = startT(e < EXT ? e : H + e);
  /* the air over each row: the transport moves heat between the rows' air, and each cell trades
     heat with the air over it (warm air over cold ground gives most) */
  const Ta = new Float64Array(R), rowSea = new Float64Array(R), rowSum = new Float64Array(R), rowG = new Float64Array(R);
  for (let r = 0; r < R; r++) Ta[r] = startT(r);
  const la = new Float64Array(R), lb = new Float64Array(R), lc = new Float64Array(R), rhs = new Float64Array(R);
  const mon = new Float64Array(12 * N), monP = new Float64Array(12 * 2 * EXT), monA = new Float64Array(12 * R), monG = new Float64Array(12 * R), cnt = new Float64Array(12);
  for (let yr = 0; yr < P.YEARS; yr++) for (let k = 0; k < P.STEPS; k++) {
    /* poleward transport in the air, implicit in time (Thomas algorithm) */
    for (let r = 0; r < R; r++) {
      const a = r > 0 ? coef[r - 1] / dx[r] : 0, b = r < R - 1 ? coef[r] / dx[r] : 0;
      la[r] = -a; lc[r] = -b; lb[r] = P.CAIR / dt + a + b; rhs[r] = P.CAIR / dt * Ta[r];
    }
    for (let r = 1; r < R; r++) { const m = la[r] / lb[r - 1]; lb[r] -= m * lc[r - 1]; rhs[r] -= m * rhs[r - 1]; }
    Ta[R - 1] = rhs[R - 1] / lb[R - 1];
    for (let r = R - 2; r >= 0; r--) Ta[r] = (rhs[r] - lc[r] * Ta[r + 1]) / lb[r];
    /* each row's sea, for the land to feel */
    for (let y = 0; y < H; y++) {
      let ss = 0, ns = 0;
      for (let x = 0; x < W; x++) { const i = y * W + x; if (sea[i]) { ss += T[i]; ns++; } }
      rowSea[y + EXT] = ns ? ss / ns : Ta[y + EXT];
    }
    /* each cell: sunlight in, heat out to space, heat traded with the air, semi-implicit */
    for (let r = 0; r < R; r++) {
      const q = Q[r * P.STEPS + k], ta = Ta[r];
      if (r < EXT || r >= EXT + H) {
        const e = r < EXT ? r : r - H, t = Tp[e];
        Tp[e] = (P.CSEA * t + dt * (q * (1 - albedo(base[r], t, true)) - P.A + P.KAIR * ta)) / (P.CSEA + dt * (P.B + P.KAIR));
        rowSum[r] = Tp[e];
        continue;
      }
      const y = r - EXT, b = base[r], bi = Math.max(b, P.ICE), bs = Math.max(b, P.SNOW), rs = rowSea[r];
      let sum = 0, sg = 0;
      for (let x = 0; x < W; x++) {
        const i = y * W + x, t = T[i];
        let alb, ka, g, ref;
        if (sea[i]) {
          alb = t >= -1.5 ? b : t <= -6 ? bi : b + (bi - b) * (-1.5 - t) / 4.5;
          ka = P.KAIR; g = ka; ref = ka * ta + (qO ? qO[i] : 0);
        } else {
          alb = t >= 1 ? b : t <= -9 ? bs : b + (bs - b) * (1 - t) / 10;
          ka = t > ta ? P.KAIR : P.KSTABLE; g = ka + gmA[i]; ref = ka * ta + gmA[i] * rs + gaA[i];
        }
        const v = (C[i] * t + dt * (q * (1 - alb) - P.A + ref)) / (C[i] + dt * (P.B + g));
        T[i] = v;
        sum += (v - ta) * ka; sg += v;
      }
      rowSum[r] = sum / W; rowG[r] = sg / W;
    }
    /* the air takes what the ground gave it */
    for (let r = 0; r < R; r++) {
      if (r < EXT || r >= EXT + H) Ta[r] = (P.CAIR * Ta[r] + dt * P.KAIR * rowSum[r]) / (P.CAIR + dt * P.KAIR);
      else Ta[r] += dt * rowSum[r] / P.CAIR;
    }
    if (yr === P.YEARS - 1) {
      const m = Math.min(11, Math.floor(k * 12 / P.STEPS));
      cnt[m]++;
      for (let i = 0; i < N; i++) mon[m * N + i] += T[i];
      for (let e = 0; e < 2 * EXT; e++) monP[m * 2 * EXT + e] += Tp[e];
      for (let r = 0; r < R; r++) { monA[m * R + r] += Ta[r]; monG[m * R + r] += r < EXT || r >= EXT + H ? Tp[r < EXT ? r : r - H] : rowG[r]; }
    }
  }
  const mean = new Float32Array(N), amp = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0, hi = -1e9, lo = 1e9;
    for (let m = 0; m < 12; m++) { const v = mon[m * N + i] / cnt[m]; s += v; hi = Math.max(hi, v); lo = Math.min(lo, v); }
    mean[i] = s / 12; amp[i] = (hi - lo) / 2;
  }
  const polar = [];
  for (let e = 0; e < 2 * EXT; e++) { let s = 0; for (let m = 0; m < 12; m++) s += monP[m * 2 * EXT + e] / cnt[m]; polar.push(Math.round(s / 12 * 10) / 10); }
  /* the air over each row, month by month (north to south, polar rows included), and the rows'
     latitudes: the winds are worked out from it */
  const air = new Float32Array(12 * R), ground = new Float32Array(12 * R);
  for (let m = 0; m < 12; m++) for (let r = 0; r < R; r++) { air[m * R + r] = monA[m * R + r] / cnt[m]; ground[m * R + r] = monG[m * R + r] / cnt[m]; }
  const out = { mean: mean, amp: amp, polar: polar, air: air, ground: ground, latR: Float32Array.from(latR), R: R };
  if (o.months) { out.months = new Float32Array(12 * N); for (let m = 0; m < 12; m++) for (let i = 0; i < N; i++) out.months[m * N + i] = mon[m * N + i] / cnt[m]; }
  return out;
}

/* The world's ocean currents (docs/OCEAN_CURRENTS.md), from its own winds, coasts and sea floor.
   Stommel's model of the wind-driven circulation, on the planet's grid: a stream function psi
   over the sea, 0 on every coast (the water flows along the shore, never into it), with
     r lap(psi) + beta d(psi)/dx - k psi = curl(wind)
   - curl(wind): the spin the winds give the water; the trades and westerlies together turn the
     subtropical oceans clockwise in the north, anticlockwise in the south
   - beta: how fast the Coriolis effect grows northward (cos latitude); it squeezes each gyre's
     return flow into a narrow fast current along its western shore (Gulf Stream, Kuroshio,
     Brazil, Agulhas) and spreads the rest slow and wide over the basin
   - k: drag on the shallow sea floor; shelves and shallow straits carry little, so a strait or
     ridge can cut one basin's flow off from another's
   The current is (dpsi/dy, -dpsi/dx / cos) in grid cells, scaled so most of the sea moves under
   1. Also the coastal upwelling: where the wind drives the surface water off a coast (the
   Ekman drift, to the right of the wind in the north, the left in the south), cold water rises
   (Canary, Benguela, California, Humboldt). Returns { U, V, psi, up }. */
const CUR_BETA = 0.5;          /* Coriolis growth: the western currents' width is ~1/(beta cos) cells */
const CUR_SHELF = 6;           /* drag on a shelf (k at the shallowest) */
const CUR_UP = 7;              /* deg C the strongest upwelling cools the water at the coast */
const CUR_DT = 1.2;            /* cells a full-speed current carries water in one heat step */
const CUR_XCHG = 0.035;        /* share of its anomaly the water gives the air each heat step */
const CUR_MIX = 0.25;          /* sideways mixing each heat step */
const CUR_GAIN = 1.2;            /* scale on the warmth or cold the currents carry */
const CUR_HEAT_STEPS = 160;
const CUR_SPREAD = 6;          /* rows (about 10 degrees) the ocean's eddies spread the currents' heat across */
const CUR_SHARE = 3;           /* scale on the currents' share of the poleward transport (see airShare) */
const CUR_LAMBDA = 20;         /* W/m2 the currents' heat gives a sea cell for each degree of anomaly they carry */
const CUR_ZONAL = [[0, 0], [15, -0.5], [30, -0.2], [40, 0.8], [50, 4], [60, 4], [70, 3], [75, 2.5]];
function oceanCurrents(W, H, N, KX, DEGL, wx, isOcean, hm, U, V, blurWrap) {
  const sea = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const y = (i / W) | 0; sea[i] = isOcean(i) && y > 0 && y < H - 1 ? 1 : 0; }
  /* the winds smoothed a little, so the noise in them bends the gyres without speckling them */
  const Us = blurWrap(U, W, H, 2, KX), Vs = blurWrap(V, W, H, 2, KX);
  /* the wind's curl, north up: d(tau_n)/dx_east - d(tau_e)/dy_north, with tau_n = -V (V is +south) */
  const F = new Float32Array(N);
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!sea[i]) continue;
    F[i] = -(Vs[y * W + wx(x + 1)] - Vs[y * W + wx(x - 1)]) / (2 * KX[y]) + (Us[i + W] - Us[i - W]) / 2;
  }
  /* drag from the sea floor: none in the deep ocean, strong on the shelves */
  const kd = new Float32Array(N);
  for (let i = 0; i < N; i++) if (sea[i]) { const d = clamp((-hm[i] - 150) / 1800, 0, 1); kd[i] = CUR_SHELF * (1 - d) * (1 - d); }
  /* solve by over-relaxation. Per row, with dx = KX (r = 1): the east neighbour is upwind for
     the beta term (it carries the solution westward, piling it up at the western shores) */
  const psi = new Float32Array(N), cells = [];
  for (let i = 0; i < N; i++) if (sea[i]) cells.push(i);
  const C = cells.length, cI = Int32Array.from(cells), cE = new Int32Array(C), cW = new Int32Array(C);
  const aE = new Float32Array(C), aW = new Float32Array(C), aP = new Float32Array(C), cF = new Float32Array(C);
  for (let s = 0; s < C; s++) {
    const i = cI[s], x = i % W, y = (i / W) | 0, ex = 1 / (KX[y] * KX[y]);
    cE[s] = y * W + wx(x + 1); cW[s] = y * W + wx(x - 1);
    aE[s] = ex + CUR_BETA; aW[s] = ex; aP[s] = 1 / (2 * ex + 2 + CUR_BETA + kd[i]); cF[s] = F[i];
  }
  const OM = 1.75;
  for (let it = 0; it < 1500; it++) {
    let dmax = 0;
    for (let s = 0; s < C; s++) {
      const i = cI[s];
      const d = (aE[s] * psi[cE[s]] + aW[s] * psi[cW[s]] + psi[i - W] + psi[i + W] - cF[s]) * aP[s] - psi[i];
      psi[i] += OM * d;
      if (d > dmax) dmax = d; else if (-d > dmax) dmax = -d;
    }
    if (dmax < 1e-6) break;
  }
  /* the velocity, x east and y south, in grid cells */
  const CU = new Float32Array(N), CV = new Float32Array(N), sp = [];
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!sea[i]) continue;
    CU[i] = (psi[i + W] - psi[i - W]) / 2;
    CV[i] = -(psi[y * W + wx(x + 1)] - psi[y * W + wx(x - 1)]) / (2 * KX[y]);
    sp.push(Math.hypot(CU[i], CV[i]));
  }
  sp.sort((a, b) => a - b);
  const p90 = sp.length ? Math.max(1e-9, sp[Math.floor(sp.length * 0.9)]) : 1;
  for (let i = 0; i < N; i++) {
    CU[i] /= p90; CV[i] /= p90;
    const s = Math.hypot(CU[i], CV[i]);
    if (s > 2.5) { CU[i] *= 2.5 / s; CV[i] *= 2.5 / s; }
  }
  /* coastal upwelling: the Ekman drift (wind turned 90 degrees, right in the north, left in the
     south; weak at the equator, where the Coriolis effect vanishes, and in the high latitudes,
     where the winds turn) against the direction away from the land, at the coast and fading
     two cells out */
  const up = new Float32Array(N), dist = new Uint8Array(N).fill(9), q = [];
  for (let i = 0; i < N; i++) if (!isOcean(i)) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % W, cy = (c / W) | 0;
    if (dist[c] >= 3) continue;
    for (const j of [cy * W + wx(cx + 1), cy * W + wx(cx - 1), cy > 0 ? c - W : -1, cy < H - 1 ? c + W : -1])
      if (j >= 0 && dist[j] > dist[c] + 1) { dist[j] = dist[c] + 1; q.push(j); }
  }
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!isOcean(i) || dist[i] > 3) continue;
    /* away from the land: the sum of directions to the sea neighbours minus the land ones */
    let gx = 0, gy = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const j = (y + dy) * W + wx(x + dx), l = isOcean(j) ? 0 : 1, len = Math.hypot(dx * KX[y], dy);
      gx -= l * dx * KX[y] / len; gy -= l * dy / len;
    }
    const gl = Math.hypot(gx, gy);
    if (gl < 1e-6) continue;
    const deg = Math.abs(DEGL[i]), north = DEGL[i] >= 0;
    const lat = deg <= 4 ? 0 : deg < 12 ? (deg - 4) / 8 : deg <= 35 ? 1 : deg < 45 ? (45 - deg) / 10 : 0;
    const mx = north ? -Vs[i] : Vs[i], my = north ? Us[i] : -Us[i];
    const off = (mx * gx + my * gy) / gl;
    if (off > 0) up[i] = Math.min(1, off / 0.6) * lat * [1, 1, 0.6, 0.3][dist[i] - 1];
  }
  return { U: CU, V: CV, psi: psi, up: up };
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
/* raised whenever a change here makes the same seed a different world (its land, climate or
   biomes, and so its history): what the browser kept for a world of an older version is
   dropped (ui.js loadWrites). 2: the ocean currents (docs/OCEAN_CURRENTS.md). 3: 3 to 5 hotspots. 4: a sea level per world. 5: the climate refitted on the real Earth
   (docs/EARTH_CLIMATE_TEST.md). 6: rain seasons (the half-year share, seasonal westerlies, shallow winter highs), half a cold sea's
   anomaly on land, winter storms through cold-current air, shelf edges averaged with the slope.
   7: temperature and seasons from a seasonal energy balance (sunlight by tilt, docs/ENERGY_BALANCE.md),
   a tilt per world. 8: young ranges narrower and lower (the land's heights as Earth's). 9: wind belts
   from the heat budget (the rain belt where the air is warmest, the Hadley cell's width, the
   westerlies' strength and seasons from the temperature contrast, docs/WINDS.md). 10: the currents'
   heat as a source in the heat budget, the air carrying the rest (docs/OCEAN_HEAT.md). */
AEON.GEN_VERSION = 10;
AEON.regiongen = region;

})();
