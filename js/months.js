/* The months of a region (docs/REGION_CHAPTERS.md, step 6): what happens month by month between the
   chronicle's events, read from the computed history, so that a chapter played at the seasonal
   speeds has something to watch about every month. Nothing here changes the history (the raids,
   which do, are made by the engine: campaigns.js); it is worked out per calendar year when shown.

   happenings(world, y0, y1): [{ date, until, kind, text, pid, rid, to }] that begin in (y0, y1]:
   - envoys: a treaty made (alliance, trade, truce, tribute, marriage) is carried by riders from
     one capital to the other in the month before; a marriage, by the bride's train
   - the yearly traffic of treaties in force: a vassal's tribute carried to its lord, gifts
     between allies, envoys between trading partners, each once a year in a month of its own
   - sickness: a ruler who dies in his bed (an orderly succession, a regency, a disputed one) lies
     sick in his capital for the months before
   - plague: a sickness that breaks out or spreads (events tagged plague) creeps out from the
     stricken capital over the following year
   - famine: the harvest fails the autumn before a famine (events tagged famine)
   - the armies (world.armyLog, campaigns.js): a levy called up, a siege laid, winter quarters,
     the troops sent home (a realm's armies told once a month: "and two other wars")
   - raids (world.raidLog, campaigns.js)
   The map draws them (mapfx.js months), and ui.js shows the latest in a news line. */
(function () {
"use strict";
const AEON = window.AEON = window.AEON || {};

function baseOf(w) { return w._view === w ? Object.getPrototypeOf(w) : w; }
function hidden(o, k, v) { Object.defineProperty(o, k, { value: v, enumerable: false, configurable: true, writable: true }); return v; }
function nm(p) { return p ? p.name : "a realm"; }
function place(r) { return r ? (r.settlement && r.settlement.name) || r.name || "the frontier" : "the frontier"; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function dateOf(e) { return e.date != null ? e.date : e.year; }
/* the entries of a year-sorted list whose date lies in (Y, Y+1] (yearOf: the entry's tick year) */
function inYear(list, Y, yearOf, date) {
  let a = 0, b = list.length;
  while (a < b) { const m = (a + b) >> 1; if (yearOf(list[m]) < Y) a = m + 1; else b = m; }
  const out = [];
  for (let i = a; i < list.length && yearOf(list[i]) <= Y + 2; i++) { const d = date(list[i]); if (d > Y && d <= Y + 1) out.push(list[i]); }
  return out;
}
function capitalAt(w, pid, y) { const p = w.polities[pid]; return p ? AEON.capitalAt(p, y) : null; }
function hash(a, b) { let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function num(id) { return +String(id).replace(/\D/g, "") || 0; }
const YEARLY = { tribute: "The tribute of {A} is carried to {B}", alliance: "Envoys of {A} bring gifts to their allies in {B}",
                 trade: "Envoys of {A} and {B} meet to renew their trade", marriage: "Kin of {B} visit the court of {A}" };

const ENVOY = { alliance: "Envoys of {A} ride to {B} to seal an alliance", trade: "Merchants' envoys of {A} ride to {B} to agree a trade",
                truce: "Heralds of {A} ride to {B} under a flag of truce", tribute: "Envoys of {B} ride to {A} to fix the tribute",
                marriage: "A bride's train sets out from {B} for {A}" };

/* the happenings of calendar year Y (dates in (Y, Y+1]) */
function yearOf(w, Y) {
  const cache = w._monthsYears || hidden(w, "_monthsYears", {}), key = w.chronicle.length + ":" + (w.armyLog ? w.armyLog.length : 0) + ":" + (w.raidLog ? w.raidLog.length : 0);
  if (cache[Y] && cache[Y].key === key) return cache[Y].list;
  for (const k in cache) if (Math.abs(+k - Y) > 3) delete cache[k];
  const R = w.regions, P = w.polities, out = [];
  const add = function (o) { if (o.date > Y && o.date <= Y + 1 && (o.rid == null || R[o.rid])) out.push(o); };

  /* envoys and brides: treaties made in the year (and the next year's, whose riders set out now) */
  for (const t of w.treaties || []) {
    if (!ENVOY[t.kind] || t.start < Y || t.start > Y + 2) continue;
    const at = t.startDate != null ? t.startDate : t.start, a = capitalAt(w, t.a, at), b = capitalAt(w, t.b, at);
    if (a == null || b == null || a === b) continue;
    const there = t.kind === "marriage" || t.kind === "tribute" ? [b, a] : [a, b];
    add({ date: at - 1 / 12, until: at, kind: t.kind === "marriage" ? "bride" : "envoy", pid: t.kind === "marriage" || t.kind === "tribute" ? t.b : t.a,
          rid: there[0], to: there[1], text: ENVOY[t.kind].replace("{A}", nm(P[t.a])).replace("{B}", nm(P[t.b])) + "." });
  }
  /* the yearly traffic of the treaties in force all year, each in a month of its own (tribute
     was owed after the harvest, but brought in when it could be) */
  for (const t of AEON.openTreaties ? (w.treaties || []) : []) {
    if (!YEARLY[t.kind] || t.start >= Y || (t.end != null && t.end <= Y + 1)) continue;
    const m = Math.floor(hash(num(t.id), Y) * 12), d = Y + (m + 0.5) / 12;
    const a = capitalAt(w, t.a, d), b = capitalAt(w, t.b, d);
    if (a == null || b == null || a === b) continue;
    add({ date: d, until: d + 1 / 12, kind: t.kind === "marriage" ? "bride" : "envoy", pid: t.a, rid: a, to: b,
          text: YEARLY[t.kind].replace("{A}", nm(P[t.a])).replace("{B}", nm(P[t.b])) + "." });
  }
  /* sickness, plague, famine: from the year's events and the next's */
  for (const e of inYear(w.chronicle, Y, function (e) { return e.year; }, function (e) { return dateOf(e) - (e.tags.indexOf("famine") >= 0 ? 0.5 : e.tags.indexOf("succession") >= 0 ? 0.25 : 0); })) {
    const T = e.tags, d = dateOf(e), pa = (e.actors || []).filter(function (a) { return a && a.kind === "polity"; }), p = pa[0] && P[pa[0].id];
    if (T.indexOf("succession") >= 0 && p && !/usurp|coup|murder|assassin|seiz/.test(e.type + " " + T.join(" "))) {
      const rid = AEON.capitalAt(p, d);
      add({ date: d - 0.25, until: d, kind: "sick", pid: p.id, rid: rid, text: "The ruler of " + nm(p) + " lies sick at " + place(R[rid]) + "." });
    } else if (T.indexOf("famine") >= 0 && p) {
      const rid = AEON.capitalAt(p, d);
      add({ date: d - 0.5, until: d, kind: "famine", pid: p.id, rid: rid, text: "The harvest fails in " + nm(p) + "." });
    }
  }
  for (const e of inYear(w.chronicle, Y, function (e) { return e.year; }, dateOf)) {
    const T = e.tags, d = dateOf(e);
    if (T.indexOf("plague") >= 0 && e.regionId != null && !/wanes|over|ends/.test(e.type)) {
      const pa = (e.actors || []).filter(function (a) { return a && a.kind === "polity"; }), p = pa[pa.length - 1] && P[pa[pa.length - 1].id];
      add({ date: d, until: d + 1, kind: "plague", pid: p ? p.id : null, rid: e.regionId, text: "Sickness at " + place(R[e.regionId]) + (p ? ", in " + nm(p) : "") + "." });
    }
  }
  /* the armies' turns of fortune: a realm's of each kind told once a month, its other wars counted */
  const told = {};
  for (const e of inYear(w.armyLog || [], Y, function (e) { return Math.floor(e[0] == null ? -1e9 : e[0] - 1e-9); }, function (e) { return e[0] == null ? -1e9 : e[0]; })) {
    const p = P[e[2]];
    if (!p || ["muster", "siege", "quarters", "home"].indexOf(e[4]) < 0) continue;
    const k = e[2] + "|" + e[4] + "|" + Math.floor(e[0] * 12), h = told[k];
    if (h) { if (h.foes.indexOf(e[5]) < 0) h.foes.push(e[5]); continue; }
    told[k] = { e: e, p: p, foes: [e[5]] };
  }
  for (const k in told) {
    const e = told[k].e, p = told[k].p, more = told[k].foes.length - 1, foe = P[e[5]];
    const also = more ? (more === 1 ? " and one other war" : " and " + more + " other wars") : "";
    const text = e[4] === "muster" ? cap(nm(p)) + " calls up its levy against " + nm(foe) + (more ? " and " + more + " other " + (more === 1 ? "foe" : "foes") : "") + "."
      : e[4] === "siege" ? "The army of " + nm(p) + " lays siege to " + place(R[e[3]]) + "."
      : e[4] === "quarters" ? "The armies of " + nm(p) + " march into winter quarters."
      : "The army of " + nm(p) + " goes home from its war with " + nm(foe) + also + ".";
    add({ date: e[0], until: e[0] + 1 / 12, kind: "army", pid: p.id, rid: e[3], text: text });
  }
  /* raids */
  for (const e of inYear(w.raidLog || [], Y, function (e) { return Math.floor(e[0]); }, function (e) { return e[0]; })) {
    add({ date: e[0], until: e[0] + 1 / 12, kind: "raid", pid: e[1], rid: e[4], from: e[3],
          text: "Raiders from " + nm(P[e[1]]) + " burn the stores of " + place(R[e[4]]) + ", in " + nm(P[e[2]]) + "." });
  }
  out.sort(function (a, b) { return a.date - b.date; });
  cache[Y] = { key: key, list: out };
  return out;
}

/* the happenings under way at a date (begun, not yet over) and those begun in (y0, y1] */
function at(world, date) {
  const w = baseOf(world);
  if (!w.square || date == null) return [];
  const Y = Math.floor(date), out = [];
  for (const y of [Y - 1, Y]) for (const h of yearOf(w, y)) if (h.date <= date && date < h.until) out.push(h);
  return out;
}
function between(world, y0, y1) {
  const w = baseOf(world), out = [];
  if (!w.square) return out;
  for (let Y = Math.floor(y0); Y <= Math.floor(y1); Y++) for (const h of yearOf(w, Y)) if (h.date > y0 && h.date <= y1) out.push(h);
  return out;
}

AEON.months = { at: at, between: between };
})();
