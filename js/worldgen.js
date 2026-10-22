/* Aeon - terrain / star-field generation.
   Fills world.regions and sets neighbors. Every random decision uses the supplied rng. */
(function () {
"use strict";

window.AEON = window.AEON || {};
var AEON = window.AEON;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function r3(v) { return Math.round(v * 1000) / 1000; }

/* ---------------------------------------------------------------- noise */
/* Seeded 2D value noise (quintic-smoothed lattice, permutation-hashed) with rotated-octave fBm. */
function makeNoise(rng) {
  var P = new Uint8Array(512), V = new Float32Array(256), perm = new Array(256), i, j, t;
  for (i = 0; i < 256; i++) perm[i] = i;
  for (i = 255; i > 0; i--) { j = rng.int(0, i); t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (i = 0; i < 512; i++) P[i] = perm[i & 255];
  for (i = 0; i < 256; i++) V[i] = rng.next() * 2 - 1;
  var cs = [], sn = [], ox = [], oy = [];
  for (i = 0; i < 8; i++) {
    var a = rng.range(0, Math.PI * 2);
    cs.push(Math.cos(a)); sn.push(Math.sin(a));
    ox.push(rng.range(0, 200)); oy.push(rng.range(0, 200));
  }
  function sm(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function noise2(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    xi &= 255; yi &= 255;
    var a = V[P[P[xi] + yi]], b = V[P[P[xi + 1] + yi]];
    var c = V[P[P[xi] + yi + 1]], d = V[P[P[xi + 1] + yi + 1]];
    var u = sm(xf), v = sm(yf);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function fbm(x, y, oct, lac, gain) {
    var sum = 0, amp = 1, norm = 0, f = 1;
    for (var o = 0; o < oct; o++) {
      var k = o & 7;
      var rx = (x * cs[k] - y * sn[k]) * f + ox[k], ry = (x * sn[k] + y * cs[k]) * f + oy[k];
      sum += amp * noise2(rx, ry); norm += amp; amp *= gain; f *= lac;
    }
    return sum / norm;
  }
  return { noise: noise2, fbm: fbm };
}

function blur(src, W, H, r) {
  var tmp = new Float32Array(W * H), out = new Float32Array(W * H), cnt = 2 * r + 1, x, y, k, s;
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    s = 0;
    for (k = -r; k <= r; k++) s += src[y * W + clamp(x + k, 0, W - 1)];
    tmp[y * W + x] = s / cnt;
  }
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    s = 0;
    for (k = -r; k <= r; k++) s += tmp[clamp(y + k, 0, H - 1) * W + x];
    out[y * W + x] = s / cnt;
  }
  return out;
}

function quantile(arr, q) {
  var s = Array.prototype.slice.call(arr).sort(function (a, b) { return a - b; });
  return s[clamp(Math.floor(s.length * q), 0, s.length - 1)];
}

function makeRegion(id, x, y) {
  return {
    id: id, x: x, y: y, name: null,
    elevation: 0, temperature: 0, moisture: 0,
    biome: "barren", habitability: 0,
    resources: { food: 0, metal: 0, exotic: 0 },
    barren: true, owner: null, population: 0, settlement: null,
    features: [], neighbors: []
  };
}

function biomeHab(pack, key) {
  var b = pack && pack.biomes && pack.biomes[key];
  return b && typeof b.habitability === "number" ? b.habitability : 0.5;
}

/* binary min-heap keyed by (key, idx) */
function Heap(n) {
  var keys = new Float64Array(n), ids = new Int32Array(n), size = 0;
  function less(a, b) { return keys[a] < keys[b] || (keys[a] === keys[b] && ids[a] < ids[b]); }
  function swap(a, b) { var k = keys[a], d = ids[a]; keys[a] = keys[b]; ids[a] = ids[b]; keys[b] = k; ids[b] = d; }
  return {
    size: function () { return size; },
    push: function (k, id) {
      var i = size++; keys[i] = k; ids[i] = id;
      while (i > 0) { var p = (i - 1) >> 1; if (less(i, p)) { swap(i, p); i = p; } else break; }
    },
    pop: function () {
      var top = ids[0]; size--;
      if (size > 0) {
        keys[0] = keys[size]; ids[0] = ids[size];
        var i = 0;
        for (;;) {
          var l = 2 * i + 1, r = l + 1, m = i;
          if (l < size && less(l, m)) m = l;
          if (r < size && less(r, m)) m = r;
          if (m === i) break;
          swap(i, m); i = m;
        }
      }
      return top;
    }
  };
}

/* ---------------------------------------------------------------- planet */
function classifyLand(e, t, m, mtn) {
  if (e >= mtn) return t < 0.13 ? "ice" : "mountain";
  if (t < 0.11) return "ice";
  if (t < 0.24) return "tundra";
  if (t < 0.38) return m > 0.32 ? "taiga" : "tundra";
  if (t < 0.62) {
    if (m < 0.2) return "desert";
    if (m < 0.46) return "grassland";
    if (m > 0.78 && e < 0.545) return "swamp";
    return m < 0.55 ? "grassland" : "forest";
  }
  if (m < 0.22) return "desert";
  if (m < 0.46) return "savanna";
  if (m > 0.74 && e < 0.545) return "swamp";
  if (m >= 0.55) return t >= 0.7 ? "jungle" : "forest";
  return "savanna";
}

function genPlanet(world, pack, rng) {
  var W = world.width, H = world.height, N = W * H, x, y, i, k;
  var nElev = makeNoise(rng), nWarp = makeNoise(rng), nMoist = makeNoise(rng), nTemp = makeNoise(rng),
      nRes = makeNoise(rng), nMet = makeNoise(rng), nExo = makeNoise(rng);
  var fb = 1 / (H * 0.5);

  /* ---- 1. tectonics ---- */
  var nPlates = clamp(Math.round(Math.sqrt(N) / 9), 6, 28);
  var plates = [];
  for (i = 0; i < nPlates; i++) {
    var best = null, bestD = -1;
    for (k = 0; k < 14; k++) {
      var cx = rng.range(0, W), cy = rng.range(0, H), md = 1e9;
      for (var q = 0; q < plates.length; q++) {
        var ddx = plates[q].x - cx, ddy = plates[q].y - cy;
        md = Math.min(md, ddx * ddx + ddy * ddy);
      }
      if (md > bestD) { bestD = md; best = [cx, cy]; }
    }
    var ang = rng.range(0, Math.PI * 2), sp = rng.range(0.3, 1);
    var cont = rng.chance(0.45);
    plates.push({
      x: best[0], y: best[1], vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      cont: cont, base: cont ? 0.58 + rng.range(-0.04, 0.06) : 0.28 + rng.range(-0.05, 0.05)
    });
  }
  var plateOf = new Int16Array(N), baseF = new Float32Array(N);
  var warpAmp = 0.05 * Math.max(W, H), fw = 4 / H;
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    var wx = x + warpAmp * nWarp.fbm(x * fw, y * fw, 3, 2, 0.5);
    var wy = y + warpAmp * nWarp.fbm(x * fw + 31.7, y * fw + 17.3, 3, 2, 0.5);
    var bi = 0, bd = 1e18;
    for (k = 0; k < nPlates; k++) {
      var dx = plates[k].x - wx, dy = plates[k].y - wy, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = k; }
    }
    plateOf[y * W + x] = bi; baseF[y * W + x] = plates[bi].base;
  }
  baseF = blur(blur(baseF, W, H, 3), W, H, 2);

  var DX = [0, -1, 1, 0], DY = [-1, 0, 0, 1];
  var pos = new Float32Array(N), neg = new Float32Array(N);
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    i = y * W + x;
    var pa = plates[plateOf[i]], bestAbs = 0, val = 0;
    for (k = 0; k < 4; k++) {
      var nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      var pb = plates[plateOf[ny * W + nx]];
      if (pb === pa) continue;
      var vx = pb.x - pa.x, vy = pb.y - pa.y, vl = Math.sqrt(vx * vx + vy * vy) || 1;
      var conv = ((pa.vx - pb.vx) * vx + (pa.vy - pb.vy) * vy) / vl;
      var v;
      if (conv > 0.08) {
        if (pa.cont && pb.cont) v = conv;
        else if (pa.cont) v = 0.8 * conv;
        else if (pb.cont) v = -0.55 * conv;   /* trench beside the coastal range */
        else v = 0.35 * conv;                  /* island arc */
      } else if (conv < -0.08) v = conv * 0.6;  /* rift */
      else v = 0.05;
      if (Math.abs(v) > bestAbs) { bestAbs = Math.abs(v); val = v; }
    }
    if (val > 0) pos[i] = val; else neg[i] = -val;
  }
  var spreadIt = clamp(Math.round(Math.sqrt(N) / 30), 3, 8);
  [pos, neg].forEach(function (arr) {
    for (var it = 0; it < spreadIt; it++) {
      var nxt = new Float32Array(arr);
      for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
        var ii = yy * W + xx, m = arr[ii];
        for (var kk = 0; kk < 4; kk++) {
          var ax = xx + DX[kk], ay = yy + DY[kk];
          if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
          var c = arr[ay * W + ax] * 0.8;
          if (c > m) m = c;
        }
        nxt[ii] = m;
      }
      arr.set(nxt);
    }
  });
  var posB = blur(pos, W, H, 1), negB = blur(neg, W, H, 1);

  /* ---- 2. elevation ---- */
  var raw = new Float32Array(N);
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    i = y * W + x;
    var big = nElev.fbm(x * fb * 0.6 + 9.1, y * fb * 0.6 + 4.3, 2, 2, 0.5);
    var det = nElev.fbm(x * fb, y * fb, 6, 2, 0.5);
    var mod = 0.65 + 0.7 * (nElev.fbm(x * fb * 1.7 + 50, y * fb * 1.7 + 70, 2, 2, 0.5) * 0.5 + 0.5);
    raw[i] = baseF[i] + 0.12 * big + 0.24 * det + posB[i] * 0.42 * mod - negB[i] * 0.3;
  }

  /* ---- 3. sea level ---- */
  var oceanFrac = rng.range(0.6, 0.7);
  var sea = quantile(raw, oceanFrac);
  /* fill tiny inland seas */
  var seen = new Uint8Array(N), stack = [];
  for (i = 0; i < N; i++) {
    if (seen[i] || raw[i] > sea) continue;
    var comp = [i]; seen[i] = 1; stack.length = 0; stack.push(i);
    while (stack.length) {
      var c = stack.pop(), cx2 = c % W, cy2 = (c / W) | 0;
      for (k = 0; k < 4; k++) {
        var ax = cx2 + DX[k], ay = cy2 + DY[k];
        if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
        var ai = ay * W + ax;
        if (!seen[ai] && raw[ai] <= sea) { seen[ai] = 1; comp.push(ai); stack.push(ai); }
      }
    }
    if (comp.length < Math.max(5, N * 0.0009)) for (k = 0; k < comp.length; k++) raw[comp[k]] = sea + 0.0005;
  }
  var minE = 1e9, maxE = -1e9;
  for (i = 0; i < N; i++) { if (raw[i] < minE) minE = raw[i]; if (raw[i] > maxE) maxE = raw[i]; }
  var elev = new Float32Array(N), isOcean = new Uint8Array(N), landN = 0;
  for (i = 0; i < N; i++) {
    if (raw[i] <= sea) { elev[i] = 0.5 * (raw[i] - minE) / ((sea - minE) || 1); isOcean[i] = 1; }
    else { elev[i] = 0.5 + 0.5 * Math.pow((raw[i] - sea) / ((maxE - sea) || 1), 1.15); landN++; }
  }
  world.seaLevel = 0.5;

  /* ---- 4. temperature ---- */
  var temp = new Float32Array(N), latN = new Float32Array(N);
  for (y = 0; y < H; y++) {
    var lat = Math.abs(y + 0.5 - H / 2) / (H / 2);
    for (x = 0; x < W; x++) {
      i = y * W + x; latN[i] = lat;
      var t = 1 - 0.95 * Math.pow(lat, 1.35) + 0.05 * nTemp.fbm(x * fb, y * fb, 3, 2, 0.5);
      if (!isOcean[i]) t -= (elev[i] - 0.5) * 0.55;
      temp[i] = clamp(t, 0, 1);
    }
  }

  /* ---- 5. moisture: prevailing winds, ocean evaporation, orographic rain, rain shadow ---- */
  var wu = new Float32Array(H), wv = new Float32Array(H);
  for (y = 0; y < H; y++) {
    var phi = Math.abs(y + 0.5 - H / 2) / (H / 2) * Math.PI / 2;   /* radians, 0 = equator */
    wu[y] = -Math.cos(3 * phi);                 /* easterly trades, westerlies, polar easterlies */
    var pole = -Math.sin(3 * phi) * 0.4;        /* poleward drift (negative = toward equator) */
    wv[y] = pole * (y + 0.5 < H / 2 ? -1 : 1);
  }
  var q1 = new Float32Array(N), q2 = new Float32Array(N), precip = new Float32Array(N), qin = new Float32Array(N);
  function samp(arr, fx, fy, dflt) {
    if (fx < 0 || fy < 0 || fx > W - 1 || fy > H - 1) {
      if (dflt !== undefined) return dflt;
      fx = clamp(fx, 0, W - 1); fy = clamp(fy, 0, H - 1);
    }
    var x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
    var tx = fx - x0, ty = fy - y0;
    return lerp(lerp(arr[y0 * W + x0], arr[y0 * W + x1], tx), lerp(arr[y1 * W + x0], arr[y1 * W + x1], tx), ty);
  }
  var iters = Math.min(W + 20, 320);
  for (var it = 0; it < iters; it++) {
    for (y = 0; y < H; y++) {
      var ux = wu[y], uy = wv[y];
      for (x = 0; x < W; x++) {
        i = y * W + x;
        if (isOcean[i]) { q2[i] = 0.45 + 0.55 * temp[i]; precip[i] = 0; qin[i] = q2[i]; continue; }
        var sx = x - ux, sy = y - uy;
        var qu = samp(q1, sx, sy, 0.5);
        var eu = samp(elev, sx, sy);
        var de = elev[i] - eu;
        var p = clamp(0.035 + Math.max(0, de) * 7 + Math.max(0, elev[i] - 0.62) * 0.25, 0, 0.85) * qu;
        var lee = de < -0.008 ? qu * 0.12 * Math.min(1, -de * 12) : 0;
        q2[i] = clamp(qu - p - lee + 0.012 * temp[i], 0, 1);
        precip[i] = p; qin[i] = qu - lee;
      }
    }
    var sw = q1; q1 = q2; q2 = sw;
  }
  var moist = new Float32Array(N);
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    i = y * W + x;
    if (isOcean[i]) { moist[i] = 1; continue; }
    var lt = latN[i];
    var m = qin[i] * 0.75 + precip[i] * 1.4 - 0.05 + 0.06 * nMoist.fbm(x * fb * 1.3, y * fb * 1.3, 3, 2, 0.5);
    m += 0.14 * Math.exp(-Math.pow(lt / 0.15, 2));                    /* equatorial rain belt */
    m -= 0.13 * Math.exp(-Math.pow((lt - 0.33) / 0.12, 2));           /* subtropical high */
    m -= 0.05 * Math.max(0, 1 - temp[i] * 2.2);                       /* cold air holds little */
    moist[i] = clamp(m, 0, 1);
  }
  /* The wind model gets the ordering right (rain shadows, wet coasts) but runs dry in
     absolute terms. Rank-normalise land so the spread is sane while keeping the order. */
  var landIdx = [];
  for (i = 0; i < N; i++) if (!isOcean[i]) landIdx.push(i);
  landIdx.sort(function (a, b) { return moist[a] - moist[b]; });
  for (k = 0; k < landIdx.length; k++) {
    var u = landIdx.length > 1 ? k / (landIdx.length - 1) : 0.5;
    moist[landIdx[k]] = clamp(0.8 * u + 0.2 * moist[landIdx[k]], 0, 1);
  }

  /* ---- 6. rivers: priority-flood guarantees every land cell drains to the sea ---- */
  var filled = new Float32Array(N), flowTo = new Int32Array(N), closed = new Uint8Array(N);
  var order = new Int32Array(N), oc = 0, heap = Heap(N);
  for (i = 0; i < N; i++) flowTo[i] = -1;
  for (i = 0; i < N; i++) if (isOcean[i]) { closed[i] = 1; filled[i] = elev[i]; heap.push(elev[i], i); }
  while (heap.size()) {
    var cc = heap.pop(); order[oc++] = cc;
    var cxx = cc % W, cyy = (cc / W) | 0;
    for (k = 0; k < 4; k++) {
      var bx = cxx + DX[k], by = cyy + DY[k];
      if (bx < 0 || by < 0 || bx >= W || by >= H) continue;
      var bi2 = by * W + bx;
      if (closed[bi2]) continue;
      closed[bi2] = 1;
      filled[bi2] = Math.max(elev[bi2], filled[cc] + 1e-5);
      flowTo[bi2] = cc;
      heap.push(filled[bi2], bi2);
    }
  }
  var acc = new Float32Array(N);
  for (i = 0; i < N; i++) acc[i] = isOcean[i] ? 0 : 0.2 + moist[i];
  for (k = oc - 1; k >= 0; k--) {
    var cell = order[k];
    if (!isOcean[cell] && flowTo[cell] >= 0 && !isOcean[flowTo[cell]]) acc[flowTo[cell]] += acc[cell];
  }
  var T = Math.max(5, landN * 0.005), maxRiver = 0;
  var river = new Float32Array(N);
  for (i = 0; i < N; i++) if (!isOcean[i] && acc[i] >= T) { river[i] = acc[i]; if (acc[i] > maxRiver) maxRiver = acc[i]; }
  world.riverThreshold = T; world.maxRiver = maxRiver;
  for (i = 0; i < N; i++) if (river[i] > 0) {
    moist[i] = Math.min(1, moist[i] + 0.2);
    var rx0 = i % W, ry0 = (i / W) | 0;
    for (k = 0; k < 4; k++) {
      var tx2 = rx0 + DX[k], ty2 = ry0 + DY[k];
      if (tx2 < 0 || ty2 < 0 || tx2 >= W || ty2 >= H) continue;
      var ti = ty2 * W + tx2;
      if (!isOcean[ti] && river[ti] === 0) moist[ti] = Math.min(1, moist[ti] + 0.07);
    }
  }

  /* ---- 7-9. biomes, habitability, resources, neighbors ---- */
  var landElev = [];
  for (i = 0; i < N; i++) if (!isOcean[i]) landElev.push(elev[i]);
  var mtn = landElev.length ? quantile(landElev, 0.92) : 2;
  var foodBase = { grassland: 0.78, forest: 0.6, jungle: 0.58, savanna: 0.55, swamp: 0.4, taiga: 0.32, tundra: 0.14, desert: 0.08, mountain: 0.12, ice: 0.02 };
  var regions = world.regions = [];
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    i = y * W + x;
    var reg = makeRegion(i, x, y);
    reg.elevation = r3(elev[i]); reg.temperature = r3(temp[i]); reg.moisture = r3(moist[i]);
    var coastal = false;
    for (k = 0; k < 4; k++) {
      var qx = x + DX[k], qy = y + DY[k];
      if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
      var qi = qy * W + qx;
      reg.neighbors.push(qi);
      if (isOcean[qi]) coastal = true;
    }
    reg.river = 0; reg.flowTo = -1;
    if (isOcean[i]) {
      reg.barren = true; reg.biome = "barren"; reg.habitability = 0;
      reg.resources = { food: r3(coastal ? 0.2 : 0.05), metal: 0, exotic: r3(Math.max(0, nExo.fbm(x * 0.2, y * 0.2, 2, 2, 0.5) - 0.3) * 0.5) };
      regions.push(reg); continue;
    }
    reg.barren = false;
    var biome = classifyLand(elev[i], temp[i], moist[i], mtn);
    reg.biome = biome;
    var h = biomeHab(pack, biome);
    var flowBonus = 0;
    if (river[i] > 0) {
      reg.river = r3(river[i]); reg.flowTo = flowTo[i];
      flowBonus = Math.min(1, Math.log(river[i] / T) / Math.log(8));
      h += 0.1 + 0.05 * flowBonus;
    }
    if (coastal) h += 0.04;
    h -= 0.12 * Math.pow(latN[i], 3);
    reg.habitability = r3(clamp(h, 0, 1));
    var nr = nRes.fbm(x * 0.15, y * 0.15, 3, 2, 0.5);
    var food = (foodBase[biome] !== undefined ? foodBase[biome] : 0.4) + 0.12 * nr;
    if (river[i] > 0) food += 0.18 + 0.1 * flowBonus;
    if (coastal) food += 0.08;
    var nm = nMet.fbm(x * 0.12, y * 0.12, 3, 2, 0.5);
    var metal = (biome === "mountain" ? 0.55 + (elev[i] - mtn) * 1.0 : (elev[i] > 0.68 ? 0.25 : 0.06)) + 0.2 * nm + 0.35 * posB[i];
    var exo = Math.max(0, nExo.fbm(x * 0.09, y * 0.09, 3, 2, 0.5) - 0.12) * 2.2 + (posB[i] > 0.3 ? 0.3 * posB[i] : 0);
    if (biome === "desert" || biome === "jungle") exo += 0.08;
    reg.resources = { food: r3(clamp(food, 0, 1)), metal: r3(clamp(metal, 0, 1)), exotic: r3(clamp(exo, 0, 1)) };
    regions.push(reg);
  }
}

/* ---------------------------------------------------------------- galaxy */
function genGalaxy(world, pack, rng) {
  var W = world.width, H = world.height, N = W * H, i, k, x, y;
  var regions = world.regions = [];
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    var r = makeRegion(y * W + x, x, y);
    r.biome = "barren"; r.barren = true; r.habitability = 0;
    regions.push(r);
  }
  var cx = (W - 1) / 2, cy = (H - 1) / 2;
  var arms = rng.pick([2, 2, 3, 4]), b = rng.range(0.28, 0.42);
  var nSys = clamp(Math.round(N * rng.range(0.055, 0.075)), Math.min(40, N), 2000);

  function place() {
    var u = rng.next(), px, py, rad, th;
    if (u < 0.16) { px = rng.gauss() * 0.12; py = rng.gauss() * 0.12; }
    else if (u < 0.24) { px = rng.gauss() * 0.42; py = rng.gauss() * 0.42; }
    else {
      var arm = rng.int(0, arms - 1);
      rad = clamp(-Math.log(1 - rng.next() * (1 - Math.exp(-3.2))) / 3.2, 0.05, 1);
      th = arm * Math.PI * 2 / arms + Math.log(rad / 0.05) / b;
      var sg = 0.035 + 0.07 * rad;
      var perp = rng.gauss() * sg, along = rng.gauss() * sg * 0.5;
      px = (rad + along) * Math.cos(th) - perp * Math.sin(th);
      py = (rad + along) * Math.sin(th) + perp * Math.cos(th);
    }
    return [px, py];
  }

  var sys = [], taken = new Uint8Array(N), attempts = 0;
  while (sys.length < nSys && attempts < nSys * 40) {
    attempts++;
    var p = place(), gx = Math.round(cx + p[0] * cx * 0.97), gy = Math.round(cy + p[1] * cy * 0.97);
    if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
    var id = gy * W + gx;
    if (taken[id]) continue;
    taken[id] = 1;
    sys.push({ id: id, x: gx, y: gy, jx: rng.range(-0.38, 0.38), jy: rng.range(-0.38, 0.38),
               rad: Math.sqrt(Math.pow((gx - cx) / (cx || 1), 2) + Math.pow((gy - cy) / (cy || 1), 2)) });
  }
  var n = sys.length;

  /* local density, used to flag dense clusters */
  var occ = new Float32Array(N);
  for (i = 0; i < n; i++) occ[sys[i].id] = 1;
  var dens = blur(occ, W, H, 3);
  var dArr = sys.map(function (s) { return dens[s.id]; });
  var dHi = dArr.length ? quantile(dArr, 0.9) : 1;

  for (i = 0; i < n; i++) {
    var s = sys[i], reg = regions[s.id];
    var core = Math.max(0, 1 - s.rad / 0.3);
    var mass = clamp(Math.pow(rng.next(), 1.8) + core * 0.15, 0, 1);
    var temp = clamp(0.5 + rng.gauss() * 0.25 + (mass - 0.3) * 0.3, 0, 1);
    var vol = clamp(0.5 + rng.gauss() * 0.28 - core * 0.2, 0, 1);
    var biome;
    if ((dens[s.id] >= dHi && rng.chance(0.5)) || mass > 0.93) biome = "mountain";
    else if (vol > 0.78 && temp < 0.5) biome = "swamp";
    else biome = classifyLand(0.6, temp, vol, 2);
    reg.barren = false; reg.biome = biome;
    reg.elevation = r3(mass); reg.temperature = r3(temp); reg.moisture = r3(vol);
    reg.jx = r3(s.jx); reg.jy = r3(s.jy);
    reg.habitability = r3(clamp(biomeHab(pack, biome) * (1 - 0.45 * core * core) * (0.9 + 0.2 * rng.next()), 0, 1));
    var fb = { grassland: 0.7, forest: 0.6, jungle: 0.6, savanna: 0.5, swamp: 0.4, taiga: 0.3, tundra: 0.15, desert: 0.1, mountain: 0.1, ice: 0.05 }[biome];
    reg.resources = {
      food: r3(clamp((fb === undefined ? 0.3 : fb) + rng.range(-0.1, 0.1), 0, 1)),
      metal: r3(clamp(0.15 + mass * 0.5 + core * 0.2 + (biome === "mountain" ? 0.25 : 0) + rng.range(-0.1, 0.1), 0, 1)),
      exotic: r3(clamp(core * 0.5 + (biome === "mountain" ? 0.2 : 0) + (rng.chance(0.08) ? rng.range(0.3, 0.6) : 0) + rng.range(0, 0.1), 0, 1))
    };
  }

  /* ---- hyperlanes ---- */
  function px(s) { return s.x + s.jx; }
  function py(s) { return s.y + s.jy; }
  function dist(a, c) { var dx = px(a) - px(c), dy = py(a) - py(c); return Math.sqrt(dx * dx + dy * dy); }
  var nearest = [], nn1 = [];
  for (i = 0; i < n; i++) {
    var list = [];   /* the 4 closest as [d, j], ascending */
    for (var j = 0; j < n; j++) {
      if (j === i) continue;
      var d = dist(sys[i], sys[j]);
      if (list.length < 4 || d < list[list.length - 1][0]) {
        list.push([d, j]);
        for (var q = list.length - 1; q > 0 && (list[q][0] < list[q - 1][0] || (list[q][0] === list[q - 1][0] && list[q][1] < list[q - 1][1])); q--) {
          var tmp = list[q]; list[q] = list[q - 1]; list[q - 1] = tmp;
        }
        if (list.length > 4) list.pop();
      }
    }
    nearest.push(list);
    if (list.length) nn1.push(list[0][0]);
  }
  var ref = nn1.length ? quantile(nn1, 0.5) : 1;
  var maxLane = ref * 2.2;
  var parent = new Int32Array(n);
  for (i = 0; i < n; i++) parent[i] = i;
  function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
  var edgeSet = {};
  function link(a, c) {
    if (a === c) return;
    var lo = Math.min(a, c), hi = Math.max(a, c), key = lo * n + hi;
    if (edgeSet[key]) return;
    edgeSet[key] = 1;
    var d = dist(sys[a], sys[c]), cost = r3(Math.max(0.5, d / ref));
    var ra = regions[sys[a].id], rc = regions[sys[c].id];
    ra.neighbors.push(sys[c].id); rc.neighbors.push(sys[a].id);
    (ra.linkCost = ra.linkCost || {})[sys[c].id] = cost;
    (rc.linkCost = rc.linkCost || {})[sys[a].id] = cost;
    parent[find(a)] = find(c);
  }
  for (i = 0; i < n; i++) {
    var L = nearest[i];
    for (k = 0; k < L.length; k++) {
      if (k === 0 || (k < 3 && L[k][0] <= maxLane)) link(i, L[k][1]);
    }
  }
  /* join isolated components by their closest pair */
  for (;;) {
    var roots = {}, compCount = 0, rkeys = [];
    for (i = 0; i < n; i++) {
      var rt = find(i);
      if (!roots[rt]) { roots[rt] = []; compCount++; rkeys.push(rt); }
      roots[rt].push(i);
    }
    if (compCount <= 1) break;
    var smallest = rkeys[0];
    for (k = 1; k < rkeys.length; k++) if (roots[rkeys[k]].length < roots[smallest].length) smallest = rkeys[k];
    var members = roots[smallest], bd = 1e18, ba = -1, bc = -1;
    for (i = 0; i < members.length; i++) for (var j2 = 0; j2 < n; j2++) {
      if (find(j2) === smallest) continue;
      var dd = dist(sys[members[i]], sys[j2]);
      if (dd < bd) { bd = dd; ba = members[i]; bc = j2; }
    }
    link(ba, bc);
  }
  world.linkRef = r3(ref);
}

/* ---------------------------------------------------------------- entry */
AEON.worldgen = {
  generate: function (world, pack, rng) {
    if (world.scale === "galaxy") genGalaxy(world, pack, rng);
    else if (AEON.planetgen) AEON.planetgen.generate(world, pack, rng);
    else genPlanet(world, pack, rng);
  }
};

})();
