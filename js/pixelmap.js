/* Aeon - pixel map renderer for planets (style F: an old atlas drawn in pixels).

   The map is painted once per world into a virtual canvas at PPC pixels per cell, then
   blitted to the screen at a whole number of device pixels per map pixel, so pixels stay
   square at every zoom. The map is drawn once; ui.js keeps the pan inside its edges.
   Settlements and labels are drawn afterwards in screen space, so they keep a readable
   size when zoomed and more of them appear as you zoom in.

   View convention (shared with ui.js): screen = pan + grid * s, where s is CSS pixels per
   cell. Here s is snapped so that s * dpr / PPC is a whole number; pixelScale() exposes
   the snapping so ui.js can zoom and centre with the same numbers. */
(function () {
"use strict";

const AEON = window.AEON = window.AEON || {};
const PPC = 4;
const MODES = ["biome", "political", "population", "elevation", "habitability"];

/* ------------------------------------------------------------ palette */
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
/* stepped ramps for the data modes, in the parchment-and-ink family */
const RAMPS = {
  population:   ["#ead9b0", "#dcb98a", "#cc9468", "#b5664a", "#93392d", "#6a1a17"],
  elevation:    ["#3f7a3a", "#7d9b4c", "#b9ab68", "#a0805a", "#7a6656", "#e8e4dc"],
  habitability: ["#8a6a48", "#ad8b58", "#c9b26a", "#9db35a", "#6c9c48", "#3f7a3a"],
};
const INK = "#2a1a0e", RED_INK = "#6e1f12", HALO = "#efe2bf", DESK = "#2a1d12";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = function (x, y) { return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16; };
const HEX = {};
function rgb(h) {
  if (HEX[h]) return HEX[h];
  const n = parseInt(h.slice(1), 16);
  return (HEX[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
}

/* ------------------------------------------------------------ pixel font */
const GLYPHS = {
  A: [14,17,17,31,17,17,17], B: [30,17,17,30,17,17,30], C: [14,17,16,16,16,17,14], D: [28,18,17,17,17,18,28],
  E: [31,16,16,30,16,16,31], F: [31,16,16,30,16,16,16], G: [14,17,16,23,17,17,15], H: [17,17,17,31,17,17,17],
  I: [14,4,4,4,4,4,14], J: [7,2,2,2,2,18,12], K: [17,18,20,24,20,18,17], L: [16,16,16,16,16,16,31],
  M: [17,27,21,21,17,17,17], N: [17,17,25,21,19,17,17], O: [14,17,17,17,17,17,14], P: [30,17,17,30,16,16,16],
  Q: [14,17,17,17,21,18,13], R: [30,17,17,30,20,18,17], S: [15,16,16,14,1,1,30], T: [31,4,4,4,4,4,4],
  U: [17,17,17,17,17,17,14], V: [17,17,17,17,17,10,4], W: [17,17,17,21,21,21,10], X: [17,17,10,4,10,17,17],
  Y: [17,17,10,4,4,4,4], Z: [31,1,2,4,8,16,31],
  "0": [14,17,19,21,25,17,14], "1": [4,12,4,4,4,4,14], "2": [14,17,1,2,4,8,31], "3": [31,2,4,2,1,17,14],
  "4": [2,6,10,18,31,2,2], "5": [31,16,30,1,1,17,14], "6": [6,8,16,30,17,17,14], "7": [31,1,2,4,8,8,8],
  "8": [14,17,17,14,17,17,14], "9": [14,17,17,15,1,2,12],
  " ": [0,0,0,0,0,0,0], ".": [0,0,0,0,0,12,12], ",": [0,0,0,0,12,4,8], "-": [0,0,0,31,0,0,0],
  "'": [4,4,8,0,0,0,0], "!": [4,4,4,4,4,0,4], "?": [14,17,1,2,4,0,4], ":": [0,12,12,0,12,12,0],
  "/": [1,1,2,4,8,16,16], "(": [2,4,8,8,8,4,2], ")": [8,4,2,2,2,4,8],
};
function fold(s) {
  /* drop combining accents (U+0300-U+036F) so accented letters fall back to their base letter */
  return String(s).normalize("NFD").split("").filter(function (ch) { const k = ch.charCodeAt(0); return k < 768 || k > 879; }).join("").toUpperCase();
}
function textWidth(s, u, gap) { return s.length * (5 + (gap || 1)) * u - (gap || 1) * u; }
function text(ctx, s, x, y, color, u, gap) {
  const step = (5 + (gap || 1)) * u;
  ctx.fillStyle = color;
  for (let n = 0; n < s.length; n++) {
    const g = GLYPHS[s[n]];
    if (!g) continue;
    for (let r = 0; r < 7; r++) {
      const bits = g[r];
      if (!bits) continue;
      for (let c = 0; c < 5; c++) if (bits & (16 >> c)) ctx.fillRect(x + n * step + c * u, y + r * u, u, u);
    }
  }
}
/* ink with a parchment halo so it reads on any terrain */
function inked(ctx, s, x, y, color, u, gap) {
  const h = Math.max(1, Math.round(u / 2));
  for (const d of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) text(ctx, s, x + d[0] * h, y + d[1] * h, HALO, u, gap);
  text(ctx, s, x, y, color, u, gap);
}

/* ------------------------------------------------------------ sprites */
function sprite(rows, pal) { return { rows: rows, pal: pal, w: rows[0].length, h: rows.length }; }
function blit(ctx, sp, x, y, u, over) {
  for (let j = 0; j < sp.h; j++) for (let i = 0; i < sp.w; i++) {
    const ch = sp.rows[j][i];
    if (ch === ".") continue;
    ctx.fillStyle = (over && over[ch]) || sp.pal[ch];
    ctx.fillRect(x + i * u, y + j * u, u, u);
  }
}
const PEAK = sprite(["....k....", "...kwk...", "..kwwlk..", "..kwlldk.", ".kllddddk", "klllddddk", "kkkkkkkkk"],
  { k: "#2a2420", w: "#ffffff", l: "#a39482", d: "#6b5d4f" });
const PINE = sprite(["..k..", ".kgk.", ".kgk.", "kgggk", ".kbk."], { k: "#14301f", g: "#2f6e45", b: "#5a3d22" });
const TREE = sprite([".kkk.", "kgglk", "kgggk", ".kbk."], { k: "#13361b", g: "#3a8f42", l: "#6cc160", b: "#5a3d22" });
const PALM = sprite(["kg.gk", ".ggg.", "..b..", "..b.."], { k: "#14451f", g: "#2fa055", b: "#7a5a2e" });
const KEEP = sprite(["k.k.k.k", "kwkwkwk", "kwwwwwk", "kwrrrwk", "kwrdrwk", "kkkkkkk"], { k: INK, w: "#efe6d6", r: "#999", d: INK });
const TOWN = sprite([".kkk.", "kwwwk", "kwrwk", "kkkkk"], { k: INK, w: "#efe6d6", r: "#999" });
const HAMLET = sprite(["kk", "kk"], { k: INK });

/** A well-mixed value in [0,1) per cell id; salt gives independent values for the same cell. */
function cellRand(id, salt) {
  let h = Math.imul(id + 1, 2654435761) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ------------------------------------------------------------ terrain, once per world */
const caches = new WeakMap();
/* viewAt() returns an object that inherits from the world; share one cache between them */
function baseOf(w) { return w._view === w ? Object.getPrototypeOf(w) : w; }

function getCache(w) {
  const base = baseOf(w);
  let c = caches.get(base);
  if (!c) { c = buildTerrain(base); caches.set(base, c); }
  return c;
}

function buildTerrain(world) {
  const W = world.width, H = world.height, R = world.regions, VW = W * PPC, VH = H * PPC, N = VW * VH;
  const cellAt = function (fx, fy) {
    const x = ((Math.floor(fx) % W) + W) % W, y = Math.max(0, Math.min(H - 1, Math.floor(fy)));
    return R[y * W + x];
  };
  const elev = function (fx, fy) {
    const x = fx - 0.5, y = Math.max(0, Math.min(H - 1, fy - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, y1 = Math.min(y0 + 1, H - 1);
    const e = function (i, j) { return R[j * W + ((i % W) + W) % W].elevation; };
    return (e(x0, y0) * (1 - tx) + e(x0 + 1, y0) * tx) * (1 - ty) + (e(x0, y1) * (1 - tx) + e(x0 + 1, y1) * tx) * ty;
  };

  const E = new Float32Array(N), land = new Uint8Array(N), cellOf = new Int32Array(N);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const i = y * VW + x, c = cellAt((x + 0.5) / PPC, (y + 0.5) / PPC);
    E[i] = elev((x + 0.5) / PPC, (y + 0.5) / PPC);
    cellOf[i] = c.id;
    land[i] = E[i] > 0.5 && !c.lake ? 1 : 0;
  }

  const px = new Uint8ClampedArray(N * 4);
  const put = function (i, h) { const c = rgb(h); px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255; };
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const i = y * VW + x, e = E[i], t = bayer(x, y);
    if (!land[i]) {
      if (R[cellOf[i]].lake) { put(i, (x + y) % 5 ? P.shallow : P.mid); continue; }
      let coast = false;
      for (let dy = -1; dy <= 1 && !coast; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ny = y + dy;
        if (ny >= 0 && ny < VH && land[ny * VW + (x + dx + VW) % VW]) { coast = true; break; }
      }
      const d = 0.5 - e;
      put(i, coast ? P.foam : d < 0.018 + t * 0.012 ? P.shallow : d < 0.075 + t * 0.03 ? P.mid : P.deep);
      continue;
    }
    /* jitter the biome lookup with the dither matrix so biome borders break up into pixels */
    const c = cellAt((x + 0.5) / PPC + (t - 0.5) * 0.9, (y + 0.5) / PPC + (bayer(y + 1, x + 2) - 0.5) * 0.9);
    const biome = c.barren ? "grassland" : c.biome;
    const eNW = E[Math.max(0, y - 1) * VW + (x + VW - 1) % VW], eSE = E[Math.min(VH - 1, y + 1) * VW + (x + 1) % VW];
    const lvl = Math.min(2, Math.floor(Math.max(0, Math.min(0.999, 0.55 + (eNW - eSE) * 38)) * 2 + t));
    if (e < 0.506 && biome !== "ice" && biome !== "swamp") put(i, P.sand[lvl]);
    else if (biome === "mountain" && e > 0.86) put(i, P.snow[lvl]);
    else put(i, (P[biome] || P.grassland)[lvl]);
  }

  const terrain = document.createElement("canvas");
  terrain.width = VW; terrain.height = VH;
  const g = terrain.getContext("2d");
  const img = g.createImageData(VW, VH);
  img.data.set(px);
  g.putImageData(img, 0, 0);

  /* rivers: curves through jittered cell centres, midpoint to midpoint, so they meander */
  g.fillStyle = P.river;
  const centre = function (r) {
    const h = Math.sin(r.id * 12.9898) * 43758.5453, j = h - Math.floor(h);
    return [r.x * PPC + 2 + (j - 0.5) * 2.4, r.y * PPC + 2 + ((j * 7.3) % 1 - 0.5) * 2.4];
  };
  const near = function (p, ref) { return p[0] - ref[0] > VW / 2 ? [p[0] - VW, p[1]] : ref[0] - p[0] > VW / 2 ? [p[0] + VW, p[1]] : p; };
  const plot = function (x, y, s) { g.fillRect(((Math.round(x) % VW) + VW) % VW, Math.round(y), s, s); };
  for (const r of R) {
    if (!r.river || r.flowTo < 0) continue;
    const t = R[r.flowTo], s = r.river > world.riverThreshold * 6 ? 2 : 1;
    const a = centre(r), b = near(centre(t), a), m1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const u = t.flowTo >= 0 && t.river ? R[t.flowTo] : null;
    const m2 = u ? (function () { const c = near(centre(u), b); return [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]; })() : b;
    const hasUp = r.neighbors.some(function (n) { return R[n].flowTo === r.id && R[n].river; });
    if (!hasUp) for (let k = 0; k <= 6; k++) plot(a[0] + (m1[0] - a[0]) * k / 6, a[1] + (m1[1] - a[1]) * k / 6, s);
    for (let k = 0; k <= 10; k++) {
      const q = k / 10, iq = 1 - q;
      plot(iq * iq * m1[0] + 2 * iq * q * b[0] + q * q * m2[0], iq * iq * m1[1] + 2 * iq * q * b[1] + q * q * m2[1], s);
    }
  }

  /* scenery: peaks, woods -- sparse, so borders and settlements stay readable. Which
     cells get one, and the small offset inside the cell, come from a hash of the cell
     id: a formula linear in x and y would line them up along diagonals. */
  const props = [];
  for (const r of R) {
    if (r.barren || r.lake) continue;
    const k = cellRand(r.id, 1);
    const jx = Math.floor(cellRand(r.id, 2) * 3) - 1, jy = Math.floor(cellRand(r.id, 3) * 3) - 1;
    const x = r.x * PPC + jx, y = r.y * PPC + jy;
    if (r.biome === "mountain" && k < 0.4) props.push([PEAK, x - 3, y - 3, y]);
    else if ((r.biome === "forest" || r.biome === "jungle") && k < 0.55) props.push([r.biome === "jungle" ? PALM : TREE, x, y, y]);
    else if (r.biome === "taiga" && k < 0.5) props.push([PINE, x, y - 1, y]);
    /* the odd lone tree out on open land */
    else if ((r.biome === "grassland" || r.biome === "savanna") && k < 0.05) props.push([TREE, x, y, y]);
  }
  props.sort(function (a, b) { return a[3] - b[3]; });
  for (const p of props) blit(g, p[0], p[1], p[2], 1);

  const frame = document.createElement("canvas");
  frame.width = VW; frame.height = VH;
  return {
    W: W, H: H, VW: VW, VH: VH, land: land, cellOf: cellOf, terrain: terrain,
    terrainPx: g.getImageData(0, 0, VW, VH).data,
    frame: frame, fctx: frame.getContext("2d"), fimg: frame.getContext("2d").createImageData(VW, VH), key: null,
  };
}

/* ------------------------------------------------------------ the frame for a year and mode */
function compose(c, w, mode) {
  const key = mode + "|" + w.year + "|" + (w.ownerLog ? w.ownerLog.length : 0);
  if (c.key === key) return c.frame;
  c.key = key;
  const VW = c.VW, VH = c.VH, R = w.regions, land = c.land, cellOf = c.cellOf;
  const d = c.fimg.data;
  d.set(c.terrainPx);

  if (mode === "population" || mode === "elevation" || mode === "habitability") {
    const ramp = RAMPS[mode].map(rgb), n = ramp.length;
    let maxPop = 1;
    if (mode === "population") for (const r of R) if (r.population > maxPop) maxPop = r.population;
    const lm = Math.log(1 + maxPop);
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      const i = y * VW + x;
      if (!land[i]) continue;
      const r = R[cellOf[i]];
      const t = mode === "population" ? Math.log(1 + (r.population || 0)) / lm
              : mode === "elevation" ? (r.elevation - 0.5) / 0.5 : (r.habitability || 0);
      const k = Math.max(0, Math.min(n - 1, Math.floor(Math.max(0, Math.min(1, t)) * (n - 1) + bayer(x, y))));
      /* keep a whisper of the terrain shading underneath */
      const col = ramp[k], a = 0.82;
      d[i * 4] += (col[0] - d[i * 4]) * a; d[i * 4 + 1] += (col[1] - d[i * 4 + 1]) * a; d[i * 4 + 2] += (col[2] - d[i * 4 + 2]) * a;
    }
  }

  /* realms: a dithered wash of the realm colour and a two-pixel border where owners meet.
     Water never counts as a different owner, so coasts stay clean. */
  const tint = mode === "political", borders = mode !== "elevation";
  if (tint || borders) {
    const own = new Array(R.length);
    for (let k = 0; k < R.length; k++) own[k] = R[k].owner;
    const cols = {};
    const colorOf = function (id) { const p = w.polities[id]; return cols[id] || (cols[id] = rgb((p && p.color) || "#888888")); };
    const at = function (x, y, o) {
      if (y < 0 || y >= VH) return o;
      const j = y * VW + ((x + VW) % VW);
      return land[j] ? own[cellOf[j]] : o;
    };
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      const i = y * VW + x;
      if (!land[i]) continue;
      const o = own[cellOf[i]];
      if (o == null) continue;
      const edge = at(x + 1, y, o) !== o || at(x - 1, y, o) !== o || at(x, y + 1, o) !== o || at(x, y - 1, o) !== o;
      const edge2 = !edge && (at(x + 2, y, o) !== o || at(x - 2, y, o) !== o || at(x, y + 2, o) !== o || at(x, y - 2, o) !== o);
      const cl = colorOf(o);
      if (edge) {
        const k = tint ? 0.5 : 0.62;
        d[i * 4] = cl[0] * k; d[i * 4 + 1] = cl[1] * k; d[i * 4 + 2] = cl[2] * k;
      } else if (tint || (borders && edge2)) {
        const a = edge2 ? 0.62 : !tint ? 0 : bayer(x, y) < 0.5 ? 0.66 : 0.44;
        d[i * 4] += (cl[0] - d[i * 4]) * a; d[i * 4 + 1] += (cl[1] - d[i * 4 + 1]) * a; d[i * 4 + 2] += (cl[2] - d[i * 4 + 2]) * a;
      }
    }
  }
  c.fctx.putImageData(c.fimg, 0, 0);
  return c.frame;
}

/* ------------------------------------------------------------ view */
function fitScale(canvas, world) {
  const cssW = canvas.clientWidth || 300, cssH = canvas.clientHeight || 150;
  return Math.min(cssW / world.width, cssH / world.height);
}
/* P = device pixels per map pixel, always a whole number; s = CSS pixels per cell */
function pixelScale(canvas, world, zoom) {
  const dpr = window.devicePixelRatio || 1;
  const raw = fitScale(canvas, world) * (zoom || 1) * dpr / PPC;
  const Pn = Math.max(1, Math.round(raw + 1e-6));
  return { P: Pn, s: Pn * PPC / dpr, dpr: dpr, zoomFor: function (p) { return p * PPC / (fitScale(canvas, world) * dpr); } };
}
function makeView(canvas, world, opts) {
  const ps = pixelScale(canvas, world, opts && opts.zoom);
  return {
    cssW: canvas.clientWidth || 300, cssH: canvas.clientHeight || 150, dpr: ps.dpr, P: ps.P, s: ps.s,
    ox: (opts && opts.panX) || 0, oy: (opts && opts.panY) || 0,
  };
}

/* ------------------------------------------------------------ labels and settlements */
function realmInfo(w, c) {
  /* size and a wrap-aware centroid (circular mean of x) per living realm */
  const info = {}, W = c.W, R = w.regions;
  for (let k = 0; k < R.length; k++) {
    const o = R[k].owner;
    if (o == null) continue;
    const r = R[k], a = r.x / W * Math.PI * 2;
    const f = info[o] || (info[o] = { n: 0, cx: 0, sx: 0, y: 0 });
    f.n++; f.cx += Math.cos(a); f.sx += Math.sin(a); f.y += r.y;
  }
  for (const id in info) {
    const f = info[id];
    let a = Math.atan2(f.sx / f.n, f.cx / f.n);
    if (a < 0) a += Math.PI * 2;
    f.x = a / (Math.PI * 2) * W; f.y = f.y / f.n;
    /* a crescent-shaped realm's centroid can fall outside it; use the capital instead */
    const cell = R[Math.min(c.H - 1, Math.floor(f.y)) * W + (Math.floor(f.x) % W)];
    const p = w.polities[id];
    if (cell.owner !== id && p && p.capital != null) { f.x = R[p.capital].x + 0.5; f.y = R[p.capital].y + 0.5; }
  }
  return info;
}
function splitName(s) {
  if (s.length <= 16) return [s];
  const k = s.indexOf(" OF ");
  if (k > 0) return [s.slice(0, k), s.slice(k + 1)];
  const m = s.lastIndexOf(" ", Math.ceil(s.length / 2) + 2);
  return m > 0 ? [s.slice(0, m), s.slice(m + 1)] : [s];
}

function drawOverlay(ctx, w, c, v, opts, tiles) {
  const dpr = v.dpr, pc = v.P / dpr;                         // CSS pixels per map pixel
  const u = Math.max(1, Math.round((pc >= 2 ? 2 : 1) * dpr)); // device pixels per font/sprite pixel
  const cell = PPC * v.P, R = w.regions;
  const boxes = [];
  const free = function (b) {
    for (const o of boxes) if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false;
    return true;
  };
  /* everything is placed once on the first tile and drawn on each visible copy */
  const drawn = [];
  const sx = function (gx) { return tiles[0] + gx * cell; }, sy = function (gy) { return v.Y0 + gy * cell; };

  /* settlements: capitals always; towns and villages appear as the map is zoomed in */
  const capitals = {};
  for (const id in w.polities) { const p = w.polities[id]; if (!p.ended && p.capital != null) capitals[p.capital] = p; }
  const minTier = pc >= 7 ? 1 : pc >= 4 ? 2 : pc >= 3 ? 3 : 9;
  const sites = [];
  for (let k = 0; k < R.length; k++) {
    const s = R[k].settlement, cap = capitals[k];
    if (cap) sites.push({ r: R[k], cap: cap, tier: 9, name: (s && s.name) || R[k].name });
    else if (s && s.tier >= minTier && R[k].owner != null) sites.push({ r: R[k], tier: s.tier, name: s.name });
  }
  sites.sort(function (a, b) { return b.tier - a.tier; });
  for (const st of sites) {
    const sp = st.cap ? KEEP : st.tier >= 3 ? TOWN : HAMLET;
    const x = Math.round(sx(st.r.x + 0.5) - sp.w * u / 2), y = Math.round(sy(st.r.y + 0.5) - sp.h * u / 2);
    const b = [x - u, y - u, x + (sp.w + 1) * u, y + (sp.h + 1) * u];
    if (!st.cap && !free(b)) continue;
    boxes.push(b);
    drawn.push(function (dx) { blit(ctx, sp, x + dx, y, u, st.cap ? { r: st.cap.color, d: st.cap.color } : null); });
    st.box = b;
  }

  /* realm names, largest first, in red ink; skipped if they would collide */
  const info = realmInfo(w, c);
  const realms = Object.keys(info).filter(function (id) { return info[id].n >= 8 && w.polities[id]; })
    .sort(function (a, b) { return info[b].n - info[a].n; });
  const labelBoxes = [];
  const lfree = function (b) {
    for (const o of labelBoxes) if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false;
    return true;
  };
  if (pc < 7) for (const id of realms) {
    const f = info[id], lines = splitName(fold(w.polities[id].name.replace(/^The /, "")));
    const gap = f.n >= 40 ? 2 : 1, lh = 9 * u;
    const wd = Math.max.apply(null, lines.map(function (l) { return textWidth(l, u, gap); }));
    const x = Math.round(sx(f.x) - wd / 2), y = Math.round(sy(f.y) - lines.length * lh / 2);
    const b = [x - 2 * u, y - u, x + wd + 2 * u, y + lines.length * lh];
    if (!lfree(b)) continue;
    labelBoxes.push(b);
    drawn.push(function (dx) {
      lines.forEach(function (l, i) { inked(ctx, l, Math.round(x + (wd - textWidth(l, u, gap)) / 2) + dx, y + i * lh, RED_INK, u, gap); });
    });
  }

  /* settlement names in brown ink, beside their marker */
  if (opts.showLabels !== false && pc >= 3) for (const st of sites) {
    if (!st.box || !st.name) continue;
    const name = fold(st.name), wd = textWidth(name, u), b0 = st.box;
    const tries = [[Math.round((b0[0] + b0[2]) / 2 - wd / 2), b0[3] + u], [b0[2] + u, Math.round((b0[1] + b0[3]) / 2 - 3.5 * u)],
                   [Math.round((b0[0] + b0[2]) / 2 - wd / 2), b0[1] - 8 * u]];
    for (const t of tries) {
      const b = [t[0] - u, t[1] - u, t[0] + wd + u, t[1] + 8 * u];
      if (!lfree(b) || !free(b)) continue;
      labelBoxes.push(b);
      drawn.push(function (dx) { inked(ctx, name, t[0] + dx, t[1], INK, u); });
      break;
    }
  }

  /* hover and selection: the cell, outlined */
  const ring = function (id, color, wpx) {
    if (id == null || !R[id]) return;
    const r = R[id], x = Math.round(sx(r.x)), y = Math.round(sy(r.y));
    drawn.push(function (dx) {
      ctx.strokeStyle = color; ctx.lineWidth = wpx;
      ctx.strokeRect(x + dx - wpx / 2, y - wpx / 2, cell + wpx, cell + wpx);
    });
  };
  ring(opts.hoverRegion, "rgba(255,248,225,.9)", u);
  ring(opts.selectedRegion, "#c0392b", 2 * u);

  for (const f of drawn) f(0);
}

/* ------------------------------------------------------------ public API */
function draw(canvas, world, opts) {
  opts = opts || {};
  if (!canvas || !world || !world.regions || !world.regions.length) return;
  const v = makeView(canvas, world, opts);
  const pw = Math.round(v.cssW * v.dpr), ph = Math.round(v.cssH * v.dpr);
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  canvas._aeonView = v;

  const c = getCache(world), frame = compose(c, world, opts.mode || "political");
  ctx.fillStyle = DESK; ctx.fillRect(0, 0, pw, ph);
  const mw = c.VW * v.P, mh = c.VH * v.P;
  const X0 = Math.round(v.ox * v.dpr);
  v.Y0 = Math.round(v.oy * v.dpr);
  /* one copy of the map, laid on the desk like a sheet, with an ink rule around it */
  ctx.fillStyle = INK;
  ctx.fillRect(X0 - 1, v.Y0 - 1, mw + 2, mh + 2);
  ctx.drawImage(frame, X0, v.Y0, mw, mh);
  drawOverlay(ctx, world, c, v, opts, [X0]);
}

function hitTest(canvas, world, px, py, opts) {
  if (!canvas || !world || !world.regions || !world.regions.length) return null;
  const v = makeView(canvas, world, opts || { zoom: 1 });
  const W = world.width, H = world.height;
  const gx = Math.floor((px - v.ox) / v.s), gy = Math.floor((py - v.oy) / v.s);
  if (gy < 0 || gy >= H || gx < 0 || gx >= W) return null;
  return gy * W + gx;
}

AEON.render = { draw: draw, modes: MODES, hitTest: hitTest, pixelScale: pixelScale };
AEON.pixelFont = { draw: text, width: textWidth, fold: fold };

})();
