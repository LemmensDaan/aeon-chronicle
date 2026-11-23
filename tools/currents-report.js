/* Aeon - ocean currents check (docs/OCEAN_CURRENTS.md).

   Builds the planet only (no history) for some seeds and draws, per seed, the sea's
   temperature anomaly (blue cold, red warm), the coastal upwelling (cyan) and the currents
   (white arrows), with the land in grey. Prints a few numbers per seed: how long the
   generation took, the spread of the anomaly, and whether the subtropical gyres turn the way
   Earth's do (poleward flow along western shores, equatorward along eastern ones).

     node tools/currents-report.js                  seeds 1,7,42,99
     node tools/currents-report.js --seeds 3,11     chosen seeds
     node tools/currents-report.js --out <dir>      where the PNGs go (default tools/out) */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const opt = (name) => { const k = args.indexOf(name); return k >= 0 ? args[k + 1] : null; };
const SEEDS = (opt("--seeds") || "1,7,42,99").split(",").map(Number);
const PACK = opt("--pack") || "historical";
const OUT = opt("--out") || path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });

const ctx = { console: console, Math: Math, Date: Date };
ctx.window = ctx; ctx.self = ctx;
vm.createContext(ctx);
for (const f of ["js/rng.js", "js/core.js", "js/campaigns.js", "js/fastlayer.js", "js/tribes.js", "js/nudges.js", "js/planetgen.js", "js/worldgen.js", "js/sketch.js", "packs/historical.js", "packs/fantasy.js"])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const AEON = ctx.AEON;

const CT = 1 / 55.6;
const CRC = (function () { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function savePNG(w, h, d, file) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(d.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

for (const seed of SEEDS) {
  const t0 = Date.now();
  const world = AEON.createWorld({ packId: PACK, seed: seed });
  const ms = Date.now() - t0;
  const g = world._gen, W = world.width, H = world.height, N = W * H;
  const sea = (i) => g.E[i] <= 0.5;
  const lat = (y) => 75 * (1 - 2 * (y + 0.5) / H);
  if (!g.CU) { console.log("seed " + seed + ": no currents in _gen"); continue; }

  /* the anomaly over the sea, deg C: the water against its latitude's level */
  const T0 = (y) => 0.02 + 0.88 * Math.pow(Math.max(0, Math.cos(lat(y) * Math.PI / 180)), 1.35);
  const A = new Float32Array(N);
  const vals = [];
  for (let i = 0; i < N; i++) if (sea(i)) { A[i] = (g.SST[i] - T0((i / W) | 0)) / CT; vals.push(A[i]); }
  vals.sort((a, b) => a - b);
  const q = (p) => vals[Math.floor(p * (vals.length - 1))].toFixed(1);

  /* gyre sense: sea cells 15-40 deg with land 1-2 cells to the west (a western shore of the
     basin) should flow poleward; with land 1-2 cells to the east, equatorward */
  let wP = 0, wN = 0, eP = 0, eN = 0;
  for (let y = 1; y < H - 1; y++) {
    const L = lat(y), d = Math.abs(L);
    if (d < 15 || d > 40) continue;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!sea(i)) continue;
      const landW = !sea(y * W + (x + W - 1) % W) || !sea(y * W + (x + W - 2) % W);
      const landE = !sea(y * W + (x + 1) % W) || !sea(y * W + (x + 2) % W);
      const pole = L > 0 ? -g.CV[i] : g.CV[i];
      if (landW && !landE) { if (pole > 0) wP++; else wN++; }
      if (landE && !landW) { if (pole > 0) eP++; else eN++; }
    }
  }
  let upN = 0; for (let i = 0; i < N; i++) if (g.upwell[i] > 0.3) upN++;
  console.log("seed " + seed + ": " + ms + " ms; anomaly C p5 " + q(0.05) + " p50 " + q(0.5) + " p95 " + q(0.95) +
    "; western shores poleward " + Math.round(100 * wP / Math.max(1, wP + wN)) + "% (" + (wP + wN) + ")" +
    ", eastern shores equatorward " + Math.round(100 * eN / Math.max(1, eP + eN)) + "% (" + (eP + eN) + ")" +
    "; upwelling cells " + upN);

  /* picture: S pixels a cell */
  const S = 8, w = W * S, h = H * S, d = new Uint8Array(w * h * 3);
  const set = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const k = (y * w + x) * 3; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let c;
    if (!sea(i)) c = [120, 120, 112];
    else {
      const a = Math.max(-1, Math.min(1, A[i] / 10));
      c = a >= 0 ? [Math.round(40 + 215 * a), Math.round(60 + 20 * (1 - a)), Math.round(110 * (1 - a))] : [Math.round(40 * (1 + a)), Math.round(60 + 60 * -a), Math.round(110 + 145 * -a)];
      if (g.upwell[i] > 0.05) { const u = Math.min(1, g.upwell[i]); c = [c[0] * (1 - u) | 0, Math.round(c[1] * (1 - u) + 255 * u), Math.round(c[2] * (1 - u) + 255 * u)]; }
    }
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) set(x * S + xx, y * S + yy, c);
  }
  for (let y = 1; y < H - 1; y += 2) for (let x = 0; x < W; x += 2) {
    const i = y * W + x;
    if (!sea(i)) continue;
    const u = g.CU[i], v = g.CV[i], s = Math.hypot(u, v);
    if (s < 0.05) continue;
    const cx = x * S + S / 2, cy = y * S + S / 2, L = Math.min(2.2, s) * S * 0.9;
    const ex = cx + u / s * L, ey = cy + v / s * L;
    for (let k = 0; k <= 12; k++) set(Math.round(cx + (ex - cx) * k / 12), Math.round(cy + (ey - cy) * k / 12), [255, 255, 255]);
    set(Math.round(ex), Math.round(ey), [255, 230, 0]); set(Math.round(ex) + 1, Math.round(ey), [255, 230, 0]); set(Math.round(ex), Math.round(ey) + 1, [255, 230, 0]);
  }
  savePNG(w, h, d, path.join(OUT, "currents-" + seed + ".png"));
}
