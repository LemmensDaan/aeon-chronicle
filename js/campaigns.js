/* Campaigns (docs/REGION_CHAPTERS.md, step 5): in a region, wars are fought by armies that take the
   field in the campaign season and go into winter quarters when the frost (or the rains) close it.
   Two halves, neither drawing on the world's random stream, so a history stays as the packs make it:

   - the engine (core.js dateTick calls dateWar): a year's war events (battles, sieges, land taken:
     events tagged "war" with a place and two realms) are dated to the months the square's weather
     lets armies march, the rest of the year's events kept in their order between them. What a
     war's events change (land, towns, battles on the map) takes their dates, as before.
   - the map (mapfx.js draws, ui.js gives the date): each realm at war in a year has an army, whose
     itinerary is read from that year's events: it winters in its quarters, musters when the
     season opens, marches to each place it fought at to be there on the month it was fought,
     lies before a town it besieged, camps on the border facing its enemy in a year without
     fighting, and goes back into quarters (its own land nearest the front) when the season
     closes; it goes home when the war ends. Worked out per year when shown, cached.

   Outcomes still come from the packs' war events; the weather decides when, not who wins (yet). */
(function () {
"use strict";
const AEON = window.AEON = window.AEON || {};
const MIDWINTER = 0.05, ACTIVE = 0.35;

function hidden(o, k, v) { Object.defineProperty(o, k, { value: v, enumerable: false, configurable: true, writable: true }); return v; }
function baseOf(w) { return w._view === w ? Object.getPrototypeOf(w) : w; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
/* a number in [0, 1) from a few integers, the same every time (no random stream) */
function hash(a, b, c) {
  let h = Math.imul((a | 0) + 1, 374761393) ^ Math.imul((b | 0) + 7, 668265263) ^ Math.imul((c | 0) + 13, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function num(id) { return +String(id).replace(/\D/g, "") || 0; }
function median(list) { const v = list.slice().sort(function (a, b) { return a - b; }); return v.length ? v[v.length >> 1] : null; }

/* ------------------------------------------------------------ the weather of the months */
/* the square's months for war: weights (0: no army takes the field; 1: the best of the year) from
   the middle land's warmest and coldest months, the south's seasons the other way round, and the
   rains of a monsoon summer in the warm lands; `active` the months a campaign is on */
function climate(world) {
  world = baseOf(world);
  if (world._campClimate) return world._campClimate;
  const land = world.regions.filter(function (r) { return !r.barren && !r.beyond && r.warmC != null; });
  const pick = function (k, d) { const m = median(land.map(function (r) { return r[k]; }).filter(function (v) { return v != null; })); return m == null ? d : m; };
  const warm = pick("warmC", 20), cold = pick("coldC", 5), wet = pick("summerRain", 0.5), midY = pick("y", world.height / 2);
  const sq = world.square, pl = world.planet;
  const south = sq && pl ? sq.py0 + (midY + 0.5) / sq.K >= pl.height / 2 : false;
  const w = [], temp = [];
  for (let m = 0; m < 12; m++) {
    const l = (((m + 0.5) / 12 - MIDWINTER + (south ? 0.5 : 0)) % 1 + 1) % 1, c = Math.cos(2 * Math.PI * l);
    const T = (warm + cold) / 2 - (warm - cold) / 2 * c;
    let k = clamp((T - 2) / 10, 0, 1);
    if (warm > 22 && wet > 0.6) k *= 1 - Math.max(0, -c) * Math.min(0.85, (wet - 0.6) * 3);
    w.push(k); temp.push(T);
  }
  /* where it never warms enough, the three warmest months */
  if (w.reduce(function (a, b) { return a + b; }, 0) < 1.5) {
    const top = temp.slice().sort(function (a, b) { return b - a; })[2];
    for (let m = 0; m < 12; m++) w[m] = temp[m] >= top ? 1 : 0;
  }
  return hidden(world, "_campClimate", { w: w, active: w.map(function (k) { return k >= ACTIVE; }), south: south });
}

function polities(e) {
  const out = [];
  for (const a of e.actors || []) if (a && a.kind === "polity" && out.indexOf(a.id) < 0) out.push(a.id);
  return out;
}
/* a war event: a place, two realms, and the tag */
function isWar(e) { return e && e.regionId != null && (e.tags || []).indexOf("war") >= 0 && polities(e).length >= 2; }

/* ------------------------------------------------------------ the engine: dating a year's events */
/* core.js dateTick, after its even dating of the tick's events (from `from` on): the war events go
   to the campaign months, at places in the season drawn from the events themselves (spread by the
   weather's weights), and the others keep their places between them, so the chronicle's dates
   still run in its order */
function dateWar(world, from) {
  if (!world.square || world.timeStep !== 1) return;
  const C = world.chronicle, y0 = world.year - 1, war = [];
  for (let i = from; i < C.length; i++) if (isWar(C[i])) war.push(i);
  if (!war.length) return;
  const W = climate(world).w, cum = [0];
  for (let m = 0; m < 12; m++) cum.push(cum[m] + W[m]);
  const at = {}, qs = war.map(function (i) { return hash(num(C[i].id), world.year, C[i].regionId); }).sort();
  war.forEach(function (i, j) {
    const q = qs[j] * cum[12];
    let m = 0;
    while (m < 11 && cum[m + 1] < q) m++;
    at[i] = y0 + (m + 1) / 12;
  });
  let lo = from - 1, loD = y0;
  for (let j = 0; j <= war.length; j++) {
    const hi = j < war.length ? war[j] : C.length, hiD = j < war.length ? at[war[j]] : y0 + 1, g = hi - lo - 1;
    for (let k = 1; k <= g; k++) {
      const d = Math.round((loD + k / (g + 1) * (hiD - loD)) * 12) / 12;
      C[lo + k].date = clamp(d, Math.max(loD, y0 + 1 / 12), hiD);
    }
    if (j < war.length) { C[hi].date = hiD; lo = hi; loD = hiD; }
  }
}

/* ------------------------------------------------------------ the map: armies and their years */
/* the chronicle's events of a tick year (binary search: the chronicle runs in year order) */
function eventsOf(world, year) {
  const C = world.chronicle;
  let a = 0, b = C.length;
  while (a < b) { const m = (a + b) >> 1; if (C[m].year < year) a = m + 1; else b = m; }
  const out = [];
  for (let i = a; i < C.length && C[i].year === year; i++) out.push(i);
  return out;
}
/* the indices of the events a battle came before, in a tick year */
function battlesOf(world, year) {
  const B = world.battleLog || [], out = {};
  let a = 0, b = B.length;
  while (a < b) { const m = (a + b) >> 1; if (B[m][0] < year) a = m + 1; else b = m; }
  for (let i = a; i < B.length && B[i][0] === year; i++) if (!B[i][7]) out[B[i][9]] = B[i];
  return out;
}
function pairKey(a, b) { return a < b ? a + "|" + b : b + "|" + a; }
function dist2(R, a, b) { const p = R[a], q = R[b], dx = p.x - q.x, dy = p.y - q.y; return dx * dx + dy * dy; }

/* the wars of calendar year Y (dates in (Y, Y+1]) and their fighting, cached on the world */
function yearOf(world, Y) {
  const cache = world._campYears || hidden(world, "_campYears", {}), key = world.chronicle.length + ":" + world.ownerLog.length;
  const hit = cache[Y];
  if (hit && hit.key === key) return hit;
  const R = world.regions, C = world.chronicle, P = world.polities;
  const owners = AEON.ownersAt(world, Y + 0.5);
  const wars = [], byPair = {};
  for (const t of world.treaties || []) {
    if (t.kind !== "war" || t.start > Y + 1 || (t.end != null && t.end < Y + 1)) continue;
    const s = t.startDate != null ? t.startDate : t.start, e = t.end == null ? Infinity : t.endDate != null ? t.endDate : t.end;
    if (s > Y + 1 || e <= Y) continue;
    const a = P[t.a], b = P[t.b];
    if (!a || !b) continue;
    const w = { t: t, from: Math.max(Y, s), to: Math.min(Y + 1, e), sides: [t.a, t.b], fights: [] };
    wars.push(w);
    const k = pairKey(t.a, t.b);
    if (!byPair[k] || (byPair[k].t.joined && !t.joined)) byPair[k] = w;
  }
  const B = battlesOf(world, Y + 1);
  for (const i of eventsOf(world, Y + 1)) {
    const e = C[i];
    if (!isWar(e) || R[e.regionId] == null) continue;
    const ps = polities(e), w = byPair[pairKey(ps[0], ps[1])];
    if (!w) continue;
    const b = B[i], kind = b ? "battle" : /siege/.test(e.type) ? "siege" : "take";
    /* the side that came: the battle's attacker, else the event's first realm */
    w.fights.push({ date: e.date != null ? e.date : Y + 1, rid: e.regionId, kind: kind, by: b ? b[1] : ps[0], both: !!b });
  }
  const held = {};
  for (const o of owners) if (o != null) held[o] = true;
  const out = { key: key, wars: wars, owners: owners, held: held };
  cache[Y] = out;
  return out;
}

/* a realm's own land nearest a place (its quarters), else its capital */
function nearestOwn(world, owners, pid, rid, year) {
  const R = world.regions, seen = {}, q = [rid];
  seen[rid] = true;
  for (let h = 0; h < q.length && h < 400; h++) {
    const r = R[q[h]];
    if (owners[r.id] === pid && !r.beyond) return r.id;
    for (const n of r.neighbors || []) if (!seen[n]) { seen[n] = true; q.push(n); }
  }
  const p = world.polities[pid];
  return p ? AEON.capitalAt(p, year) : rid;
}
/* where a realm watches its enemy in a year without fighting: its land on their border, the four
   places nearest the enemy's capital (else its land nearest that capital) */
function frontier(world, owners, pid, foe, year) {
  const R = world.regions, fp = world.polities[foe], fc = fp ? AEON.capitalAt(fp, year) : null;
  if (fc == null) return [];
  const edge = [];
  let any = null, ad = Infinity;
  for (const r of R) {
    if (owners[r.id] !== pid || r.beyond) continue;
    const d = dist2(R, r.id, fc);
    if (d < ad) { ad = d; any = r.id; }
    for (const n of r.neighbors || []) if (owners[n] === foe) { edge.push([d, r.id]); break; }
  }
  edge.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  return edge.length ? edge.slice(0, 4).map(function (e) { return e[1]; }) : any != null ? [any] : [];
}

/* one side's itinerary in year Y: [date, region, state] waypoints, states "winter", "muster",
   "march", "camp", "siege", "battle", "home"; null when it has no army that year */
function itinerary(world, Y, w, side, prevEnd) {
  const pid = w.sides[side], foe = w.sides[1 - side], p = world.polities[pid];
  if (!p) return null;
  const yr = yearOf(world, Y), owners = yr.owners, act = climate(world).active, out = [];
  const cap = AEON.capitalAt(p, Y);
  if (cap == null) return null;
  const mine = w.fights.filter(function (f) { return f.by === pid || f.both; }).sort(function (a, b) { return a.date - b.date; });
  let at = prevEnd != null && w.from <= Y ? prevEnd : cap;
  const wp = function (d, rid, s) { if (d >= w.from - 1e-9 && d <= w.to + 1e-9) out.push([d, rid, s]); };
  out.push([w.from, at, w.from > Y ? "muster" : act[0] ? "camp" : "winter"]);
  /* the months: march to the next fight (to be there on its month), else watch the border in the
     season, moving along it every two months or so, winter in quarters out of it */
  let fi = 0, last = null;
  const watch = frontier(world, owners, pid, foe, Y);
  for (let m = 0; m < 12; m++) {
    const d0 = Y + m / 12, d1 = Y + (m + 1) / 12;
    while (fi < mine.length && mine[fi].date <= d1 + 1e-9) {
      const f = mine[fi++];
      if (f.kind === "siege" && f.by === pid) wp(Math.max(d0, f.date - 2 / 12), f.rid, "siege");
      wp(f.date - 0.5 / 12, f.rid, f.kind === "siege" && f.by === pid ? "siege" : "march");
      wp(f.date, f.rid, f.kind === "battle" ? "battle" : f.by === pid ? f.kind : "camp");
      at = last = f.rid;
    }
    if (act[m]) {
      const going = fi < mine.length;
      const to = watch.length ? watch[Math.floor(hash(num(w.t.id), Y * 6 + (m >> 1), side) * watch.length)] : null;
      if (!going && last == null && to != null && at !== to) { wp(d0, at, act[(m + 11) % 12] ? "camp" : "muster"); wp(d1, to, "camp"); at = to; }
      else if (!going && at != null) wp(d1, at, "camp");
    } else if (at != null) {
      const q = nearestOwn(world, owners, pid, at, Y);
      if (q !== at) { wp(d0, at, "march"); wp(d1, q, "winter"); at = q; }
      else wp(d1, at, "winter");
      last = null;
    }
  }
  if (w.to < Y + 1) out.push([w.to, at, "home"]);
  out.sort(function (a, b) { return a[0] - b[0]; });
  return out;
}

/* where an army is at the end of a year (the start of the next one's itinerary) */
function endOf(world, Y, t, side) {
  const yr = yearOf(world, Y), w = yr.wars.filter(function (x) { return x.t === t; })[0];
  if (!w) return null;
  const it = itinerary(world, Y, w, side, null);
  return it && it.length ? it[it.length - 1][1] : null;
}

/* the armies on the map at a date: [{ pid, foe, war, x, y (region cells, fractional), state,
   moving, dir, n }]; plans cached per calendar year */
function armiesAt(world, date) {
  world = baseOf(world);
  if (!world.square || world.timeStep !== 1 || date == null) return [];
  const Y = Math.floor(date), R = world.regions;
  const plans = world._campPlans || hidden(world, "_campPlans", {}), key = world.chronicle.length + ":" + world.ownerLog.length;
  let plan = plans[Y];
  if (!plan || plan.key !== key) {
    for (const k in plans) if (Math.abs(+k - Y) > 2) delete plans[k];
    const list = [];
    for (const w of yearOf(world, Y).wars) {
      /* a vassal's levy and an ally's war show only where they fight */
      if ((w.t.levy || w.t.joined) && !w.fights.length) continue;
      for (let s = 0; s < 2; s++) {
        if (!yearOf(world, Y).held[w.sides[s]]) continue;
        const it = itinerary(world, Y, w, s, w.from <= Y ? endOf(world, Y - 1, w.t, s) : null);
        if (it && it.length) list.push({ pid: w.sides[s], foe: w.sides[1 - s], war: w.t.id, it: it, fights: w.fights.length });
      }
    }
    plan = plans[Y] = { key: key, list: list };
  }
  const out = [];
  for (const a of plan.list) {
    const it = a.it;
    if (date < it[0][0] || date > it[it.length - 1][0] + (it[it.length - 1][2] === "home" ? 0 : 1)) continue;
    let k = 0;
    while (k < it.length - 1 && it[k + 1][0] <= date) k++;
    const A = it[k], Bp = it[k + 1] || A, ra = R[A[1]], rb = R[Bp[1]];
    if (!ra || !rb) continue;
    const span = Bp[0] - A[0], f = span > 0 ? clamp((date - A[0]) / span, 0, 1) : 0, moving = A[1] !== Bp[1];
    const x = ra.x + (rb.x - ra.x) * f, y = ra.y + (rb.y - ra.y) * f;
    const fr = R[a.foe != null && world.polities[a.foe] ? AEON.capitalAt(world.polities[a.foe], Y) : A[1]] || rb;
    const dir = moving ? (rb.x >= ra.x ? 1 : -1) : (fr.x >= x ? 1 : -1);
    out.push({ pid: a.pid, foe: a.foe, war: a.war, x: x + 0.5, y: y + 0.5, state: moving ? "march" : A[2] === "muster" || A[2] === "home" ? "camp" : A[2], moving: moving, dir: dir, n: a.fights ? 3 : 2 });
  }
  return out;
}

AEON.campaigns = { climate: climate, dateWar: dateWar, armiesAt: armiesAt, isWar: isWar };
})();
