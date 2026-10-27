/* Aeon - region history harness (docs/REGION_PROTOTYPE.md, step 2).

   Plays the history of a few squares per seed with AEON.createRegion and checks it against the
   world sketch: the years the ages are reached, every contact told, the sketch's outcomes held
   (and how long the newcomers last after), realm counts and sizes, and run time.

     node tools/region-history.js                  18 seeds, 3 squares each, historical
     node tools/region-history.js --seeds 7,42 --pack fantasy --squares 2
     node tools/region-history.js --seeds 7 --show 3,1   print one region's chronicle

   Writes tools/out/regions/history.txt. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const opt = (name) => { const k = args.indexOf(name); return k >= 0 ? args[k + 1] : null; };
const SEEDS = opt("--seeds") ? opt("--seeds").split(",").map(Number)
  : [1, 7, 42, 99, 123, 256, 404, 777, 1000, 1234, 2024, 3141, 4242, 5150, 8080, 9001, 31337, 65535];
const PER = Number(opt("--squares") || 3);
const PACK = opt("--pack") || "historical";
const SHOW = opt("--show");
const OUT = path.join(__dirname, "out", "regions");

const ctx = { console: console, Math: Math, Date: Date };
ctx.window = ctx; ctx.self = ctx;
vm.createContext(ctx);
for (const f of ["js/rng.js", "js/core.js", "js/planetgen.js", "js/worldgen.js", "js/sketch.js", "js/region.js", "packs/historical.js", "packs/fantasy.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
}
const AEON = ctx.AEON;
const r2 = (v) => Math.round(v * 100) / 100;

function play(planet, si) {
  const t0 = Date.now();
  const w = AEON.createRegion(planet, si);
  const tCreate = Date.now() - t0;
  const sk = planet.sketch, sq = sk.squares[si], pack = w.pack, ages = pack.ages;
  const land = w.regions.filter((r) => !r.beyond && !r.barren).length;
  const living = () => Object.values(w.polities).filter((p) => !p.ended);
  const start = living().length;
  let peak = start, peakShare = 0;
  const reached = ages.map(() => null);
  const t1 = Date.now();
  while (w.year < w.endYear) {
    AEON.tick(w);
    const alive = living();
    peak = Math.max(peak, alive.length);
    for (const p of alive) peakShare = Math.max(peakShare, p.regions.length / land);
    /* the year half the living realms have reached each age */
    const as = alive.map((p) => p.age || 0).sort((a, b) => a - b), med = as.length ? as[Math.floor(as.length / 2)] : 0;
    for (let k = 1; k <= med; k++) if (reached[k] == null) reached[k] = w.year;
  }
  AEON.finish(w);
  const tRun = Date.now() - t1;
  const S = w._sketch;
  const expected = S.contacts.length, told = new Set(w.chronicle.filter((e) => e.sketch).map((e) => e.sketch.year + e.sketch.kind + e.sketch.from + e.sketch.to)).size;
  const done = S.done || [];
  /* the outcome held: the newcomers holding about the share the sketch gives when their campaign ends */
  const held = done.map((d) => d.got / d.target);
  const lasted = done.map((d) => { const p = w.polities[d.p]; return (p.ended == null ? w.year : p.ended) - d.year; });
  const ageDiff = ages.map((a, k) => (k && reached[k] != null && sq.ageYears[k] != null ? reached[k] - sq.ageYears[k] : null)).filter((v) => v != null);
  const alive = living();
  return {
    w: w, square: sq.id, peoples: sq.peoples.length, createMs: tCreate, runMs: tRun, events: w.chronicle.length,
    realmsStart: start, realmsPeak: peak, realmsEnd: alive.length, polities: Object.keys(w.polities).length,
    ownedEnd: r2(w.regions.filter((r) => !r.beyond && !r.barren && r.owner).length / land),
    vassalsAfterConquest: done.filter((d) => d.c.outcome === "conquest").map((d) => d.vassals).join(",") || null,
    largestEnd: r2(Math.max(0, ...alive.map((p) => p.regions.length / land))), largestEver: r2(peakShare),
    contacts: expected, told: told, campaigns: done.length, heldMin: held.length ? r2(Math.min(...held)) : null,
    waves: done.reduce((s, d) => s + d.waves - 1, 0), lastedMedian: lasted.length ? lasted.sort((a, b) => a - b)[Math.floor(lasted.length / 2)] : null,
    ageDiffs: ageDiff, ageDiffMax: ageDiff.length ? Math.max(...ageDiff.map(Math.abs)) : null,
  };
}

fs.mkdirSync(OUT, { recursive: true });
const rows = [], t0 = Date.now();
for (const seed of SEEDS) {
  const planet = AEON.createWorld({ packId: PACK, seed: seed });
  let picks = planet.sketch.squares.map((s, i) => ({ i: i, land: s.land, lived: s.peoples.length })).filter((s) => s.lived)
    .sort((a, b) => b.land - a.land).slice(0, PER).map((s) => s.i);
  if (SHOW) picks = [planet.sketch.squares.findIndex((s) => s.id === SHOW)];
  for (const si of picks) {
    const m = play(planet, si); m.seed = seed;
    if (SHOW) {
      for (const e of m.w.chronicle) if (e.importance >= 3 || e.sketch) console.log(PACK === "fantasy" ? e.year : e.year, (e.sketch ? "*" : " ") + e.text);
    }
    delete m.w; rows.push(m);
  }
  process.stdout.write(".");
}
process.stdout.write(" " + (Date.now() - t0) + " ms\n");

const keys = ["createMs", "runMs", "events", "realmsStart", "realmsPeak", "realmsEnd", "polities", "ownedEnd", "largestEnd", "largestEver", "contacts", "told", "campaigns", "heldMin", "waves", "lastedMedian", "ageDiffMax"];
const q = (vals, f) => { const s = vals.filter((v) => v != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : null; };
const lines = ["Aeon region history harness - " + SEEDS.length + " seeds x " + PER + " squares, " + PACK, "", "min / median / max over " + rows.length + " regions:"];
for (const k of keys) { const v = rows.map((r) => r[k]); lines.push("  " + k.padEnd(14) + q(v, 0) + " / " + q(v, 0.5) + " / " + q(v, 0.999)); }
const allDiffs = rows.flatMap((r) => r.ageDiffs);
lines.push("  ageDiff (each age, region minus sketch, years): " + q(allDiffs, 0) + " / " + q(allDiffs, 0.1) + " / " + q(allDiffs, 0.5) + " / " + q(allDiffs, 0.9) + " / " + q(allDiffs, 0.999) + "  (min / p10 / median / p90 / max)");
lines.push("", "per region:");
for (const r of rows) lines.push("  seed " + String(r.seed).padEnd(6) + r.square + "  " + keys.map((k) => k + " " + r[k]).join("  ") + "  ages " + r.ageDiffs.join(","));
const summary = lines.join("\n");
console.log(summary.split("\n").slice(0, keys.length + 5).join("\n"));
fs.writeFileSync(path.join(OUT, PACK === "historical" ? "history.txt" : "history-" + PACK + ".txt"), summary + "\n");
