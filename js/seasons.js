/* Seasons and ambient life on the pixel map (Daan's picks, 2026-10-30, from samples/seasons.html and
   samples/seasonal-sprites.html; written up in docs/SEASONS_AND_AMBIENT.md). The land goes through
   the year (snow, autumn woods, golden plains and farm fields, wet and dry seasons, sea ice), the
   sprites with it (trees, pines, peaks, roofs, orchards, sheaves), the weather comes and goes
   (snowfall, the monsoon's rain and lightning, plankton blooms, hurricanes, tornadoes) and the
   small life moves between the events (merchant cogs, fishing boats, caravans), making for home
   before the ice or snow closes in. Everything is decided from what a cell knows (coldC, warmC,
   rainMm, summerRain, biome). The calendar is ui.js's: season is the date's share of the year, 0 on
   the first of January, and null when the years go by faster than one a second; then the map
   keeps its held look and no weather. js/pixelmap.js calls in here. */
(function () {
"use strict";
const AEON = window.AEON = window.AEON || {};
const PPC = 4, MIDWINTER = 0.05;

/* ------------------------------------------------------------ palette (pixelmap.js) and the new ramps */
const P = {
  shallow: "#3570c4", foam: "#a6dbff",
  grassland: ["#4a9438", "#5fae45", "#80c95a"], savanna: ["#949539", "#b0af4a", "#cbc865"],
  ice: ["#b4c5db", "#d3dfed", "#f1f6fc"], snow: ["#c3cddb", "#e3eaf2", "#ffffff"],
};
const R = {
  gold: ["#9c7f22", "#c29d2e", "#dfbd4a"], red: ["#7e2e1a", "#a8432a", "#cf6a32"], russet: ["#6b4424", "#8a5a30", "#a8743c"],
  bare: ["#4e4034", "#665444", "#7d6a55"], leaf: ["#4f9a36", "#6cb848", "#94d466"],
  dormant: ["#5f6e40", "#76824c", "#8c975c"], straw: ["#857a48", "#9c9258", "#b3a86a"], ripe: ["#a49a38", "#c2b148", "#dac862"],
  wheat: ["#c2a03c", "#d8b84e", "#ead06c"], stubble: ["#ad9668", "#c4ac7c", "#d8c290"], plough: ["#5e4630", "#76583a", "#8c6a46"],
  dry: ["#98804a", "#b29a5a", "#c9b26e"], wet: ["#4f8a30", "#6aa43c", "#8ac052"], bloom: ["#2d7d74", "#3f9a8c", "#6cc4ae"],
};
const PALE = "#a6dbff", WHITE = "#e8f4ff", RAIN = "#9fb8d0", TRACK = "#8a6a40";
const INK = "#2a1a0e", SNOW = "#f1f6fc", SNOW_SH = "#c3cddb";

/* the land's biomes as pixelmap.js bakes them, one code a pixel (0: water or river) */
const BIOMES = ["grassland", "forest", "jungle", "savanna", "desert", "swamp", "taiga", "tundra", "ice", "mountain"];
const GRASS = 1, FOREST = 2, JUNGLE = 3, SAVANNA = 4, SWAMP = 6, TAIGA = 7, ICE = 9, MOUNTAIN = 10, BEACH = 20, PEAK_SNOW = 21;
function code(biome) { return BIOMES.indexOf(biome) + 1 || GRASS; }

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
const RGB = {};
function rgb(h) { let c = RGB[h]; if (!c) { const n = parseInt(h.slice(1), 16); c = RGB[h] = [n >> 16, (n >> 8) & 255, n & 255]; } return c; }
const PACKED = {};
function pack(h, a) {
  const key = h + (a == null ? "" : "/" + a);
  let p = PACKED[key];
  if (p === undefined) { const c = rgb(h); p = PACKED[key] = (((a == null ? 255 : a) << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0; }
  return p;
}

/* ------------------------------------------------------------ the calendar */
/* where a place stands in its own year: 0 at its mid-winter, 0.5 at mid-summer (null when held) */
function local(season, south) { return season == null ? null : wrap(season - MIDWINTER + (south ? 0.5 : 0)); }
/* how far lake ice has crept out from the shore, as pixelmap.js has it (ph: 0.5 at mid-winter) */
function iceLevel(share, ph) {
  if (!share) return 0;
  if (ph == null) return share >= 0.5 ? 10 : 0;
  return Math.max(0, Math.min(10, Math.min(ph - (0.5 - share / 2), 0.5 + share / 2 - ph) * 90));
}
/* the season quantised for the caches: a step of a few days, longer the faster the days go, so the
   map is rebuilt at most about eight times a second; "h" when held */
function key(o, minDays) {
  if (!o || o.season == null) return "h";
  const step = Math.max(minDays, (o.speed || 1) / 8);
  return "s" + Math.floor(o.season * 365 / step);
}

/* ------------------------------------------------------------ what each map pixel knows, once per world */
function prepare(c, w) {
  if (c.sea) return c.sea;
  const W = w.width, H = w.height, RG = w.regions, VW = c.VW, VH = c.VH, N = VW * VH, land = c.land, lake = c.lake, cellOf = c.cellOf;
  const sq = w.square, pl = w.planet;
  const southC = new Uint8Array(RG.length);
  for (let k = 0; k < RG.length; k++) southC[k] = (sq && pl ? sq.py0 + (RG[k].y + 0.5) / sq.K >= pl.height / 2 : RG[k].y + 0.5 >= H / 2) ? 1 : 0;
  const val = function (r, k, d) { const v = r[k]; return v == null ? d : v; };
  /* the coldest and warmest month blended between the cells' centres, so the snow's edge curves */
  const bil = function (k, d, fx, fy) {
    const x = fx - 0.5, y = clamp(fy - 0.5, 0, H - 1), x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, y1 = Math.min(y0 + 1, H - 1);
    const e = function (i, j) { return val(RG[j * W + ((i % W) + W) % W], k, d); };
    return (e(x0, y0) * (1 - tx) + e(x0 + 1, y0) * tx) * (1 - ty) + (e(x0, y1) * (1 - tx) + e(x0 + 1, y1) * tx) * ty;
  };
  const cold = new Float32Array(N), warm = new Float32Array(N), snowS = new Float32Array(N), jit = new Float32Array(N), south = new Uint8Array(N);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const i = y * VW + x, fx = (x + 0.5) / PPC, fy = (y + 0.5) / PPC;
    cold[i] = bil("coldC", 10, fx, fy); warm[i] = bil("warmC", 20, fx, fy);
    jit[i] = hash(i, 81); south[i] = southC[cellOf[i]];
    /* the share of the year snow lies: from the coldest month (with the height in it); always where
       the warmest month is below freezing */
    if (land[i]) snowS[i] = warm[i] < 0 ? 1 : cold[i] >= -1 ? 0 : Math.min(0.92, 0.12 - (cold[i] + 1) / 22) * (0.9 + jit[i] * 0.2);
  }
  /* each water pixel's distance to the land (up to 20) */
  const wd = new Uint8Array(N).fill(255), q = new Int32Array(N);
  let n = 0;
  for (let i = 0; i < N; i++) if (land[i]) { wd[i] = 0; q[n++] = i; }
  for (let h = 0; h < n; h++) {
    const i = q[h], x = i % VW, y = (i - x) / VW;
    if (wd[i] >= 20) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ny = y + dy;
      if (ny < 0 || ny >= VH) continue;
      const j = ny * VW + (x + dx + VW) % VW;
      if (wd[j] > wd[i] + 1) { wd[j] = wd[i] + 1; q[n++] = j; }
    }
  }
  /* sea ice: how readily each sea pixel freezes, from its coldest month and the shore */
  const iceScore = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (land[i] || lake[i]) continue;
    const x = i % VW, y = (i - x) / VW, k = (-cold[i] - 8) / 20;
    if (k > 0) iceScore[i] = Math.min(1.2, k) + (wd[i] <= 2 ? 0.1 : wd[i] <= 5 ? 0.05 : 0) + (vnoise(x * 0.15, y * 0.15, 31) - 0.5) * 0.16;
  }
  const lakeK = new Int32Array(N).fill(-1), L = c.water.lakes;
  for (let k = 0; k < L.px.length; k++) lakeK[L.px[k]] = k;
  /* where the weather can happen: plankton on cool coastal sea and off the river mouths; the monsoon
     over summer-rain land; hurricanes on warm open sea; tornadoes over continental plains */
  const plank = [], plankW = [], mon = [], hur = [], tor = [];
  for (let i = 0; i < N; i++) {
    const x = i % VW, y = (i - x) / VW, r = RG[cellOf[i]];
    if (!land[i] && !lake[i]) {
      let wgt = wd[i] >= 2 && warm[i] < 24 ? clamp(1 - (wd[i] - 2) / 16, 0, 1) : 0;
      if (wd[i] >= 2) for (const m of c.water.mouths) {
        let dx = Math.abs(x - m[0]); if (dx > VW / 2) dx = VW - dx;
        if (dx < 16) wgt = Math.max(wgt, clamp(1 - Math.hypot(dx, y - m[1]) / 16, 0, 1));
      }
      if (wgt > 0) { plank.push(i); plankW.push(wgt); }
      if (wd[i] >= 4 && warm[i] >= 27 && cold[i] >= 20 && hash(i, 85) < 0.2) hur.push(i);
      continue;
    }
    if (!land[i] || !c.pxB[i]) continue;
    const b = c.pxB[i], sum = val(r, "summerRain", 0.5);
    if ((b === SAVANNA || b === JUNGLE || b === GRASS) && sum >= 0.55 && cold[i] >= 8) mon.push(i);
    if ((b === GRASS || b === SAVANNA) && cold[i] >= -18 && cold[i] <= 8 && warm[i] >= 16 && hash(i, 86) < 0.2) tor.push(i);
  }
  c.sea = {
    cold: cold, warm: warm, snowS: snowS, jit: jit, south: south, wd: wd, iceScore: iceScore, lakeK: lakeK,
    plank: Int32Array.from(plank), plankW: Float32Array.from(plankW), mon: Int32Array.from(mon), hur: Int32Array.from(hur), tor: Int32Array.from(tor),
    iced: new Uint8Array(N), hasIce: false, layer: null, st: { hur: {}, tor: {}, looks: {} },
  };
  return c.sea;
}

/* the snow at a pixel: how deep into its snow season (above 0: lying), peaking a few weeks after mid-winter */
function snowMargin(S, i, season) {
  const s = S.snowS[i];
  if (season == null) return s >= 0.5 ? 0.1 : -1;
  return s ? s / 2 - Math.abs(sdist(local(season, S.south[i]), 0.04)) : -1;
}
/* sea ice: out from the coasts and down from the pole in winter, broken into floes on the way out;
   widest about two months after mid-winter, least about two months after mid-summer */
function iceExtent(lp) { return lp == null ? 0.2 : 0.2 + 0.78 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (lp - 0.15))); }
function seaIced(S, i, season) { return S.iceScore[i] > 1 - iceExtent(local(season, S.south[i])); }
/* broadleaf woods: the colder the earlier they turn in autumn and the later they leaf in spring */
function leafTiming(cold, jit) {
  const c = -clamp(cold * 0.004, -0.03, 0.05);
  return { turn: 0.66 + jit * 0.05 - c, out: 0.27 + jit * 0.03 + c };
}
/* the wet season: 0 through the dry, 1 through the rains */
function wetness(lp) {
  if (lp < 0.36) return 0;
  if (lp < 0.48) return (lp - 0.36) / 0.12;
  if (lp < 0.72) return 1;
  if (lp < 0.92) return 1 - (lp - 0.72) / 0.2;
  return 0;
}

/* ------------------------------------------------------------ farm fields round the settlements, per year */
/* a patchwork of fields 7 by 5 pixels, each row of them shifted its own way, each field with its own
   crop, its own few days' lead and its rows running across or down it; a track here and there */
function fieldAt(x, y) {
  const band = Math.floor(y / 5), off = Math.floor(hash(band, 5) * 7), fx = x + off, col = Math.floor(fx / 7);
  const edge = fx % 7 === 0 ? 1 : y % 5 === 0 ? (hash(band, 8) < 0.35 ? 2 : 1) : 0;
  return { id: col * 97 + band + 1, edge: edge, cx: col * 7 + 3.5 - off, cy: band * 5 + 2.5 };
}
function farmBase(id, s, l) {
  const k = hash(id, 3);
  return k < 0.3 ? P.grassland[l] : k < 0.55 ? P.savanna[s ? 2 : 1] : k < 0.8 ? P.grassland[s ? 2 : 1] : P.grassland[s ? 1 : 0];
}
const FIELDS = new WeakMap();
/* temperate grassland round each settlement standing in the shown year (wider round the bigger
   ones); fid: the field's id per pixel (0 none), and where the sheaves stand on the cornfields */
function fieldsOf(c, w) {
  let F = FIELDS.get(w);
  if (F) return F;
  const S = c.sea, RG = w.regions, VW = c.VW, VH = c.VH, fid = new Int32Array(VW * VH), track = new Uint8Array(VW * VH), stooks = [];
  for (const r of RG) {
    if (!r.settlement || r.owner == null || r.barren) continue;
    const rad = 4 + Math.min(3, r.settlement.tier || 1) * 2.5, cx = r.x * PPC + PPC / 2, cy = r.y * PPC + PPC / 2;
    for (let y = Math.max(0, Math.floor(cy - rad - 5)); y <= Math.min(VH - 1, cy + rad + 5); y++)
      for (let xx = Math.floor(cx - rad - 7); xx <= cx + rad + 7; xx++) {
        const x = ((xx % VW) + VW) % VW, i = y * VW + x, b = c.pxB[i];
        if (fid[i] || !c.land[i] || (b !== GRASS && b !== SAVANNA) || S.cold[i] < -12 || S.cold[i] > 12) continue;
        const rr = RG[c.cellOf[i]];
        if ((rr.rainMm || 0) < 300 || (b === SAVANNA && (rr.summerRain || 0) >= 0.55 && S.cold[i] >= 8)) continue;
        const fa = fieldAt(xx, y), dx = fa.cx - cx, dy = fa.cy - cy;
        if (dx * dx + dy * dy * 1.6 >= rad * rad || hash(fa.id, 6) >= 0.85) continue;
        fid[i] = fa.id; track[i] = fa.edge === 2 ? 1 : 0;
        if (!track[i] && hash(fa.id, 3) >= 0.3 && hash(fa.id, 3) < 0.8 && x % 3 === 1 && y % 2 === 1 && hash(i, 301) < 0.45) stooks.push(i);
      }
  }
  F = { fid: fid, track: track, stooks: stooks };
  FIELDS.set(w, F);
  return F;
}

/* ------------------------------------------------------------ the ground through the year (compose) */
const PLAINS_YEAR = [[0, "dormant"], [0.18, "dormant"], [0.3, "leaf"], [0.42, "leaf"], [0.5, "own"], [0.56, "own"], [0.64, "ripe"],
  [0.72, "ripe"], [0.84, "straw"], [0.97, "dormant"], [1.01, "dormant"]];
function mix(a, b, k, x, y, l) { return bayer(x, y) < k ? b[l] : a[l]; }
/* the field's colour on its day: ploughed (dark and light furrows), sprouting, green, golden,
   stubble, ploughed again; pasture as the grass; held, the field's own green or gold */
function fieldColour(id, stripe, l, q, x, y) {
  if (q == null) return farmBase(id, stripe, l);
  const fj = hash(id, 4) * 0.05, crop = hash(id, 3) < 0.8 ? R.wheat : R.ripe, fl = stripe ? 2 : 0, gl = stripe ? 2 : 1;
  if (q < 0.2 + fj || q >= 0.8 + fj) return R.plough[fl];
  if (q < 0.3 + fj) return mix(R.plough, R.leaf, (q - 0.2 - fj) / 0.1, x, y, gl);
  if (q < 0.42 + fj) return R.leaf[gl];
  if (q < 0.52 + fj) return P.grassland[gl];
  if (q < 0.6 + fj) return mix(P.grassland, crop, (q - 0.52 - fj) / 0.08, x, y, gl);
  if (q < 0.65 + fj) return crop[gl];
  if (q < 0.72 + fj) return R.stubble[gl];
  return mix(R.stubble, R.plough, (q - 0.72 - fj) / 0.08, x, y, fl);
}
/* grassland through the year by keyframes, each step dithered into the next: dormant in winter, a
   fresh green in spring, ripening gold in late summer (the drier, the more of it), fading to straw
   and back to the winter's dull green as slowly as it came */
function plainsColour(own, ripeHere, l, q, x, y) {
  let a = PLAINS_YEAR.length - 2;
  while (a > 0 && PLAINS_YEAR[a][0] > q) a--;
  const A = PLAINS_YEAR[a], B = PLAINS_YEAR[a + 1], k = (q - A[0]) / (B[0] - A[0]);
  const ramp = function (r) { return r === "own" ? own : r === "ripe" ? (ripeHere ? R.ripe : own) : R[r]; };
  return mix(ramp(A[1]), ramp(B[1]), k, x, y, l);
}
/* broadleaf woods: green, then gold, red or russet tree by tree, bare through the winter, a fresh
   green in spring; the odd conifer stays green */
function autumnColour(i, cold, jit, l, q, x, y) {
  const sp = hash(i, 82);
  if (sp < 0.12) return null;
  const tm = leafTiming(cold, jit), ramp = sp < 0.5 ? R.gold : sp < 0.8 ? R.red : R.russet, bb = bayer(x, y);
  if (q >= tm.turn) {
    const k = (q - tm.turn) / 0.14;
    if (k < 0.25) return bb < k * 4 ? ramp[l] : null;
    if (k < 0.7) return ramp[l];
    if (k < 1) return bb < (k - 0.7) / 0.3 ? R.bare[l] : ramp[l];
    return R.bare[l];
  }
  if (q < tm.out) return R.bare[l];
  if (q < tm.out + 0.07) return bb < (q - tm.out) / 0.03 ? R.leaf[l] : R.bare[l];
  return null;
}
/* d: the frame's RGBA, from the baked terrain, before the realms' tint; marks the iced sea for the
   animation (no surf or glints on it) */
function ground(c, w, d, season) {
  const S = prepare(c, w), F = fieldsOf(c, w), RG = w.regions, VW = c.VW, N = VW * c.VH, pxB = c.pxB, pxL = c.pxL;
  const iced = S.iced;
  iced.fill(0); S.hasIce = false;
  const put = function (i, h) { const q = rgb(h); d[i * 4] = q[0]; d[i * 4 + 1] = q[1]; d[i * 4 + 2] = q[2]; };
  const held = season == null, lpN = local(season, false), lpS = local(season, true), EN = iceExtent(lpN), ES = iceExtent(lpS);
  const melt = function (lp) { return lp != null && lp > 0.15 && lp < 0.65; };
  for (let i = 0; i < N; i++) {
    const x = i % VW, y = (i - x) / VW, b = pxB[i];
    if (!c.land[i]) {
      if (c.lake[i]) continue;
      /* sea ice */
      const sc = S.iceScore[i];
      if (!sc) continue;
      const lp = S.south[i] ? lpS : lpN, m = sc - (1 - (S.south[i] ? ES : EN));
      if (m <= 0) continue;
      const bb = bayer(x, y);
      if (m < 0.06) {
        if (melt(lp)) { if (hash(i, 101) > 0.25 + m * 8) continue; put(i, hash(i, 102) < 0.5 ? P.ice[2] : P.ice[1]); }
        else { if (bb > 0.3 + m * 10) continue; put(i, P.ice[0]); }
      } else {
        const v = vnoise(x * 0.35, y * 0.18, 103);
        put(i, v > 0.68 ? P.ice[2] : v < 0.3 && bb < 0.5 ? P.ice[0] : P.ice[1]);
      }
      iced[i] = 1; S.hasIce = true;
      continue;
    }
    if (!b) continue;                                              /* rivers */
    const l = pxL[i], lp = held ? null : S.south[i] ? lpS : lpN, cold = S.cold[i];
    let col = null;
    if (F.fid[i]) col = F.track[i] ? TRACK : hash(F.fid[i], 3) < 0.3 ? (lp == null ? P.grassland[l] : plainsColour(P.grassland, true, l, lp, x, y))
      : fieldColour(F.fid[i], ((hash(F.fid[i], 9) < 0.5 ? y : x) % 2), l, lp, x, y);
    else if (lp != null && b !== BEACH && b !== PEAK_SNOW) {
      const r = RG[c.cellOf[i]], sum = r.summerRain == null ? 0.5 : r.summerRain;
      if (b === FOREST) { if (cold >= -12 && cold <= 9) col = autumnColour(i, cold, S.jit[i], l, lp, x, y); }
      else if ((b === SAVANNA || b === JUNGLE) && sum >= 0.55 && cold >= 8) {
        const g = wetness(lp);
        if (b === JUNGLE) { if (g < 0.3 && bayer(x, y) < 0.25 * (1 - g)) col = P.savanna[0]; }
        else col = mix(R.dry, R.wet, g, x, y, l);
      } else if ((b === GRASS || b === SAVANNA) && cold <= 12)
        col = plainsColour(b === GRASS ? P.grassland : P.savanna, hash(i, 88) < clamp((900 - (r.rainMm || 0)) / 500, 0.35, 1), l, lp, x, y);
    }
    /* snow, patchy at its edge; the woods stand dark through it */
    if (b !== ICE && b !== PEAK_SNOW && S.snowS[i]) {
      const m = snowMargin(S, i, season), bb = bayer(x, y);
      if (m > 0 && !(m < 0.025 && bb > m / 0.025) && !((b === FOREST || b === TAIGA || b === JUNGLE || b === SWAMP) && bb > 0.55))
        col = P.snow[b === MOUNTAIN ? l : Math.min(2, l + 1)];
    }
    if (col) put(i, col);
  }
}

/* ------------------------------------------------------------ storms: rare, set on the calendar, drawn on the wall clock */
/* a storm starts on its date but plays for at least minMs, so it can be seen even when the days fly
   by; while the calendar stands still (paused) it waits */
function events(st, o, sched) {
  st.active = st.active || [];
  const D = o.day, prev = st.prevD == null ? D : st.prevD, now = o.time;
  if (st.prevT != null && D === prev) for (const a of st.active) a.born += now - st.prevT;
  st.prevT = now;
  if (D < prev || D - prev > 40 || st.prevD == null) {
    st.active = [];
    for (let y = Math.floor(D / 365) - 1; y <= Math.floor(D / 365); y++) for (const e of sched(y)) {
      const abs = y * 365 + e.day;
      if (abs <= D && D < abs + e.dur) st.active.push({ e: e, abs: abs, born: now - (D - abs) / e.dur * e.minMs });
    }
  } else {
    for (let y = Math.floor(prev / 365); y <= Math.floor(D / 365); y++) for (const e of sched(y)) {
      const abs = y * 365 + e.day;
      if (prev < abs && abs <= D) st.active.push({ e: e, abs: abs, born: now });
    }
  }
  st.prevD = D;
  st.active = st.active.filter(function (a) { a.prog = Math.min((D - a.abs) / a.e.dur, (now - a.born) / a.e.minMs); return a.prog < 1; });
  return st.active;
}
/* a date in a place's own year (0: its mid-winter), as a day of the calendar year */
function onCalendar(south, lp) { return Math.round(wrap(lp + MIDWINTER + (south ? 0.5 : 0)) * 365); }

/* ------------------------------------------------------------ the weather, each frame, at map resolution */
function weather(ctx, c, w, v, X0, o) {
  const S = prepare(c, w), VW = c.VW, VH = c.VH, N = VW * VH, season = o.season;
  if (!S.layer) {
    S.layer = document.createElement("canvas"); S.layer.width = VW; S.layer.height = VH;
    S.img = S.layer.getContext("2d").createImageData(VW, VH);
    S.buf = new Uint32Array(S.img.data.buffer); S.set = [];
  }
  const buf = S.buf, set = S.set, had = set.length;
  for (let k = 0; k < set.length; k++) buf[set[k]] = 0;
  set.length = 0;
  S.places = [];
  if (season == null || o.day == null) {
    S.st.hur.active = []; S.st.tor.active = [];
    if (had) { S.layer.getContext("2d").putImageData(S.img, 0, 0); }
    return;
  }
  const t = o.time / 1000;
  const put = function (i, h) { buf[i] = pack(h); set.push(i); };
  /* darker (k < 1) or lit up (k > 1): a veil over what is under it */
  const shade = function (i, k) { buf[i] = k < 1 ? pack("#000000", Math.round((1 - k) * 255)) : pack("#ffffff", Math.round(Math.min(0.55, (k - 1) * 1.4) * 255)); set.push(i); };
  const at = function (x, y) { x = Math.round(x); y = Math.round(y); return y < 0 || y >= VH ? -1 : y * VW + ((x % VW) + VW) % VW; };
  const dot = function (x, y, h) { const i = at(x, y); if (i >= 0) put(i, h); };
  const lpN = local(season, false), lpS = local(season, true);

  /* phytoplankton: green-turquoise swirls on cool coastal sea and off the river mouths in spring and
     early summer, a smaller bloom in autumn, slowly turning (worked out four times a second) */
  const bloomEnv = function (q) { return Math.max(Math.max(0, 1 - Math.abs(q - 0.33) / 0.11), 0.45 * Math.max(0, 1 - Math.abs(q - 0.74) / 0.05)); };
  const eN = bloomEnv(lpN), eS = bloomEnv(lpS);
  if ((eN > 0 || eS > 0) && S.plank.length) {
    const tick = Math.floor(t * 4);
    if (S.plankTick !== tick || S.plankKey !== season) {
      S.plankTick = tick; S.plankKey = season;
      const out = S.plankOut || (S.plankOut = []);
      out.length = 0;
      const tt = tick / 4;
      for (let k = 0; k < S.plank.length; k++) {
        const i = S.plank[k];
        if (S.iced[i]) continue;
        const env = S.south[i] ? eS : eN;
        if (!env) continue;
        const x = i % VW, y = (i - x) / VW;
        const m = vnoise(x * 0.12 + Math.sin(y * 0.15 + tt * 0.2) * 0.9 + tt * 0.04, y * 0.2 + Math.cos(x * 0.1 - tt * 0.15) * 0.7, 41) * S.plankW[k] * env - 0.22;
        if (m <= 0 || (m < 0.06 && bayer(x, y) > m / 0.06)) continue;
        out.push(i, m > 0.22 ? 2 : m > 0.1 ? 1 : 0);
      }
    }
    for (let k = 0; k < S.plankOut.length; k += 2) put(S.plankOut[k], R.bloom[S.plankOut[k + 1]]);
  }

  /* snowfall: flakes in bursts where the snow is building (from its first day to a little past
     mid-winter), drifting east */
  const nf = Math.min(20000, Math.round(N * 0.03));
  for (let k = 0; k < nf; k++) {
    const sp = 6 + hash(k, 2) * 5, y = Math.floor(((hash(k, 1) * (VH + 6) + t * sp) % (VH + 6)) - 3);
    if (y < 0 || y >= VH) continue;
    const x = Math.floor((((hash(k, 3) * VW + t * sp * 0.6 + Math.sin(t * 1.3 + k) * 1.2) % VW) + VW) % VW), i = y * VW + x, s = S.snowS[i];
    if (!s) continue;
    const d = sdist(S.south[i] ? lpS : lpN, 0.04);
    if (d < -s / 2 - 0.03 || d > s / 6) continue;
    if (hash(k, Math.floor(t / 3)) > 0.35 + vnoise(t * 0.25, x * 0.02, 71) * 0.65) continue;
    put(i, hash(k, 5) < 0.5 ? "#ffffff" : P.snow[1]);
  }

  /* the monsoon: rain cells drifting over the summer-rain land through the rains, darkening it, and
     lightning: now and then the whole cloud flashes, a forked bolt with a yellow glow runs down to
     the ground, goes out and strikes again */
  const rainEnv = function (q) { return q < 0.36 || q > 0.74 ? 0 : Math.sin((q - 0.36) / 0.38 * Math.PI); };
  const gN = rainEnv(lpN), gS = rainEnv(lpS);
  if ((gN > 0 || gS > 0) && S.mon.length) {
    const nc = clamp(Math.round(S.mon.length / 800), 1, 40);
    for (let k = 0; k < nc; k++) {
      const cyc = Math.floor(t / 9 + hash(k, 1)), life = (t / 9 + hash(k, 1)) % 1;
      const pi = S.mon[Math.floor(hash(k, cyc) * S.mon.length)], g = S.south[pi] ? gS : gN;
      if (hash(k, cyc + 5) > g) continue;
      const cx = pi % VW - 9 + life * 18, cy = (pi - pi % VW) / VW + 5 - life * 10, r = 7 + hash(k, cyc + 3) * 6;
      const env = Math.sin(life * Math.PI), slot = t / 0.7 + hash(k, 9), u = slot % 1, sid = Math.floor(slot);
      const strike = env > 0.5 && hash(k * 31, sid) < 0.3, bolt = strike && (u < 0.07 || (u > 0.13 && u < 0.2)), glow = strike && u < 0.3;
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r * 1.4); x <= cx + r * 1.4; x++) {
        const i = at(x, y);
        if (i < 0) continue;
        const dd = Math.hypot((x - cx) / 1.4, y - cy) / r + (vnoise(x * 0.3, y * 0.3 + t, 72) - 0.5) * 0.5;
        if (dd > env) continue;
        if (bolt) { shade(i, 1.45); continue; }
        if (hash(i, Math.floor(t * 10)) < 0.07 || hash(i - VW - 1, Math.floor(t * 10)) < 0.07) put(i, RAIN);
        else shade(i, glow ? 0.95 : 0.78);
      }
      if (bolt) {
        const pts = [], len = 11 + Math.floor(hash(k, sid + 1) * 5);
        let x = Math.round(cx + (hash(k, sid + 2) - 0.5) * r), y = Math.round(cy - r * 0.6), dir = hash(k, sid + 3) < 0.5 ? -1 : 1;
        for (let s = 0; s < len; s++, y++) {
          if (hash(k * 7 + s, sid) < 0.45) dir = -dir;
          if (hash(k * 5 + s, sid) < 0.6) x += dir;
          pts.push([x, y]);
          if (s === 4) for (let b = 1, bx = x; b <= 4; b++) { bx -= dir; pts.push([bx, y + b]); }
        }
        for (const p of pts) { dot(p[0] - 1, p[1], "#f3df6a"); dot(p[0] + 1, p[1], "#f3df6a"); }
        for (const p of pts) dot(p[0], p[1], "#ffffff");
        const gp = pts[len + 3] || pts[pts.length - 1];
        dot(gp[0] - 1, gp[1] + 1, "#fff3a0"); dot(gp[0] + 1, gp[1] + 1, "#fff3a0"); dot(gp[0], gp[1] + 1, "#ffffff");
      }
    }
  }

  /* hurricanes: two or three a year on each warm sea in late summer and autumn, the storm going over
     (Daan, 2026-10-30): one dark mass moving in off the sea and curving away poleward, rain driven
     before it in slanting lines, whitecaps under it, surf on the coast ahead and the sea washing
     over the beaches it passes; lightning: big strikes (the whole storm flashing pale, a long
     forked bolt with a yellow glow, struck again) and small short bolts between them */
  if (S.hur.length) {
    const list = events(S.st.hur, o, function (y) {
      const out = [], n = clamp(Math.round(S.hur.length / 1200), 2, 4);
      for (let k = 0; k < n; k++) {
        if (hash(y, k + 11) >= 0.8) continue;
        const pi = S.hur[Math.floor(hash(y * 13 + k, 12) * S.hur.length)], south = S.south[pi];
        out.push({ day: onCalendar(south, 0.56 + hash(y, k) * 0.28), dur: 9, minMs: 6000, k: k, y: y, x0: pi % VW, y0: (pi - pi % VW) / VW, hs: south ? -1 : 1 });
      }
      return out;
    });
    for (const a of list) {
      const e = a.e, p = a.prog, hs = e.hs;
      const cx = e.x0 + 60 - p * 120, cy = e.y0 - hs * p * p * 34, r = 18 * Math.min(1, Math.sin(Math.PI * p) * 1.6) + 2;
      const n = e.y * 7 + e.k, slot = t / 0.5 + hash(n, 90), sid = Math.floor(slot), u = slot % 1;
      const strike = r > 6 && hash(n * 31, sid) < 0.5, lit = strike && (u < 0.09 || (u > 0.15 && u < 0.24));
      for (let y = Math.floor(cy - r - 4); y <= cy + r + 4; y++) for (let x = Math.floor(cx - r * 1.3 - 4); x <= cx + r * 1.3 + 4; x++) {
        const i = at(x, y);
        if (i < 0) continue;
        const sea = !c.land[i] && !c.lake[i], beach = c.pxB[i] === BEACH;
        const d = Math.hypot((x - cx) / 1.3, (y - cy) * 1.2) / r + (vnoise(x * 0.3 - t * 0.8, y * 0.3, 74) - 0.5) * 0.3;
        if (d > 1) {
          if (d < 1.5 && sea && S.wd[i] <= 2 && hash(i, Math.floor(t * 6)) < 0.5) put(i, WHITE);
          else if (d < 1.3 && beach && hash(i, Math.floor(t * 3)) < 0.6) put(i, hash(i, 5) < 0.5 ? P.shallow : P.foam);
          continue;
        }
        const band = 1 - d * 0.5;
        if (beach) put(i, hash(i, Math.floor(t * 3)) < 0.5 ? P.shallow : P.foam);
        else if (band > 0.45 && ((x * 3 + y * hs + Math.floor(t * 16)) % 6 + 6) % 6 === 0) put(i, lit ? "#dfe8f0" : RAIN);
        else if (sea && hash(i, Math.floor(t * 5)) < 0.08) put(i, WHITE);
        else shade(i, lit ? 1.3 - 0.2 * d : 0.8 - 0.36 * band * (1 - d * 0.4));
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
        dot(x - 1, y, "#fff3a0"); dot(x + 1, y, "#fff3a0"); dot(x, y, "#ffffff"); dot(x, y + 1, "#fff3a0");
      }
      if (r > 6) for (let q = 0; q < 3; q++) {
        const sl = t / 0.3 + hash(n, q + 100), si = Math.floor(sl);
        if (sl % 1 > 0.12 || hash(n * 13 + q, si) > 0.5) continue;
        let x = Math.round(cx + (hash(q, si + 5) - 0.5) * r * 1.8), y = Math.round(cy + (hash(q, si + 6) - 0.6) * r * 1.2);
        for (let yy = y - 3; yy <= y + 9; yy++) for (let xx = x - 4; xx <= x + 4; xx++) {
          const i = at(xx, yy);
          if (i >= 0 && Math.hypot(xx - x, (yy - y - 3) * 0.8) < 4.5) shade(i, 1.25);
        }
        const len = 4 + Math.floor(hash(q, si + 7) * 4);
        for (let s = 0; s < len; s++, y++) { if (hash(q * 11 + s, si) < 0.5) x += hash(q * 3 + s, si) < 0.5 ? -1 : 1; dot(x, y, s === len - 1 ? "#fff3a0" : "#ffffff"); }
      }
    }
  }

  /* tornadoes: a few a year in spring and early summer over the continental plains, each a day or so
     (at least six seconds) wandering east; dust and debris at its foot (spray over water); the
     funnel is drawn over the sprites (sky) */
  if (S.tor.length) {
    const list = events(S.st.tor, o, function (y) {
      const out = [], n = clamp(Math.round(S.tor.length / 400), 3, 10);
      for (let k = 0; k < n; k++) {
        const pi = S.tor[Math.floor(hash(y * 17 + k, 52) * S.tor.length)];
        out.push({ day: onCalendar(S.south[pi], 0.3 + hash(y, k + 50) * 0.25), dur: 1.5, minMs: 6000, k: k, y: y, x0: pi % VW, y0: (pi - pi % VW) / VW });
      }
      return out;
    });
    for (const a of list) {
      const e = a.e, p = a.prog, x = e.x0 + p * 40, y = e.y0 - p * 10 + Math.sin(p * 9 + e.k) * 2.5;
      S.places.push({ x: x, y: y, p: p, n: e.y * 16 + e.k });
      for (let q = 0; q < 26; q++) {
        const ang = hash(q, 70) * 6.283 + t * 5, rr = 1 + hash(q, 71) * 3.5, i = at(x + Math.cos(ang) * rr * 1.4, y + Math.sin(ang) * rr * 0.6);
        if (i >= 0) put(i, c.land[i] && c.pxB[i] ? (hash(q, 72) < 0.5 ? "#8a6a40" : "#a8865a") : WHITE);
      }
    }
  }

  if (set.length || had) S.layer.getContext("2d").putImageData(S.img, 0, 0);
  if (set.length) ctx.drawImage(S.layer, X0, v.Y0, VW * v.P, VH * v.P);
}

/* ------------------------------------------------------------ sprites, drawn from a cache per palette and unit */
let lib = null;                                  /* pixelmap.js's sprites and blit (setup) */
let sid = 0;
const IMG = new Map();
function sprite(rows, pal) { return { rows: rows, pal: pal, w: rows[0].length, h: rows.length }; }
function over(o) { o._id = "o" + sid++; return o; }
function image(sp, ov, u, flip) {
  if (sp._id == null) sp._id = sid++;
  if (ov && ov._id == null) ov._id = "o" + sid++;
  const k = sp._id + "|" + (ov ? ov._id : "") + "|" + u + (flip ? "f" : "");
  let cv = IMG.get(k);
  if (!cv) {
    if (IMG.size > 3000) IMG.clear();
    cv = document.createElement("canvas"); cv.width = sp.w * u; cv.height = sp.h * u;
    const g = cv.getContext("2d");
    for (let j = 0; j < sp.h; j++) for (let i = 0; i < sp.w; i++) {
      const ch = sp.rows[j][flip ? sp.w - 1 - i : i];
      if (ch === ".") continue;
      g.fillStyle = (ov && ov[ch]) || sp.pal[ch];
      g.fillRect(i * u, j * u, u, u);
    }
    IMG.set(k, cv);
  }
  return cv;
}
let SP = null;
/* the seasonal sprites, made once pixelmap.js has handed over its own */
function sprites() {
  if (SP || !lib) return SP;
  const TREE = lib.TREE, PEAK = lib.PEAK, ROOF = lib.ROOF;
  SP = {
    TREE_THIN: sprite([".k.k.", "kg.lk", ".gkg.", ".kbk."], TREE.pal),
    TREE_BARE: sprite(["b.b.b", ".bbb.", "..b..", ".kbk."], { k: "#13361b", b: "#5a4030" }),
    TREE_BARE_SNOW: sprite(["w.w.w", ".bwb.", "..b..", ".kbk."], { k: "#13361b", b: "#5a4030", w: SNOW }),
    TREE_BUD: sprite(["g.g.g", ".bgb.", "..b..", ".kbk."], { k: "#13361b", b: "#5a4030", g: "#7cc050" }),
    PINE_SNOW: sprite(["..w..", ".kwk.", ".kgk.", "kwgwk", ".kbk."], { k: "#14301f", g: "#2f6e45", b: "#5a3d22", w: SNOW }),
    PINE_DEEP: sprite(["..w..", ".kwk.", ".wgw.", "kwwwk", ".kbk."], { k: "#14301f", g: "#2f6e45", b: "#5a3d22", w: SNOW }),
    OTREE: sprite([".kkk.", "kglgk", ".kgk.", "..b.."], { k: "#13361b", g: "#3a8f42", l: "#6cc160", b: "#5a3d22" }),
    OTREE_BARE: sprite(["b.b.b", ".bbb.", "..b..", "..b.."], { b: "#5a4030" }),
    OTREE_BUD: sprite(["p.p.p", ".bpb.", "..b..", "..b.."], { b: "#5a4030", p: "#e7a9bc" }),
    OTREE_SNOW: sprite(["w.w.w", ".bwb.", "..b..", "..b.."], { b: "#5a4030", w: SNOW }),
    STOOK: sprite([".k.", "kyk", "kyk"], { k: "#7a5a22", y: "#e0c060" }),
    /* a small trading cog (sail up, or furled in harbour), a fishing boat with its sail, a boat
       pulled up keel up; camels, an ox cart and a rider on a mule */
    COG: sprite(["...k...", "..kcc..", "..kccd.", "..kcdd.", "k..k..k", "kbbbbbk", ".kkkkk."], Object.assign({ c: "#efe6d6", d: "#c9bc9a" }, ROOF)),
    COG_MOORED: sprite(["...k...", "...k...", "..kck..", "...k...", "k..k..k", "kbbbbbk", ".kkkkk."], Object.assign({ c: "#efe6d6" }, ROOF)),
    FISHER: sprite(["..k..", "..kc.", "..kcc", "kbbbk", ".kkk."], Object.assign({ c: "#efe6d6" }, ROOF)),
    ROWBOAT: lib.ROWBOAT,
    KEEL_UP: sprite([".kkk.", "kbbbk"], ROOF),
    CAMEL: sprite(["..k....", ".kck..k", "kccckkc", "kcccck.", ".k..k.."], { k: INK, c: "#c8a060" }),
    CART: sprite(["kkkk....", "kllk.kk.", "kllkkook", ".kk.kook", ".kwk.k.k"], { k: INK, l: "#d9c08a", o: "#7a4a22", w: "#4e2f16" }),
    RIDER: sprite([".m..", ".m..", "kook", "kook", "k..k"], { k: INK, m: "#3a5a8a", o: "#6b5a4a" }),
    PEAK_SNOW: [null],
  };
  /* the peak whiter down its slope, a row at a time */
  for (let n = 1; n <= 5; n++) SP.PEAK_SNOW.push(sprite(PEAK.rows.map(function (r, j) { return j < 2 + n ? r.replace(/l/g, "w").replace(/d/g, "s") : r; }), Object.assign({ s: SNOW_SH }, PEAK.pal)));
  return SP;
}
const FRESH = over({ g: "#5aa83c", l: "#a6dc7a" });
const AUTUMN = {
  gold: [over({ l: "#e0bd4a" }), over({ k: "#5a3f12", g: "#c29d2e", l: "#e8c860" })],
  red: [over({ l: "#d9763a" }), over({ k: "#4a1a10", g: "#a8432a", l: "#d9763a" })],
  russet: [over({ l: "#b07a44" }), over({ k: "#3a2412", g: "#8a5a30", l: "#b07a44" })],
};
const DRY = over({ k: "#3a3010", g: "#8a7a3a", l: "#b5a050" }), HALF_DRY = over({ g: "#6a8a3a", l: "#a0b858" });
const BLOSSOM = over({ k: "#9a7a72", g: "#fbf3f6", l: "#f2c4d2" }), GOING_OVER = over({ g: "#8ac46a", l: "#f6cfdc" }), APPLES = over({ l: "#c8402a" });
const ROOF_DUST = { F: "#e3eaf2" }, ROOF_SNOW = { f: SNOW, F: SNOW_SH };

/* a prop's look on the day: [sprite, palette] or null for its own. kind: peak, tree, pine, palm;
   i: the map pixel it stands on */
function propLook(c, w, kind, i, season) {
  const S = prepare(c, w), X = sprites();
  if (!X || kind === "palm") return null;
  const m = snowMargin(S, i, season);
  if (kind === "peak") return m > 0 ? [X.PEAK_SNOW[Math.max(1, Math.min(5, 1 + Math.floor(m / 0.03)))], null] : null;
  if (kind === "pine") return m > 0.05 ? [X.PINE_DEEP, null] : m > 0 ? [X.PINE_SNOW, null] : null;
  const cold = S.cold[i], r = w.regions[c.cellOf[i]], sum = r.summerRain == null ? 0.5 : r.summerRain, q = local(season, S.south[i]);
  if (q == null) return cold > 9 && sum > 0.55 ? [lib.TREE, HALF_DRY] : null;
  if (cold > 9) {
    if (sum <= 0.55) return null;
    const g = wetness(q);
    return g < 0.33 ? [lib.TREE, DRY] : g < 0.7 ? [lib.TREE, HALF_DRY] : null;
  }
  if (cold < -12) return m > 0 ? [X.PINE_SNOW, null] : null;
  const tm = leafTiming(cold, S.jit[i]), sp = hash(i, 4), a = sp < 0.45 ? "gold" : sp < 0.8 ? "red" : "russet";
  const bare = m > 0 ? X.TREE_BARE_SNOW : X.TREE_BARE;
  if (q >= tm.turn) {
    const k = (q - tm.turn) / 0.14;
    if (k < 0.2) return [lib.TREE, AUTUMN[a][0]];
    if (k < 0.6) return [lib.TREE, AUTUMN[a][1]];
    if (k < 0.85) return [X.TREE_THIN, AUTUMN[a][1]];
    return [bare, null];
  }
  if (q < tm.out) return [bare, null];
  if (q < tm.out + 0.02) return [X.TREE_BUD, null];
  if (q < tm.out + 0.07) return [lib.TREE, FRESH];
  return null;
}
/* snow on the roofs where it lies on the ground: a dusting, then white (null: the realm's own) */
function roofLook(c, w, rid, season) {
  const S = prepare(c, w), r = w.regions[rid], i = (r.y * PPC + 2) * c.VW + r.x * PPC + 2, m = snowMargin(S, i, season);
  return m <= 0 ? null : m < 0.02 ? ROOF_DUST : ROOF_SNOW;
}
/* an orchard tree through the year: bare, in bud, in blossom tree by tree (white and pink), going
   over with its petals in the grass, in leaf, red with apples in late summer, gold, bare, snowy */
function orchardLook(S, i, tree, season) {
  const X = sprites(), q = local(season, S.south[i]);
  if (q == null) return [X.OTREE, null];
  const tm = leafTiming(S.cold[i], S.jit[i]), start = tm.out - 0.08 + tree * 0.045, k = (q - start) / 0.04, bare = snowMargin(S, i, season) > 0 ? X.OTREE_SNOW : X.OTREE_BARE;
  if (q >= tm.turn) { const a = (q - tm.turn) / 0.14; return a < 0.6 ? [X.OTREE, AUTUMN.gold[a < 0.2 ? 0 : 1]] : [bare, null]; }
  if (k < 0) return [bare, null];
  if (k < 0.15) return [X.OTREE_BUD, null];
  if (k < 0.7) return [X.OTREE, BLOSSOM];
  if (k < 1) return [X.OTREE, GOING_OVER, true];
  if (q > 0.56) return [X.OTREE, APPLES];
  return [X.OTREE, null];
}

/* ------------------------------------------------------------ ambient life */
/* Ships, caravans and boats see the ice and snow coming and make for home before it closes in:
   threat() is 0 when it is far off and climbs to 1 as it arrives (and back after the thaw); they
   are drawn that share of the way to their harbour, town or shore. The warning is about 20 days,
   or 2.5 seconds of playback at the faster speeds, so there is always time to see them go. */
function threat(frozen, season, speed) {
  if (season == null) return frozen(null) ? 1 : 0;
  if (frozen(season)) return 1;
  const L = Math.min(0.25, Math.max(20, (speed || 1) * 2.5) / 365);
  for (let s = 1; s <= 16; s++) {
    const d = L * s / 16;
    if (frozen(wrap(season + d)) || frozen(wrap(season - d))) { const k = 1 - (s - 1) / 16; return k * k * (3 - 2 * k); }
  }
  return 0;
}
/* map pixels along a line, wrapping east-west; null if it leaves the map */
function line(c, x0, y0, x1, y1, out) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let s = out.length ? 1 : 0; s <= n; s++) {
    const x = Math.round(x0 + (x1 - x0) * s / n), y = Math.round(y0 + (y1 - y0) * s / n);
    if (y < 0 || y >= c.VH) return null;
    out.push([((x % c.VW) + c.VW) % c.VW, y]);
  }
  return out;
}
function dxw(a, b, VW) { let d = b - a; if (d > VW / 2) d -= VW; if (d < -VW / 2) d += VW; return d; }
const sea = function (c, p) { const i = p[1] * c.VW + p[0]; return !c.land[i] && !c.lake[i]; };

/* the year's trade: lanes over open sea between ports (settlements on the coast), each to its
   nearest two it can sail to straight or round one bend; the boats round the settlements by the
   sea or a lake; the caravans' roads */
const LIFE = new WeakMap();
function lifeOf(c, w, roads) {
  let L = LIFE.get(w);
  if (L) return L;
  const S = c.sea, RG = w.regions, VW = c.VW, VH = c.VH;
  const ports = [];
  for (const r of RG) {
    if (!r.settlement || r.owner == null || r.barren) continue;
    const cx = r.x * PPC + 2, cy = r.y * PPC + 2;
    for (const nb of r.neighbors) {
      const q = RG[nb];
      if (!q || !q.barren || q.lake || q.beyondBiome) continue;
      const pts = line(c, cx, cy, cx + dxw(cx, q.x * PPC + 2, VW), q.y * PPC + 2, []), h = pts && pts.find(function (p) { return sea(c, p); });
      if (h) { ports.push({ r: r, h: h }); break; }
    }
  }
  const lanes = [], linked = {};
  for (const a of ports) {
    const near = ports.filter(function (b) { return b !== a; }).map(function (b) { return [b, Math.hypot(dxw(a.h[0], b.h[0], VW), b.h[1] - a.h[1])]; })
      .filter(function (e) { return e[1] > 6 && e[1] < 140; }).sort(function (p, q) { return p[1] - q[1]; });
    let made = 0;
    for (const e of near) {
      if (made >= 2 || lanes.length >= 80) break;
      const b = e[0], kk = a.r.id < b.r.id ? a.r.id + "-" + b.r.id : b.r.id + "-" + a.r.id;
      if (linked[kk]) { made++; continue; }
      const ax = a.h[0], ay = a.h[1], bx = ax + dxw(ax, b.h[0], VW), by = b.h[1], len = e[1];
      for (const bend of [0, 0.2, -0.2, 0.4, -0.4]) {
        const mx = (ax + bx) / 2 - (by - ay) / len * bend * len, my = (ay + by) / 2 + (bx - ax) / len * bend * len;
        const pts = line(c, ax, ay, mx, my, []);
        if (!pts || !line(c, mx, my, bx, by, pts) || !pts.every(function (p) { return sea(c, p); })) continue;
        /* the pixels where the sea can freeze, for the ships to watch */
        const icy = pts.map(function (p) { return p[1] * VW + p[0]; }).filter(function (i) { return S.iceScore[i] > 0; });
        lanes.push({ pts: pts, icy: icy });
        linked[kk] = true; made++;
        break;
      }
    }
  }
  const boats = [];
  for (const r of RG) {
    /* only the settlements on the water's edge fish */
    if (!r.settlement || r.owner == null || r.barren || !r.neighbors.some(function (n) { return RG[n] && RG[n].barren && !RG[n].beyondBiome; })) continue;
    const cx = r.x * PPC + 2, cy = r.y * PPC + 2, cand = [];
    for (let y = Math.max(0, cy - 9); y <= Math.min(VH - 1, cy + 9); y++) for (let xx = cx - 9; xx <= cx + 9; xx++) {
      const x = ((xx % VW) + VW) % VW, i = y * VW + x;
      if (c.land[i] || S.wd[i] < 2 || (!c.lake[i] && S.wd[i] > 5)) continue;
      cand.push(i);
    }
    if (!cand.length) continue;
    const nb = (r.settlement.tier || 1) >= 2 && hash(r.id, 120) < 0.5 ? 2 : 1;
    for (let k = 0; k < nb; k++) {
      const i = cand[Math.floor(hash(r.id * 3 + k, 121) * cand.length)], x0 = i % VW, y0 = (i - x0) / VW;
      let best = null, bd = 1e9;
      for (let y = Math.max(0, y0 - 8); y <= Math.min(VH - 1, y0 + 8); y++) for (let dx = -8; dx <= 8; dx++) {
        const j = y * VW + (x0 + dx + VW) % VW, d = dx * dx + (y - y0) * (y - y0);
        if (c.land[j] && c.pxB[j] && d < bd) { bd = d; best = [x0 + dx, y]; }
      }
      if (!best) continue;
      const n = Math.max(1, Math.round(Math.sqrt(bd)));
      let off = i;
      for (let s = 0; s <= n; s++) {
        const x = Math.round(x0 + (best[0] - x0) * s / n), y = Math.round(y0 + (best[1] - y0) * s / n), j = y * VW + ((x % VW) + VW) % VW;
        if (!c.land[j] && c.lake[j] === c.lake[i]) off = j;
      }
      boats.push({ i: i, x: x0, y: y0, hx: best[0], hy: best[1], off: off, n: r.id * 3 + k });
    }
  }
  const trails = [];
  for (const l of roads || []) {
    const a = RG[l[0]], b = RG[l[1]];
    const ax = a.x * PPC + PPC / 2, ay = a.y * PPC + PPC / 2, bx = ax + dxw(a.x * PPC, b.x * PPC, VW), by = b.y * PPC + PPC / 2;
    /* the road's own line (pixelmap.js drawRoads): a slight bend half-way */
    const len = Math.hypot(bx - ax, by - ay) || 1, bend = (cellRandLike(l[0] * 7919 + l[1]) - 0.5) * 5;
    const mx = (ax + bx) / 2 - (by - ay) / len * bend, my = (ay + by) / 2 + (bx - ax) / len * bend;
    const pts = line(c, ax, ay, mx, my, []);
    if (!pts || !line(c, mx, my, bx, by, pts) || pts.length < 6) continue;
    trails.push({ pts: pts, ids: pts.map(function (p) { return p[1] * VW + p[0]; }) });
  }
  L = { lanes: lanes, boats: boats, trails: trails, orchards: orchardsOf(c, w) };
  LIFE.set(w, L);
  return L;
}
/* pixelmap.js's cellRand(id, 11), for the roads' bend */
function cellRandLike(id) {
  let h = Math.imul(id + 1, 2654435761) ^ Math.imul(11, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/* an orchard beside each temperate settlement, on a neighbouring cell of open land */
function orchardsOf(c, w) {
  const S = c.sea, RG = w.regions, out = [];
  for (const r of RG) {
    if (!r.settlement || r.owner == null || r.barren) continue;
    const i0 = (r.y * PPC + 2) * c.VW + r.x * PPC + 2;
    if (S.cold[i0] < -12 || S.cold[i0] > 12) continue;
    const opts = r.neighbors.filter(function (n) {
      const q = RG[n];
      return q && !q.barren && !q.lake && !q.settlement && (q.biome === "grassland" || q.biome === "forest" || q.biome === "savanna");
    });
    if (!opts.length) continue;
    out.push({ rid: r.id, cell: opts[Math.floor(hash(r.id, 130) * opts.length)] });
  }
  return out;
}

/* draws the life over the scenery, under the settlements: tiers, the settlements shown at this zoom
   (pixelmap.js minTier); pc, CSS pixels a map pixel */
function life(ctx, c, w, v, X0, u, o, roads, minTier, pc) {
  const S = prepare(c, w), X = sprites();
  if (!X) return;
  const L = lifeOf(c, w, roads), VW = c.VW, P = v.P, Y0 = v.Y0, season = o.season, t = (o.time || 0) / 1000, cw = ctx.canvas.width, ch = ctx.canvas.height;
  /* a sprite standing on map point (mx, my), as the scenery stands */
  const stand = function (sp, ov, mx, my, flip) {
    const x = Math.round(X0 + (mx + 0.5) * P - sp.w * u / 2), y = Math.round(Y0 + (my + 0.5) * P - sp.h * u + u);
    if (x < -sp.w * u || y < -sp.h * u || x > cw || y > ch) return;
    ctx.drawImage(image(sp, ov, u, flip), x, y);
  };
  const cell = PPC * P;

  /* orchards in rows beside the settlements, zoomed in far enough for them to fit their cell */
  if (pc >= 2 && cell >= 10 * u) {
    const cols = Math.min(3, Math.floor(cell * 0.9 / (5 * u))), rows = Math.min(2, Math.floor(cell * 0.8 / (4 * u)));
    for (const oc of L.orchards) {
      const r = w.regions[oc.rid], q = w.regions[oc.cell];
      if (!r.settlement || (r.settlement.tier || 1) < minTier) continue;
      const cx = (q.x + 0.5) * PPC, cy = (q.y + 0.5) * PPC, i = Math.floor(cy) * VW + Math.floor(cx);
      for (let b = 0; b < rows; b++) for (let a = 0; a < cols; a++) {
        const mx = cx + (a - (cols - 1) / 2) * 5 * u / P, my = cy + (b - (rows - 1) / 2) * 4 * u / P + 1;
        const lk = orchardLook(S, i, hash(oc.rid * 7 + a, b), season);
        if (lk[2]) { ctx.fillStyle = "#f2c4d2"; ctx.fillRect(Math.round(X0 + mx * P - 3 * u), Math.round(Y0 + my * P + u), u, u); ctx.fillRect(Math.round(X0 + mx * P + 2 * u), Math.round(Y0 + my * P + 2 * u), u, u); }
        stand(lk[0], lk[1], mx, my);
      }
    }
  }
  /* sheaves standing on the cornfields between the harvest and the plough, zoomed in */
  const F = FIELDS.get(w);
  if (F && pc >= 3 && season != null) for (const i of F.stooks) {
    const q = local(season, S.south[i]), fj = hash(F.fid[i], 4) * 0.05;
    if (q >= 0.65 + fj && q < 0.72 + fj) stand(X.STOOK, null, i % VW, (i - i % VW) / VW);
  }

  /* merchant cogs to and fro on the lanes, a voyage at a time, a pale wake behind; before the sea
     ice closes a lane they make for the nearest port on it and lie there, sails furled */
  L.lanes.forEach(function (lane, li) {
    const pts = lane.pts, len = pts.length;
    const k = lane.icy.length ? threat(function (s) { for (const i of lane.icy) if (seaIced(S, i, s)) return true; return false; }, season, o.speed) : 0;
    for (let m = 0; m < (len > 80 ? 2 : 1); m++) {
      const speed = 4 + hash(li, m) * 2, pos = t * speed + hash(li, m + 9) * len * 2, voyage = Math.floor(pos / (2 * len));
      let s = pos % (2 * len);
      const back = s >= len; if (back) s = 2 * len - s - 1;
      if (hash(li * 7 + m, voyage) > 0.75) continue;
      let at = s, dir = back ? -1 : 1, moored = false;
      if (k > 0) {
        const home = s < len / 2 ? 0 : len - 1, berth = clamp(home + (home ? -1 : 1) * (1 + m * 4), 0, len - 1);
        at = s + (berth - s) * k; dir = berth >= s ? 1 : -1; moored = k > 0.97;
      }
      const j = clamp(Math.round(at), 0, len - 1), p = pts[j], nx = pts[clamp(j + dir, 0, len - 1)];
      const left = dxw(p[0], nx[0], VW) < 0 || (nx[0] === p[0] && dir < 0);
      if (!moored && Math.floor(t * 4) % 2) {
        const wk = pts[clamp(j - dir * 3, 0, len - 1)];
        ctx.fillStyle = PALE; ctx.fillRect(X0 + wk[0] * P, Y0 + wk[1] * P, P, P);
      }
      stand(moored ? X.COG_MOORED : X.COG, null, p[0], p[1] + 1, left);
    }
  });
  if (pc < 2) return;

  /* fishing boats off the settlements, rocking, a net going out now and then; before the ice
     reaches the shore they row in and lie keel up on it for the winter */
  for (const b of L.boats) {
    const iced = function (j, s) {
      if (c.lake[j]) {
        const k = S.lakeK[j], LK = c.water.lakes;
        return k >= 0 && iceLevel(LK.ice[k], s == null ? null : wrap(local(s, LK.south[k]) + 0.5)) >= Math.min(1, LK.d[k]);
      }
      return seaIced(S, j, s);
    };
    const th = threat(function (s) { return iced(b.off, s) || iced(b.i, s); }, season, o.speed);
    if (th > 0.97) { stand(X.KEEL_UP, null, b.hx, b.hy); continue; }
    const x = b.x + (b.hx - b.x) * th + Math.sin(t * 0.3 + b.n) * 1.5 * (1 - th), y = b.y + (b.hy - b.y) * th;
    stand(th > 0 ? X.ROWBOAT : X.FISHER, null, x, y + 1, b.hx < b.x && th > 0);
    if (th === 0 && Math.sin(t * 0.9 + b.n * 3) > 0.7) {
      ctx.fillStyle = PALE;
      ctx.fillRect(Math.round(X0 + (x + 0.5) * P + 3 * u), Math.round(Y0 + (y + 0.5) * P), u, u);
      ctx.fillRect(Math.round(X0 + (x + 0.5) * P + 4.5 * u), Math.round(Y0 + (y + 0.5) * P + u), u, u);
    }
  }

  /* caravans on the roads: camels where the land is dry (rain under 400 mm), an ox cart and riders
     elsewhere; before the snow closes their road they make for the nearer town and wait beside it */
  const snowed = function (i, s) { return snowMargin(S, i, s) > (s == null ? 0 : 0.04); };
  const crowd = [];
  L.trails.forEach(function (tr, ri) {
    const pts = tr.pts, len = pts.length;
    if (hash(ri, 140) > 0.6) return;
    const k = threat(function (s) { for (let q = 0; q < len; q += 2) if (snowed(tr.ids[q], s)) return true; return false; }, season, o.speed);
    const speed = 2.2 + hash(ri, 141) * 1.2, pos = t * speed + hash(ri, 142) * len * 2;
    let s = pos % (2 * len); const back = s >= len; if (back) s = 2 * len - s - 1;
    const home = s <= len / 2 ? 0 : len - 1, at = s + (home - s) * k, parked = k > 0.97;
    const dir = k > 0.02 ? (home >= s ? 1 : -1) : back ? -1 : 1;
    for (let m = 0; m < 4; m++) {
      const sm = Math.round(at - dir * m * 4 * (1 - k * 0.6));
      if (sm < 0 || sm >= len) continue;
      const p = pts[sm], nx = pts[clamp(sm + dir, 0, len - 1)], i = tr.ids[sm];
      const ox = parked ? (m % 2) * 3 - 1 : 0, oy = parked ? Math.floor(m / 2) * 2 + 1 : 0;
      const dry = (w.regions[c.cellOf[i]].rainMm || 0) < 400;
      crowd.push([dry ? X.CAMEL : m < 2 ? X.CART : X.RIDER, p[0] + ox, p[1] + oy + 1, dxw(p[0], nx[0], VW) < 0]);
    }
  });
  crowd.sort(function (a, b) { return a[2] - b[2]; });
  for (const q of crowd) stand(q[0], null, q[1], q[2], q[3]);
}

/* ------------------------------------------------------------ tornado funnels, over everything */
/* Seen from the side, no cloud and no fill: the funnel only particles whirling round its twisting
   axis and rising up it, wider and thinning out towards the top, lighter on the near side. Dust
   over land; over water, the sea, a lake or a river (a waterspout), the rain's colours. Going from
   one to the other the new colours climb from its foot to its top in about a second and a half;
   each change is a band rising behind the one before, so turning back halfway sends the old colours
   up again under the new. */
const DUST = ["#e6d4ac", "#5a3e24"], SPOUT = ["#c9d8e6", "#5f7488"];
function spoutLook(looks, o, want, now) {
  let L = looks[o.n];
  if (!L) L = looks[o.n] = { bands: [[want, 1]], at: now };
  const step = Math.max(0, now - L.at) / 1500;
  L.at = now; L.seen = now;
  for (const b of L.bands) b[1] = Math.min(1, b[1] + step);
  if (want !== L.bands[L.bands.length - 1][0]) L.bands.push([want, 0]);
  for (let k = L.bands.length - 1; k > 0; k--) if (L.bands[k][1] >= 1) { L.bands = L.bands.slice(k); break; }
  return L;
}
function colourAt(look, top) {
  for (let k = look.bands.length - 1; k > 0; k--) if (top < look.bands[k][1]) return look.bands[k][0];
  return look.bands[0][0];
}
function sky(ctx, c, w, v, X0, u, o) {
  const S = c.sea;
  if (!S || !S.places || !S.places.length) return;
  u = Math.max(2, u);                            /* never smaller than a settlement zoomed in a little */
  const t = (o.time || 0) / 1000, VW = c.VW, VH = c.VH, looks = S.st.looks;
  for (const id in looks) if (o.time - looks[id].seen > 20000) delete looks[id];
  for (const p of S.places) {
    let wet = false;
    for (let y = Math.round(p.y) - 1; y <= Math.round(p.y) + 1 && !wet; y++) for (let x = Math.round(p.x) - 1; x <= Math.round(p.x) + 1; x++) {
      if (y < 0 || y >= VH) continue;
      const i = y * VW + ((x % VW) + VW) % VW;
      if (!c.land[i] || !c.pxB[i]) { wet = true; break; }
    }
    const look = spoutLook(looks, p, wet ? SPOUT : DUST, o.time), low = colourAt(look, 0);
    const gx = X0 + (((p.x % VW) + VW) % VW + 0.5) * v.P, gy = v.Y0 + (p.y + 0.5) * v.P, rows = 26, life = Math.sin(Math.PI * Math.min(1, p.p * 1.15));
    const reach = rows * Math.min(1, life * 1.6);
    for (let q = 0; q < 200; q++) {
      const rise = (hash(q, p.n * 7 + 1) + t * 0.35 * (0.6 + hash(q, 2) * 0.8)) % 1, h = rows - reach + rise * reach, top = h / rows;
      if (top > 0.8 && hash(q, 3) < (top - 0.8) / 0.2) continue;
      const wd = 1 + top * top * 5, off = Math.sin((rows - h) * 0.22 + t * 3) * (1 + top * 2), a = hash(q, 4) * 6.283 + t * (8 - top * 4), pal = colourAt(look, top);
      ctx.fillStyle = Math.sin(a) > 0 ? pal[0] : pal[1];
      for (let k = 0; k < 2; k++) {
        const b = a - k * 0.4;
        ctx.fillRect(Math.round((gx + (off + Math.cos(b) * wd) * u) / u) * u, Math.round((gy - h * u + Math.sin(b) * u * 0.5) / u) * u, u, u);
      }
    }
    if (reach < rows * 0.9) continue;
    for (let q = 0; q < 10; q++) {
      const a = hash(q, p.n) * 6.283 + t * 6, rr = 4 + hash(q, p.n + 1) * 7;
      ctx.fillStyle = q % 3 ? "#4e3a24" : low[0];
      ctx.fillRect(Math.round(gx + Math.cos(a) * rr * u), Math.round(gy - u * 2 - Math.abs(Math.sin(a)) * rr * u * 0.6), u, u);
    }
  }
}

AEON.seasons = {
  setup: function (s) { lib = s; },
  code: code, BEACH: BEACH, PEAK_SNOW: PEAK_SNOW, key: key, prepare: prepare, ground: ground, weather: weather,
  propLook: propLook, roofLook: roofLook, image: image, life: life, sky: sky,
};
})();
