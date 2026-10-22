/* Aeon - map renderer. Planet tile maps with hillshading, rivers and borders; galaxy star maps.
   View convention (shared with ui.js): screen = pan + grid * scale, where
   scale = min(cssW / width, cssH / height) * zoom, grid coords are in cells (cell i spans [i, i+1)).
   hitTest takes px,py in CSS pixels relative to the canvas's top-left corner. */
(function () {
"use strict";

window.AEON = window.AEON || {};
var AEON = window.AEON;

var MODES = ["biome", "political", "population", "elevation", "habitability"];

/* ------------------------------------------------------------ helpers */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }

function hash2(x, y) {
  var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y) {
  var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
  var a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
}
function mulberry(seed) {
  var a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedNum(s) {
  var str = String(s), h = 2166136261;
  for (var i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h | 0;
}

var colorCache = {};
function parseColor(c) {
  if (!c) return [128, 128, 128];
  var hit = colorCache[c];
  if (hit) return hit;
  var out = [128, 128, 128], m;
  if (c.charAt(0) === "#") {
    if (c.length === 4) out = [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
    else if (c.length >= 7) out = [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
  } else if ((m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c))) out = [+m[1], +m[2], +m[3]];
  for (var i = 0; i < 3; i++) if (isNaN(out[i])) out[i] = 128;
  colorCache[c] = out;
  return out;
}
function rgba(c, a) { return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + a + ")"; }
function mix(c, d, t) { return [lerp(c[0], d[0], t), lerp(c[1], d[1], t), lerp(c[2], d[2], t)]; }

function makeLUT(stops) {
  var lut = new Uint8Array(256 * 3);
  for (var i = 0; i < 256; i++) {
    var t = i / 255, k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    var a = stops[k], b = stops[k + 1], u = clamp((t - a[0]) / ((b[0] - a[0]) || 1), 0, 1);
    for (var j = 0; j < 3; j++) lut[i * 3 + j] = Math.round(lerp(a[j + 1], b[j + 1], u));
  }
  return lut;
}
var LUT = {
  population: makeLUT([[0, 38, 26, 60], [0.2, 84, 28, 112], [0.45, 170, 45, 110], [0.7, 240, 110, 60], [1, 252, 236, 150]]),
  elevation: makeLUT([[0, 11, 6, 25], [0.2, 38, 32, 84], [0.4, 52, 84, 140], [0.5, 60, 140, 160], [0.65, 110, 200, 150], [0.8, 200, 230, 140], [1, 252, 250, 220]]),
  habitability: makeLUT([[0, 14, 22, 20], [0.25, 24, 70, 52], [0.5, 60, 140, 70], [0.75, 160, 205, 90], [1, 246, 246, 190]])
};
function lutColor(name, t) {
  var i = clamp(Math.round(t * 255), 0, 255) * 3, l = LUT[name];
  return [l[i], l[i + 1], l[i + 2]];
}

var DEFAULT_BIOME = {
  barren: "#1d3b5c", ice: "#e6eef5", tundra: "#b8c6d9", taiga: "#4d7a62", grassland: "#86b05a",
  forest: "#2f6b3f", jungle: "#1f7a4a", savanna: "#c2b062", desert: "#dcc382", mountain: "#8a8580", swamp: "#4e6b4a"
};

function getPack(world, opts) {
  return (opts && opts.pack) || world.pack || (AEON.packs && AEON.packs[world.packId]) || null;
}
function biomeRGB(pack, key) {
  var b = pack && pack.biomes && pack.biomes[key];
  return parseColor((b && b.color) || DEFAULT_BIOME[key] || "#888888");
}

/* ------------------------------------------------------------ view */
function makeView(canvas, world, opts) {
  var dpr = window.devicePixelRatio || 1;
  var cssW = canvas.clientWidth || (canvas.width / dpr) || 300;
  var cssH = canvas.clientHeight || (canvas.height / dpr) || 150;
  var s0 = Math.min(cssW / world.width, cssH / world.height);
  var z = (opts && opts.zoom) || 1;
  return { cssW: cssW, cssH: cssH, dpr: dpr, s: s0 * z, ox: (opts && opts.panX) || 0, oy: (opts && opts.panY) || 0, W: world.width, H: world.height };
}

/* Planets wrap east-west, so a neighbour can sit on the far edge of the grid.
   Move it next to `ref` instead, so a river crossing the seam draws as a short
   step off the edge rather than a line across the whole map. */
function unwrapX(x, ref, W) {
  if (x - ref > W / 2) return x - W;
  if (ref - x > W / 2) return x + W;
  return x;
}

/* ------------------------------------------------------------ cache (static terrain data per world) */
var caches = typeof WeakMap !== "undefined" ? new WeakMap() : null;

function makeCanvas(w, h) {
  var c = document.createElement("canvas");
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

function boxBlur(src, W, H, r) {
  var tmp = new Float32Array(W * H), out = new Float32Array(W * H), cnt = 2 * r + 1, x, y, k, s;
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    s = 0; for (k = -r; k <= r; k++) s += src[y * W + clamp(x + k, 0, W - 1)];
    tmp[y * W + x] = s / cnt;
  }
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    s = 0; for (k = -r; k <= r; k++) s += tmp[clamp(y + k, 0, H - 1) * W + x];
    out[y * W + x] = s / cnt;
  }
  return out;
}

function getCache(world, pack) {
  var c = caches && caches.get(world);
  var regs = world.regions;
  if (c && c.pack === pack && c.N === regs.length) return c;
  var W = world.width, H = world.height, N = W * H, i;
  c = { pack: pack, W: W, H: H, N: N, galaxy: world.scale === "galaxy", biomeSig: null };
  c.elev = new Float32Array(N); c.barren = new Uint8Array(N);
  for (i = 0; i < N; i++) { c.elev[i] = regs[i].elevation; c.barren[i] = regs[i].barren ? 1 : 0; }
  if (c.galaxy) buildGalaxyCache(c, world);
  else buildPlanetCache(c, world);
  if (caches) caches.set(world, c);
  return c;
}

function buildPlanetCache(c, world) {
  var W = c.W, H = c.H, N = c.N, regs = world.regions, x, y, i;
  c.R = clamp(Math.floor(1600 / W), 2, 6);
  /* coastline segments (grid coords) */
  var seg = [];
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    i = y * W + x;
    if (x < W - 1 && c.barren[i] !== c.barren[i + 1]) seg.push(x + 1, y, x + 1, y + 1);
    if (y < H - 1 && c.barren[i] !== c.barren[i + W]) seg.push(x, y + 1, x + 1, y + 1);
  }
  c.coast = new Float32Array(seg);
  /* rivers */
  var T = world.riverThreshold || 5, ups = {};
  c.rivers = [];
  for (i = 0; i < N; i++) {
    var r = regs[i];
    if (r.river > 0 && r.flowTo >= 0) {
      (ups[r.flowTo] = ups[r.flowTo] || []).push(i);
    }
  }
  for (i = 0; i < N; i++) {
    var rr = regs[i];
    if (rr.river > 0 && rr.flowTo >= 0) c.rivers.push({ c: i, d: rr.flowTo, ups: ups[i] || [], flow: rr.river });
  }
  c.riverT = T;
  /* hillshade at R px per cell */
  var R = c.R, cw = W * R, ch = H * R;
  var hh = new Float32Array(N);
  for (i = 0; i < N; i++) hh[i] = c.barren[i] ? 0.5 : c.elev[i];
  function hAt(gx, gy) {
    var fx = clamp(gx - 0.5, 0, W - 1.001), fy = clamp(gy - 0.5, 0, H - 1.001);
    var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, k = y0 * W + x0;
    return lerp(lerp(hh[k], hh[k + 1], tx), lerp(hh[k + W], hh[k + W + 1], tx), ty);
  }
  c.shade = makeCanvas(cw, ch);
  var sctx = c.shade.getContext("2d"), img = sctx.createImageData(cw, ch), d32 = new Uint32Array(img.data.buffer);
  var py, px, dlt = 0.35;
  for (py = 0; py < ch; py++) {
    var gy = (py + 0.5) / R;
    for (px = 0; px < cw; px++) {
      var gx = (px + 0.5) / R;
      var cell = Math.floor(gy) * W + Math.floor(gx);
      if (c.barren[cell]) { d32[py * cw + px] = 0; continue; }
      var sx = (hAt(gx + dlt, gy) - hAt(gx - dlt, gy)) / (2 * dlt);
      var sy = (hAt(gx, gy + dlt) - hAt(gx, gy - dlt)) / (2 * dlt);
      var s = clamp((sx + sy) * 4.5, -1, 1);
      var a, rch, g, b;
      if (s > 0) { a = Math.round(s * 0.3 * 255); rch = 255; g = 250; b = 235; }
      else { a = Math.round(-s * 0.45 * 255); rch = 10; g = 14; b = 40; }
      d32[py * cw + px] = (a << 24) | (b << 16) | (g << 8) | rch;
    }
  }
  sctx.putImageData(img, 0, 0);
  c.biomeCanvas = makeCanvas(cw, ch);
  c.tint = makeCanvas(W, H);
  c.tintCtx = c.tint.getContext("2d");
  c.tintImg = c.tintCtx.createImageData(W, H);
  c.tint32 = new Uint32Array(c.tintImg.data.buffer);
}

function buildBiomeLayer(c, world) {
  var W = c.W, H = c.H, R = c.R, cw = W * R, ch = H * R, regs = world.regions, pack = c.pack, i;
  var cols = new Float32Array(c.N * 3);
  for (i = 0; i < c.N; i++) {
    var col = biomeRGB(pack, regs[i].biome);
    cols[i * 3] = col[0]; cols[i * 3 + 1] = col[1]; cols[i * 3 + 2] = col[2];
  }
  var ctx = c.biomeCanvas.getContext("2d"), img = ctx.createImageData(cw, ch), d32 = new Uint32Array(img.data.buffer);
  var elev = c.elev, barren = c.barren;
  for (var py = 0; py < ch; py++) {
    var gy = (py + 0.5) / R, cy = Math.floor(gy), fy = clamp(gy - 0.5, -0.5, H - 0.5), y0 = Math.floor(fy), ty = fy - y0;
    for (var px = 0; px < cw; px++) {
      var gx = (px + 0.5) / R, cx = Math.floor(gx), own = cy * W + cx, ob = barren[own];
      var fx = gx - 0.5, x0 = Math.floor(fx), tx = fx - x0;
      var rs = 0, gs = 0, bs = 0, ws = 0, es = 0, ew = 0;
      for (var dy = 0; dy < 2; dy++) {
        var yy = y0 + dy; if (yy < 0 || yy >= H) continue;
        var wy = dy ? ty : 1 - ty;
        for (var dx = 0; dx < 2; dx++) {
          var xx = x0 + dx; if (xx < 0 || xx >= W) continue;
          var k = yy * W + xx, w = (dx ? tx : 1 - tx) * wy;
          if (barren[k] !== ob) continue;
          rs += cols[k * 3] * w; gs += cols[k * 3 + 1] * w; bs += cols[k * 3 + 2] * w; ws += w;
          es += elev[k] * w;
        }
      }
      var r, g, b, e;
      if (ws < 1e-6) { r = cols[own * 3]; g = cols[own * 3 + 1]; b = cols[own * 3 + 2]; e = elev[own]; }
      else { r = rs / ws; g = gs / ws; b = bs / ws; e = es / ws; }
      var m;
      if (ob) {
        m = 0.5 + 0.95 * clamp(e, 0, 0.5) + (vnoise(gx * 1.7, gy * 1.7) - 0.5) * 0.06;
      } else {
        m = 1 + (vnoise(gx * 2.5, gy * 2.5) - 0.5) * 0.14 + (hash2(cx, cy) - 0.5) * 0.06 +
            (vnoise(gx * 9, gy * 9) - 0.5) * 0.05 + (e - 0.55) * 0.22;
      }
      r = clamp(r * m, 0, 255); g = clamp(g * m, 0, 255); b = clamp(b * m, 0, 255);
      d32[py * cw + px] = (255 << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function biomeSignature(world) {
  var regs = world.regions, sig = 0;
  for (var i = 0; i < regs.length; i++) {
    var b = regs[i].biome || "";
    sig = (Math.imul(sig, 31) + b.charCodeAt(0) + b.length * 7 + (b.charCodeAt(1) || 0) * 3) | 0;
  }
  return sig;
}

function buildGalaxyCache(c, world) {
  var W = c.W, H = c.H, N = c.N, regs = world.regions, i;
  c.stars = [];
  for (i = 0; i < N; i++) if (!regs[i].barren) c.stars.push(i);
  var rnd = mulberry(seedNum(world.seed) ^ 0x51ED);
  var count = clamp(Math.round(N * 0.12), 300, 4000);
  c.bg = new Float32Array(count * 4);
  for (i = 0; i < count; i++) {
    c.bg[i * 4] = rnd() * W * 1.3 - W * 0.15;
    c.bg[i * 4 + 1] = rnd() * H * 1.3 - H * 0.15;
    c.bg[i * 4 + 2] = Math.pow(rnd(), 3);          /* brightness */
    c.bg[i * 4 + 3] = rnd();                       /* tint */
  }
  var occ = new Float32Array(N), mx = 0;
  for (i = 0; i < c.stars.length; i++) occ[c.stars[i]] = 1;
  var dens = boxBlur(boxBlur(occ, W, H, 2), W, H, 2);
  for (i = 0; i < N; i++) if (dens[i] > mx) mx = dens[i];
  c.nebula = makeCanvas(W, H);
  var nctx = c.nebula.getContext("2d"), img = nctx.createImageData(W, H);
  for (i = 0; i < N; i++) {
    var t = mx ? Math.pow(dens[i] / mx, 0.55) : 0;
    img.data[i * 4] = 90 + 80 * t; img.data[i * 4 + 1] = 100 + 40 * t; img.data[i * 4 + 2] = 230;
    img.data[i * 4 + 3] = Math.round(t * 120);
  }
  nctx.putImageData(img, 0, 0);
}

/* ------------------------------------------------------------ polity colours */
function polityColor(world, owner, store) {
  var v = store[owner];
  if (v) return v;
  var p = world.polities && world.polities[owner];
  v = parseColor(p && p.color);
  store[owner] = v;
  return v;
}

/* ------------------------------------------------------------ markers & labels */
function starPath(ctx, x, y, r, pts) {
  ctx.beginPath();
  for (var i = 0; i < pts * 2; i++) {
    var rad = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / pts;
    var px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function drawSettlement(ctx, x, y, tier, r, capital, tint) {
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(15,12,10,0.85)";
  ctx.fillStyle = tint || "#f4ecd8";
  if (capital) {
    starPath(ctx, x, y, r * 1.45, 5);
    ctx.fillStyle = "#ffd86b"; ctx.fill(); ctx.stroke();
    return;
  }
  if (tier >= 4) {
    starPath(ctx, x, y, r * 1.25, 4); ctx.fill(); ctx.stroke();
  } else if (tier === 3) {
    ctx.beginPath(); ctx.rect(x - r, y - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(x, y, tier === 2 ? r : r * 0.75, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (tier === 2) { ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fillStyle = "rgba(15,12,10,0.8)"; ctx.fill(); }
  }
}

function placeLabels(ctx, items, cssW, cssH) {
  items.sort(function (a, b) { return b.pri - a.pri; });
  var placed = [], shown = 0;
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  for (var i = 0; i < items.length && shown < 140; i++) {
    var it = items[i];
    var fs = it.fs;
    ctx.font = "600 " + fs + "px system-ui, -apple-system, Segoe UI, sans-serif";
    var w = ctx.measureText(it.text).width, h = fs + 2, r = it.r;
    var cands = [
      [it.x - w / 2, it.y + r + 2], [it.x - w / 2, it.y - r - 2 - h],
      [it.x + r + 4, it.y - h / 2], [it.x - r - 4 - w, it.y - h / 2]
    ];
    for (var k = 0; k < cands.length; k++) {
      var lx = cands[k][0], ly = cands[k][1], ok = true;
      if (lx < 2 || ly < 2 || lx + w > cssW - 2 || ly + h > cssH - 2) continue;
      for (var j = 0; j < placed.length; j++) {
        var p = placed[j];
        if (lx < p[2] && lx + w > p[0] && ly < p[3] && ly + h > p[1]) { ok = false; break; }
      }
      if (!ok) continue;
      placed.push([lx - 1, ly - 1, lx + w + 1, ly + h + 1]);
      ctx.lineWidth = 3; ctx.strokeStyle = it.halo || "rgba(8,10,16,0.78)";
      ctx.strokeText(it.text, lx, ly);
      ctx.fillStyle = it.color || "#f6f1e4";
      ctx.fillText(it.text, lx, ly);
      shown++;
      break;
    }
  }
}

function collectCapitals(world) {
  var caps = {}, id;
  for (id in world.polities) {
    var p = world.polities[id];
    if (p && p.ended == null && p.capital != null) caps[p.capital] = p.color || true;
  }
  return caps;
}

function tierMinForScale(s) { return s >= 14 ? 1 : (s >= 8 ? 2 : (s >= 4.5 ? 3 : 4)); }

/* ------------------------------------------------------------ planet drawing */
function drawPlanet(ctx, world, opts, v, c, pack) {
  var W = c.W, H = c.H, N = c.N, regs = world.regions, s = v.s, mode = opts.mode || "biome", i, x, y;
  var sig = biomeSignature(world);
  if (sig !== c.biomeSig) { buildBiomeLayer(c, world); c.biomeSig = sig; }
  var pcol = {};

  ctx.save();
  ctx.translate(v.ox, v.oy);
  ctx.scale(s, s);
  ctx.imageSmoothingEnabled = true;

  var shadeAlpha = 1;
  if (mode === "biome" || mode === "political") {
    ctx.drawImage(c.biomeCanvas, 0, 0, W, H);
    if (mode === "political") {
      var land = [196, 188, 168], sea = [6, 12, 28], d32 = c.tint32, r;
      for (i = 0; i < N; i++) {
        r = regs[i];
        var col, a;
        if (r.barren) { col = sea; a = 130; }
        else if (r.owner != null && world.polities[r.owner]) { col = polityColor(world, r.owner, pcol); a = 178; }
        else { col = land; a = 150; }
        d32[i] = (a << 24) | (col[2] << 16) | (col[1] << 8) | col[0];
      }
      c.tintCtx.putImageData(c.tintImg, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(c.tint, 0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      shadeAlpha = 0.85;
    }
  } else {
    var maxPop = 1, lutName = mode;
    if (mode === "population") for (i = 0; i < N; i++) if (regs[i].population > maxPop) maxPop = regs[i].population;
    var lm = Math.log(1 + maxPop), lut = LUT[lutName] || LUT.elevation, t32 = c.tint32;
    for (i = 0; i < N; i++) {
      var rg = regs[i], t, ci;
      if (mode === "elevation") t = rg.elevation;
      else if (rg.barren) t = -1;
      else if (mode === "population") t = Math.log(1 + rg.population) / lm;
      else t = rg.habitability;
      if (t < 0) { t32[i] = (255 << 24) | (30 << 16) | (18 << 8) | 8; continue; }
      ci = clamp(Math.round(t * 255), 0, 255) * 3;
      t32[i] = (255 << 24) | (lut[ci + 2] << 16) | (lut[ci + 1] << 8) | lut[ci];
    }
    c.tintCtx.putImageData(c.tintImg, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c.tint, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    shadeAlpha = mode === "elevation" ? 0.55 : 0.45;
  }
  ctx.globalAlpha = shadeAlpha;
  ctx.drawImage(c.shade, 0, 0, W, H);
  ctx.globalAlpha = 1;

  /* coastline */
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  var co = c.coast;
  if (co.length) {
    ctx.beginPath();
    for (i = 0; i < co.length; i += 4) { ctx.moveTo(co[i], co[i + 1]); ctx.lineTo(co[i + 2], co[i + 3]); }
    ctx.strokeStyle = mode === "biome" ? "rgba(20,24,34,0.65)" : "rgba(10,12,20,0.55)";
    ctx.lineWidth = Math.max(1, s * 0.09) / s;
    ctx.stroke();
  }

  /* rivers */
  if (opts.showRivers !== false && c.rivers.length && (mode === "biome" || mode === "political" || mode === "elevation")) {
    var buckets = [[], [], [], [], [], [], []], rv = c.rivers, T = c.riverT, b;
    for (i = 0; i < rv.length; i++) {
      var q = rv[i];
      b = clamp(Math.round(Math.log(q.flow / T) / Math.LN2 * 1.4), 0, 6);
      buckets[b].push(q);
    }
    var rcol = mode === "political" ? "rgba(120,170,225,0.8)" : "rgba(70,125,200,0.92)";
    for (b = 0; b < 7; b++) {
      if (!buckets[b].length) continue;
      ctx.beginPath();
      for (i = 0; i < buckets[b].length; i++) {
        var rq = buckets[b][i], cc = rq.c, dd = rq.d;
        var cx = cc % W + 0.5, cy = ((cc / W) | 0) + 0.5, dx = unwrapX(dd % W + 0.5, cx, W), dy = ((dd / W) | 0) + 0.5;
        var mx = (cx + dx) / 2, my = (cy + dy) / 2;
        if (!rq.ups.length) { ctx.moveTo(cx, cy); ctx.lineTo(mx, my); continue; }
        for (var u = 0; u < rq.ups.length; u++) {
          var uc = rq.ups[u], ux = unwrapX(uc % W + 0.5, cx, W), uy = ((uc / W) | 0) + 0.5;
          ctx.moveTo((ux + cx) / 2, (uy + cy) / 2);
          ctx.quadraticCurveTo(cx, cy, mx, my);
        }
      }
      ctx.strokeStyle = rcol;
      ctx.lineWidth = Math.max(0.9, s * (0.07 + b * 0.028)) / s;
      ctx.stroke();
    }
  }

  /* political borders: only edges between differently-owned tiles */
  if (mode === "political") {
    var casing = [], byOwner = {}, off = 0.11;
    var own = function (idx) { var o = regs[idx].owner; return (o != null && world.polities[o]) ? o : null; };
    var addSide = function (o, x1, y1, x2, y2) {
      if (o == null) return;
      (byOwner[o] = byOwner[o] || []).push(x1, y1, x2, y2);
    };
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x;
      var oa = own(i);
      if (x < W - 1) {
        var ob = own(i + 1);
        if (oa !== ob) {
          if (oa != null && ob != null) casing.push(x + 1, y, x + 1, y + 1);
          addSide(oa, x + 1 - off, y, x + 1 - off, y + 1);
          addSide(ob, x + 1 + off, y, x + 1 + off, y + 1);
        }
      }
      if (y < H - 1) {
        var oc = own(i + W);
        if (oa !== oc) {
          if (oa != null && oc != null) casing.push(x, y + 1, x + 1, y + 1);
          addSide(oa, x, y + 1 - off, x + 1, y + 1 - off);
          addSide(oc, x, y + 1 + off, x + 1, y + 1 + off);
        }
      }
    }
    ctx.lineCap = "square";
    if (casing.length) {
      ctx.beginPath();
      for (i = 0; i < casing.length; i += 4) { ctx.moveTo(casing[i], casing[i + 1]); ctx.lineTo(casing[i + 2], casing[i + 3]); }
      ctx.strokeStyle = "rgba(10,10,18,0.6)";
      ctx.lineWidth = Math.max(2.4, s * 0.26) / s;
      ctx.stroke();
    }
    for (var oid in byOwner) {
      var arr = byOwner[oid], bc = mix(polityColor(world, oid, pcol), [255, 255, 255], 0.28);
      ctx.beginPath();
      for (i = 0; i < arr.length; i += 4) { ctx.moveTo(arr[i], arr[i + 1]); ctx.lineTo(arr[i + 2], arr[i + 3]); }
      ctx.strokeStyle = rgba(bc, 0.95);
      ctx.lineWidth = Math.max(1.3, s * 0.13) / s;
      ctx.stroke();
    }
  }

  /* hover / selection */
  function cellBox(id, style, lw, fill) {
    if (id == null || id < 0 || id >= N) return;
    var cx = id % W, cy = (id / W) | 0;
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(cx, cy, 1, 1); }
    ctx.strokeStyle = style; ctx.lineWidth = lw / s; ctx.lineJoin = "miter";
    ctx.strokeRect(cx, cy, 1, 1);
  }
  cellBox(opts.hoverRegion, "rgba(255,255,255,0.9)", 1.5, "rgba(255,255,255,0.1)");
  cellBox(opts.selectedRegion, "#ffd86b", 2.5, "rgba(255,216,107,0.14)");
  ctx.restore();

  /* markers + labels in screen space */
  var caps = collectCapitals(world), labels = [], minTier = tierMinForScale(s);
  var rBase = clamp(s * 0.2, 2.2, 7) ;
  var x0 = -20, y0 = -20, x1 = v.cssW + 20, y1 = v.cssH + 20;
  for (i = 0; i < N; i++) {
    var rg2 = regs[i], st = rg2.settlement, isCap = caps[i] !== undefined;
    if (!st && !isCap) continue;
    var sx = v.ox + (rg2.x + 0.5) * s, sy = v.oy + (rg2.y + 0.5) * s;
    if (sx < x0 || sy < y0 || sx > x1 || sy > y1) continue;
    var tier = st ? st.tier || 1 : 2;
    if (tier < minTier && !isCap) { if (s < 4) continue; }
    var rad = rBase * (0.7 + tier * 0.22);
    drawSettlement(ctx, sx, sy, tier, rad, isCap && (mode === "political" || tier >= 3 || !st));
    if (opts.showLabels && st && st.name && (tier >= minTier || isCap)) {
      labels.push({ x: sx, y: sy, r: rad, text: st.name, fs: 10 + Math.min(tier, 4), pri: tier * 1e6 + (isCap ? 5e6 : 0) + rg2.population });
    }
  }
  if (opts.showLabels && mode === "political") drawPolityNames(ctx, world, v, c);
  if (opts.showLabels && labels.length) placeLabels(ctx, labels, v.cssW, v.cssH);
}

function drawPolityNames(ctx, world, v, c) {
  var W = c.W, regs = world.regions, sums = {}, i;
  for (i = 0; i < regs.length; i++) {
    var o = regs[i].owner;
    if (o == null || !world.polities[o]) continue;
    var q = sums[o] || (sums[o] = { x: 0, y: 0, n: 0 });
    q.x += regs[i].x + 0.5; q.y += regs[i].y + 0.5; q.n++;
  }
  ctx.save();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (var id in sums) {
    var sm = sums[id], p = world.polities[id];
    if (sm.n < 6 || !p.name) continue;
    var mx = sm.x / sm.n, my = sm.y / sm.n, best = -1, bd = 1e9;
    for (i = 0; i < regs.length; i++) {
      if (regs[i].owner != id) continue;
      var dx = regs[i].x + 0.5 - mx, dy = regs[i].y + 0.5 - my, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    var fs = clamp(Math.sqrt(sm.n) * v.s * 0.55, 11, 34);
    if (v.s * Math.sqrt(sm.n) < 14) continue;
    ctx.font = "700 " + Math.round(fs) + "px Georgia, 'Times New Roman', serif";
    var px = v.ox + (regs[best].x + 0.5) * v.s, py = v.oy + (regs[best].y + 0.5) * v.s;
    var text = p.name.toUpperCase().split("").join(String.fromCharCode(8202));
    ctx.lineWidth = 4; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.strokeText(text, px, py);
    ctx.fillStyle = "rgba(255,255,255,0.72)"; ctx.fillText(text, px, py);
  }
  ctx.restore();
}

/* ------------------------------------------------------------ galaxy drawing */
var spriteCache = {};
function glowSprite(col) {
  var key = (col[0] | 0) + "," + (col[1] | 0) + "," + (col[2] | 0);
  var sp = spriteCache[key];
  if (sp) return sp;
  sp = makeCanvas(64, 64);
  var g = sp.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.18, rgba(col, 0.55));
  gr.addColorStop(0.5, rgba(col, 0.12)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  spriteCache[key] = sp;
  return sp;
}

function starColor(mode, r, pack, world, maxPop) {
  if (mode === "population") return lutColor("population", 0.15 + 0.85 * Math.log(1 + r.population) / Math.log(1 + maxPop));
  if (mode === "elevation") return lutColor("elevation", 0.3 + 0.7 * r.elevation);
  if (mode === "habitability") return lutColor("habitability", 0.2 + 0.8 * r.habitability);
  return mix(biomeRGB(pack, r.biome), [255, 255, 255], 0.3);
}

function starRadius(r, s) {
  var zf = clamp(Math.sqrt(s / 4) * 0.9, 0.75, 3.2);
  return (0.9 + r.habitability * 2.0 + r.elevation * 0.8) * zf;
}

function drawGalaxy(ctx, world, opts, v, c, pack) {
  var W = c.W, H = c.H, regs = world.regions, s = v.s, mode = opts.mode || "biome", i, j;
  var political = mode === "political";
  /* void */
  var bg = ctx.createRadialGradient(v.cssW / 2, v.cssH / 2, 0, v.cssW / 2, v.cssH / 2, Math.max(v.cssW, v.cssH) * 0.75);
  bg.addColorStop(0, "#080a16"); bg.addColorStop(1, "#02030a");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, v.cssW, v.cssH);

  /* starfield + nebula (move with the map) */
  var nb = c.bg, tints = [[190, 210, 255], [255, 244, 220], [255, 210, 190]];
  for (i = 0; i < nb.length; i += 4) {
    var px = v.ox + nb[i] * s, py = v.oy + nb[i + 1] * s;
    if (px < 0 || py < 0 || px > v.cssW || py > v.cssH) continue;
    var br = nb[i + 2], tc = tints[Math.floor(nb[i + 3] * 3) % 3];
    ctx.fillStyle = rgba(tc, 0.12 + br * 0.6);
    var sz = br > 0.6 ? 1.4 : 1;
    ctx.fillRect(px, py, sz, sz);
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = political ? 0.35 : 0.6;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c.nebula, v.ox, v.oy, W * s, H * s);
  ctx.restore();

  var maxPop = 1, stars = c.stars, pcol = {}, owners = {};
  if (mode === "population") for (i = 0; i < stars.length; i++) if (regs[stars[i]].population > maxPop) maxPop = regs[stars[i]].population;
  function pos(r) { return [v.ox + (r.x + 0.5 + (r.jx || 0)) * s, v.oy + (r.y + 0.5 + (r.jy || 0)) * s]; }

  /* hyperlanes */
  var faint = [], lanesByOwner = {};
  for (i = 0; i < stars.length; i++) {
    var a = regs[stars[i]], pa = pos(a);
    for (j = 0; j < a.neighbors.length; j++) {
      var bid = a.neighbors[j];
      if (bid < a.id) continue;
      var b = regs[bid], pb = pos(b);
      if ((pa[0] < -50 && pb[0] < -50) || (pa[0] > v.cssW + 50 && pb[0] > v.cssW + 50) ||
          (pa[1] < -50 && pb[1] < -50) || (pa[1] > v.cssH + 50 && pb[1] > v.cssH + 50)) continue;
      if (a.owner != null && a.owner === b.owner && world.polities[a.owner]) (lanesByOwner[a.owner] = lanesByOwner[a.owner] || []).push(pa[0], pa[1], pb[0], pb[1]);
      else faint.push(pa[0], pa[1], pb[0], pb[1]);
    }
  }
  ctx.lineCap = "round";
  if (faint.length) {
    ctx.beginPath();
    for (i = 0; i < faint.length; i += 4) { ctx.moveTo(faint[i], faint[i + 1]); ctx.lineTo(faint[i + 2], faint[i + 3]); }
    ctx.strokeStyle = "rgba(120,150,215,0.17)"; ctx.lineWidth = 0.8; ctx.stroke();
  }
  for (var oid in lanesByOwner) {
    var la = lanesByOwner[oid], lc = polityColor(world, oid, pcol);
    ctx.beginPath();
    for (i = 0; i < la.length; i += 4) { ctx.moveTo(la[i], la[i + 1]); ctx.lineTo(la[i + 2], la[i + 3]); }
    ctx.strokeStyle = rgba(mix(lc, [255, 255, 255], 0.2), political ? 0.6 : 0.4);
    ctx.lineWidth = political ? 1.5 : 1.1; ctx.stroke();
  }

  /* territory glow for owned systems */
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (political) {
    for (i = 0; i < stars.length; i++) {
      var ro = regs[stars[i]];
      if (ro.owner == null || !world.polities[ro.owner]) continue;
      var po = pos(ro), rr = Math.max(14, s * 2.6);
      ctx.globalAlpha = 0.2;
      ctx.drawImage(glowSprite(polityColor(world, ro.owner, pcol)), po[0] - rr, po[1] - rr, rr * 2, rr * 2);
    }
  }
  ctx.globalAlpha = 1;
  /* star glows */
  for (i = 0; i < stars.length; i++) {
    var r = regs[stars[i]], p = pos(r);
    if (p[0] < -30 || p[1] < -30 || p[0] > v.cssW + 30 || p[1] > v.cssH + 30) continue;
    var col = starColor(mode, r, pack, world, maxPop), rad = starRadius(r, s), gr = rad * 5;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(glowSprite(col), p[0] - gr, p[1] - gr, gr * 2, gr * 2);
  }
  ctx.restore();

  /* cores, halos, markers */
  var caps = collectCapitals(world), labels = [], minTier = tierMinForScale(s * 1.4);
  for (i = 0; i < stars.length; i++) {
    var rg = regs[stars[i]], q = pos(rg);
    if (q[0] < -30 || q[1] < -30 || q[0] > v.cssW + 30 || q[1] > v.cssH + 30) continue;
    var rd = starRadius(rg, s), cl = starColor(mode, rg, pack, world, maxPop);
    if (rg.owner != null && world.polities[rg.owner]) {
      var oc = polityColor(world, rg.owner, pcol);
      ctx.beginPath(); ctx.arc(q[0], q[1], rd + (political ? 4.5 : 3.5), 0, Math.PI * 2);
      ctx.strokeStyle = rgba(oc, 0.95); ctx.lineWidth = political ? 1.8 : 1.3; ctx.stroke();
      ctx.fillStyle = rgba(oc, political ? 0.22 : 0.14); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(0.9, rd * 0.55), 0, Math.PI * 2);
    ctx.fillStyle = rgba(mix(cl, [255, 255, 255], 0.65), 1); ctx.fill();
    var cap = caps[rg.id] !== undefined, st = rg.settlement;
    if (cap) drawSettlement(ctx, q[0], q[1] - rd - 7, 4, 3.2, true);
    else if (st) {
      ctx.beginPath(); ctx.arc(q[0], q[1], rd + 2 + (st.tier || 1) * 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,240,200,0.55)"; ctx.lineWidth = 0.9; ctx.stroke();
    }
    if (opts.showLabels && st && st.name && ((st.tier || 1) >= minTier || cap)) {
      labels.push({ x: q[0], y: q[1], r: rd + 5, text: st.name, fs: 10 + Math.min(st.tier || 1, 4), pri: (st.tier || 1) * 1e6 + (cap ? 5e6 : 0) + rg.population, color: "#e8eeff" });
    }
  }
  /* hover / selection rings */
  function ring(id, col, lw, extra) {
    if (id == null || !regs[id] || regs[id].barren) return;
    var pp = pos(regs[id]), rr2 = starRadius(regs[id], s) + extra;
    ctx.beginPath(); ctx.arc(pp[0], pp[1], rr2, 0, Math.PI * 2);
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
  }
  ring(opts.hoverRegion, "rgba(255,255,255,0.9)", 1.3, 7);
  ring(opts.selectedRegion, "#ffd86b", 2, 9);
  if (opts.showLabels && labels.length) placeLabels(ctx, labels, v.cssW, v.cssH);
}

/* ------------------------------------------------------------ public API */
function draw(canvas, world, opts) {
  opts = opts || {};
  if (!canvas || !world || !world.regions || !world.regions.length) return;
  var v = makeView(canvas, world, opts);
  var pw = Math.round(v.cssW * v.dpr), ph = Math.round(v.cssH * v.dpr);
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
  var ctx = canvas.getContext("2d");
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  canvas._aeonView = v;
  var pack = getPack(world, opts), c = getCache(world, pack);
  if (c.galaxy) {
    drawGalaxy(ctx, world, opts, v, c, pack);
  } else {
    ctx.fillStyle = "#06090f"; ctx.fillRect(0, 0, v.cssW, v.cssH);
    drawPlanet(ctx, world, opts, v, c, pack);
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1;
    ctx.strokeRect(v.ox, v.oy, c.W * v.s, c.H * v.s);
  }
}

function hitTest(canvas, world, px, py, opts) {
  if (!canvas || !world || !world.regions || !world.regions.length) return null;
  var v = opts ? makeView(canvas, world, opts) : (canvas._aeonView || makeView(canvas, world, null));
  var s = v.s, W = world.width, H = world.height;
  var gx = (px - v.ox) / s, gy = (py - v.oy) / s;
  if (world.scale !== "galaxy") {
    var cx = Math.floor(gx), cy = Math.floor(gy);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return null;
    return cy * W + cx;
  }
  var regs = world.regions, best = null, bestD = 1e9;
  var reach = Math.ceil(12 / s) + 1;
  var bx = Math.floor(gx), by = Math.floor(gy);
  for (var yy = by - reach; yy <= by + reach; yy++) {
    if (yy < 0 || yy >= H) continue;
    for (var xx = bx - reach; xx <= bx + reach; xx++) {
      if (xx < 0 || xx >= W) continue;
      var r = regs[yy * W + xx];
      if (r.barren) continue;
      var sx = v.ox + (r.x + 0.5 + (r.jx || 0)) * s, sy = v.oy + (r.y + 0.5 + (r.jy || 0)) * s;
      var d = Math.sqrt((sx - px) * (sx - px) + (sy - py) * (sy - py));
      if (d < bestD && d <= Math.max(8, starRadius(r, s) + 5)) { bestD = d; best = r.id; }
    }
  }
  return best;
}

AEON.render = { draw: draw, modes: MODES, hitTest: hitTest };

})();
