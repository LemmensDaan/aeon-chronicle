/* Shared by samples/seasons.html and samples/ambient-life.html: small pieces of map in the game's
   palette (js/pixelmap.js), each pixel carrying the climate a map cell has (coldC, warmC, rainMm,
   summerRain, biome, heightM), the seasonal and ambient effects drawn from that data, and panels
   with a date slider, a speed control and a held toggle. The calendar is the app's (ui.js): the
   season is the date's share of the year, 0 on the first of January; mid-winter is MIDWINTER in
   the north and half a year later in the south; faster than 1 year a second the season is null
   and the map shows its held look. */
(function () {
"use strict";
const K = window.SEASONS = {};
const W = 120, H = 70, N = W * H;
K.W = W; K.H = H;

/* ------------------------------------------------------------ palette (js/pixelmap.js) */
const P = {
  deep: "#16295f", mid: "#1f4294", shallow: "#3570c4", foam: "#a6dbff", river: "#3570c4",
  sand: ["#d4b56c", "#e6cd88", "#f3e2a6"],
  grassland: ["#4a9438", "#5fae45", "#80c95a"], forest: ["#215a2a", "#2c7436", "#3b8f44"],
  jungle: ["#1b663d", "#25804f", "#349b60"], savanna: ["#949539", "#b0af4a", "#cbc865"],
  desert: ["#c2924c", "#d9b066", "#eacb88"], swamp: ["#384e30", "#48633e", "#5c794e"],
  taiga: ["#2a5143", "#356453", "#477a65"], tundra: ["#7b8b74", "#94a48c", "#b2bfa7"],
  ice: ["#b4c5db", "#d3dfed", "#f1f6fc"], mountain: ["#584c42", "#796a5b", "#9a8b79"],
  snow: ["#c3cddb", "#e3eaf2", "#ffffff"],
};
const LIGHT = "#5f93d8", PALE = "#a6dbff", FOAM_B = "#dcefff", WHITE = "#e8f4ff", ROAD = "#604426";
/* the new ramps, three shades each like the biomes */
const R = {
  gold: ["#9c7f22", "#c29d2e", "#dfbd4a"], red: ["#7e2e1a", "#a8432a", "#cf6a32"], russet: ["#6b4424", "#8a5a30", "#a8743c"],
  bare: ["#4e4034", "#665444", "#7d6a55"], leaf: ["#4f9a36", "#6cb848", "#94d466"],
  dormant: ["#5f6e40", "#76824c", "#8c975c"], straw: ["#857a48", "#9c9258", "#b3a86a"], ripe: ["#a49a38", "#c2b148", "#dac862"],
  wheat: ["#c2a03c", "#d8b84e", "#ead06c"], stubble: ["#ad9668", "#c4ac7c", "#d8c290"], plough: ["#5e4630", "#76583a", "#8c6a46"],
  dry: ["#98804a", "#b29a5a", "#c9b26e"], wet: ["#4f8a30", "#6aa43c", "#8ac052"],
  bloom: ["#2d7d74", "#3f9a8c", "#6cc4ae"], cloud: ["#8f9aa8", "#c5ced8", "#eef3f8"],
};
K.P = P; K.R = R;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function bayer(x, y) { return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }
function hash(a, b) { let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, tx = fx * fx * (3 - 2 * fx), ty = fy * fy * (3 - 2 * fy);
  const v = function (i, j) { return hash(i * 131 + s * 7919, j); };
  return (v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx) * (1 - ty) + (v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx) * ty;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function wrap(v) { return ((v % 1) + 1) % 1; }
/* signed distance on the year's circle, -0.5..0.5 */
function sdist(a, b) { return wrap(a - b + 0.5) - 0.5; }
K.bayer = bayer; K.hash = hash; K.vnoise = vnoise; K.clamp = clamp;

const PACKED = {};
function pack(hex) {
  let p = PACKED[hex];
  if (p === undefined) {
    const n = parseInt(hex.slice(1), 16);
    p = PACKED[hex] = ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
  }
  return p;
}

/* ------------------------------------------------------------ the calendar (pixelmap.js) */
const MIDWINTER = 0.05;
K.MIDWINTER = MIDWINTER;
/* where a place stands in its own year: 0 at its mid-winter, 0.5 at mid-summer */
function local(season, south) { return season == null ? null : wrap(season - MIDWINTER + (south ? 0.5 : 0)); }
/* how far lake ice has crept out from the shore (0-10 pixels), as pixelmap.js iceLevel (ph: 0.5 at mid-winter) */
function iceLevel(share, ph) {
  if (!share) return 0;
  if (ph == null) return share >= 0.5 ? 10 : 0;
  return Math.max(0, Math.min(10, Math.min(ph - (0.5 - share / 2), 0.5 + share / 2 - ph) * 90));
}
/* the share of the year lakes and rivers stay frozen (pixelmap.js buildTerrain) */
function winterShare(cc) { return cc == null || cc >= 0 ? 0 : Math.min(0.85, 0.2 - cc / 25); }
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function dateName(day) {
  let d = Math.floor(((day % 365) + 365) % 365), m = 0;
  while (d >= MDAYS[m]) { d -= MDAYS[m]; m++; }
  return (d + 1) + " " + MONTHS[m];
}
K.local = local; K.iceLevel = iceLevel; K.dateName = dateName;

/* ------------------------------------------------------------ biomes */
const B = { sea: 0, lake: 1, river: 2, sand: 3, grass: 4, forest: 5, taiga: 6, mountain: 7, tundra: 8, icecap: 9,
            savanna: 10, jungle: 11, desert: 12, farm: 13, orchard: 14, town: 15, steppe: 16 };
K.B = B;
const LAND_PAL = {};
LAND_PAL[B.sand] = P.sand; LAND_PAL[B.grass] = P.grassland; LAND_PAL[B.forest] = P.forest; LAND_PAL[B.taiga] = P.taiga;
LAND_PAL[B.mountain] = P.mountain; LAND_PAL[B.tundra] = P.tundra; LAND_PAL[B.icecap] = P.ice; LAND_PAL[B.savanna] = P.savanna;
LAND_PAL[B.jungle] = P.jungle; LAND_PAL[B.desert] = P.desert; LAND_PAL[B.steppe] = P.savanna; LAND_PAL[B.farm] = P.grassland;
LAND_PAL[B.orchard] = P.grassland; LAND_PAL[B.town] = P.grassland;

/* ------------------------------------------------------------ building a piece of map */
/* spec: water(x,y) 0 land / 1 sea / 2 lake; height(x,y) metres; climate(x,y,h) {cold, warm, rain, sum};
   biome(x,y,ctx) a B code for land; rivers [[points], wide]; towns [[x,y,port]]; roads [[points]];
   lanes [[points]] for ships; flip: the same map for the south (pole at the bottom, opposite seasons) */
function build(spec) {
  const flip = !!spec.flip, Y = function (y) { return flip ? H - 1 - y : y; };
  const kind = new Uint8Array(N), biome = new Uint8Array(N), lvl = new Uint8Array(N);
  const h = new Float32Array(N), cold = new Float32Array(N), warm = new Float32Array(N), rain = new Float32Array(N), sum = new Float32Array(N);
  const jit = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, sy = Y(y), w = spec.water(x, sy), hh = w ? 0 : spec.height(x, sy), c = spec.climate(x, sy, hh);
    kind[i] = w; h[i] = hh; cold[i] = c.cold; warm[i] = c.warm; rain[i] = c.rain; sum[i] = c.sum;
    jit[i] = hash(x * 3 + 1, sy * 5 + 2);
    lvl[i] = Math.min(2, Math.floor(vnoise(x * 0.3, sy * 0.3, 9) * 2 + bayer(x, y)));
  }
  const bfs = function (src, pass) {
    const d = new Int16Array(N).fill(99), q = [];
    for (let i = 0; i < N; i++) if (src(i)) { d[i] = 0; q.push(i); }
    for (let k = 0; k < q.length; k++) {
      const c = q[k], x = c % W, y = (c - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !pass(j) || d[j] <= d[c] + 1) continue;
        d[j] = d[c] + 1; q.push(j);
      }
    }
    return d;
  };
  const toLand = bfs(function (i) { return kind[i] === 0; }, function (i) { return kind[i] !== 0; });
  const toSea = bfs(function (i) { return kind[i] === 1; }, function (i) { return kind[i] !== 1; });
  const toLake = bfs(function (i) { return kind[i] === 2; }, function (i) { return kind[i] === 0; });

  /* rivers: Catmull-Rom through control points, one pixel per step, in the order they flow */
  const trace = function (pts, wide, any) {
    const out = [], seen = new Set();
    const at = function (p0, p1, p2, p3, t) {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };
    pts = pts.map(function (p) { return [p[0], Y(p[1])]; });
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[k], c = pts[k + 1], d = pts[Math.min(pts.length - 1, k + 2)];
      for (let s = 0; s <= 1; s += 0.02) {
        const x = Math.round(at(a[0], b[0], c[0], d[0], s)), y = Math.round(at(a[1], b[1], c[1], d[1], s)), i = y * W + x;
        if (seen.has(i) || x < -6 || y < -6 || x >= W + 6 || y >= H + 6) continue;
        if (!any && (x < 0 || y < 0 || x >= W || y >= H || kind[i] !== 0)) continue;
        seen.add(i); out.push([x, y, out.length]);
        if (wide && kind[i + W] === 0 && !seen.has(i + W)) { seen.add(i + W); out.push([x, y + 1, out.length - 1]); }
      }
    }
    return out;
  };
  const rivers = (spec.rivers || []).map(function (r) { return trace(r[0], r[1]); });
  const riverPx = [].concat.apply([], rivers);
  for (const p of riverPx) kind[p[1] * W + p[0]] = 3;
  const mouths = rivers.filter(function (r) { const l = r[r.length - 1]; return l && toSea[l[1] * W + l[0]] <= 2; }).map(function (r) {
    const l = r[r.length - 1], p = r[Math.max(0, r.length - 8)];
    return { x: l[0], y: l[1], a: Math.atan2(l[1] - p[1], l[0] - p[0]), cold: cold[l[1] * W + l[0]] };
  });

  const towns = (spec.towns || []).map(function (t) { return { x: t[0], y: Y(t[1]), port: !!t[2], name: t[3] || "" }; });
  const ctx = { kind: kind, h: h, cold: cold, warm: warm, rain: rain, toSea: toSea, toLake: toLake, towns: towns, Y: Y };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (kind[i] === 1) biome[i] = B.sea;
    else if (kind[i] === 2) biome[i] = B.lake;
    else if (kind[i] === 3) biome[i] = B.river;
    else if (toSea[i] === 1 || (toSea[i] === 2 && bayer(x, y) < 0.5)) biome[i] = B.sand;
    else biome[i] = spec.biome(x, Y(y), i, ctx);
  }
  const roads = (spec.roads || []).map(function (r) { return trace(r, false, true).filter(function (p) { return p[0] >= 0 && p[1] >= 0 && p[0] < W && p[1] < H; }); });
  const lanes = (spec.lanes || []).map(function (r) { return trace(r, false, true); });
  /* farmland (spec.farm "stripes": fields told apart by their crops and the way their rows run,
     a track here and there; "hedges": the same with hedgerows between them) and orchard trees */
  const hedge = new Uint8Array(N), field = new Int32Array(N), stripe = new Uint8Array(N), otree = new Uint8Array(N);
  const hedges = spec.farm === "hedges";
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i - x) / W;
    if (biome[i] === B.orchard) otree[i] = orchardPart(x, y);
    if (biome[i] !== B.farm) continue;
    const fa = fieldAt(x, Y(y));
    field[i] = fa.id;
    stripe[i] = (hash(fa.id, 9) < 0.5 ? Y(y) : x) % 2;
    hedge[i] = fa.edge === 2 ? 2 : fa.edge === 1 && hedges && hash(i, 7) < 0.7 ? 1 : 0;
  }
  const road = new Uint8Array(N);
  for (const r of roads) for (const p of r) road[p[1] * W + p[0]] = 1;

  /* the map as pixelmap.js draws it, once */
  const base = new Uint32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = bayer(x, y), d = toLand[i], b = biome[i];
    let col;
    if (kind[i] === 2) col = d <= 2 ? P.shallow : d <= 7 && t >= (d - 2) / 5 ? P.shallow : P.mid;
    else if (kind[i] === 1) col = d === 1 ? (t < 0.5 ? P.foam : P.shallow) : d <= 3 + t * 2 ? P.shallow : d <= 9 + t * 3 ? P.mid : P.deep;
    else if (kind[i] === 3) col = P.river;
    else if (b === B.mountain && h[i] > 2700) col = P.snow[lvl[i]];
    else if (b === B.farm) col = hedge[i] ? (hedge[i] === 2 ? TRACK : HEDGE[(x + y) & 1]) : farmBase(field[i], stripe[i], lvl[i]);
    else if (b === B.orchard) col = otree[i] ? ORCHARD[otree[i] - 1] : P.grassland[Math.max(1, lvl[i])];
    else if (b === B.town) col = P.grassland[lvl[i]];
    else col = LAND_PAL[b][lvl[i]];
    if (road[i] && kind[i] === 0) col = ROAD;
    base[i] = pack(col);
  }
  /* towns: a few roofs */
  for (const tw of towns) for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = tw.x + dx, y = tw.y + dy, i = y * W + x;
    if (x < 0 || y < 0 || x >= W || y >= H || kind[i] !== 0) continue;
    if (hash(x, y * 7) < 0.7) base[i] = pack((x + y) % 2 ? "#b5452e" : "#efe6d6");
  }

  const S = { kind: kind, biome: biome, lvl: lvl, h: h, cold: cold, warm: warm, rain: rain, sum: sum, jit: jit,
              toLand: toLand, toSea: toSea, toLake: toLake, hedge: hedge, field: field, stripe: stripe, otree: otree, rivers: rivers, riverPx: riverPx, mouths: mouths,
              towns: towns, roads: roads, lanes: lanes, road: road, base: base, south: !!spec.south, flip: flip,
              wind: spec.wind == null ? 1 : spec.wind, name: spec.name };
  /* lake and river ice (pixelmap.js buildTerrain): each lake pixel's distance from the shore and how long it stays frozen */
  S.lakePx = []; S.lakeD = []; S.lakeIce = []; S.lakeJit = []; S.lakeK = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (kind[i] === 2) {
    S.lakeK[i] = S.lakePx.length;
    S.lakePx.push(i); S.lakeD.push(toLand[i] + (hash(i, 51) - 0.5) * 1.5); S.lakeIce.push(winterShare(cold[i])); S.lakeJit.push(hash(i, 52));
  }
  S.foam = [];
  for (let i = 0; i < N; i++) if (kind[i] === 1 && toLand[i] === 1) S.foam.push(i);
  /* sea ice: how readily each sea pixel freezes, from its coldest month and the shore */
  S.iceScore = new Float32Array(N);
  for (let i = 0; i < N; i++) if (kind[i] === 1) {
    const x = i % W, y = (i - x) / W;
    const c = (-cold[i] - 8) / 20;
    if (c > 0) S.iceScore[i] = Math.min(1.2, c) + (toLand[i] <= 2 ? 0.1 : toLand[i] <= 5 ? 0.05 : 0) + (vnoise(x * 0.15, y * 0.15, 31) - 0.5) * 0.16;
  }
  return S;
}
/* farmland: a patchwork of fields 7 by 5 pixels, each row of them shifted its own way, each field
   with its own crop, its own few days' lead and its rows running across or down it */
function fieldAt(x, y) {
  const band = Math.floor(y / 5), off = Math.floor(hash(band, 5) * 7), fx = x + off, col = Math.floor(fx / 7);
  const edge = fx % 7 === 0 ? 1 : y % 5 === 0 ? (hash(band, 8) < 0.35 ? 2 : 1) : 0;
  return { id: col * 97 + band, edge: edge, cx: col * 7 + 3.5 - off, cy: band * 5 + 2.5 };
}
const HEDGE = ["#24512a", "#2c5e2e"], TRACK = "#8a6a40", HEDGE_BARE = ["#4e4034", "#5e4c3c"];
function farmBase(id, s, l) {
  const k = hash(id, 3);
  return k < 0.3 ? P.grassland[l] : k < 0.55 ? P.savanna[s ? 2 : 1] : k < 0.8 ? P.grassland[s ? 2 : 1] : P.grassland[s ? 1 : 0];
}
/* an orchard in rows: each tree a crown of two pixels, light and dark, its shadow under it, grass between the rows */
const ORCHARD = ["#4f9a3c", "#2f7436", "#3a6e2a"];
function orchardPart(x, y) { return y % 3 === 0 ? (x % 3 === 0 ? 1 : x % 3 === 1 ? 2 : 0) : y % 3 === 1 && x % 3 === 0 ? 3 : 0; }
K.build = build;
K.fieldAt = fieldAt;

/* ------------------------------------------------------------ the pieces of map */
function coast(y, x0) { return x0 + (vnoise(0.5, y * 0.11, 1) - 0.5) * 16 - Math.max(0, y - 50) * 2.2; }
/* temperate: hills in the north-west, a lake, a river out to the sea in the east, a village with
   fields and an orchard; from about 55 N at the top (coldest month -14) to 45 N at the bottom (+3) */
function temperateSpec(south, farm) {
  const hill = function (x, y) { return x + y < 34 + vnoise(x * 0.2, y * 0.2, 6) * 10; };
  return {
    name: "temperate", south: south, flip: south, wind: 1, farm: farm,
    water: function (x, y) {
      const dx = (x - 46) / 17, dy = (y - 35) / 8.5;
      if (x > coast(y, 94) + (vnoise(x * 0.2, y * 0.2, 3) - 0.5) * 4) return 1;
      if (dx * dx + dy * dy < 1 + (vnoise(x * 0.22, y * 0.22, 2) - 0.5) * 0.7) return 2;
      return 0;
    },
    height: function (x, y) { return hill(x, y) ? 1400 + (34 - x - y) * 70 + vnoise(x * 0.3, y * 0.3, 8) * 700 : 80 + vnoise(x * 0.1, y * 0.1, 5) * 300; },
    climate: function (x, y, h) { const c = -14 + y * 0.25; return { cold: c - h * 0.0065, warm: 15 + y * 0.12 - h * 0.0065, rain: 650 + vnoise(x * 0.05, y * 0.05, 12) * 300, sum: 0.4 }; },
    biome: function (x, y, i, c) {
      if (hill(x, y)) return B.mountain;
      const vx = x - 66, vy = y - 53;
      if (vx * vx + vy * vy * 1.6 < 12) return B.town;
      if (x >= 51 && x <= 62 && y >= 56 && y <= 65) return B.orchard;
      const fa = fieldAt(x, y), fx = fa.cx - 66, fy = fa.cy - 53;
      if (fx * fx + fy * fy * 1.6 < 300 && hash(fa.id, 6) < 0.85) return B.farm;
      if (vnoise(x * 0.12, y * 0.12, 4) > 0.55) return c.cold[i] < -10 ? B.taiga : B.forest;
      return B.grass;
    },
    rivers: [[[[4, 2], [10, 9], [17, 13], [21, 21], [27, 26], [31, 32], [36, 35]], false],
             [[[58, 38], [64, 41], [70, 46], [76, 45], [83, 49], [90, 52], [99, 55], [104, 57]], true]],
    towns: [[66, 53, false, "village"], [88, 9, true, "north port"], [91, 40, true, "south port"]],
    roads: [[[-2, 58], [20, 56], [40, 55], [60, 54], [66, 53], [78, 47], [88, 41], [91, 40]], [[66, 53], [70, 32], [80, 18], [88, 9]]],
    lanes: [[[92, 9], [100, 8], [110, 10], [125, 12]], [[94, 40], [102, 36], [112, 30], [125, 26]], [[94, 40], [100, 24], [96, 12], [92, 9]], [[104, 59], [112, 62], [125, 66]]],
  };
}
/* tropical: desert in the north, savanna with a summer monsoon, jungle by a warm sea to the south and east */
function tropicalSpec() {
  return {
    name: "tropical", wind: -1,
    water: function (x, y) {
      const shore = 50 + (vnoise(x * 0.06, 0.5, 21) - 0.5) * 14 + Math.max(0, x - 70) * 0.25;
      if (y > shore || x > 104 + (vnoise(0.5, y * 0.1, 22) - 0.5) * 10) return 1;
      const dx = (x - 42) / 9, dy = (y - 30) / 5;
      if (dx * dx + dy * dy < 1 + (vnoise(x * 0.25, y * 0.25, 23) - 0.5) * 0.6) return 2;
      return 0;
    },
    height: function (x, y) { const r = 30 - x * 0.5 - y * 0.6; return r > 0 ? 400 + r * 60 + vnoise(x * 0.3, y * 0.3, 24) * 300 : 60 + vnoise(x * 0.1, y * 0.1, 25) * 200; },
    climate: function (x, y) { return { cold: 14 + y * 0.15, warm: 33 - y * 0.06, rain: 80 + y * 28 + (vnoise(x * 0.08, y * 0.08, 26) - 0.5) * 500, sum: y > 48 ? 0.65 : 0.85 }; },
    biome: function (x, y, i, c) {
      const r = c.rain[i];
      if (c.h[i] > 900) return B.mountain;
      if (r < 380) return B.desert;
      if (r < 1350) return B.savanna;
      return B.jungle;
    },
    rivers: [[[[6, 4], [14, 14], [24, 22], [33, 29]], false], [[[50, 31], [58, 36], [63, 42], [70, 47], [76, 54], [80, 62]], true]],
    towns: [[22, 9, false, "oasis"], [74, 50, true, "port"]],
    roads: [[[22, 9], [34, 16], [48, 24], [60, 34], [70, 44], [74, 50]]],
    lanes: [[[78, 54], [90, 60], [105, 62], [125, 64]], [[78, 54], [96, 50], [112, 40], [125, 30]]],
  };
}
/* polar: tundra and an ice cap to the west, a cold sea to the east, from about 80 N at the top (coldest month -32) to 66 N (-11) */
function polarSpec() {
  return {
    name: "polar", wind: 1,
    water: function (x, y) {
      const shore = 34 + (vnoise(0.5, y * 0.09, 41) - 0.5) * 18 + y * 0.25;
      if (x > shore + (vnoise(x * 0.2, y * 0.2, 42) - 0.5) * 5) {
        const dx = (x - 86) / 10, dy = (y - 24) / 6;
        return dx * dx + dy * dy < 1 + (vnoise(x * 0.25, y * 0.25, 43) - 0.5) * 0.8 ? 0 : 1;
      }
      return 0;
    },
    height: function (x, y) { return 200 + Math.max(0, 22 - y) * 40 + vnoise(x * 0.12, y * 0.12, 44) * 500; },
    climate: function (x, y, h) { const c = -32 + y * 0.3; return { cold: c - h * 0.004, warm: 2 + y * 0.13 - h * 0.004, rain: 250, sum: 0.5 }; },
    biome: function (x, y, i, c) { return c.warm[i] < 2.5 ? B.icecap : y > 56 && vnoise(x * 0.15, y * 0.15, 45) > 0.5 ? B.taiga : B.tundra; },
    rivers: [[[[6, 40], [14, 46], [24, 50], [36, 54], [44, 56]], false]],
    towns: [[48, 60, true, "harbour"]],
    lanes: [[[52, 60], [70, 58], [92, 52], [125, 46]]],
  };
}
/* trade: desert and steppe to the south-west, grassland and woods to the north, a big lake, a warm sea to the east with an island */
function tradeSpec() {
  return {
    name: "trade", wind: 1,
    water: function (x, y) {
      const sea = x > 86 + (vnoise(0.5, y * 0.1, 61) - 0.5) * 14 + (vnoise(x * 0.2, y * 0.2, 62) - 0.5) * 4;
      const ix = (x - 108) / 7, iy = (y - 20) / 5;
      if (sea && !(ix * ix + iy * iy < 1 + (vnoise(x * 0.3, y * 0.3, 63) - 0.5) * 0.6)) return 1;
      const dx = (x - 40) / 19, dy = (y - 16) / 8;
      if (dx * dx + dy * dy < 1 + (vnoise(x * 0.2, y * 0.2, 64) - 0.5) * 0.6) return 2;
      return 0;
    },
    height: function (x, y) { return 100 + vnoise(x * 0.1, y * 0.1, 65) * 400; },
    climate: function (x, y) { const r = 120 + (W - x) * -1 + (H - y) * 14 + x * 6; return { cold: 6 + y * 0.08, warm: 24 + y * 0.12, rain: r + (vnoise(x * 0.08, y * 0.08, 66) - 0.5) * 200, sum: 0.35 }; },
    biome: function (x, y, i, c) {
      const r = c.rain[i];
      if (r < 330) return B.desert;
      if (r < 560) return B.steppe;
      return vnoise(x * 0.12, y * 0.12, 67) > 0.6 ? B.forest : B.grass;
    },
    rivers: [[[[58, 20], [66, 26], [74, 30], [82, 33], [88, 34]], true]],
    towns: [[8, 60, false, "desert town"], [52, 34, false, "market"], [84, 46, true, "port"], [106, 20, true, "island"], [80, 12, true, "north port"]],
    roads: [[[-2, 64], [8, 60], [22, 54], [36, 46], [52, 34], [66, 40], [76, 44], [84, 46]], [[52, 34], [62, 26], [72, 16], [80, 12]]],
    lanes: [[[88, 46], [96, 40], [104, 30], [106, 23]], [[88, 46], [100, 52], [112, 58], [125, 62]], [[83, 12], [94, 12], [102, 16], [104, 20]], [[110, 18], [118, 14], [125, 10]]],
  };
}
const CACHE = {};
K.scene = function (name) {
  if (!CACHE[name]) CACHE[name] = build(name === "temperate" ? temperateSpec(false) : name === "south" ? temperateSpec(true) : name === "hedges" ? temperateSpec(false, "hedges")
    : name === "tropical" ? tropicalSpec() : name === "polar" ? polarSpec() : tradeSpec());
  return CACHE[name];
};

/* ------------------------------------------------------------ effects */
/* each draws into a frame f: { S, buf, t (wall ms), season (null when held), day (the calendar,
   in days), speed (days a second), lp (the place's own year, 0 at mid-winter, null when held) } */
function put(f, i, col) { f.buf[i] = pack(col); }
function shade(f, i, k) {
  const p = f.buf[i];
  const c = function (v) { return Math.min(255, Math.round(v * k)); };
  f.buf[i] = ((255 << 24) | (c((p >> 16) & 255) << 16) | (c((p >> 8) & 255) << 8) | c(p & 255)) >>> 0;
}
const FX = K.fx = {};

/* the sea's surf as the map has it now */
FX.seaFoam = function (f) {
  const tick = Math.floor(f.t / 1000 * 1.6), col = tick % 2 ? P.foam : FOAM_B;
  for (const i of f.S.foam) if ((i * 7 + tick) % 3 === 0) put(f, i, col);
};
/* lake and river ice, exactly as pixelmap.js drawWater (the reference) */
FX.lakeIce = function (f) {
  const S = f.S, ph = f.lp == null ? null : wrap(f.lp + 0.5);
  for (let k = 0; k < S.lakePx.length; k++) {
    const fl = iceLevel(S.lakeIce[k], ph), d = S.lakeD[k];
    if (!fl || d > fl || (ph > 0.5 && S.lakeJit[k] > fl / 10 + 0.3)) continue;
    const i = S.lakePx[k];
    put(f, i, d > fl - 1 ? P.ice[0] : bayer(i % W, (i / W) | 0) < 0.3 ? P.ice[2] : P.ice[1]);
  }
  for (const p of S.riverPx) {
    const i = p[1] * W + p[0];
    if (iceLevel(winterShare(S.cold[i]), ph) > 3 + hash(i, 53) * 4) put(f, i, P.ice[1]);
  }
};
/* bands of current down the rivers, as the app has them (stopped where frozen: the ice is drawn after) */
FX.current = function (f) {
  const t = f.t / 1000;
  for (const r of f.S.rivers) for (const p of r) if (((Math.floor(p[2] - t * 5) % 9) + 9) % 9 === 0) put(f, p[1] * W + p[0], LIGHT);
};

/* snow: the share of the year it lies, from the coldest month (with height already in it); lying
   where the warmest month is below freezing, never melting */
function snowShare(S, i) {
  const c = S.cold[i];
  if (S.warm[i] < 0) return 1;
  if (c >= -1) return 0;
  return Math.min(0.92, 0.12 - (c + 1) / 22) * (0.9 + S.jit[i] * 0.2);
}
/* how deep into its snow season a pixel is (positive: covered), peaking a few weeks after mid-winter */
function snowMargin(S, i, lp) { const s = snowShare(S, i); return s ? s / 2 - Math.abs(sdist(lp, 0.04)) : -1; }
FX.snow = function (f) {
  const S = f.S;
  for (let i = 0; i < N; i++) {
    if (S.kind[i] !== 0 || S.biome[i] === B.icecap) continue;
    const x = i % W, y = (i - x) / W, b = bayer(x, y);
    let m;
    if (f.lp == null) m = snowShare(S, i) >= 0.5 ? 1 : -1;
    else m = snowMargin(S, i, f.lp);
    if (m <= 0 || (m < 0.025 && b > m / 0.025)) continue;
    /* trees stand dark through the snow */
    if ((S.biome[i] === B.forest || S.biome[i] === B.taiga || S.biome[i] === B.jungle || S.hedge[i] === 1) && b > 0.55) continue;
    if (S.road[i] && b < 0.3) continue;
    put(f, i, P.snow[S.biome[i] === B.mountain ? S.lvl[i] : Math.min(2, S.lvl[i] + 1)]);
  }
};
/* falling flakes where the snow is building (from the first snow to a little past mid-winter), drifting with the wind */
FX.snowfall = function (f) {
  if (f.lp == null) return;
  const S = f.S, t = f.t / 1000, burst = vnoise(t * 0.25, 0.5, 71);
  for (let k = 0; k < 260; k++) {
    const sp = 6 + hash(k, 2) * 5, y = Math.floor(((hash(k, 1) * (H + 6) + t * sp) % (H + 6)) - 3);
    const x = Math.floor((((hash(k, 3) * W + t * sp * 0.6 * S.wind + Math.sin(t * 1.3 + k) * 1.2) % W) + W) % W);
    if (y < 0 || y >= H) continue;
    const i = y * W + x, s = snowShare(S, i), d = sdist(f.lp, 0.04);
    if (!s || d < -s / 2 - 0.03 || d > s / 6) continue;
    if (hash(k, Math.floor(t / 3)) > 0.35 + burst * 0.65) continue;
    put(f, i, hash(k, 5) < 0.5 ? "#ffffff" : P.snow[1]);
  }
};
/* broadleaf woods turn in autumn: green, gold, red and russet by tree, bare in winter, a fresh green in spring */
function leafTiming(S, i) {
  const c = -clamp(S.cold[i] * 0.004, -0.03, 0.05);   /* colder: earlier in autumn, later in spring */
  return { turn: 0.66 + S.jit[i] * 0.05 - c, out: 0.27 + S.jit[i] * 0.03 + c };
}
FX.autumn = function (f) {
  if (f.lp == null) return;
  const S = f.S, q = f.lp;
  for (let i = 0; i < N; i++) {
    const b = S.biome[i];
    if ((b !== B.forest && b !== B.orchard) || S.road[i]) continue;
    if (b === B.orchard && S.otree[i] !== 1 && S.otree[i] !== 2) continue;
    if (S.cold[i] < -12 || S.cold[i] > 9) continue;
    const sp = hash(i, 81);
    if (sp < 0.12) continue;                     /* the odd conifer stays green */
    const x = i % W, y = (i - x) / W, bb = bayer(x, y), tm = leafTiming(S, i), l = S.lvl[i];
    const ramp = sp < 0.5 ? R.gold : sp < 0.8 ? R.red : R.russet;
    if (q >= tm.turn) {
      const k = (q - tm.turn) / 0.14;
      if (k < 0.25) { if (bb < k * 4) put(f, i, ramp[l]); }
      else if (k < 0.7) put(f, i, ramp[l]);
      else if (k < 1) put(f, i, bb < (k - 0.7) / 0.3 ? R.bare[l] : ramp[l]);
      else put(f, i, R.bare[l]);
    } else if (q < tm.out) put(f, i, R.bare[l]);
    else if (q < tm.out + 0.07) put(f, i, bb < (q - tm.out) / 0.03 ? R.leaf[l] : R.bare[l]);
  }
};
/* blossom in the orchard in spring, just before the leaves, tree by tree: each tree in bud, in
   full flower (white, pink on its shaded side) and going over in about two weeks, somewhere in a
   spell of a month, its petals lying pink in the grass under it for a while after; with wild, a
   few wild cherries flowering white on the edges of the woods too */
FX.blossom = function (f, st, opts) {
  if (f.lp == null) return;
  const S = f.S, wild = opts && opts.wild;
  for (let i = 0; i < N; i++) {
    const b = S.biome[i];
    if (S.cold[i] < -12 || S.cold[i] > 12 || S.kind[i] !== 0 || S.road[i]) continue;
    const x = i % W, y = (i - x) / W, part = b === B.orchard ? S.otree[i] : 0;
    const edge = wild && b === B.forest && S.toSea[i] > 1 && hash(i, 91) < 0.06 && isEdge(S, x, y);
    if (!part && !edge) continue;
    const tree = part ? Math.floor(x / 3) * 31 + Math.floor(y / 3) : i;
    const start = leafTiming(S, i).out - 0.08 + hash(tree, 97) * 0.045, k = (f.lp - start) / 0.04;
    if (edge) { if (k > 0.1 && k < 0.8) put(f, i, k < 0.25 ? "#d8d0c8" : "#fbf3f6"); continue; }
    if (part === 3) {
      /* fallen petals in the tree's shadow, and beside it */
      if (k > 0.7 && k < 1.5) { put(f, i, "#f2c4d2"); if (k < 1.2 && x + 1 < W && S.biome[i + 1] === B.orchard && !S.otree[i + 1]) put(f, i + 1, "#e7b9c8"); }
      continue;
    }
    if (k < 0 || k > 1) continue;
    if (k < 0.15) { if (part === 1) put(f, i, "#e7b9c8"); }
    else if (k < 0.7) put(f, i, part === 1 ? "#fbf3f6" : "#f2c4d2");
    else if (part === 1) put(f, i, "#f6cfdc");
  }
};
function isEdge(S, x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H && S.biome[ny * W + nx] !== B.forest) return true;
  }
  return false;
}
const PLAINS_YEAR = [[0, "dormant"], [0.18, "dormant"], [0.3, "leaf"], [0.42, "leaf"], [0.5, "own"], [0.56, "own"], [0.64, "ripe"],
  [0.72, "ripe"], [0.84, "straw"], [0.97, "dormant"], [1.01, "dormant"]];
/* grassland and farmland through the year: dormant in winter, a fresh green in spring, ripening gold
   in late summer (the drier the more), fields harvested to stubble and ploughed in autumn */
function mixRamp(f, i, a, b, k, l) { put(f, i, bayer(i % W, (i / W) | 0) < k ? b[l] : a[l]); }
FX.plains = function (f) {
  if (f.lp == null) return;
  const S = f.S, q = f.lp;
  for (let i = 0; i < N; i++) {
    const b = S.biome[i], l = S.lvl[i];
    if (b !== B.grass && b !== B.farm && b !== B.steppe && b !== B.town && !(b === B.orchard && !S.otree[i])) continue;
    if (S.cold[i] > 12 || S.road[i]) continue;
    const x = i % W, y = (i - x) / W, own = LAND_PAL[b];
    /* hedges in leaf from spring to autumn, bare in winter; tracks as they are */
    if (b === B.farm && S.hedge[i]) {
      if (S.hedge[i] === 1 && (q < 0.28 || q >= 0.8)) put(f, i, HEDGE_BARE[(x + y) & 1]);
      continue;
    }
    if (b === B.farm && hash(S.field[i], 3) >= 0.3) {
      const fj = hash(S.field[i], 4) * 0.05, crop = hash(S.field[i], 3) < 0.8 ? R.wheat : R.ripe;
      /* the rows: furrows dark and light when bare, the crop lighter along its rows when growing */
      const fl = S.stripe[i] ? 2 : 0, gl = S.stripe[i] ? 2 : 1;
      if (q < 0.2 + fj || q >= 0.8 + fj) put(f, i, R.plough[fl]);
      else if (q < 0.3 + fj) mixRamp(f, i, R.plough, R.leaf, (q - 0.2 - fj) / 0.1, gl);
      else if (q < 0.42 + fj) put(f, i, R.leaf[gl]);
      else if (q < 0.52 + fj) put(f, i, P.grassland[gl]);
      else if (q < 0.6 + fj) mixRamp(f, i, P.grassland, crop, (q - 0.52 - fj) / 0.08, gl);
      else if (q < 0.65 + fj) put(f, i, crop[gl]);
      else if (q < 0.72 + fj) put(f, i, R.stubble[gl]);
      else mixRamp(f, i, R.stubble, R.plough, (q - 0.72 - fj) / 0.08, fl);
      continue;
    }
    /* through the year by keyframes, each step dithered into the next: autumn as slow as spring,
       the gold fading to straw and then to the winter's dull green; the drier the grass, the more
       of it turns gold (the rest stays green into the straw) */
    const ripe = hash(i, 88) < clamp((900 - S.rain[i]) / 500, 0.35, 1) ? R.ripe : own;
    let a = PLAINS_YEAR.length - 2;
    while (a > 0 && PLAINS_YEAR[a][0] > q) a--;
    const A = PLAINS_YEAR[a], Bk = PLAINS_YEAR[a + 1], k = (q - A[0]) / (Bk[0] - A[0]);
    const ramp = function (r) { return r === "own" ? own : r === "ripe" ? ripe : R[r]; };
    mixRamp(f, i, ramp(A[1]), ramp(Bk[1]), k, l);
  }
};
/* savanna and monsoon land (summerRain high): green in the rains, brown through the dry season; the held look is the biome's own, in between */
function wetness(lp) {
  if (lp < 0.36) return 0;
  if (lp < 0.48) return (lp - 0.36) / 0.12;
  if (lp < 0.72) return 1;
  if (lp < 0.92) return 1 - (lp - 0.72) / 0.2;
  return 0;
}
FX.wetDry = function (f) {
  if (f.lp == null) return;
  const S = f.S, g = wetness(f.lp);
  for (let i = 0; i < N; i++) {
    const b = S.biome[i];
    if ((b !== B.savanna && b !== B.steppe && b !== B.jungle) || S.sum[i] < 0.55 || S.cold[i] < 8 || S.road[i]) continue;
    const l = S.lvl[i];
    if (b === B.jungle) { if (g < 0.3 && bayer(i % W, (i / W) | 0) < 0.25 * (1 - g)) put(f, i, P.savanna[0]); continue; }
    mixRamp(f, i, R.dry, R.wet, g, l);
  }
};
/* the monsoon itself: rain cells drift in off the sea through the rains, darkening the land, with now and then a flash */
FX.monsoonRain = function (f) {
  if (f.lp == null) return;
  const S = f.S, t = f.t / 1000, g = f.lp < 0.36 || f.lp > 0.74 ? 0 : Math.sin((f.lp - 0.36) / 0.38 * Math.PI);
  const n = Math.round(g * 5);
  for (let k = 0; k < n; k++) {
    const cyc = Math.floor(t / 9 + hash(k, 1)), life = (t / 9 + hash(k, 1)) % 1;
    const cx = 10 + hash(k, cyc) * 100 + life * 18, cy = 66 - life * 50 - hash(k, cyc + 7) * 10, r = 7 + hash(k, cyc + 3) * 6;
    /* lightning: now and then a strike, a flash of the whole cloud with a forked bolt to the ground,
       out, and struck again, as lightning flickers */
    const env = Math.sin(life * Math.PI), slot = t / 0.7 + hash(k, 9), u = slot % 1, sid = Math.floor(slot);
    const strike = env > 0.5 && hash(k * 31, sid) < 0.3, bolt = strike && (u < 0.07 || (u > 0.13 && u < 0.2)), glow = strike && u < 0.3;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r * 1.4); x <= cx + r * 1.4; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot((x - cx) / 1.4, y - cy) / r + (vnoise(x * 0.3, y * 0.3 + t, 72) - 0.5) * 0.5;
      if (d > env) continue;
      const i = y * W + x;
      if (bolt) { shade(f, i, 1.45); continue; }
      shade(f, i, glow ? 0.95 : 0.78);
      if (hash(i, Math.floor(t * 10)) < 0.07 || hash(i - W - 1, Math.floor(t * 10)) < 0.07) put(f, i, "#9fb8d0");
    }
    if (bolt) {
      const pts = [], len = 11 + Math.floor(hash(k, sid + 1) * 5);
      let x = Math.round(cx + (hash(k, sid + 2) - 0.5) * r), y = Math.round(cy - r * 0.6), dir = hash(k, sid + 3) < 0.5 ? -1 : 1;
      for (let st = 0; st < len; st++, y++) {
        if (hash(k * 7 + st, sid) < 0.45) dir = -dir;
        if (hash(k * 5 + st, sid) < 0.6) x += dir;
        pts.push([x, y]);
        /* a fork from the upper part, running off sideways */
        if (st === 4) for (let b = 1, bx = x; b <= 4; b++) { bx -= dir; pts.push([bx, y + b]); }
      }
      const dot = function (x, y, col) { if (x >= 0 && x < W && y >= 0 && y < H) put(f, y * W + x, col); };
      for (const p of pts) { dot(p[0] - 1, p[1], "#f3df6a"); dot(p[0] + 1, p[1], "#f3df6a"); }
      for (const p of pts) dot(p[0], p[1], "#ffffff");
      const g = pts[len + 3] || pts[pts.length - 1];
      dot(g[0] - 1, g[1] + 1, "#fff3a0"); dot(g[0] + 1, g[1] + 1, "#fff3a0"); dot(g[0], g[1] + 1, "#ffffff");
    }
  }
};
/* phytoplankton: green-turquoise swirls on cool coastal sea and off river mouths, in spring and early summer (a smaller bloom in autumn) */
FX.plankton = function (f) {
  if (f.lp == null) return;
  const S = f.S, t = f.t / 1000, q = f.lp;
  const env = Math.max(Math.max(0, 1 - Math.abs(q - 0.33) / 0.11), 0.45 * Math.max(0, 1 - Math.abs(q - 0.74) / 0.05));
  if (env <= 0) return;
  for (let i = 0; i < N; i++) {
    if (S.kind[i] !== 1 || S.toLand[i] < 2) continue;
    const x = i % W, y = (i - x) / W;
    let wgt = S.warm[i] < 24 ? clamp(1 - (S.toLand[i] - 2) / 16, 0, 1) : 0;
    for (const m of S.mouths) wgt = Math.max(wgt, clamp(1 - Math.hypot(x - m.x, y - m.y) / 16, 0, 1));
    if (!wgt) continue;
    const v = vnoise(x * 0.12 + Math.sin(y * 0.15 + t * 0.2) * 0.9 + t * 0.04, y * 0.2 + Math.cos(x * 0.1 - t * 0.15) * 0.7, 41);
    const m = v * wgt * env - 0.22;
    if (m <= 0) continue;
    if (m < 0.06 && bayer(x, y) > m / 0.06) continue;
    put(f, i, R.bloom[m > 0.22 ? 2 : m > 0.1 ? 1 : 0]);
  }
};
/* sea ice: out from the coasts and down from the pole in winter, broken into floes as it goes in
   summer; widest about two months after mid-winter, least about two months after mid-summer */
function iceExtent(lp) { return lp == null ? 0.2 : 0.2 + 0.78 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (lp - 0.15))); }
K.seaIced = function (S, i, lp) { return S.kind[i] === 1 && S.iceScore[i] > 1 - iceExtent(lp); };
FX.seaIce = function (f) {
  const S = f.S, E = iceExtent(f.lp), melting = f.lp != null && f.lp > 0.15 && f.lp < 0.65;
  for (let i = 0; i < N; i++) {
    if (S.kind[i] !== 1) continue;
    const m = S.iceScore[i] - (1 - E);
    if (m <= 0) continue;
    const x = i % W, y = (i - x) / W, b = bayer(x, y);
    if (m < 0.06) {
      if (melting) { if (hash(i, 101) > 0.25 + m * 8) continue; put(f, i, hash(i, 102) < 0.5 ? P.ice[2] : P.ice[1]); }
      else { if (b > 0.3 + m * 10) continue; put(f, i, P.ice[0]); }
      continue;
    }
    const v = vnoise(x * 0.35, y * 0.18, 103);
    put(f, i, v > 0.68 ? P.ice[2] : v < 0.3 && b < 0.5 ? P.ice[0] : P.ice[1]);
  }
};

/* ------------------------------------------------------------ storms: rare, set on the calendar, drawn on the wall clock */
/* a storm starts on its date but plays for at least minMs, so it can be seen even when the days fly by */
function events(f, st, sched) {
  if (f.lp == null) { st.active = []; return []; }
  st.active = st.active || [];
  const D = f.day, prev = st.prevD == null ? D : st.prevD;
  if (f.paused) for (const a of st.active) a.born += f.dt;
  if (D < prev || D - prev > 40) {
    st.active = [];
    for (let y = Math.floor(D / 365) - 1; y <= Math.floor(D / 365); y++) for (const e of sched(y)) {
      const abs = y * 365 + e.day;
      if (abs <= D && D < abs + e.dur) st.active.push({ e: e, abs: abs, born: f.now - (D - abs) / e.dur * e.minMs });
    }
  } else {
    for (let y = Math.floor(prev / 365); y <= Math.floor(D / 365); y++) for (const e of sched(y)) {
      const abs = y * 365 + e.day;
      if (prev < abs && abs <= D) st.active.push({ e: e, abs: abs, born: f.now });
    }
  }
  st.prevD = D;
  st.active = st.active.filter(function (a) { a.prog = Math.min((D - a.abs) / a.e.dur, (f.now - a.born) / a.e.minMs); return a.prog < 1; });
  return st.active;
}
/* the season's dates in the place's own year, turned into calendar days */
function onCalendar(S, lp) { return Math.round(wrap(lp + MIDWINTER + (S.south ? 0.5 : 0)) * 365); }
/* tropical cyclones: two or three a year in the late summer and autumn, coming in off the warm sea
   with the trade winds and curving away poleward. Drawn like the winter gales, as weather over the
   map rather than a cloud on it: the land and sea go dark under the storm, whitecaps under it and
   surf on the coast ahead. style "spin" (the default): the wind made visible, streaks of rain and
   spray whirling round and spiralling in to a calm eye (anticlockwise in the north), faster near
   it, a darker eyewall round the eye and the sea washing over the beaches it passes; "mass" (the pick, 2026-10-30): the same surf and beaches, under one
   dark mass, no eye, the rain in slanting lines as in the gales. */
FX.hurricanes = function (f, st, opts) {
  const S = f.S, t = f.t / 1000, mass = opts && opts.style === "mass", hs = S.south ? -1 : 1;
  const list = events(f, st, function (y) {
    const out = [];
    for (let k = 0; k < 3; k++) if (hash(y, k + 11) < 0.8) out.push({ day: onCalendar(S, 0.56 + hash(y, k) * 0.28), dur: 9, minMs: 6000, k: k, y: y });
    return out;
  });
  const dot = function (x, y, col) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) put(f, y * W + x, col); };
  for (const a of list) {
    const p = a.prog, y0 = 40 + hash(a.e.y, a.e.k + 20) * 18;
    const cx = W + 16 - p * (W + 34), cy = y0 - p * p * 34, r = 16 * Math.min(1, Math.sin(Math.PI * p) * 1.6) + 2;
    /* lightning in the storm mass: every so often a strike, the whole storm flashing pale, a forked
       bolt with a yellow glow down to the ground, out, and struck again (as lightning flickers) */
    const n = a.e.y * 3 + a.e.k, slot = t / 0.5 + hash(n, 90), sid = Math.floor(slot), u = slot % 1;
    const strike = mass && r > 6 && hash(n * 31, sid) < 0.5, lit = strike && (u < 0.09 || (u > 0.15 && u < 0.24));
    for (let y = Math.floor(cy - r - 4); y <= cy + r + 4; y++) for (let x = Math.floor(cx - r * 1.3 - 4); x <= cx + r * 1.3 + 4; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x, dx = x - cx, dy = (y - cy) * 1.2;
      const d = Math.hypot(mass ? dx / 1.3 : dx, dy) / r + (vnoise(x * 0.3 - t * 0.8, y * 0.3, 74) - 0.5) * (mass ? 0.3 : 0.15);
      if (d > 1) {
        /* surf thrown up on the coast ahead of it, and in the spinning storm the sea over the beaches */
        if (d < 1.5 && S.kind[i] === 1 && S.toLand[i] <= 2 && hash(i, Math.floor(t * 6)) < 0.5) put(f, i, WHITE);
        else if (d < 1.3 && S.biome[i] === B.sand && hash(i, Math.floor(t * 3)) < 0.6) put(f, i, hash(i, 5) < 0.5 ? P.shallow : P.foam);
        continue;
      }
      if (!mass && d < 0.12) continue;                                /* the eye: calm, clear */
      const band = mass ? 1 - d * 0.5 : d < 0.25 ? 1.25 : 1 - d * 0.55;  /* the eyewall darkest */
      shade(f, i, lit ? 1.3 - 0.2 * d : 0.8 - 0.36 * band * (1 - d * 0.4));
      if (d < 1.3 && S.biome[i] === B.sand) put(f, i, hash(i, Math.floor(t * 3)) < 0.5 ? P.shallow : P.foam);
      else if (mass && band > 0.45 && ((x * 3 + y * hs + Math.floor(t * 16)) % 6 + 6) % 6 === 0) put(f, i, "#9fb8d0");
      else if (S.kind[i] === 1 && hash(i, Math.floor(t * 5)) < (mass ? 0.08 : 0.05)) put(f, i, WHITE);
    }
    if (lit) {
      const pts = [], len = 12 + Math.floor(hash(n, sid + 1) * 7);
      let x = Math.round(cx + (hash(n, sid + 2) - 0.5) * r * 1.4), y = Math.round(cy - r * 0.6 + hash(n, sid + 4) * r * 0.3), dir = hash(n, sid + 3) < 0.5 ? -1 : 1;
      for (let s = 0; s < len; s++, y++) {
        if (hash(n * 7 + s, sid) < 0.45) dir = -dir;
        if (hash(n * 5 + s, sid) < 0.6) x += dir;
        pts.push([x, y]);
        if (s === 4 || s === 9) for (let b = 1, bx = x; b <= 4; b++) { bx -= dir; pts.push([bx, y + b]); }
      }
      for (const q of pts) { dot(q[0] - 1, q[1], "#f3df6a"); dot(q[0] + 1, q[1], "#f3df6a"); }
      for (const q of pts) dot(q[0], q[1], "#ffffff");
      const g = [x, y - 1];
      dot(g[0] - 1, g[1] + 1, "#fff3a0"); dot(g[0] + 1, g[1] + 1, "#fff3a0"); dot(g[0], g[1] + 1, "#ffffff"); dot(g[0], g[1] + 2, "#fff3a0");
    }
    if (mass) continue;
    /* the wind: streaks whirling round, each drawn in from the edge and spiralling in to the eye */
    const ns = Math.round(r * 6);
    for (let s = 0; s < ns; s++) {
      const u = (t * 0.12 + hash(s, 201)) % 1, rho = r * (1 - u * 0.84), th = hash(s, 202) * 6.283 + hs * (t * 1.8 + u * 7 + u * u * 6);
      if (u < 0.08 && hash(s, 203) > u / 0.08) continue;
      for (let q = 2; q >= 0; q--) {
        const a2 = th - hs * q * 0.11 * (1.4 - u * 0.6);
        dot(cx + Math.cos(a2) * rho, cy + Math.sin(a2) * rho / 1.2, q === 0 ? "#e6eef5" : q === 1 ? "#b9cad8" : "#8fa6bb");
      }
    }
  }
};
/* tornadoes (drawn from the side on samples/seasonal-sprites.html, from places): a few in spring and early summer over the open land, each a day or so (at least five
   seconds) wandering east across it, dust and debris whirling at its foot */
FX.tornadoes = function (f, st, opts) {
  const S = f.S, t = f.t / 1000, out = opts && opts.places;
  const list = events(f, st, function (y) {
    const o = [];
    for (let k = 0; k < 4; k++) o.push({ day: onCalendar(S, 0.3 + hash(y, k + 50) * 0.25), dur: 1.5, minMs: 6000, k: k, y: y });
    return o;
  });
  for (const a of list) {
    const p = a.prog, x0 = 30 + hash(a.e.y, a.e.k + 60) * 30, y0 = 42 + hash(a.e.y, a.e.k + 61) * 22;
    const x = x0 + p * 40, y = y0 - p * 10 + Math.sin(p * 9 + a.e.k) * 2.5;
    if (out) out.push({ x: x, y: y, p: p, n: a.e.y * 4 + a.e.k });
    /* dust at its foot, over land; spray over water */
    for (let q = 0; q < 26; q++) {
      const ang = hash(q, 70) * 6.283 + t * 5, rr = 1 + hash(q, 71) * 3.5, px = Math.round(x + Math.cos(ang) * rr * 1.4), py = Math.round(y + Math.sin(ang) * rr * 0.6);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = py * W + px;
      put(f, i, S.kind[i] === 0 ? (hash(q, 72) < 0.5 ? "#8a6a40" : "#a8865a") : WHITE);
    }
  }
};
/* winter gales: fronts sweeping in from the west across the sea, dark with rain (snow where it is cold), whitecaps under them */
FX.gales = function (f, st) {
  const S = f.S, t = f.t / 1000;
  const list = events(f, st, function (y) {
    const out = [];
    for (let k = 0; k < 6; k++) out.push({ day: onCalendar(S, wrap(0.8 + hash(y, k + 30) * 0.38)), dur: 3, minMs: 4000, k: k, y: y });
    return out;
  });
  for (const a of list) {
    const p = a.prog, bend = hash(a.e.y, a.e.k + 40) * 20, fx0 = -20 + p * (W + 40);
    for (let y = 0; y < H; y++) {
      const front = fx0 + Math.sin(y * 0.06 + bend) * 10 + (y - 35) * 0.3 * S.wind;
      for (let x = Math.floor(front - 14); x <= front + 3; x++) {
        if (x < 0 || x >= W) continue;
        const i = y * W + x, d = (front - x) / 14 + (vnoise(x * 0.3, y * 0.3 - t, 73) - 0.5) * 0.3;
        if (d < 0 || d > 1) continue;
        shade(f, i, 0.62 + d * 0.25);
        const cold = S.cold[i] < -2 && Math.abs(sdist(f.lp, 0.04)) < 0.2;
        if (((x * 3 + y + Math.floor(t * 16)) % 6) === 0) put(f, i, cold ? "#ffffff" : "#9fb8d0");
        else if (S.kind[i] === 1 && hash(i, Math.floor(t * 5)) < 0.06) put(f, i, WHITE);
      }
    }
  }
};

/* ------------------------------------------------------------ ambient life */
/* Ships, caravans and boats see the ice and snow coming and make for home before it closes in:
   threat() is 0 when it is far off and climbs to 1 as it arrives (and back down after the thaw);
   they are drawn that share of the way from where they would be to their harbour, town or shore.
   The warning is about 20 days, or 2.5 seconds of playback at the faster speeds, so there is
   always time to see them go. */
function threat(frozen, lp, f) {
  if (lp == null) return frozen(null) ? 1 : 0;
  if (frozen(lp)) return 1;
  const L = Math.min(0.25, Math.max(20, f.speed * 2.5) / 365);
  for (let s = 1; s <= 16; s++) {
    const d = L * s / 16;
    if (frozen(wrap(lp + d)) || frozen(wrap(lp - d))) { const k = 1 - (s - 1) / 16; return k * k * (3 - 2 * k); }
  }
  return 0;
}
function inMap(p) { return p[0] >= 0 && p[0] < W && p[1] >= 0 && p[1] < H; }
function nearTown(S, p, r, port) {
  for (const tw of S.towns) if ((!port || tw.port) && Math.abs(tw.x - p[0]) <= r && Math.abs(tw.y - p[1]) <= r) return true;
  return false;
}
/* the places along a route where they can wait: towns on it, and the ends that run off the map */
function homes(S, route, port) {
  const out = [];
  route.forEach(function (p, k) {
    if (!inMap(p)) { if (k === 0 || k === route.length - 1) out.push(k); return; }
    if (nearTown(S, p, port ? 4 : 2, port) && (!out.length || k - out[out.length - 1] > 3)) out.push(k);
  });
  return out;
}

/* merchant ships to and fro along the trade lanes, a voyage at a time; before the ice closes a lane they make for the nearest harbour on it (or sail off
   the map) and lie there with their sails down until it opens again */
const SHIP = [".s..", ".ss.", "hhhh"], SHIP_COL = { s: "#efe6d6", h: "#7a4a22" };
const MOORED = [".m..", ".m..", "hhhh"], MOORED_COL = { m: "#4e2f16", h: "#7a4a22" };
function sprite(f, rows, cols, x0, y0, flipX, landOk) {
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
    const ch = rows[r][flipX ? rows[r].length - 1 - c : c];
    if (ch === ".") continue;
    const x = x0 + c, y = y0 + r;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (!landOk && f.S.kind[y * W + x] !== 1 && f.S.kind[y * W + x] !== 2) continue;
    put(f, y * W + x, cols[ch]);
  }
}
FX.ships = function (f, st, opts) {
  const S = f.S, t = f.t / 1000, out = opts && opts.places;
  if (!S.laneHomes) S.laneHomes = S.lanes.map(function (l) { return homes(S, l, true); });
  S.lanes.forEach(function (lane, li) {
    const len = lane.length, hs = S.laneHomes[li], sea = lane.filter(function (q) { return inMap(q) && S.kind[q[1] * W + q[0]] === 1; });
    const k = threat(function (lp) { for (const q of sea) if (K.seaIced(S, q[1] * W + q[0], lp)) return true; return false; }, f.lp, f);
    for (let m = 0; m < 3; m++) {
      const speed = 4 + hash(li, m) * 2, pos = t * speed + hash(li, m + 9) * len * 2, voyage = Math.floor(pos / (2 * len));
      let s = pos % (2 * len);
      const back = s >= len; if (back) s = 2 * len - s - 1;
      if (hash(li * 7 + m, voyage) > 0.75) continue;
      let at = s, dir = back ? -1 : 1, moored = false;
      if (k > 0 && hs.length) {
        let home = hs[0];
        for (const h of hs) if (Math.abs(h - s) < Math.abs(home - s)) home = h;
        /* lying in harbour a few pixels out from the quay, one behind the other */
        const into = home < len / 2 ? 1 : -1;
        let berth = home;
        if (inMap(lane[home])) {
          while (berth + into >= 0 && berth + into < len && !(inMap(lane[berth]) && S.kind[lane[berth][1] * W + lane[berth][0]] === 1)) berth += into;
          berth = Math.max(0, Math.min(len - 1, berth + into * (1 + m * 4)));
        }
        at = s + (berth - s) * k; dir = berth >= s ? 1 : -1; moored = k > 0.97;
      }
      const p = lane[Math.max(0, Math.min(len - 1, Math.round(at)))];
      if (!inMap(p)) continue;
      if (out) {
        const nx = lane[Math.max(0, Math.min(len - 1, Math.round(at) + dir))], wk = lane[Math.max(0, Math.min(len - 1, Math.round(at) - dir * 3))];
        out.push({ x: p[0], y: p[1], moored: moored, left: nx[0] - p[0] < 0 || (nx[0] === p[0] && dir < 0), wake: wk, n: li * 3 + m });
        continue;
      }
      if (moored) { sprite(f, MOORED, MOORED_COL, p[0] - 2, p[1] - 2, false, false); continue; }
      const wk = lane[Math.max(0, Math.min(len - 1, Math.round(at) - dir * 3))];
      if (inMap(wk) && S.kind[wk[1] * W + wk[0]] === 1 && Math.floor(t * 4) % 2) put(f, wk[1] * W + wk[0], PALE);
      const nx = lane[Math.max(0, Math.min(len - 1, Math.round(at) + dir))];
      sprite(f, SHIP, SHIP_COL, p[0] - 2, p[1] - 2, nx[0] - p[0] < 0 || (nx[0] === p[0] && dir < 0), false);
    }
  });
};
/* caravans on the roads: camels where the land is dry (desert and steppe, rain under 400 mm), an ox
   cart and riders elsewhere; before snow closes their stretch of road they make for the nearest
   town on it (or off the map) and wait there, bunched up, until it melts */
const CAMEL = [".k.", "kkk", "k.k"], CAMEL_COL = { k: "#c8a060" };
const CART = ["oll", "oww"], CART_COL = { o: "#4e2f16", l: "#d9c08a", w: "#2a1a0e" };
const RIDER = ["m", "m"], RIDER_COL = { m: "#3a2a1a" };
function snowed(S, i, lp) { return lp == null ? snowShare(S, i) >= 0.5 : snowMargin(S, i, lp) > 0.04; }
FX.caravans = function (f, st, opts) {
  const S = f.S, t = f.t / 1000, out = opts && opts.places;
  if (!S.roadHomes) S.roadHomes = S.roads.map(function (r) { return homes(S, r, false); });
  S.roads.forEach(function (road, ri) {
    const len = road.length, hs = S.roadHomes[ri];
    if (!len) return;
    for (let c = 0; c < 2; c++) {
      const speed = 2.2 + hash(ri, c) * 1.2, pos = t * speed + hash(ri, c + 5) * len * 2;
      let s = pos % (2 * len); const back = s >= len; if (back) s = 2 * len - s - 1;
      /* the stretch of road it is on, between two towns (or a town and the end of the road) */
      let a = 0, b = len - 1;
      for (const h of hs) { if (h <= s) a = h; }
      for (let q = hs.length - 1; q >= 0; q--) if (hs[q] >= s) b = hs[q];
      const k = threat(function (lp) { for (let q = a; q <= b; q += 2) { const p = road[q]; if (inMap(p) && snowed(S, p[1] * W + p[0], lp)) return true; } return false; }, f.lp, f);
      const home = s - a <= b - s ? a : b, at = s + (home - s) * k, parked = k > 0.97;
      const dir = k > 0.02 ? (home >= s ? 1 : -1) : back ? -1 : 1;
      for (let m = 0; m < 4; m++) {
        /* bunching up as they arrive; parked, they stand together beside the town */
        const sm = Math.round(at - dir * m * 4 * (1 - k * 0.6));
        if (sm < 0 || sm >= len) continue;
        const p = road[sm];
        if (!inMap(p)) continue;
        const i = p[1] * W + p[0], nx = road[Math.max(0, Math.min(len - 1, sm + dir))];
        const left = nx[0] - p[0] < 0, ox = parked ? (m % 2) * 3 - 1 : 0, oy = parked ? Math.floor(m / 2) * 2 + 1 : 0;
        if (out) { out.push({ x: p[0] + ox, y: p[1] + oy, left: left, kind: S.rain[i] < 400 ? "camel" : m < 2 ? "cart" : "rider", parked: parked, m: m, n: ri * 2 + c }); continue; }
        if (S.rain[i] < 400) sprite(f, CAMEL, CAMEL_COL, p[0] - 1 + ox, p[1] - 2 + oy, left, true);
        else if (m < 2) sprite(f, CART, CART_COL, p[0] - 1 + ox, p[1] - 1 + oy, left, true);
        else sprite(f, RIDER, RIDER_COL, p[0] + ox, p[1] - 1 + oy, false, true);
      }
    }
  });
};
/* fishing boats: off the coasts and on big lakes, out all the time (a day lasts a second at the
   slowest speed, too short for them to come and go without flickering); before the ice reaches the shore they row in and
   are pulled up on it for the winter, and go out again once it has gone (huts: ice fishing on the
   frozen lake meanwhile) */
FX.fishing = function (f, st, opts) {
  const S = f.S, t = f.t / 1000, out = opts && opts.places;
  if (!S.fish) {
    S.fish = [];
    for (let i = 0; i < N; i++) {
      const lake = S.kind[i] === 2 && S.toLand[i] >= 2 && hash(i, 111) < 0.03;
      const sea = S.kind[i] === 1 && S.toLand[i] >= 2 && S.toLand[i] <= 5 && hash(i, 112) < 0.012;
      if (!lake && !sea) continue;
      /* the nearest bit of shore, and the water just off it */
      const x0 = i % W, y0 = (i - x0) / W;
      let best = null, bd = 1e9;
      for (let y = Math.max(0, y0 - 14); y < Math.min(H, y0 + 15); y++) for (let x = Math.max(0, x0 - 14); x < Math.min(W, x0 + 15); x++) {
        const j = y * W + x, d = (x - x0) * (x - x0) + (y - y0) * (y - y0);
        if (S.kind[j] === 0 && d < bd) { bd = d; best = [x, y]; }
      }
      if (!best) continue;
      const n = Math.max(1, Math.round(Math.sqrt(bd)));
      let off = i;
      for (let s = 0; s <= n; s++) { const x = Math.round(x0 + (best[0] - x0) * s / n), y = Math.round(y0 + (best[1] - y0) * s / n), j = y * W + x; if (S.kind[j] === S.kind[i]) off = j; }
      S.fish.push({ i: i, x: x0, y: y0, hx: best[0], hy: best[1], off: off });
    }
  }
  const lakeFrozen = function (j, lp) { const lk = S.lakeK[j]; return lk >= 0 && iceLevel(S.lakeIce[lk], lp == null ? null : wrap(lp + 0.5)) >= Math.min(1, S.lakeD[lk]); };
  const iced = function (j, lp) { return S.kind[j] === 2 ? lakeFrozen(j, lp) : K.seaIced(S, j, lp); };
  for (let k = 0; k < S.fish.length; k++) {
    const b = S.fish[k], i = b.i;
    /* the ice comes from the shore, so they watch the water just off it */
    const th = threat(function (lp) { return iced(b.off, lp) || iced(i, lp); }, f.lp, f);
    if (out) {
      const hut = opts.huts && S.kind[i] === 2 && iced(i, f.lp);
      if (th > 0.97) out.push({ x: b.hx, y: b.hy, beached: true, hut: hut ? [b.x, b.y] : null, n: k });
      else out.push({ x: b.x + (b.hx - b.x) * th + Math.sin(t * 0.3 + k) * 1.5 * (1 - th), y: b.y + (b.hy - b.y) * th, rowing: th > 0, left: b.hx < b.x && th > 0, net: th === 0 && Math.sin(t * 0.9 + k * 3) > 0.7, n: k });
      continue;
    }
    if (th > 0.97) {
      /* pulled up on the shore, keel up */
      put(f, b.hy * W + b.hx, "#4e2f16");
      if (b.hx + 1 < W && S.kind[b.hy * W + b.hx + 1] === 0) put(f, b.hy * W + b.hx + 1, "#6b4a2a");
      if (opts && opts.huts && S.kind[i] === 2 && iced(i, f.lp)) { put(f, i, "#7a4a22"); if (b.x + 1 < W) put(f, i + 1, "#2a3a5a"); }
      continue;
    }
    const sway = Math.round(Math.sin(t * 0.3 + k) * 1.5 * (1 - th));
    const x = Math.round(b.x + (b.hx - b.x) * th) + sway, y = Math.round(b.y + (b.hy - b.y) * th);
    if (x < 0 || x >= W) continue;
    const j = y * W + x;
    put(f, j, "#6b4a2a"); if (x + 1 < W && S.kind[j + 1] !== 0) put(f, j + 1, "#6b4a2a");
    if (y > 0 && th < 0.5) put(f, j - W, "#efe6d6");
    if (th === 0 && Math.sin(t * 0.9 + k * 3) > 0.7 && x + 2 < W && S.kind[j + 2] === S.kind[i]) put(f, j + 2, PALE);
  }
};

K.snowShare = snowShare; K.snowMargin = snowMargin; K.leafTiming = leafTiming; K.wetness = wetness; K.sdist = sdist; K.wrap = wrap;

/* ------------------------------------------------------------ panels */
const SPEEDS = [[1, "1 day/s"], [10, "10 days/s"], [30, "1 month/s"], [91, "1 season/s"], [365, "1 yr/s"],
  [5 * 365, "5 yr/s"], [25 * 365, "25 yr/s"], [50 * 365, "50 yr/s"], [100 * 365, "100 yr/s"]];
function controls(holder, state, onChange) {
  const el = document.createElement("div");
  el.className = "ctl";
  el.innerHTML = '<button type="button" class="play" aria-label="Pause">❚❚</button>' +
    '<input type="range" class="date" min="0" max="364" step="1" aria-label="Date">' +
    '<span class="dname"></span><select class="speed" aria-label="Speed"></select>' +
    '<label class="held"><input type="checkbox"> held</label>';
  const sel = el.querySelector(".speed");
  SPEEDS.forEach(function (s, k) { const o = document.createElement("option"); o.value = k; o.textContent = s[1]; sel.appendChild(o); });
  const play = el.querySelector(".play"), date = el.querySelector(".date"), dn = el.querySelector(".dname"), held = el.querySelector(".held input");
  play.onclick = function () { state.paused = !state.paused; onChange(); };
  date.oninput = function () { state.day = Math.floor(state.day / 365) * 365 + (+date.value); onChange(); };
  sel.onchange = function () { state.speedK = +sel.value; onChange(); };
  held.onchange = function () { state.held = held.checked; onChange(); };
  holder.appendChild(el);
  return function sync() {
    const fast = SPEEDS[state.speedK][0] > 365;
    play.textContent = state.paused ? "▶" : "❚❚"; play.setAttribute("aria-label", state.paused ? "Play" : "Pause");
    date.value = Math.floor(((state.day % 365) + 365) % 365);
    dn.textContent = fast || state.held ? "held" : dateName(state.day);
    sel.value = state.speedK; held.checked = state.held || fast; held.disabled = fast;
  };
}
function query(k) { const m = new RegExp("[?&]" + k + "=([^&]+)").exec(location.search); return m ? decodeURIComponent(m[1]) : null; }

/* scenes: [{ title, note, scene, start (day of the year), draw(f, st), pair (north and south side by side) }] */
K.run = function (SCENES, opts) {
  const grid = document.getElementById("grid"), ONLY = query("only");
  if (ONLY) { grid.classList.add("only"); }
  const dayQ = query("day"), speedQ = query("speed"), heldQ = query("held");
  const panels = [];
  SCENES.forEach(function (sc, n) {
    if (ONLY && n !== +ONLY - 1) return;
    const fig = document.createElement("figure");
    if (sc.pair) fig.className = "pair";
    const names = sc.pair ? [sc.scene, sc.pair] : [sc.scene];
    const views = names.map(function (nm, k) {
      const box = document.createElement("div"); box.className = "view";
      /* with sprites the land is drawn at 3 device pixels a map pixel and the sprites over it at 2,
         about as the app has them zoomed in a little (spriteUnit) */
      const cv = document.createElement("canvas"), SC = sc.sprites ? 3 : 1; cv.width = W * SC; cv.height = H * SC;
      box.appendChild(cv);
      if (sc.pair) { const tag = document.createElement("i"); tag.textContent = k ? "south (pole at the bottom)" : "north (pole at the top)"; box.appendChild(tag); }
      const layer = SC > 1 ? document.createElement("canvas") : cv;
      layer.width = W; layer.height = H;
      return { S: K.scene(nm), g: layer.getContext("2d"), out: cv.getContext("2d"), SC: SC, img: null, box: box, st: {} };
    });
    const row = document.createElement("div"); row.className = "views";
    views.forEach(function (v) { row.appendChild(v.box); v.img = v.g.createImageData(W, H); v.buf = new Uint32Array(v.img.data.buffer); });
    fig.appendChild(row);
    const state = { day: dayQ != null ? +dayQ : sc.start || 0, speedK: speedQ != null ? +speedQ : sc.speed != null ? sc.speed : 2, held: heldQ === "1", paused: false };
    const sync = controls(fig, state, function () { sync(); });
    const cap = document.createElement("figcaption");
    cap.innerHTML = "<b></b><span></span>";
    cap.querySelector("b").textContent = (n + 1) + ". " + sc.title; cap.querySelector("span").textContent = sc.note;
    fig.appendChild(cap); grid.appendChild(fig);
    sync();
    const panel = { sc: sc, views: views, state: state, sync: sync, seen: true };
    /* only the panels in view are drawn (their calendars run on) */
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { panel.seen = es[0].isIntersecting; }).observe(fig);
    panels.push(panel);
  });
  K.panels = panels;
  /* one bar over all panels */
  const all = document.getElementById("all");
  if (all) {
    const shared = { day: dayQ != null ? +dayQ : 0, speedK: speedQ != null ? +speedQ : 2, held: heldQ === "1", paused: false };
    const syncAll = controls(all, shared, function () {
      for (const p of panels) { p.state.day = shared.day; p.state.speedK = shared.speedK; p.state.held = shared.held; p.state.paused = shared.paused; p.sync(); }
      syncAll();
    });
    syncAll();
  }
  let last = performance.now(), lastSync = 0;
  function frame(now) {
    const dt = Math.min(100, now - last); last = now;
    for (const p of panels) {
      const s = p.state, speed = SPEEDS[s.speedK][0];
      if (!s.paused) s.day += speed * dt / 1000;
      if (!p.seen) continue;
      const heldNow = s.held || speed > 365, season = heldNow ? null : wrap(s.day / 365);
      for (const v of p.views) {
        v.buf.set(v.S.base);
        const f = { S: v.S, buf: v.buf, t: now, now: now, dt: dt, day: s.day, speed: speed, season: season, lp: local(season, v.S.south), paused: s.paused };
        p.sc.draw(f, v.st);
        v.g.putImageData(v.img, 0, 0);
        if (v.SC > 1) {
          v.out.imageSmoothingEnabled = false;
          v.out.drawImage(v.g.canvas, 0, 0, W * v.SC, H * v.SC);
          p.sc.sprites(f, v.out, v.SC, v.st);
        }
      }
    }
    if (now - lastSync > 120) { lastSync = now; for (const p of panels) p.sync(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};
})();
