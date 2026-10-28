/* Aeon - region harness (docs/REGION_PROTOTYPE.md, step 1).

   Makes regions with AEON.regiongen for several seeds and squares, compares each with the
   planet square it refines, and renders them side by side: the planet's biomes, the region's
   biomes with its rivers, and the region's relief. Terrain only, no history.

     node tools/region-report.js                 18 seeds, 3 squares each
     node tools/region-report.js --seeds 7,42    chosen seeds
     node tools/region-report.js --no-png        numbers only

   Output in tools/out/regions/: region-<seed>-<square>.png and summary.txt. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const opt = (name) => { const k = args.indexOf(name); return k >= 0 ? args[k + 1] : null; };
const SEEDS = opt("--seeds") ? opt("--seeds").split(",").map(Number)
  : [1, 7, 42, 99, 123, 256, 404, 777, 1000, 1234, 2024, 3141, 4242, 5150, 8080, 9001, 31337, 65535];
const PER = Number(opt("--squares") || 3);
const PNG = !args.includes("--no-png");
const OUT = opt("--out") || path.join(__dirname, "out", "regions");

const ctx = { console: console, Math: Math, Date: Date };
ctx.window = ctx; ctx.self = ctx;
vm.createContext(ctx);
for (const f of ["js/rng.js", "js/core.js", "js/planetgen.js", "js/worldgen.js", "js/sketch.js", "packs/historical.js", "packs/fantasy.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
}
const AEON = ctx.AEON;

/* ---- tiny PNG writer ---- */
function Img(w, h) {
  const d = new Uint8Array(w * h * 3).fill(30);
  return {
    w: w, h: h, d: d,
    set(x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return; const k = (y * w + x) * 3; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; },
    rect(x, y, rw, rh, c) { for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) this.set(xx, yy, c); },
  };
}
const CRC = (function () { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function savePNG(img, file) {
  const raw = Buffer.alloc((img.w * 3 + 1) * img.h);
  for (let y = 0; y < img.h; y++) { raw[y * (img.w * 3 + 1)] = 0; Buffer.from(img.d.buffer, y * img.w * 3, img.w * 3).copy(raw, y * (img.w * 3 + 1) + 1); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BIOME = Object.fromEntries(Object.entries(AEON.packs.historical.biomes).map(([k, v]) => [k, hex(v.color)]));
const SEA = [52, 84, 140], LAKE = [90, 150, 220], RIVER = [40, 110, 230];
const mixc = (a, b, t) => a.map((v, k) => Math.round(v * (1 - t) + b[k] * t));
const colourOf = (r) => r.lake ? LAKE : r.barren ? SEA : BIOME[r.biome] || [200, 0, 200];

/* ---- measuring ---- */
const r2 = (v) => Math.round(v * 100) / 100;
function compare(world, reg) {
  const sq = world.sketch.squares[reg.squareIndex], PW = world.width, R = world.regions;
  const inner = reg.regions.filter((r) => !r.beyond);
  /* the planet square's cells */
  const pc = [];
  for (let y = sq.y0; y < sq.y1; y++) for (let x = sq.x0; x < sq.x1; x++) pc.push(R[y * PW + x]);
  const share = (cells, f) => cells.filter(f).length / cells.length;
  const landF = share(inner, (r) => !r.barren || r.lake), landP = share(pc, (r) => !r.barren || r.lake);
  const agree = share(inner, (r) => (r.barren && !r.lake) === (R[r.planet].barren && !R[r.planet].lake));
  const biomes = (cells) => { const o = {}; let n = 0; for (const r of cells) if (!r.barren) { o[r.biome] = (o[r.biome] || 0) + 1; n++; } for (const k in o) o[k] /= n; return o; };
  const bf = biomes(inner), bp = biomes(pc);
  let l1 = 0; for (const k of new Set(Object.keys(bf).concat(Object.keys(bp)))) l1 += Math.abs((bf[k] || 0) - (bp[k] || 0));
  const g = reg._gen, W = reg.width;
  const rivers = inner.filter((r) => r.river > 0);
  /* a river in a valley: lower than the mean of its 8 neighbours */
  let low = 0;
  for (const r of rivers) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const x = r.x + dx, y = r.y + dy;
      if (x < 0 || y < 0 || x >= W || y >= reg.height) continue; s += g.E[y * W + x]; n++;
    }
    if (g.E[r.id] <= s / n) low++;
  }
  return {
    square: reg.square, cells: reg.width * reg.height, inner: inner.length, ms: g.ms,
    landPlanet: r2(landP), landRegion: r2(landF), coastAgree: r2(agree),
    biomeDiff: r2(l1 / 2), riverShare: r2(share(inner.filter((r) => !r.barren), (r) => r.river > 0)),
    riversInValleys: rivers.length ? r2(low / rivers.length) : null,
    lakes: inner.filter((r) => r.lake).length,
    /* lakes where the planet has them: area shares, and overlap (both lake / either lake) */
    lakePlanet: r2(share(pc, (r) => r.lake)), lakeRegion: r2(share(inner, (r) => r.lake)),
    lakeOverlap: (function () { const e = inner.filter((r) => r.lake || R[r.planet].lake); return e.length ? r2(e.filter((r) => r.lake && R[r.planet].lake).length / e.length) : null; })(),
    desertPlanet: r2(share(pc.filter((r) => !r.barren), (r) => r.biome === "desert")),
    desert: r2(share(inner.filter((r) => !r.barren), (r) => r.biome === "desert")),
    mountain: r2(share(inner.filter((r) => !r.barren), (r) => r.biome === "mountain")),
    mountainPlanet: r2(share(pc.filter((r) => !r.barren), (r) => r.biome === "mountain")),
    habitable: r2(share(inner.filter((r) => !r.barren), (r) => r.habitability > 0.35)),
    habitablePlanet: r2(share(pc.filter((r) => !r.barren), (r) => r.habitability > 0.35)),
  };
}

/* ---- rendering: planet window | region biomes and rivers | region relief ---- */
function render(world, reg, file) {
  const K = reg.K, W = reg.width, H = reg.height, S = 3, PW = world.width, R = world.regions, g = reg._gen;
  const pw = W * S, gap = 8, img = Img(pw * 3 + gap * 2, H * S);
  const inner = (x, y) => !reg.regions[y * W + x].beyond;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = reg.regions[y * W + x], p = R[r.planet];
    let a = colourOf(p), b = colourOf(r);
    if (r.river > 0) b = RIVER;
    /* relief: shaded from the north-west */
    const e = g.E[r.id], ew = g.E[y * W + Math.max(0, x - 1)], en = g.E[Math.max(0, y - 1) * W + x];
    const shade = Math.max(-1, Math.min(1, ((e - ew) + (e - en)) * 25));
    let c = r.barren && !r.lake ? mixc(SEA, [10, 20, 50], Math.min(1, (0.5 - e) * 2)) : mixc([120, 150, 90], [235, 225, 200], Math.min(1, (e - 0.5) * 2.2));
    if (!r.barren) c = shade > 0 ? mixc(c, [255, 255, 240], shade * 0.5) : mixc(c, [20, 20, 30], -shade * 0.5);
    if (!inner(x, y)) { a = mixc(a, [30, 30, 30], 0.45); b = mixc(b, [30, 30, 30], 0.45); c = mixc(c, [30, 30, 30], 0.45); }
    img.rect(x * S, y * S, S, S, a);
    img.rect(pw + gap + x * S, y * S, S, S, b);
    img.rect(2 * (pw + gap) + x * S, y * S, S, S, c);
  }
  savePNG(img, file);
}

/* ---- run ---- */
if (PNG) fs.mkdirSync(OUT, { recursive: true });
const rows = [], t0 = Date.now();
for (const seed of SEEDS) {
  const world = AEON.createWorld({ packId: "historical", seed: seed });
  const pick = world.sketch.squares.map((s, i) => ({ i: i, land: s.land, lived: s.peoples.length }))
    .filter((s) => s.lived).sort((a, b) => b.land - a.land).slice(0, PER);
  for (const p of pick) {
    const reg = AEON.regiongen(world, p.i);
    const m = compare(world, reg); m.seed = seed; rows.push(m);
    if (PNG) render(world, reg, path.join(OUT, "region-" + seed + "-" + reg.square.replace(",", "_") + ".png"));
  }
  process.stdout.write(".");
}
process.stdout.write(" " + (Date.now() - t0) + " ms\n");

const keys = ["cells", "inner", "ms", "landPlanet", "landRegion", "coastAgree", "biomeDiff", "riverShare", "riversInValleys", "lakes", "lakePlanet", "lakeRegion", "lakeOverlap", "desertPlanet", "desert", "mountainPlanet", "mountain", "habitablePlanet", "habitable"];
const q = (vals, f) => { const s = vals.filter((v) => v != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : null; };
const lines = ["Aeon region harness - " + SEEDS.length + " seeds x " + PER + " squares (the largest lived ones), historical pack", "", "min / median / max over " + rows.length + " regions:"];
for (const k of keys) { const v = rows.map((r) => r[k]); lines.push("  " + k.padEnd(18) + q(v, 0) + " / " + q(v, 0.5) + " / " + q(v, 0.999)); }
lines.push("", "per region:");
for (const r of rows) lines.push("  seed " + String(r.seed).padEnd(6) + " square " + r.square + "  " + keys.slice(2).map((k) => k + " " + r[k]).join("  "));
const summary = lines.join("\n");
console.log(summary.split("\n").slice(0, keys.length + 4).join("\n"));
if (PNG) fs.writeFileSync(path.join(OUT, "summary.txt"), summary + "\n");
