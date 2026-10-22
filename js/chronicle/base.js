/* Aeon chronicle browser: timeline, entity pages, atlas, search, graph, "The Story So Far".
 * Pure DOM construction (no innerHTML): all pack-generated text is untrusted.
 *
 * The browser is split into parts loaded as plain scripts, in this order: base, style, timeline,
 * pages, atlas, story, graph, shell (file:// rules out ES modules). Each part is an IIFE that
 * imports what it needs from AEON._chronicle at the top and exports what later parts use at
 * the bottom. Parts only import from earlier parts; the one call that goes the other way,
 * render() in the shell, is made as C.render().
 *
 * base.js: Shared state, DOM helpers, world accessors, event indexes, derived data (ownership,
 * territory, wars, travel), navigation and entity links. Loaded first. */
(function () {
"use strict";
window.AEON = window.AEON || {};
var AEON = window.AEON;
var C = AEON._chronicle = {};

var SVGNS = "http://www.w3.org/2000/svg";
var KIND_LABEL = { polity: "Polity", figure: "Figure", artifact: "Artifact", region: "Region", event: "Event", settlement: "Settlement" };
/* settlement sizes by tier; the engine names them (AEON.tierName), a pack may rename them */
var TIER = {};
[1, 2, 3, 4].forEach(function (t) { Object.defineProperty(TIER, t, { enumerable: true, get: function () {
  return AEON.tierName ? AEON.tierName(S.world && S.world.pack, t) : ["", "village", "town", "city", "great city"][t];
} }); });
var IMP_LABEL = ["", "everything", "minor events and up", "notable events and up", "major events and up", "world-defining only"];
var PAGE_STEP = 120;

var S = {
  world: null, root: null, hooks: {}, nav: [], pos: -1,
  ix: null, cache: null, tl: null, pane: null, tlWrap: null, bar: null,
  searchEl: null, tabs: {}, backBtn: null, fwdBtn: null, live: null,
  timer: null, sel: -1, atlas: { tab: "polity", sort: "longevity", state: "all", q: "", limit: PAGE_STEP },
  gWrap: null, gUI: null, g: null, gm: null, gRaf: 0,
  gs: { on: { polity: true, figure: true, artifact: true, region: false, event: false }, n: 150, imp: 5, depth: 1 }
};

/* ---------- small DOM helpers ---------- */
function h(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = String(text);
  return e;
}
function add(parent) {
  for (var i = 1; i < arguments.length; i++) {
    var c = arguments[i];
    if (c == null || c === false) continue;
    if (typeof c === "string" || typeof c === "number") parent.appendChild(document.createTextNode(String(c)));
    else parent.appendChild(c);
  }
  return parent;
}
function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
function svg(tag, attrs) {
  var e = document.createElementNS(SVGNS, tag);
  for (var k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function safeColor(c) { return typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#8a8a8a"; }
function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function pct(v) { v = Math.max(0, Math.min(1, +v || 0)); return Math.round(v * 100); }
function trunc(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; }
function call(fn) { try { return fn(); } catch (e) { return undefined; } }
function objVals(o) { return Object.keys(o).map(function (k) { return o[k]; }); }

/* ---------- world accessors ---------- */
function getPack() {
  var w = S.world, p = null;
  call(function () {
    if (AEON.pack && typeof AEON.pack === "object") p = AEON.pack;
    else if (AEON.currentPack) p = AEON.currentPack;
    else if (AEON.packs && w) {
      if (Array.isArray(AEON.packs)) { for (var i = 0; i < AEON.packs.length; i++) if (AEON.packs[i].id === w.packId) p = AEON.packs[i]; }
      else p = AEON.packs[w.packId] || null;
    } else if (typeof AEON.getPack === "function" && w) p = AEON.getPack(w.packId);
  });
  return p;
}
function yr(y) {
  var p = getPack();
  if (p && typeof p.yearLabel === "function") { var s = call(function () { return p.yearLabel(y); }); if (s != null) return String(s); }
  return y < 0 ? "−" + (-y) : String(y);
}
function eras() {
  var p = getPack();
  var list = p && Array.isArray(p.eras) ? p.eras.slice() : [];
  list.sort(function (a, b) { return a.from - b.from; });
  return list;
}
function eraOf(year) {
  var l = eras(), cur = null;
  for (var i = 0; i < l.length; i++) if (l[i].from <= year) cur = l[i];
  return cur || (l.length ? l[0] : null);
}
function archetype(id) {
  var p = getPack();
  if (p && Array.isArray(p.archetypes)) for (var i = 0; i < p.archetypes.length; i++) if (p.archetypes[i].id === id) return p.archetypes[i];
  return null;
}
function biomeName(key) {
  var p = getPack();
  if (p && p.biomes && p.biomes[key] && p.biomes[key].name) return p.biomes[key].name;
  return key ? cap(String(key)) : "unknown";
}
function regionLabel(r) { return r ? (r.name || "Unnamed region (" + r.x + "," + r.y + ")") : "unknown region"; }
function ent(kind, id) {
  var w = S.world;
  if (!w || id == null) return null;
  if (kind === "polity") return w.polities[id] || null;
  if (kind === "figure") return w.figures[id] || null;
  if (kind === "artifact") return w.artifacts[id] || null;
  if (kind === "region" || kind === "settlement") return w.regions[id] || null;
  if (kind === "event") return S.ix.byEv[id] || null;
  return null;
}
function entName(kind, id) {
  var e = ent(kind, id);
  if (!e) return "(unknown " + kind + ")";
  if (kind === "region" || kind === "settlement") return regionLabel(e);
  if (kind === "event") return yr(e.year) + ": " + trunc(e.text, 60);
  return e.name || "(unnamed)";
}
function polityEnd(p) { return p.ended != null ? p.ended : S.world.year; }

/* ---------- indexes (incremental) ---------- */
function indexEvents() {
  var w = S.world, ix = S.ix, ev = w.chronicle || [], i, j;
  if (!ix || ix.n > ev.length || ix.world !== w) {
    ix = S.ix = { world: w, n: 0, byEv: {}, byActor: {}, byRegion: {}, tags: {}, minYear: Infinity, maxYear: -Infinity, low: {} };
    S.cache = null;
  }
  function push(map, key, e) { var a = map[key]; if (!a) a = map[key] = []; if (a[a.length - 1] !== e) a.push(e); }
  for (i = ix.n; i < ev.length; i++) {
    var e = ev[i];
    ix.byEv[e.id] = e;
    ix.low[e.id] = String(e.text || "").toLowerCase();
    if (e.year < ix.minYear) ix.minYear = e.year;
    if (e.year > ix.maxYear) ix.maxYear = e.year;
    var acts = e.actors || [];
    for (j = 0; j < acts.length; j++) {
      push(ix.byActor, acts[j].kind + ":" + acts[j].id, e);
      if (acts[j].kind === "region") push(ix.byRegion, acts[j].id, e);
    }
    if (e.regionId != null) push(ix.byRegion, e.regionId, e);
    var tg = e.tags || [];
    for (j = 0; j < tg.length; j++) ix.tags[tg[j]] = (ix.tags[tg[j]] || 0) + 1;
  }
  ix.n = ev.length;
}
function eventsOf(kind, id) { return (S.ix.byActor[kind + ":" + id] || []).slice(); }
function eventsOfRegion(id) { return (S.ix.byRegion[id] || []).slice(); }
function hasTag(e, t) { return (e.tags || []).indexOf(t) >= 0; }
function timeSpan() {
  var w = S.world, lo = S.ix.minYear, hi = S.ix.maxYear;
  if (w.startYear != null) lo = Math.min(lo, w.startYear);
  if (!isFinite(lo)) lo = w.startYear != null ? w.startYear : 0;
  if (w.year != null) hi = Math.max(hi, w.year);
  if (!isFinite(hi) || hi <= lo) hi = lo + 1;
  return [lo, hi];
}

/* ---------- derived data: ownership strata, territory, wars, travel ---------- */
var CLAIM = /conquest|conquer|annex|expan|coloni|settle|found|acquir|seiz|captur|vassal|transfer|claim|absorb|cession/;
var NOCLAIM = /rebel|secession|independ|revolt|liberat/;

function derived() {
  var w = S.world, key = w.chronicle.length + ":" + w.year + ":" + Object.keys(w.polities).length;
  if (S.cache && S.cache.key === key) return S.cache;
  var d = S.cache = { key: key, own: {}, terr: {}, wars: [], travel: {} };
  computeOwnership(d);
  computeWars(d);
  computeTravel(d);
  return d;
}
function computeOwnership(d) {
  var w = S.world, cur = {}, own = d.own, items = [], pid, k, i;
  function set(rid, owner, y) {
    if (cur[rid] === owner || (cur[rid] == null && owner == null)) return;
    cur[rid] = owner;
    (own[rid] = own[rid] || []).push({ year: y, owner: owner });
  }
  for (pid in w.polities) {
    var p = w.polities[pid];
    items.push({ y: p.founded, r: 0, p: p });
    if (p.ended != null) items.push({ y: p.ended, r: 2, p: p });
  }
  for (i = 0; i < w.chronicle.length; i++) items.push({ y: w.chronicle[i].year, r: 1, e: w.chronicle[i], o: i });
  items.sort(function (a, b) { return a.y - b.y || a.r - b.r || (a.o || 0) - (b.o || 0); });
  items.forEach(function (it) {
    if (it.r === 0) { if (it.p.capital != null) set(it.p.capital, it.p.id, it.y); }
    else if (it.r === 2) { for (k in cur) if (cur[k] === it.p.id) set(+k, null, it.y); }
    else {
      var e = it.e, tg = (e.tags || []).join(" ");
      if (!CLAIM.test(tg) || NOCLAIM.test(tg)) return;
      var rid = null, owner = null, a = e.actors || [], j;
      for (j = 0; j < a.length; j++) {
        if (a[j].kind === "region" && rid == null) rid = a[j].id;
        if (a[j].kind === "polity" && owner == null) owner = a[j].id;
      }
      if (rid == null) rid = e.regionId;
      if (rid != null && owner != null && w.polities[owner]) set(rid, owner, it.y);
    }
  });
  w.regions.forEach(function (r) {
    var o = r.owner == null ? null : r.owner, c = cur[r.id] == null ? null : cur[r.id];
    if (o === c) return;
    var y = w.year;
    if (!own[r.id] && o != null && w.polities[o]) y = w.polities[o].founded;
    set(r.id, o, y);
  });
}
function territory(pid) {
  var d = derived(), w = S.world;
  if (d.terr[pid]) return d.terr[pid];
  var p = w.polities[pid], pts = [], hist = p && (p.history || p.territoryHistory);
  if (Array.isArray(hist) && hist.length) {
    hist.forEach(function (x) {
      if (!x || typeof x !== "object") return;
      var v = x.regions != null ? (Array.isArray(x.regions) ? x.regions.length : x.regions) : (x.size != null ? x.size : x.territory);
      if (v != null) pts.push({ year: x.year, v: +v });
    });
  }
  if (!pts.length) {
    var deltas = [];
    for (var rid in d.own) {
      var segs = d.own[rid];
      for (var i = 0; i < segs.length; i++) {
        if (segs[i].owner === pid) deltas.push({ y: segs[i].year, d: 1 });
        else if (i > 0 && segs[i - 1].owner === pid) deltas.push({ y: segs[i].year, d: -1 });
      }
    }
    deltas.sort(function (a, b) { return a.y - b.y; });
    var n = 0;
    deltas.forEach(function (x) {
      n += x.d;
      if (pts.length && pts[pts.length - 1].year === x.y) pts[pts.length - 1].v = n;
      else pts.push({ year: x.y, v: n });
    });
  }
  if (p && pts.length) pts.push({ year: polityEnd(p), v: pts[pts.length - 1].v });
  d.terr[pid] = pts;
  return pts;
}
function peakSize(pid) {
  var pts = territory(pid), m = 0;
  pts.forEach(function (x) { if (x.v > m) m = x.v; });
  var p = S.world.polities[pid];
  return Math.max(m, p && p.regions ? p.regions.length : 0);
}
function computeWars(d) {
  var open = {}, wars = d.wars;
  S.world.chronicle.forEach(function (e) {
    if (!hasTag(e, "war")) return;
    var ids = [];
    (e.actors || []).forEach(function (a) { if (a.kind === "polity" && ids.indexOf(a.id) < 0) ids.push(a.id); });
    if (ids.length < 2) return;
    var pair = ids.slice(0, 2).sort(function (a, b) { return a - b; }), key = pair.join("-"), cur = open[key];
    if (!cur || e.year - cur.end > 60) {
      cur = open[key] = { a: pair[0], b: pair[1], start: e.year, end: e.year, events: [], score: 0 };
      wars.push(cur);
    }
    cur.end = e.year; cur.events.push(e); cur.score += e.importance || 1;
  });
  wars.forEach(function (wr) {
    var last = wr.events[wr.events.length - 1], tg = (last.tags || []).join(" "), w = S.world;
    var pa = w.polities[wr.a], pb = w.polities[wr.b], label;
    if (pa && pa.ended != null && pa.ended >= wr.start && pa.ended <= wr.end + 15) label = pa.name + " was destroyed";
    else if (pb && pb.ended != null && pb.ended >= wr.start && pb.ended <= wr.end + 15) label = pb.name + " was destroyed";
    else if (/peace|treaty|truce|armistice/.test(tg)) label = "ended in a negotiated peace";
    else if (/conquest|annex|collapse|fall/.test(tg)) label = "ended in conquest";
    else if (pa && pb && pa.ended == null && pb.ended == null && wr.end >= w.year - 30) label = "unresolved, perhaps still burning";
    else label = "petered out without a settlement";
    wr.outcome = label;
  });
}
function computeTravel(d) {
  var w = S.world;
  Object.keys(w.artifacts).forEach(function (id) {
    var a = w.artifacts[id], set = {}, n = 0;
    function mark(r) { if (r != null && !set[r]) { set[r] = 1; n++; } }
    mark(a.location);
    eventsOf("artifact", a.id).forEach(function (e) {
      mark(e.regionId);
      (e.actors || []).forEach(function (x) { if (x.kind === "region") mark(x.id); });
    });
    d.travel[id] = n;
  });
}

/* ---------- navigation ---------- */
function curEntry() { return S.nav[S.pos]; }
function saveScroll() { var c = curEntry(); if (c && c.v !== "timeline" && S.pane) c.scroll = S.pane.scrollTop; }
function go(entry, replace) {
  saveScroll();
  if (replace && S.pos >= 0) S.nav[S.pos] = entry;
  else { S.nav = S.nav.slice(0, S.pos + 1); S.nav.push(entry); S.pos = S.nav.length - 1; }
  C.render();
  sideEffects(entry);
}
function stepNav(d) {
  var np = S.pos + d;
  if (np < 0 || np >= S.nav.length) return;
  saveScroll();
  S.pos = np;
  C.render();
  sideEffects(curEntry());
}
function sideEffects(en) {
  if (en.v !== "entity") return;
  call(function () {
    var hk = S.hooks || {}, k = en.kind, id = en.id;
    if (k === "polity" && hk.onSelectPolity) hk.onSelectPolity(id);
    else if ((k === "region" || k === "settlement") && hk.onFocusRegion) hk.onFocusRegion(id);
    else if (k === "event") { var e = S.ix.byEv[id]; if (e && e.regionId != null && hk.onFocusRegion) hk.onFocusRegion(e.regionId); }
    else if (k === "figure") { var f = S.world.figures[id]; if (f && f.polityId != null && hk.onSelectPolity) hk.onSelectPolity(f.polityId); }
    else if (k === "artifact") { var a = S.world.artifacts[id]; if (a && a.location != null && hk.onFocusRegion) hk.onFocusRegion(a.location); }
  });
}
function link(kind, id, label) {
  var a = h("a", "ch-link ch-k-" + kind, label != null ? label : entName(kind, id));
  a.href = "#";
  a.setAttribute("data-ch-kind", kind);
  a.setAttribute("data-ch-id", String(id));
  if (kind === "polity") { var p = ent("polity", id); if (p) a.style.setProperty("--ch-pc", safeColor(p.color)); }
  return a;
}
function onRootClick(ev) {
  var t = ev.target;
  while (t && t !== S.root) {
    if (t.getAttribute && t.hasAttribute("data-ch-kind")) {
      ev.preventDefault();
      var kind = t.getAttribute("data-ch-kind"), id = t.getAttribute("data-ch-id");
      if (kind === "settlement") kind = "region";
      var num = +id;
      go({ v: "entity", kind: kind, id: isNaN(num) ? id : num });
      return;
    }
    t = t.parentNode;
  }
}

/* shared with the later parts */
C.KIND_LABEL = KIND_LABEL; C.TIER = TIER; C.IMP_LABEL = IMP_LABEL; C.PAGE_STEP = PAGE_STEP; C.S = S;
C.h = h; C.add = add; C.clear = clear; C.svg = svg; C.safeColor = safeColor; C.plural = plural;
C.cap = cap; C.pct = pct; C.trunc = trunc; C.call = call; C.objVals = objVals; C.yr = yr; C.eras = eras;
C.eraOf = eraOf; C.archetype = archetype; C.biomeName = biomeName; C.regionLabel = regionLabel;
C.ent = ent; C.entName = entName; C.polityEnd = polityEnd; C.indexEvents = indexEvents;
C.eventsOf = eventsOf; C.eventsOfRegion = eventsOfRegion; C.hasTag = hasTag; C.timeSpan = timeSpan;
C.derived = derived; C.territory = territory; C.peakSize = peakSize; C.curEntry = curEntry;
C.saveScroll = saveScroll; C.go = go; C.stepNav = stepNav; C.link = link; C.onRootClick = onRootClick;
})();
