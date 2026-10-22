/* Shared helpers for the three style samples. Each sample renders the SAME world
   for a given seed (kept in the URL hash), so the styles can be compared directly. */
(function () {
"use strict";

const BIOME_KEYS = ["barren", "ice", "tundra", "taiga", "grassland", "forest",
                    "jungle", "savanna", "desert", "mountain", "swamp"];
const HAB = { barren: 0, ice: 0.04, tundra: 0.18, taiga: 0.4, grassland: 0.85, forest: 0.72,
              jungle: 0.6, savanna: 0.62, desert: 0.12, mountain: 0.15, swamp: 0.35 };

function seedFromHash() {
  const m = /seed=(\d+)/.exec(location.hash);
  if (m) return Number(m[1]);
  const s = Math.floor(Math.random() * 1e6);
  history.replaceState(null, "", "#seed=" + s);
  return s;
}

function makeWorld(seed, w, h) {
  const biomes = {};
  BIOME_KEYS.forEach(function (k) { biomes[k] = { name: k, habitability: HAB[k] }; });
  const world = { seed: seed, width: w || 150, height: h || 95, scale: "planet" };
  AEON.worldgen.generate(world, { biomes: biomes }, AEON.RNG(seed));
  return world;
}

/* Bilinear sample of a numeric region field at fractional cell coordinates.
   Cell (i,j) has its centre at (i+0.5, j+0.5). */
function field(world, key, fx, fy) {
  const W = world.width, H = world.height;
  let x = fx - 0.5, y = fy - 0.5;
  if (x < 0) x = 0; if (y < 0) y = 0;
  if (x > W - 1) x = W - 1; if (y > H - 1) y = H - 1;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
  const tx = x - x0, ty = y - y0, R = world.regions;
  const a = R[y0 * W + x0][key], b = R[y0 * W + x1][key];
  const c = R[y1 * W + x0][key], d = R[y1 * W + x1][key];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

function cell(world, fx, fy) {
  const x = Math.max(0, Math.min(world.width - 1, Math.floor(fx)));
  const y = Math.max(0, Math.min(world.height - 1, Math.floor(fy)));
  return world.regions[y * world.width + x];
}

/* Pick n well-spaced, habitable sites to stand in for settlements. */
function sites(world, n, minDist, rng) {
  const cand = world.regions.filter(function (r) { return !r.barren && r.habitability > 0.45; })
    .sort(function (a, b) { return b.habitability - a.habitability; }).slice(0, 400);
  const out = [];
  for (const r of rng.shuffle(cand)) {
    if (out.length >= n) break;
    if (out.every(function (o) { return Math.hypot(o.x - r.x, o.y - r.y) >= minDist; })) out.push(r);
  }
  return out;
}

/* A tiny syllable namer, just so sample maps have plausible labels. */
const NAME_SETS = {
  fantasy: { a: ["Ael", "Bryn", "Cael", "Dun", "Eld", "Fen", "Gal", "Hol", "Ith", "Kael", "Lor", "Myr", "Nor", "Orm", "Thal", "Val", "Wyn", "Zar"],
             b: ["ador", "ath", "dell", "dor", "fall", "gard", "hold", "mere", "moor", "reach", "rith", "spire", "vale", "wick", "wyn"] },
  history: { a: ["Ach", "Ber", "Cor", "Dam", "Esk", "Gal", "Hal", "Ist", "Kar", "Lus", "Mar", "Ner", "Ost", "Pel", "Sar", "Tal", "Ver"],
             b: ["ana", "aris", "eia", "enna", "esca", "ia", "inum", "ion", "ona", "opolis", "ova", "una", "uria"] },
  scifi:   { a: ["Ash", "Cor", "Dela", "Hel", "Kep", "Lyr", "Nova", "Ori", "Pax", "Rho", "Sol", "Tess", "Vex", "Zen"],
             b: ["fall", "haven", "-9", " Prime", "-IV", " Reach", "point", " Station", "gate", "rest"] },
};
function name(rng, set) {
  const s = NAME_SETS[set] || NAME_SETS.fantasy;
  return rng.pick(s.a) + rng.pick(s.b);
}

/* Floating nav: switch style on the same seed, or roll a new world. */
function nav(current, opts) {
  opts = opts || {};
  const seed = seedFromHash();
  const bar = document.createElement("div");
  bar.className = "sample-nav";
  const styles = [["pixel.html", "Pixel"], ["lowpoly.html", "Low poly"], ["smooth.html", "Smooth"]];
  bar.innerHTML = styles.map(function (s) {
    return '<a href="' + s[0] + '#seed=' + seed + '"' + (s[0] === current ? ' class="on"' : "") + ">" + s[1] + "</a>";
  }).join("") + '<span class="sep"></span><span class="seed">seed ' + seed + "</span>" +
    '<button type="button" title="Generate a different world">New world ↻</button>';
  bar.querySelector("button").addEventListener("click", function () {
    location.hash = "seed=" + Math.floor(Math.random() * 1e6);
    location.reload();
  });
  const css = document.createElement("style");
  css.textContent =
    ".sample-nav{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:100;display:flex;align-items:center;gap:2px;" +
    "padding:5px;border-radius:999px;background:rgba(12,14,18,.82);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.12);" +
    "font:12px system-ui,'Segoe UI',sans-serif;color:#cfd5df;box-shadow:0 8px 28px rgba(0,0,0,.4)}" +
    ".sample-nav a{color:#cfd5df;text-decoration:none;padding:6px 13px;border-radius:999px}" +
    ".sample-nav a:hover{background:rgba(255,255,255,.08)}" +
    ".sample-nav a.on{background:#e8eaef;color:#111}" +
    ".sample-nav .sep{width:1px;height:16px;background:rgba(255,255,255,.18);margin:0 6px}" +
    ".sample-nav .seed{font-family:Consolas,monospace;font-size:11px;opacity:.7;padding:0 8px}" +
    ".sample-nav button{border:0;background:transparent;color:#cfd5df;padding:6px 12px;border-radius:999px;cursor:pointer;font:inherit}" +
    ".sample-nav button:hover{background:rgba(255,255,255,.08)}";
  document.head.appendChild(css);
  document.body.appendChild(bar);
  window.addEventListener("hashchange", function () { location.reload(); });
  return seed;
}

window.SAMPLE = {
  seedFromHash: seedFromHash, makeWorld: makeWorld, field: field, cell: cell,
  sites: sites, name: name, nav: nav,
};

})();
