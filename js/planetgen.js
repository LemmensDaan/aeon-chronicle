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
  const DIST8 = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
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

  /* cylinder coordinates for noise: circumference W cells -> radius W/2pi */
  const R = W / (2 * Math.PI);
  const CX = new Float32Array(N), CZ = new Float32Array(N), CY = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, th = (x / W) * 2 * Math.PI;
    CX[i] = Math.cos(th) * R; CZ[i] = Math.sin(th) * R; CY[i] = y;
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
        const nc = c + (0.4 + 1.6 * jitter[n]) / plates[p].rate;
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
          heap.push(c + 0.3 + jitter[n] * 2.2 + rng.next() * 0.4, n);
        }
      }
      covered += grown;
    }
  }

  /* ================================================== 3. tectonics ===== */
  /* For each boundary cell, the strongest interaction with a neighbouring plate
     decides an effect: { amp, width, peak } spread inland along the plate. */
  const effAmp = new Float32Array(N), effW = new Float32Array(N), effPeak = new Float32Array(N);
  const isSource = new Uint8Array(N);
  const stress = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, A = plates[plateOf[i]];
    let best = 0, bw = 0, bp = 0;
    for (let k = 0; k < 4; k++) {
      const j = NB4[i * 4 + k];
      if (j < 0 || plateOf[j] === plateOf[i]) continue;
      const B = plates[plateOf[j]];
      const jx = j % W, jy = (j / W) | 0;
      const nx = dxw(x, jx), ny = jy - y;
      const c = clamp((A.vx - B.vx) * nx + (A.vy - B.vy) * ny, -1.6, 1.6);   /* + = converging */
      const ci = cont[i], cj = cont[j];
      let amp = 0, w = 1, pk = 0;
      if (c > 0) {
        if (ci && cj) { amp = 0.44 * c; w = 4.5; pk = 1; }                   /* collision orogeny */
        else if (ci && !cj) { amp = 0.36 * c; w = 2.6; pk = 2; }             /* andean margin */
        else if (!ci && cj) { amp = -0.17 * c; w = 1.2; pk = 0; }            /* trench, subducting */
        else if (A.density < B.density) { amp = 0.3 * c; w = 1.5; pk = 1; }  /* island arc */
        else { amp = -0.15 * c; w = 1.2; pk = 0; }
      } else if (c < 0) {
        if (ci) { amp = 0.12 * c; w = 1.6; pk = 0; }                          /* continental rift */
        else { amp = -0.08 * c; w = 2.6; pk = 0; }                            /* mid-ocean ridge */
      }
      if (Math.abs(amp) > Math.abs(best)) { best = amp; bw = w; bp = pk; }
      stress[i] = Math.max(stress[i], Math.abs(c));
    }
    if (best !== 0) { isSource[i] = 1; effAmp[i] = best; effW[i] = bw; effPeak[i] = bp; }
  }
  /* spread each effect inland within its own plate (multi-source BFS) */
  const srcOf = new Int32Array(N).fill(-1), dist = new Float32Array(N).fill(Infinity);
  {
    const q = [];
    for (let i = 0; i < N; i++) if (isSource[i]) { srcOf[i] = i; dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (dist[c] > 12) continue;
      for (let k = 0; k < 4; k++) {
        const n = NB4[c * 4 + k];
        if (n < 0 || plateOf[n] !== plateOf[c] || srcOf[n] !== -1) continue;
        srcOf[n] = srcOf[c]; dist[n] = dist[c] + 1; q.push(n);
      }
    }
  }
  const uplift = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const s = srcOf[i];
    if (s < 0) continue;
    const d = dist[i], w = effW[s], pk = effPeak[s];
    uplift[i] = effAmp[s] * Math.exp(-((d - pk) * (d - pk)) / (w * w));
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
      const cx = sx + dx * k * 2.3, cy = sy + dy * k * 2.3;
      const amp = 0.27 * Math.exp(-k * 0.33) * (cont[s] ? 0.4 : 1);
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        const yy = Math.round(cy) + oy;
        if (yy < 0 || yy >= H) continue;
        const i = yy * W + wx(Math.round(cx) + ox);
        const r2 = ox * ox + oy * oy;
        uplift[i] += amp * Math.exp(-r2 / 1.4);
      }
    }
  }

  /* a straight plate boundary can leave a one-cell-wide wall; belts should be broad */
  {
    const soft = blurWrap(uplift, W, H, 1);
    for (let i = 0; i < N; i++) uplift[i] = uplift[i] * 0.45 + soft[i] * 0.55;
  }

  /* ----- assemble elevation ----- */
  const contSmooth = blurWrap(Float32Array.from(cont), W, H, 2);
  const elev = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const base = lerp(0.3, 0.6, contSmooth[i]);
    const mtn = clamp(uplift[i] / 0.22, 0, 1);
    const crest = (noise2.ridged(CX[i] * 0.16, CY[i] * 0.16, CZ[i] * 0.16, 4) - 0.55) * 0.2 * mtn;
    elev[i] = base + uplift[i] + crest
            + nf(noise, i, 0.035, 4, 0.5) * 0.11
            + nf(noise3, i, 0.14, 3, 0.5) * 0.04;
  }

  /* ================================================== 4. erosion ======= */
  const oceanFrac = rng.range(0.58, 0.7);
  let sea = quantile(elev, oceanFrac);
  const flood = function (E, runoff) {
    /* priority-flood from the sea: Ef = depression-filled surface; parent = the
       downstream neighbour; order = pop order (low to high). Guarantees drainage. */
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
  };
  for (let pass = 0; pass < 3; pass++) {
    const f = flood(elev, null);
    for (let k = 0; k < f.count; k++) {
      const c = f.order[k], p = f.parent[c];
      if (elev[c] <= sea || p < 0) continue;
      const drop = elev[c] - elev[p];
      if (drop <= 0) continue;
      const cut = 0.011 * Math.sqrt(f.acc[c]) * drop;
      elev[c] = Math.max(elev[p] + 2e-4, elev[c] - cut);
    }
  }
  sea = quantile(elev, oceanFrac);

  /* normalise: ocean -> [0, 0.5], land -> (0.5, 1] */
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) { if (elev[i] < lo) lo = elev[i]; if (elev[i] > hi) hi = elev[i]; }
  const E = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    E[i] = elev[i] <= sea ? 0.5 * (elev[i] - lo) / (sea - lo || 1)
                          : 0.5 + 0.0015 + 0.4985 * (elev[i] - sea) / (hi - sea || 1);
  }
  sea = 0.5;
  const isOcean = (i) => E[i] <= 0.5;

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
        if (n >= 0 && coastDist[n] > coastDist[c] + 1) { coastDist[n] = coastDist[c] + 1; q.push(n); }
      }
    }
  }

  /* ================================================== 5. climate ======= */
  const T = new Float32Array(N), SST = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const c = Math.cos(latRad[i]);
    T[i] = 0.02 + 0.88 * Math.pow(Math.max(0, c), 1.35);
  }
  /* ocean currents: cold water off subtropical west coasts, warm drift off
     high-latitude west coasts. Detected as "land lies to the east". */
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!isOcean(i)) continue;
    const lat = Math.abs(latRad[i]) * 180 / Math.PI;
    let landEast = 0;
    for (let d = 1; d <= 8; d++) if (!isOcean(y * W + wx(x + d))) { landEast = 1 - (d - 1) / 8; break; }
    let a = 0;
    if (lat > 12 && lat < 40) a = -0.09 * landEast;
    else if (lat > 42 && lat < 66) a = 0.07 * landEast * (1 - Math.abs(lat - 54) / 14);
    SST[i] = T[i] + a;
  }
  for (let i = 0; i < N; i++) {
    if (isOcean(i)) { T[i] = SST[i]; continue; }
    const h = (E[i] - 0.5) / 0.5;
    const cdist = Math.min(coastDist[i], 25) / 25;
    T[i] = T[i] - 0.34 * Math.pow(Math.max(0, h), 1.3) - 0.06 * cdist * Math.abs(Math.sin(latRad[i]));
  }
  /* coasts feel their offshore water */
  for (let i = 0; i < N; i++) {
    if (isOcean(i) || coastDist[i] > 3) continue;
    let s = 0, n = 0;
    for (let k = 0; k < 8; k++) { const j = NB8[i * 8 + k]; if (j >= 0 && isOcean(j)) { s += SST[j] - (0.02 + 0.88 * Math.pow(Math.max(0, Math.cos(latRad[j])), 1.35)); n++; } }
    if (n) T[i] += (s / n) * 0.7;
  }
  for (let i = 0; i < N; i++) T[i] = clamp(T[i], 0, 1);

  /* winds: three-cell circulation, as a table over |latitude| (degrees) */
  const U_TAB = [[0, -0.75], [15, -0.95], [30, 0], [45, 1], [60, 0], [75, -0.6], [90, -0.3]];
  const V_TAB = [[0, 0], [15, -0.45], [30, 0], [45, 0.35], [60, 0], [75, -0.35], [90, 0]]; /* + = poleward */
  const RAIN_TAB = [[0, 2.3], [8, 2.0], [15, 1.0], [25, 0.32], [35, 0.45], [45, 1.15], [58, 1.35], [70, 0.7], [90, 0.4]];
  const tab = (t, d) => { for (let k = 1; k < t.length; k++) if (d <= t[k][0]) return lerp(t[k - 1][1], t[k][1], (d - t[k - 1][0]) / (t[k][0] - t[k - 1][0])); return t[t.length - 1][1]; };
  const U = new Float32Array(N), Vv = new Float32Array(N), rainF = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const deg = Math.abs(latRad[i]) * 180 / Math.PI, sgn = latRad[i] >= 0 ? -1 : 1; /* poleward = -y in north */
    U[i] = tab(U_TAB, deg) + nf(noise2, i, 0.05, 2, 0.5) * 0.3;
    Vv[i] = tab(V_TAB, deg) * sgn + nf(noise3, i, 0.05, 2, 0.5) * 0.2;
    rainF[i] = tab(RAIN_TAB, deg);
  }

  /* moisture transport: semi-Lagrangian advection to a steady state */
  const sampleWrap = function (arr, fx, fy) {
    fy = clamp(fy, 0, H - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const xa = wx(x0), xb = wx(x0 + 1), y1 = Math.min(y0 + 1, H - 1);
    return lerp(lerp(arr[y0 * W + xa], arr[y0 * W + xb], tx), lerp(arr[y1 * W + xa], arr[y1 * W + xb], tx), ty);
  };
  let q1 = new Float32Array(N), q2 = new Float32Array(N);
  const precip = new Float32Array(N);
  for (let it = 0; it < 90; it++) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (isOcean(i)) { q2[i] = clamp(0.2 + 0.85 * SST[i], 0, 1); precip[i] = 0; continue; }
      const ux = x - U[i], uy = y - Vv[i];
      let q = sampleWrap(q1, ux, uy);
      const eUp = sampleWrap(E, ux, uy);
      const cap = 0.12 + 0.88 * T[i];
      let p = 0;
      if (q > cap) { p += q - cap; q = cap; }
      const rise = Math.max(0, E[i] - eUp);
      const frac = clamp(0.045 * rainF[i] + rise * 9.5, 0, 0.8);
      p += q * frac;
      q = q - q * frac + 0.33 * q * frac * T[i];   /* forests hand some back */
      q2[i] = clamp(q, 0, 1);
      precip[i] = p;
    }
    const s = q1; q1 = q2; q2 = s;
  }

  /* ================================================== 6. hydrology ===== */
  /* roughen cold lowlands slightly: glacial scour leaves lake districts */
  const Eh = Float32Array.from(E);
  for (let i = 0; i < N; i++) {
    if (isOcean(i)) continue;
    if (T[i] < 0.34 && E[i] < 0.62) Eh[i] += (nf(noise3, i, 0.5, 2, 0.5) + 0.5) * 0.012;
  }
  let pLand = [];
  for (let i = 0; i < N; i++) if (!isOcean(i)) pLand.push(precip[i]);
  const pRef = quantile(pLand, 0.97) || 1;
  const P = new Float32Array(N);
  for (let i = 0; i < N; i++) P[i] = isOcean(i) ? 1 : clamp(precip[i] / pRef, 0, 1);
  const runoff = new Float32Array(N);
  for (let i = 0; i < N; i++) runoff[i] = isOcean(i) ? 0 : Math.max(0.01, P[i] * (1.05 - 0.75 * T[i]));
  const hyd = flood(Eh, runoff);

  /* depressions -> lakes when the water balance is positive, dry basins otherwise */
  const lake = new Uint8Array(N), basin = new Uint8Array(N);
  const lakeLevel = new Float32Array(N);
  {
    const dep = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (!isOcean(i) && hyd.Ef[i] - Eh[i] > 0.0025) dep[i] = 1;
    const comp = new Int32Array(N).fill(-1);
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
      let inflow = 0, tsum = 0, level = 0;
      for (const c of cells) {
        tsum += T[c]; level = Math.max(level, hyd.Ef[c]);
        const p = hyd.parent[c];
        if (p < 0 || comp[p] !== nc) inflow = Math.max(inflow, hyd.acc[c]);
      }
      const evap = cells.length * (0.12 + 0.75 * tsum / cells.length);
      const wet = inflow > evap * 0.85;
      for (const c of cells) { if (wet) { lake[c] = 1; lakeLevel[c] = level; } else basin[c] = 1; }
      nc++;
    }
  }

  /* Dry basins are dead ends: what flows in evaporates. Re-accumulate with basins
     absorbing their inflow, otherwise the router draws parallel fake rivers across
     the flat filled floor and out to the sea. */
  {
    const acc2 = new Float32Array(N);
    for (let k = hyd.count - 1; k >= 0; k--) {
      const c = hyd.order[k];
      if (isOcean(c)) continue;
      acc2[c] += runoff[c];
      if (!basin[c] && hyd.parent[c] >= 0) acc2[hyd.parent[c]] += acc2[c];
    }
    hyd.acc = acc2;
  }

  /* rivers: the top few percent of land cells by accumulated runoff */
  const accLand = [];
  for (let i = 0; i < N; i++) if (!isOcean(i) && !lake[i] && !basin[i]) accLand.push(hyd.acc[i]);
  const riverT = quantile(accLand, 0.935);
  const isRiver = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (!isOcean(i) && !lake[i] && !basin[i] && hyd.acc[i] >= riverT) isRiver[i] = 1;
  /* Prune short channels. A wet mountain coast gives every shoreline cell its own
     torrent straight to the sea; at map scale those read as hatching, not rivers.
     Keep a system only if its longest chain, mouth to source, is 4+ cells. */
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
      if (len[i] >= 4) continue;
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
    M[i] = clamp(m, 0, 1);
  }
  /* blend toward rank so every world gets a usable spread of biomes,
     without disturbing where the wet and dry places are */
  {
    const idx = [];
    for (let i = 0; i < N; i++) if (!isOcean(i) && !lake[i]) idx.push(i);
    idx.sort((a, b) => M[a] - M[b]);
    for (let k = 0; k < idx.length; k++) {
      const u = idx.length > 1 ? k / (idx.length - 1) : 0.5;
      M[idx[k]] = clamp(0.45 * M[idx[k]] + 0.55 * u, 0, 1);
    }
  }

  /* ================================================== 7. biomes ======== */
  const hLand = [];
  for (let i = 0; i < N; i++) if (!isOcean(i) && !lake[i]) hLand.push(E[i]);
  const mtnLine = Math.max(0.66, quantile(hLand, 0.9));

  const slope = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let m = 0;
    for (let k = 0; k < 4; k++) { const j = NB4[i * 4 + k]; if (j >= 0) m = Math.max(m, Math.abs(E[i] - E[j])); }
    slope[i] = m;
  }

  function classify(i) {
    const t = T[i], m = M[i], e = E[i];
    if (e >= mtnLine) return t < 0.14 ? "ice" : "mountain";
    if (t < 0.1) return "ice";
    if (t < 0.22) return "tundra";
    const soggy = slope[i] < 0.035 && e < 0.6 && m > 0.62 &&
                  (hyd.acc[i] >= riverT || coastDist[i] <= 2 || basin[i]);
    if (t < 0.43) return m > 0.28 ? (soggy && m > 0.8 ? "swamp" : "taiga") : "tundra";
    if (t < 0.62) {
      if (m < 0.17) return "desert";
      if (m < 0.42) return "grassland";
      if (soggy) return "swamp";
      return "forest";
    }
    if (m < 0.2) return "desert";
    if (m < 0.46) return "savanna";
    if (soggy) return "swamp";
    return m > 0.62 && t > 0.66 ? "jungle" : "forest";
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
      temperature: r3(T[i]), moisture: r3(M[i]),
      precipitation: r3(P[i]),
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
    const biome = classify(i);
    reg.biome = biome;
    let h = hab(biome);
    if (isRiver[i]) {
      reg.river = r3(hyd.acc[i]);
      reg.flowTo = hyd.parent[i];
      h += 0.1 + 0.05 * Math.min(1, Math.log(hyd.acc[i] / riverT) / Math.log(8));
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
    if (Math.abs(effAmp[srcOf[i]] || 0) > 0 && effAmp[srcOf[i]] < -0.05 && cont[i]) reg.features.push("rift");

    const nr = nf(noise3, i, 0.12, 3, 0.5);
    const foodBase = { grassland: 0.78, forest: 0.6, jungle: 0.58, savanna: 0.55, swamp: 0.42, taiga: 0.32, tundra: 0.14, desert: 0.08, mountain: 0.12, ice: 0.02 };
    let food = (foodBase[biome] !== undefined ? foodBase[biome] : 0.4) + 0.12 * nr;
    if (reg.river) food += 0.2;
    if (coastal || lakeside) food += 0.08;
    const metal = (biome === "mountain" ? 0.6 : E[i] > 0.62 ? 0.28 : 0.06) + 0.25 * clamp(uplift[i] / 0.3, 0, 1) + 0.15 * nr;
    const exo = clamp((nf(noise2, i, 0.08, 3, 0.5) - 0.1) * 1.8, 0, 1) + (stress[i] > 0.8 ? 0.2 : 0) + (biome === "desert" || biome === "jungle" ? 0.06 : 0);
    reg.resources = { food: r3(clamp(food, 0, 1)), metal: r3(clamp(metal, 0, 1)), exotic: r3(clamp(exo, 0, 1)) };
    regions.push(reg);
  }
  /* rivers only flow into land/lake/sea cells that exist; drop flowTo for non-rivers
     that drain into the sea directly — the renderer only draws river cells anyway */

  /* debug layers for the inspector page; not enumerable so nothing copies them */
  Object.defineProperty(world, "_gen", {
    enumerable: false, configurable: true,
    value: { plateOf, plates, cont, uplift, E, T, P, M, U, V: Vv, acc: hyd.acc, lake, basin, hotspots,
             riverT, mtnLine, ms: Date.now() - t0 },
  });
}

/* separable box blur that wraps in x */
function blurWrap(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[y * W + (((x + k) % W) + W) % W];
    tmp[y * W + x] = s / n;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[clamp(y + k, 0, H - 1) * W + x];
    out[y * W + x] = s / n;
  }
  return out;
}

AEON.planetgen = { generate: generate };

})();
