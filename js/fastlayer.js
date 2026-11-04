/* The fast layer's slower troubles (docs/REGION_CHAPTERS.md, step 6b), run month by month in a
   region's tick (campaigns.js advance calls month()), decided by the date and place, not the
   world's random stream:

   - Unrest. A town taken from another realm stays restless for some years (a town taken in war
     the more): now and then it riots (world.unrestLog [date, region, owner, taken from]), each
     riot shaking its owner's stability a little; and while a realm holds restless towns, the
     packs' revolt events (marked `revolt: true`) are likelier for it and find them
     (ctx.restless(), core.js fireOne). It quiets down over six years, or ends when the town
     changes hands again.
   - Plague as a contagion. When a pack's plague event strikes a place, the sickness spreads from
     town to town month by month: to the towns within a few days' road of a stricken one, the
     nearer the likelier, and from a stricken port across the water to other ports. A town
     stricken costs its realm a few of its people (more for a city). At most three towns a month
     and two dozen in all; it dies out when it has found no new town for a season, and a new one
     starts no sooner than three years after the last began. world.plagueLog [date, region]. */
(function () {
"use strict";
const AEON = window.AEON = window.AEON || {};
const ROAD = 10, SEA = 30, CATCH = 0.3, SAIL = 0.05, PER_MONTH = 3, MAX_TOWNS = 24, GAP = 3, QUIET = 0.26;

function hidden(o, k, v) { Object.defineProperty(o, k, { value: v, enumerable: false, configurable: true, writable: true }); return v; }
function on(world) { return !!(AEON.campaigns && AEON.campaigns.on(world)); }
function hash(a, b, c) {
  let h = Math.imul((a | 0) + 1, 374761393) ^ Math.imul((b | 0) + 7, 668265263) ^ Math.imul((c | 0) + 13, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ------------------------------------------------------------ unrest */
/* core.js transferRegion: a town changed hands */
function taken(world, region, from, to) {
  if (!on(world) || !region.settlement) return;
  const U = world.unrest || (world.unrest = {}), now = AEON.campaigns.dateNow(world);
  U[region.id] = { since: now != null ? now : world.year - 0.5, from: from.id, owner: to.id, level: AEON.treatyBetween(world, from, to, "war") ? 1 : 0.5 };
}
/* a realm's restless towns, the most restless first */
function restless(world, p) {
  const U = world.unrest;
  if (!U || !p) return [];
  const out = [];
  for (const id in U) if (U[id].owner === p.id && U[id].level > 0.3) out.push(world.regions[id]);
  return out.sort(function (a, b) { return U[b.id].level - U[a.id].level; });
}
function unrestMonth(world, k, d) {
  const U = world.unrest;
  if (!U) return;
  const R = world.regions, P = world.polities, mon = world.year * 12 + k;
  for (const id in U) {
    const u = U[id], r = R[id];
    u.level -= 1 / 72;
    if (u.level <= 0 || !r || r.owner !== u.owner || !r.settlement) { delete U[id]; continue; }
    if (hash(+id, mon, 3) >= 0.04 * u.level) continue;
    const p = P[u.owner];
    if (p && p.traits && p.traits.stability != null) p.traits.stability = Math.max(0.03, p.traits.stability - 0.003);
    (world.unrestLog || (world.unrestLog = [])).push([d, +id, u.owner, u.from]);
  }
}

/* ------------------------------------------------------------ plague */
function coastal(world, r) {
  for (const n of r.neighbors || []) { const q = world.regions[n]; if (q && q.barren && !q.beyond) return true; }
  return false;
}
/* the towns of the tick, with which are ports, in a grid of ROAD-sized squares */
function towns(world) {
  const c = world._fastTowns;
  if (c && c.year === world.year) return c;
  const grid = {};
  for (const r of world.regions) {
    if (!r.settlement || !r.owner || r.beyond) continue;
    const k = Math.floor(r.x / ROAD) + "," + Math.floor(r.y / ROAD);
    (grid[k] || (grid[k] = [])).push({ r: r, port: coastal(world, r) });
  }
  return hidden(world, "_fastTowns", { year: world.year, grid: grid });
}
/* the towns within reach squares of a place */
function near(T, x, y, reach, fn) {
  const gx = Math.floor(x / ROAD), gy = Math.floor(y / ROAD), n = Math.ceil(reach / ROAD);
  for (let j = gy - n; j <= gy + n; j++) for (let i = gx - n; i <= gx + n; i++) for (const t of T.grid[i + "," + j] || []) fn(t);
}
function infect(world, r, d) {
  const P = world.contagion;
  P.cells[r.id] = d; P.active.push(r.id); P.last = d; P.n++;
  (world.plagueLog || (world.plagueLog = [])).push([d, r.id]);
  const p = world.polities[r.owner], tier = r.settlement ? r.settlement.tier : 1;
  if (p) p.population = Math.max(60, Math.round(p.population * (1 - 0.003 * tier)));
}
function plagueMonth(world, k, d) {
  const C = world.chronicle, R = world.regions;
  /* a pack's plague event strikes a place: the contagion starts (or flares up) there */
  for (let i = world._fastSeen || 0; i < C.length; i++) {
    const e = C[i];
    if (e.regionId == null || (e.tags || []).indexOf("plague") < 0 || /wanes|over|ends|recedes/.test(e.type)) continue;
    const r = R[e.regionId];
    if (!r || !r.settlement) continue;
    const old = world.contagion;
    if (!old || (old.done && d - old.start >= GAP)) world.contagion = { cells: {}, active: [], start: d, last: d, n: 0, done: false };
    if (!world.contagion.done && world.contagion.n < MAX_TOWNS && world.contagion.cells[r.id] == null) infect(world, r, d);
  }
  hidden(world, "_fastSeen", C.length);
  const P = world.contagion;
  if (!P || P.done) return;
  /* from each town stricken in the last three months, to the towns along the roads and across the water */
  const T = towns(world), mon = world.year * 12 + k, cand = [];
  for (const sid of P.active) {
    const s = R[sid], port = coastal(world, s);
    near(T, s.x, s.y, port ? SEA : ROAD, function (t) {
      if (P.cells[t.r.id] != null) return;
      const dx = t.r.x - s.x, dy = t.r.y - s.y, dist = Math.sqrt(dx * dx + dy * dy);
      const chance = dist <= ROAD ? CATCH / (1 + dist / 3) : port && t.port && dist <= SEA ? SAIL : 0;
      if (chance && hash(t.r.id, mon, sid) < chance) cand.push([dist, t.r]);
    });
  }
  cand.sort(function (a, b) { return a[0] - b[0] || a[1].id - b[1].id; });
  let n = 0;
  for (const c of cand) { if (n >= PER_MONTH || P.n >= MAX_TOWNS) break; if (P.cells[c[1].id] == null) { infect(world, c[1], d); n++; } }
  P.active = P.active.filter(function (id) { return d - P.cells[id] < 0.25; });
  if (d - P.last > QUIET) P.done = true;
}

function month(world, k, d) {
  if (!on(world)) return;
  unrestMonth(world, k, d);
  plagueMonth(world, k, d);
}

AEON.fast = { month: month, taken: taken, restless: restless };
})();
