/* Tribes (docs/REGION_CHAPTERS.md, step 7). In a region, a herder people (pack.tribal: the steppe
   folk and hill clans, in fantasy the hill-clans and druidic circles) placed from the sketch, or
   arriving as newcomers, is a tribe: it holds no land but its winter camp (its seat, p.capital),
   and around that camp and its summer pasture it has a sphere of influence that fades with the
   distance and may overlap other tribes' spheres and a kingdom's land.

   - The sphere: every land cell within the tribe's reach of its camp or its pasture, reached over
     land, with an influence of 1 at the camp falling to 0 at the reach. The reach follows the
     tribe's people (and so its herds and its raids), up to fifteen cells.
   - The herds: a tribe lives off its sphere (core.js capacity): the land it grazes alone feeds it
     fully, land a realm holds a quarter, all of it thinner than tilled land.
   - Its neighbours (core.js neighborScan) are the realms holding land in its sphere and the tribes
     whose spheres meet it; it raids them after the harvest more readily than a realm does
     (campaigns.js raids), and fights them over the land in its sphere (AEON.tribes.front, the
     packs' frontiers).
   - A realm settles the land in a sphere unwillingly and at a cost: the stronger the tribe's hold,
     the less likely, and each such farm sours the tribe against it.
   - Driven from its camp, a tribe moves it to the far side of its sphere and loses some reach; it
     ends only if nowhere is left.
   - Settling: a tribe that has taken a town or a few provinces (by war), or late in history has
     grown large, turns its strongest influence into land and becomes a realm (event
     "tribe-settled").

   Logged in p.tribeLog [year, camp, pasture, reach] (camp null: settled), so the map shows the
   spheres of any year (AEON.tribes.spheresAt). */
(function () {
"use strict";
const AEON = window.AEON = window.AEON || {};
const MAX_REACH = 15, MIN_REACH = 4, HERD = 0.35, SHARED = 0.25, TOUCH = 0.25, WAR = 0.3;

function hidden(o, k, v) { Object.defineProperty(o, k, { value: v, enumerable: false, configurable: true, writable: true }); return v; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function on(world) { return !!world.square; }
function isTribe(p) { return !!(p && p.tribe && !p.ended); }
function tribal(world, archetypeId) { const T = world.pack.tribal; return !!(T && T.indexOf(archetypeId) >= 0); }
function living(world) { const out = []; for (const id in world.polities) if (isTribe(world.polities[id])) out.push(world.polities[id]); return out; }

/* ------------------------------------------------------------ the sphere */
/* the cells within reach of a camp and a pasture, over land: [[rid, influence]] */
function sphereOf(world, camp, pasture, reach) {
  const base = world._tribeBase || world, key = camp + "|" + pasture + "|" + Math.round(reach * 2);
  const cache = base._tribeSph || hidden(base, "_tribeSph", { n: 0, by: {} });
  if (cache.by[key]) return cache.by[key];
  if (cache.n > 400) { cache.by = {}; cache.n = 0; }
  const R = world.regions, src = [R[camp]].concat(pasture != null && R[pasture] ? [R[pasture]] : []), seen = {}, out = [], q = [];
  const infl = function (r) {
    let best = 0;
    src.forEach(function (s, i) { const d = Math.hypot(r.x - s.x, r.y - s.y), v = (1 - d / reach) * (i ? 0.85 : 1); if (v > best) best = v; });
    return best;
  };
  for (const s of src) if (s && !seen[s.id]) { seen[s.id] = true; q.push(s); }
  while (q.length) {
    const r = q.pop(), v = infl(r);
    if (v <= 0) continue;
    out.push([r.id, Math.round(v * 100) / 100]);
    for (const n of r.neighbors || []) {
      const c = R[n];
      if (!c || seen[n] || c.barren || c.beyond) continue;
      seen[n] = true; q.push(c);
    }
  }
  cache.n++;
  return (cache.by[key] = out);
}
function sphere(world, p) { return isTribe(p) ? sphereOf(world, p.capital, p.tribe.pasture, p.tribe.reach) : []; }
/* every cell's strongest tribe this year: { infl: Float32Array, who: [pid] } */
function cells(world) {
  const c = world._tribeCells;
  if (c && c.year === world.year && c.n === world.ownerLog.length) return c;
  const infl = new Float32Array(world.regions.length), who = [];
  for (const p of living(world)) for (const e of sphere(world, p)) if (e[1] > infl[e[0]]) { infl[e[0]] = e[1]; who[e[0]] = p.id; }
  return hidden(world, "_tribeCells", { year: world.year, n: world.ownerLog.length, infl: infl, who: who });
}

/* ------------------------------------------------------------ making one */
/* the summer pasture: the highest open ground some way from the camp */
function pastureFor(world, p, reach) {
  const R = world.regions, c = R[p.capital];
  let best = null, bs = -1;
  for (const e of sphereOf(world, p.capital, null, reach)) {
    const r = R[e[0]], d = Math.hypot(r.x - c.x, r.y - c.y);
    if (d < Math.max(3, reach * 0.45) || d > reach * 0.85 || (r.owner && r.owner !== p.id) || r.settlement) continue;
    const s = (r.elevation || 0) + r.habitability * 0.3;
    if (s > bs) { bs = s; best = r; }
  }
  return best ? best.id : null;
}
function targetReach(p) { return clamp(3.5 + 1.5 * Math.sqrt(p.population / 1000), MIN_REACH, MAX_REACH); }
function log(world, p) {
  const L = p.tribeLog || (p.tribeLog = []), last = L[L.length - 1], t = p.tribe;
  const e = t ? [world.year, p.capital, t.pasture, Math.round(t.reach * 10) / 10] : [world.year, null, null, 0];
  if (last && last[1] === e[1] && last[2] === e[2] && Math.abs(last[3] - e[3]) < 0.5) return;
  if (last && last[0] === e[0]) L[L.length - 1] = e; else L.push(e);
}
/* region.js: a herder people placed or arriving becomes a tribe */
function make(world, p) {
  if (!on(world) || !tribal(world, p.archetypeId)) return false;
  const camp = world.regions[p.capital];
  if (camp && camp.settlement) camp.settlement.tier = 1;
  /* its other cells (a newcomer's) are given up: a tribe holds only its camp */
  for (const rid of p.regions.slice()) if (rid !== p.capital) { const r = world.regions[rid]; r.owner = null; AEON._core.logOwner(world, rid, null); }
  p.regions = [p.capital];
  const reach = targetReach(p);
  p.tribe = { reach: reach, pasture: null, since: world.year };
  p.tribe.pasture = pastureFor(world, p, reach);
  log(world, p);
  return true;
}

/* ------------------------------------------------------------ the engine's questions */
/* what its sphere can feed, before learning (core.js capacity) */
function pasture(world, p) {
  const R = world.regions;
  let cap = 0;
  for (const e of sphere(world, p)) {
    const r = R[e[0]];
    cap += r.habitability * e[1] * (r.owner && r.owner !== p.id ? SHARED : 1);
  }
  return cap * 9000 * HERD * (1 + p.tech * 2.2);
}
/* who it has to do with (core.js neighborScan adds these to the land neighbours) */
function neighbors(world, p, seen) {
  const R = world.regions;
  if (isTribe(p)) {
    for (const e of sphere(world, p)) { const o = R[e[0]].owner; if (e[1] >= TOUCH && o && o !== p.id) seen[o] = true; }
    for (const q of living(world)) {
      if (q === p) continue;
      const a = R[p.capital], b = R[q.capital];
      if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < (p.tribe.reach + q.tribe.reach) * 0.8) seen[q.id] = true;
    }
    return;
  }
  for (const q of living(world)) {
    if (seen[q.id]) continue;
    for (const e of sphere(world, q)) if (e[1] >= TOUCH && R[e[0]].owner === p.id) { seen[q.id] = true; break; }
  }
}
/* a realm reaching out into open land: how much a tribe holds it back there (0..1), and which */
function hold(world, region) {
  const c = cells(world), v = c.infl[region.id];
  return v ? { infl: v, tribe: world.polities[c.who[region.id]] } : null;
}
/* the places of def that att can fight for when either is a tribe (null: neither, the pack's own
   frontier): a tribe fights for the land in its sphere; a tribe's own place is its camp */
function front(world, att, def) {
  if (!isTribe(att) && !isTribe(def)) return null;
  const R = world.regions;
  if (isTribe(def)) return def.regions.map(function (id) { return R[id]; }).filter(Boolean);
  const out = [];
  for (const e of sphere(world, att)) if (e[1] >= WAR && R[e[0]].owner === def.id) out.push(R[e[0]]);
  return out;
}

/* ------------------------------------------------------------ losing the camp */
/* core.js transferRegion: the tribe lost its last cell; it moves its camp away (true), or ends */
function driven(world, p, lost, by) {
  if (!isTribe(p)) return false;
  const R = world.regions, from = R[lost.id];
  let best = null, bs = -Infinity;
  for (const e of sphereOf(world, lost.id, p.tribe.pasture, p.tribe.reach)) {
    const r = R[e[0]];
    if (r.owner || r.barren || r.habitability < 0.12) continue;
    const s = Math.hypot(r.x - from.x, r.y - from.y) + r.habitability * 4;
    if (s > bs) { bs = s; best = r; }
  }
  if (!best) return false;
  best.owner = p.id; p.regions.push(best.id); p.capital = best.id;
  AEON._core.logOwner(world, best.id, p.id);
  if (!best.settlement) best.settlement = { name: AEON._core.callName(world, "settlement", { region: best, polity: p }) || best.name, tier: 1, founded: world.year };
  p.tribe.reach = Math.max(MIN_REACH, p.tribe.reach * 0.7);
  p.tribe.pasture = pastureFor(world, p, p.tribe.reach);
  p.population = Math.max(60, Math.round(p.population * 0.85));
  log(world, p);
  AEON._core.recordEvent(world, "tribe-driven", { importance: 2, tags: ["tribe", "migration"],
    actors: [{ kind: "polity", id: p.id }].concat(by ? [{ kind: "polity", id: by.id }] : []), regionId: best.id,
    text: "Driven from their winter camp" + (by ? " by " + by.name.replace(/^The /, "the ") : "") + ", the " + p.adjective + " herders moved their tents to " + (best.settlement ? best.settlement.name : best.name) + "." });
  return true;
}

/* ------------------------------------------------------------ the year */
function settle(world, p, why) {
  const R = world.regions, list = sphere(world, p).filter(function (e) { return e[1] >= 0.5 && !R[e[0]].owner && !R[e[0]].barren; })
    .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 40);
  const camp = R[p.capital];
  p.tribe = null;
  log(world, p);
  for (const e of list) AEON._core.transferRegion(world, R[e[0]], p);
  if (camp && camp.settlement && camp.settlement.tier < 2) camp.settlement.tier = 2;
  AEON._core.recordEvent(world, "tribe-settled", { importance: 3, tags: ["tribe", "founding", "territory"],
    actors: [{ kind: "polity", id: p.id }], regionId: p.capital,
    text: why + ", the " + p.adjective + " herders settled the land around " + (camp && camp.settlement ? camp.settlement.name : "their camp") +
      ": their tents became houses, their chiefs lords, and " + p.name.replace(/^The /, "the ") + " a realm with borders." });
}
/* Tribes gather (docs/REGION_CHAPTERS.md, step 7's sequel): a tribe grazing near a stronger tribe
   (their camps within NEAR times their two reaches: on the same plains), at peace with it, may
   join it, about once a century, its people and herds with its own: one
   confederation under the stronger's chief (event "tribe-confederation"; the joined ones kept on
   p.tribe.joined). And a realm much stronger than a tribe whose sphere reaches into its land may
   make the tribe pay for the grazing, as its vassal (event "tribe-pasture-tribute"). */
const JOIN = 0.01, JOIN_HOLD = 0.35, PAY = 0.02, NEAR = 1.6;
function gather(world) {
  const R = world.regions, C = AEON._core, rng = world.rng, tribes = living(world).sort(function (a, b) { return b.population - a.population; });
  for (const a of tribes) {
    if (!isTribe(a)) continue;
    const ca = R[a.capital];
    for (const b of tribes) {
      if (b === a || !isTribe(b) || b.population >= a.population) continue;
      const cb = R[b.capital];
      if (!ca || !cb || Math.hypot(ca.x - cb.x, ca.y - cb.y) > NEAR * (a.tribe.reach + b.tribe.reach)) continue;
      if (AEON.treatyBetween(world, a, b, "war") || !rng.chance(AEON.tickShare(world) * JOIN * 5)) continue;
      const camp = R[b.capital], place = camp && camp.settlement ? camp.settlement.name : "the camps of the " + b.adjective;
      a.population += b.population;
      (a.tribe.joined || (a.tribe.joined = [])).push(b.name);
      C.recordEvent(world, "tribe-confederation", { importance: 4, tags: ["tribe", "union", "diplomacy"],
        actors: [{ kind: "polity", id: a.id }, { kind: "polity", id: b.id }], regionId: b.capital,
        text: "At " + place + " the chiefs of the " + b.adjective + " herders swore to follow the chief of " + a.name.replace(/^The /, "the ") +
          ": from then on they grazed and rode as one confederation" + (a.tribe.joined.length > 1 ? ", " + (a.tribe.joined.length + 1) + " tribes strong" : "") + "." });
      C.endPolity(world, b, "Joined the confederation of " + a.name + " in " + world.year + ".");
    }
  }
  /* a strong realm makes a tribe grazing its land pay for it */
  for (const t of living(world)) {
    if (AEON.lordOf(world, t)) continue;
    const seen = {};
    for (const e of sphere(world, t)) {
      const o = R[e[0]].owner;
      if (!o || o === t.id || seen[o] || e[1] < JOIN_HOLD) continue;
      seen[o] = true;
      const q = world.polities[o];
      if (!q || q.ended || isTribe(q) || AEON.treatyBetween(world, q, t, "war") || AEON.lordOf(world, q) === t) continue;
      if (AEON.fieldArmy(world, q) < 2 * AEON.fieldArmy(world, t) || !rng.chance(AEON.tickShare(world) * PAY * 5)) continue;
      AEON.makeVassal(world, t, q, { since: "pasture" });
      C.recordEvent(world, "tribe-pasture-tribute", { importance: 3, tags: ["tribe", "vassal", "diplomacy"],
        actors: [{ kind: "polity", id: q.id }, { kind: "polity", id: t.id }], regionId: t.capital,
        text: q.name + " made the " + t.adjective + " herders pay for the grazing they took in its lands, and they paid it tribute from then on, in horses and hides." });
      break;
    }
  }
}

function year(world) {
  if (!on(world)) return;
  const R = world.regions;
  gather(world);
  for (const p of living(world)) {
    const t = p.tribe;
    /* has it taken land in war, a town or a few provinces? */
    const towns = p.regions.filter(function (id) { return id !== p.capital && R[id].settlement && R[id].settlement.tier >= 2; }).length;
    if (towns || p.regions.length >= 4) { settle(world, p, towns ? "Masters now of towns they had taken" : "Holding land they had won by the sword"); continue; }
    /* late in history a great tribe may settle of itself */
    if ((p.age || 0) >= 2 && p.population > 20000 && world.rng.chance(0.004 * AEON.tickShare(world) * 5)) { settle(world, p, "Grown too many for their pastures"); continue; }
    t.reach += (targetReach(p) - t.reach) * (1 - Math.pow(0.9, world.timeStep));
    /* a pasture taken over by a realm is given up for another */
    if (t.pasture == null || (R[t.pasture].owner && R[t.pasture].owner !== p.id)) t.pasture = pastureFor(world, p, t.reach);
    log(world, p);
  }
}

/* ------------------------------------------------------------ for the view */
/* the spheres of a year: [{ p, cells: [[rid, influence]] }] */
function spheresAt(world, year) {
  const out = [];
  for (const id in world.polities) {
    const p = world.polities[id], L = p.tribeLog;
    if (!L || !L.length || L[0][0] > year || (p.ended != null && p.ended <= year)) continue;
    let e = null;
    for (const x of L) { if (x[0] <= year) e = x; else break; }
    if (!e || e[1] == null) continue;
    out.push({ p: p, camp: e[1], pasture: e[2], cells: sphereOf(world, e[1], e[2], e[3]) });
  }
  return out;
}
/* the herds' place at a date: 0 at the winter camp, 1 on the summer pasture. They are out in the
   six kindest months of the square's year (where there is no winter, its wet season's grass) */
function outMonths(world) {
  const C = AEON.campaigns && AEON.campaigns.climate ? AEON.campaigns.climate(world) : null;
  if (!C) return [false, false, false, false, true, true, true, true, true, true, false, false];
  const base = C.w.slice(), order = base.map(function (v, i) { return [v + i * 1e-6, i]; }).sort(function (a, b) { return b[0] - a[0]; });
  if (base[order[0][1]] - base[order[11][1]] < 0.05) return [false, false, false, false, true, true, true, true, true, true, false, false];
  const out = base.map(function () { return false; });
  for (let i = 0; i < 6; i++) out[order[i][1]] = true;
  return out;
}
function herdAt(world, date) {
  const O = outMonths(world), m = ((date % 1) + 1) % 1 * 12;
  /* out over the first month, home over the month after the last */
  const k = Math.floor(m), f = m - k, on = function (i) { return O[(i + 12) % 12]; };
  if (on(k) && on(k - 1)) return on(k + 1) ? 1 : 1 - f;
  if (on(k)) return f;
  return 0;
}

const PAT = {};
function hatch(g, color) {
  if (PAT[color]) return PAT[color];
  const c = document.createElement("canvas");
  c.width = c.height = 6;
  const x = c.getContext("2d");
  x.fillStyle = color;
  for (let i = 0; i < 6; i++) x.fillRect(i, 5 - i, 1, 1);
  return (PAT[color] = g.createPattern(c, "repeat"));
}
/* the spheres as soft hatching in the tribe's colour (no border), the herds between camp and
   pasture at the seasonal speeds */
function draw(g, world, year, sx, sy, cell, date, u) {
  if (!world.square || typeof document === "undefined") return;
  const R = world.regions;
  for (const s of spheresAt(world, year)) {
    g.save();
    g.fillStyle = hatch(g, s.p.color || "#888");
    for (const e of s.cells) {
      const r = R[e[0]];
      g.globalAlpha = clamp(e[1] * (r.owner && r.owner !== s.p.id ? 0.45 : 1.1), 0, 0.85);
      g.fillRect(Math.round(sx(r.x)), Math.round(sy(r.y)), Math.ceil(cell), Math.ceil(cell));
    }
    g.restore();
    if (date == null || s.pasture == null) continue;
    const a = R[s.camp], b = R[s.pasture], f = herdAt(world, date), t = Date.now();
    const x = sx(a.x + 0.5 + (b.x - a.x) * f), y = sy(a.y + 0.5 + (b.y - a.y) * f), n = 6;
    for (let i = 0; i < n; i++) {
      const ox = Math.round((((i * 37) % 7) - 3) * u + Math.sin(t / 900 + i) * u), oy = Math.round((((i * 53) % 5) - 2) * u);
      g.fillStyle = i % 3 ? "#efe9dc" : "#7a5a3a";
      g.fillRect(Math.round(x + ox), Math.round(y + oy), Math.max(1, u), Math.max(1, u));
    }
    if (f > 0.95) {
      /* the summer tents */
      const tx = Math.round(sx(b.x + 0.5)), ty = Math.round(sy(b.y + 0.5));
      g.fillStyle = "#e8dcc0"; g.fillRect(tx - 2 * u, ty - u, 3 * u, u); g.fillRect(tx - u, ty - 2 * u, u, u);
      g.fillStyle = "#5a4630"; g.fillRect(tx - u, ty, u, u);
    }
  }
}

AEON.tribes = { make: make, isTribe: isTribe, sphere: sphere, pasture: pasture, neighbors: neighbors, hold: hold, front: front,
  driven: driven, year: year, spheresAt: spheresAt, herdAt: herdAt, draw: draw };
})();
