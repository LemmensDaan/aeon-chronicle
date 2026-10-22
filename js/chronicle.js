/* Aeon chronicle browser: timeline, entity pages, atlas, search, "The Story So Far".
 * Pure DOM construction (no innerHTML): all pack-generated text is untrusted. */
(function () {
"use strict";
window.AEON = window.AEON || {};
var AEON = window.AEON;

var SVGNS = "http://www.w3.org/2000/svg";
var KIND_LABEL = { polity: "Polity", figure: "Figure", artifact: "Artifact", region: "Region", event: "Event", settlement: "Settlement" };
var TIER = ["", "outpost", "town", "city", "great city"];
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
  render();
  sideEffects(entry);
}
function stepNav(d) {
  var np = S.pos + d;
  if (np < 0 || np >= S.nav.length) return;
  saveScroll();
  S.pos = np;
  render();
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

/* ---------- CSS ---------- */
var DARK_VARS = "--ch-bg:#1b1916;--ch-panel:#242120;--ch-ink:#e8e1d2;--ch-mute:#a1988a;--ch-rule:#3b362f;--ch-accent:#e58b5c;--ch-link:#86bcdb;--ch-hi:#3a3322;--ch-i5:#f0a27a;";
var CSS = [
".ch-root{--ch-bg:#f6f2e8;--ch-panel:#fffdf6;--ch-ink:#2a2621;--ch-mute:#766d61;--ch-rule:#ddd3c0;--ch-accent:#8a3b1e;--ch-link:#1d5878;--ch-hi:#f0e5c6;--ch-i5:#7a1f12;" +
  "--ch-serif:Georgia,'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua','Times New Roman',serif;--ch-sans:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;" +
  "display:flex;flex-direction:column;height:100%;min-height:480px;background:var(--ch-bg);color:var(--ch-ink);font-family:var(--ch-serif);font-size:17px;line-height:1.65;box-sizing:border-box;position:relative;overflow:hidden}",
":root[data-theme='dark'] .ch-root{" + DARK_VARS + "}",
"@media (prefers-color-scheme:dark){:root:not([data-theme]) .ch-root{" + DARK_VARS + "}}",
".ch-root *{box-sizing:border-box}",
".ch-bar{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--ch-rule);background:var(--ch-panel);font-family:var(--ch-sans);font-size:14px;line-height:1.3}",
".ch-btn{font:inherit;color:var(--ch-ink);background:transparent;border:1px solid var(--ch-rule);border-radius:4px;padding:4px 10px;cursor:pointer}",
".ch-btn:hover:not(:disabled){background:var(--ch-hi)}.ch-btn:disabled{opacity:.35;cursor:default}",
".ch-btn.ch-on{background:var(--ch-ink);color:var(--ch-bg);border-color:var(--ch-ink)}",
".ch-btn:focus-visible,.ch-link:focus-visible,.ch-input:focus-visible{outline:2px solid var(--ch-link);outline-offset:1px}",
".ch-tabs{display:flex;gap:4px}.ch-grow{flex:1}",
".ch-input{font:inherit;color:var(--ch-ink);background:var(--ch-bg);border:1px solid var(--ch-rule);border-radius:4px;padding:4px 8px;min-width:0}",
".ch-search{width:min(260px,100%)}",
".ch-main{flex:1;min-height:0;position:relative;display:flex;flex-direction:column}",
".ch-pane{flex:1;min-height:0;overflow:auto;padding:0 18px 60px}",
".ch-page{max-width:46rem;margin:0 auto;padding-top:26px}",
".ch-page.ch-wide{max-width:60rem}",
".ch-link{color:var(--ch-link);text-decoration:none;border-bottom:1px dotted currentColor;cursor:pointer}",
".ch-link:hover{background:var(--ch-hi)}",
".ch-link.ch-k-polity{border-bottom:2px solid var(--ch-pc,currentColor)}",
"h1.ch-h1{font-size:2.1rem;line-height:1.2;margin:.2em 0 .1em;font-weight:600;letter-spacing:.01em}",
"h2.ch-h2{font-size:1.25rem;margin:2em 0 .5em;padding-bottom:.25em;border-bottom:1px solid var(--ch-rule);font-weight:600;font-variant:small-caps;letter-spacing:.06em}",
".ch-kicker{font-family:var(--ch-sans);font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:var(--ch-mute)}",
".ch-sub{color:var(--ch-mute);font-style:italic;margin:0 0 .6em}",
".ch-swatch{display:inline-block;width:.8em;height:.8em;border-radius:2px;margin-right:.4em;vertical-align:baseline;border:1px solid rgba(0,0,0,.3)}",
".ch-fate{margin:1em 0;padding:.9em 1.2em;border-left:4px solid var(--ch-accent);background:var(--ch-hi);font-size:1.2rem;font-style:italic}",
".ch-epitaph{margin:1em 0;padding:.6em 1.2em;border-left:3px solid var(--ch-mute);font-style:italic;font-size:1.1rem}",
".ch-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px 18px;margin:1em 0;font-family:var(--ch-sans);font-size:14px;line-height:1.35}",
".ch-stat b{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ch-mute);font-weight:500}",
".ch-bars{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-family:var(--ch-sans);font-size:13px;align-items:center;max-width:26rem}",
".ch-barx{height:8px;background:var(--ch-rule);border-radius:4px;overflow:hidden}.ch-barx i{display:block;height:100%;background:var(--ch-accent)}",
".ch-table{width:100%;border-collapse:collapse;font-size:15px;line-height:1.4}",
".ch-table th{text-align:left;font-family:var(--ch-sans);font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--ch-mute);font-weight:500;padding:4px 8px;border-bottom:1px solid var(--ch-rule)}",
".ch-table td{padding:6px 8px;border-bottom:1px solid var(--ch-rule);vertical-align:top}",
".ch-empty{color:var(--ch-mute);font-style:italic;padding:.6em 0}",
".ch-chips{display:flex;flex-wrap:wrap;gap:6px;margin:.4em 0}",
".ch-chip{font-family:var(--ch-sans);font-size:12px;border:1px solid var(--ch-rule);border-radius:10px;padding:0 9px;color:var(--ch-mute);background:transparent;cursor:default;line-height:1.7}",
".ch-spark{display:block;width:100%;max-width:32rem;height:auto;color:var(--ch-accent)}",
".ch-axis{display:flex;justify-content:space-between;max-width:32rem;font-family:var(--ch-sans);font-size:12px;color:var(--ch-mute)}",
".ch-strata{display:flex;height:34px;border:1px solid var(--ch-rule);border-radius:3px;overflow:hidden;margin:.6em 0}",
".ch-strata>div{height:100%;min-width:2px;border-right:1px solid rgba(0,0,0,.25)}",
".ch-strata>div.ch-gap{background:repeating-linear-gradient(45deg,transparent 0 5px,var(--ch-rule) 5px 6px)}",
".ch-legend{display:flex;flex-wrap:wrap;gap:4px 16px;font-family:var(--ch-sans);font-size:13px}",
".ch-chain{list-style:none;margin:1em 0;padding:0 0 0 1.6em;border-left:2px solid var(--ch-rule)}",
".ch-chain li{position:relative;padding:0 0 1.1em .4em}",
".ch-chain li:before{content:'';position:absolute;left:-2.2em;top:.55em;width:.7em;height:.7em;border-radius:50%;background:var(--ch-accent);border:2px solid var(--ch-bg)}",
".ch-chain .ch-verb{font-family:var(--ch-sans);font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--ch-accent)}",
".ch-ul{list-style:none;margin:0;padding:0}",
".ch-ul li{padding:.35em 0;border-bottom:1px solid var(--ch-rule)}",
".ch-more{margin:1em 0}",
".ch-tlwrap{flex:1;min-height:0;display:flex;flex-direction:column}",
".ch-filters{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--ch-rule);font-family:var(--ch-sans);font-size:13px;background:var(--ch-panel)}",
".ch-filters label{display:flex;align-items:center;gap:6px}",
".ch-brushrow{width:100%;display:flex;align-items:center;gap:10px}",
".ch-brush{position:relative;flex:1;height:34px;border:1px solid var(--ch-rule);border-radius:3px;cursor:crosshair;touch-action:none;user-select:none;display:flex;align-items:flex-end;background:var(--ch-bg)}",
".ch-brush>i{flex:1;background:var(--ch-mute);opacity:.55;min-height:1px;pointer-events:none}",
".ch-brush>b{position:absolute;top:0;bottom:0;background:var(--ch-accent);opacity:.22;border-left:2px solid var(--ch-accent);border-right:2px solid var(--ch-accent);pointer-events:none}",
".ch-tl{flex:1;min-height:0;overflow:auto;position:relative}",
".ch-tlin{position:relative;max-width:50rem;margin:0 auto}",
".ch-row{position:absolute;left:0;right:0;padding:0 16px}",
".ch-era{padding:44px 0 14px;border-bottom:3px double var(--ch-accent)}",
".ch-era h2{margin:0;font-size:1.9rem;line-height:1.2;font-weight:600;color:var(--ch-accent)}",
".ch-era p{margin:.2em 0 0;color:var(--ch-mute);font-style:italic}",
".ch-cent{padding:22px 0 6px 110px;font-family:var(--ch-sans);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ch-mute)}",
".ch-ev{display:flex;gap:14px;padding:5px 0}",
".ch-yr{flex:0 0 96px;text-align:right;font-family:var(--ch-sans);font-size:13px;line-height:1.9;color:var(--ch-mute);border-bottom:0;text-decoration:none;font-variant-numeric:tabular-nums;cursor:pointer}",
".ch-yr:hover{color:var(--ch-link);background:none}",
".ch-body{flex:1;min-width:0;max-width:70ch}",
".ch-txt{margin:0;overflow-wrap:break-word}",
".ch-tags{display:flex;flex-wrap:wrap;gap:4px 8px;margin-top:2px}",
".ch-tg{font:inherit;font-family:var(--ch-sans);font-size:11px;color:var(--ch-mute);background:none;border:0;padding:0;cursor:pointer}.ch-tg:hover{color:var(--ch-link);text-decoration:underline}",
".ch-i1 .ch-txt{font-size:14.5px;line-height:1.5;color:var(--ch-mute)}",
".ch-i1 .ch-yr{font-size:11.5px;line-height:2.1;opacity:.8}",
".ch-i2 .ch-txt{font-size:16px}",
".ch-i3 .ch-txt{font-size:17.5px}",
".ch-i4 .ch-txt{font-size:20px;font-weight:600;line-height:1.45}",
".ch-i4{padding-top:12px}.ch-i4 .ch-yr{color:var(--ch-ink);line-height:2.2}",
".ch-i5{padding:18px 0 14px;margin:6px 0;border-top:1px solid var(--ch-i5);border-bottom:1px solid var(--ch-i5)}",
".ch-i5 .ch-txt{font-size:25px;line-height:1.35;font-weight:700;color:var(--ch-i5)}",
".ch-i5 .ch-yr{color:var(--ch-i5);font-weight:700;font-size:15px;line-height:2.4}",
".ch-i5 .ch-link{color:inherit}",
".ch-count{color:var(--ch-mute);margin-left:auto}",
".ch-gwrap{flex:1;min-height:0;display:flex;flex-direction:column}",
".ch-gview{flex:1;min-height:0;position:relative;overflow:hidden}",
".ch-gview canvas{position:absolute;left:0;top:0;width:100%;height:100%;touch-action:none;cursor:grab;display:block}",
".ch-gstatus{padding:6px 14px;border-top:1px solid var(--ch-rule);font-family:var(--ch-sans);font-size:13px;line-height:1.5;color:var(--ch-mute);min-height:2.6em}",
".ch-gk{display:inline-flex;align-items:center;gap:6px}.ch-gk canvas{display:block;flex:none}",
".ch-btn.ch-gk:not(.ch-on){opacity:.5}",
".ch-row2{display:flex;gap:10px;align-items:baseline;padding:.55em 0;border-bottom:1px solid var(--ch-rule)}",
".ch-row2 .ch-line{color:var(--ch-mute);font-size:15px;line-height:1.45}",
".ch-res{display:block;padding:.4em .6em;margin:0 -.6em;border-radius:4px;cursor:pointer;line-height:1.4;text-decoration:none;color:var(--ch-ink)}",
".ch-res.ch-sel,.ch-res:hover{background:var(--ch-hi)}",
".ch-res small{display:block;color:var(--ch-mute);font-size:14px}",
".ch-res mark{background:var(--ch-hi);color:inherit;font-weight:700;text-decoration:underline}",
".ch-story p{margin:0 0 1.1em;max-width:70ch}",
".ch-story .ch-lede{font-size:1.25rem}",
".ch-story .ch-lede:first-letter{font-size:3.4em;float:left;line-height:.85;padding:.06em .1em 0 0;color:var(--ch-accent)}",
".ch-story h2.ch-h2{font-size:1.5rem;font-variant:normal;letter-spacing:0;color:var(--ch-accent)}",
".ch-lead{color:var(--ch-mute);font-size:.9em}",
".ch-tools{display:flex;gap:8px;margin:1.4em 0;flex-wrap:wrap;font-family:var(--ch-sans)}",
"@media (max-width:640px){.ch-yr{flex-basis:64px}.ch-cent{padding-left:78px}.ch-i5 .ch-txt{font-size:21px}.ch-pane{padding:0 12px 60px}}"
].join("\n");

function injectStyle() {
  if (document.getElementById("ch-style")) return;
  var st = document.createElement("style");
  st.id = "ch-style";
  st.appendChild(document.createTextNode(CSS));
  (document.head || document.documentElement).appendChild(st);
}

/* ---------- linkified prose ---------- */
function actorNames(ev) {
  var out = [], seen = {};
  function addName(kind, id) {
    var e = ent(kind, id), nm = e && e.name;
    if (!nm || nm.length < 2) return;
    var k = kind + ":" + id;
    if (seen[k]) return;
    seen[k] = 1;
    out.push({ kind: kind, id: id, name: nm });
  }
  (ev.actors || []).forEach(function (a) { addName(a.kind, a.id); });
  if (ev.regionId != null) addName("region", ev.regionId);
  out.sort(function (a, b) { return b.name.length - a.name.length; });
  return out;
}
function isWordChar(c) { return !!c && /[A-Za-z0-9À-ɏ]/.test(c); }
function linkified(text, ev, plain) {
  var frag = document.createDocumentFragment();
  text = String(text == null ? "" : text);
  var names = actorNames(ev), spans = [], i, j;
  names.forEach(function (n) {
    var from = 0, idx;
    while ((idx = text.indexOf(n.name, from)) >= 0) {
      var end = idx + n.name.length, clash = false;
      from = end;
      if (isWordChar(text.charAt(idx - 1)) || isWordChar(text.charAt(end))) continue;
      for (j = 0; j < spans.length; j++) if (idx < spans[j].end && end > spans[j].start) { clash = true; break; }
      if (!clash) spans.push({ start: idx, end: end, n: n });
    }
  });
  spans.sort(function (a, b) { return a.start - b.start; });
  var pos = 0;
  for (i = 0; i < spans.length; i++) {
    if (spans[i].start > pos) frag.appendChild(document.createTextNode(text.slice(pos, spans[i].start)));
    var lbl = text.slice(spans[i].start, spans[i].end);
    frag.appendChild(plain ? document.createTextNode(lbl) : link(spans[i].n.kind, spans[i].n.id, lbl));
    pos = spans[i].end;
  }
  if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
  return frag;
}
function entryNode(ev, opts) {
  opts = opts || {};
  var imp = Math.max(1, Math.min(5, ev.importance || 1));
  var row = h("div", "ch-ev ch-i" + imp);
  var y = link("event", ev.id, yr(ev.year));
  y.className = "ch-yr";
  var body = h("div", "ch-body"), p = h("p", "ch-txt");
  p.appendChild(linkified(ev.text, ev));
  body.appendChild(p);
  if (ev.tags && ev.tags.length && !opts.noTags) {
    var tg = h("div", "ch-tags");
    ev.tags.forEach(function (t) {
      var b = h("button", "ch-tg", "#" + t);
      b.type = "button";
      b.setAttribute("data-ch-tag", t);
      tg.appendChild(b);
    });
    body.appendChild(tg);
  }
  add(row, y, body);
  return row;
}

/* ---------- Timeline (virtualised) ---------- */
function filterEvents() {
  var f = S.tl.f, out = [], all = S.world.chronicle;
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    if ((e.importance || 1) < f.minImp) continue;
    if (f.from != null && e.year < f.from) continue;
    if (f.to != null && e.year > f.to) continue;
    if (f.tag && !hasTag(e, f.tag)) continue;
    if (f.polity !== "" && !evTouchesPolity(e, +f.polity)) continue;
    out.push(e);
  }
  return out;
}
function evTouchesPolity(e, pid) {
  var a = e.actors || [];
  for (var i = 0; i < a.length; i++) {
    if (a[i].kind === "polity" && a[i].id === pid) return true;
    if (a[i].kind === "figure") { var f = S.world.figures[a[i].id]; if (f && f.polityId === pid) return true; }
  }
  return false;
}
function buildRows(evs) {
  var rows = [], lastEra = null, lastCent = null, el = eras().length > 0;
  evs.forEach(function (e) {
    var era = el ? eraOf(e.year) : null, cent = Math.floor(e.year / 100) * 100;
    if (era && era !== lastEra) {
      rows.push({ t: "era", key: "E" + era.id + ":" + e.year, era: era });
      lastEra = era; lastCent = null;
    }
    if (cent !== lastCent) { rows.push({ t: "cent", key: "C" + cent + (era ? era.id : ""), cent: cent }); lastCent = cent; }
    rows.push({ t: "ev", key: "V" + e.id, ev: e });
  });
  return rows;
}
function estimateHeight(r) {
  if (r.t === "era") return 120;
  if (r.t === "cent") return 56;
  var imp = r.ev.importance || 1, len = String(r.ev.text || "").length;
  var cpl = imp >= 5 ? 34 : imp === 4 ? 50 : 62, lh = imp >= 5 ? 34 : imp === 4 ? 29 : imp === 1 ? 22 : 28;
  return Math.ceil(len / cpl) * lh + (imp >= 5 ? 56 : 18) + ((r.ev.tags || []).length ? 18 : 0);
}
function buildRow(r) {
  var d = h("div", "ch-row");
  if (r.t === "era") {
    var box = h("div", "ch-era");
    add(box, h("h2", null, r.era.name), h("p", null, "from " + yr(r.era.from) + (r.era.blurb ? " — " + r.era.blurb : "")));
    d.appendChild(box);
  } else if (r.t === "cent") {
    d.appendChild(h("div", "ch-cent", yr(r.cent) + " – " + yr(r.cent + 99)));
  } else d.appendChild(entryNode(r.ev));
  return d;
}
function tlLayout() {
  var tl = S.tl, off = 0, n = tl.rows.length;
  tl.offsets = new Array(n + 1);
  for (var i = 0; i < n; i++) { tl.offsets[i] = off; off += tl.heights[i]; }
  tl.offsets[n] = off;
  tl.inner.style.height = off + "px";
}
function firstAtOrAfter(offsets, n, y) {
  var a = 0, b = n;
  while (a < b) { var m = (a + b) >> 1; if (offsets[m + 1] <= y) a = m + 1; else b = m; }
  return a;
}
function tlRender() {
  var tl = S.tl, sc = tl.scroller, n = tl.rows.length, i;
  tl.frame = 0;
  if (!sc.clientHeight) return;
  var top = sc.scrollTop, vh = sc.clientHeight, lo = top - 500, hi = top + vh + 500;
  var start = firstAtOrAfter(tl.offsets, n, lo), end = start, want = {};
  while (end < n && tl.offsets[end] < hi) end++;
  for (i = start; i < end; i++) {
    var key = tl.rows[i].key, node = tl.nodes[key];
    want[key] = 1;
    if (!node) { node = tl.nodes[key] = buildRow(tl.rows[i]); tl.inner.appendChild(node); }
    node.style.top = tl.offsets[i] + "px";
  }
  for (var k in tl.nodes) if (!want[k]) { tl.inner.removeChild(tl.nodes[k]); delete tl.nodes[k]; }
  var anchor = firstAtOrAfter(tl.offsets, n, top), before = tl.offsets[anchor], changed = false;
  for (i = start; i < end; i++) {
    var nd = tl.nodes[tl.rows[i].key], hh = nd.offsetHeight;
    if (hh && Math.abs(hh - tl.heights[i]) > 1) { tl.heights[i] = hh; tl.measured[tl.rows[i].key] = hh; changed = true; }
  }
  if (changed) {
    tlLayout();
    for (i = start; i < end; i++) tl.nodes[tl.rows[i].key].style.top = tl.offsets[i] + "px";
    var delta = tl.offsets[anchor] - before;
    if (delta) sc.scrollTop = top + delta;
  }
}
function tlSchedule() {
  var tl = S.tl;
  if (tl.frame) return;
  tl.frame = window.requestAnimationFrame ? window.requestAnimationFrame(tlRender) : setTimeout(tlRender, 16);
}
function tlSetRows() {
  var tl = S.tl, evs = filterEvents();
  tl.evs = evs;
  tl.rows = buildRows(evs);
  tl.heights = tl.rows.map(function (r) { return tl.measured[r.key] || estimateHeight(r); });
  for (var k in tl.nodes) tl.inner.removeChild(tl.nodes[k]);
  tl.nodes = {};
  tlLayout();
  tl.count.textContent = evs.length.toLocaleString() + " of " + S.world.chronicle.length.toLocaleString() + " entries";
  if (!tl.rows.length) {
    tl.empty.style.display = "";
    tl.empty.textContent = S.world.chronicle.length ? "No entries match these filters." : "Nothing has been recorded yet. History has not begun.";
  } else tl.empty.style.display = "none";
  tlRender();
}
function tlScrollToEvent(id) {
  var tl = S.tl;
  if (!tl || !ent("event", id)) return;
  var idx = -1;
  for (var tries = 0; tries < 2 && idx < 0; tries++) {
    for (var i = 0; i < tl.rows.length; i++) if (tl.rows[i].t === "ev" && tl.rows[i].ev.id === id) { idx = i; break; }
    if (idx < 0) resetFilters();
  }
  if (idx >= 0) tl.scroller.scrollTop = Math.max(0, tl.offsets[idx] - 80);
  tlRender();
  tlRender();
}
function resetFilters() {
  var tl = S.tl;
  tl.f = { minImp: 1, tag: "", polity: "", from: null, to: null };
  tl.imp.value = "1"; tl.impLabel.textContent = IMP_LABEL[1];
  tl.tagSel.value = ""; tl.polSel.value = "";
  tlBrushDraw();
  tlSetRows();
}
function fillSelect(sel, first, items, cur) {
  clear(sel);
  var o = h("option", null, first); o.value = ""; sel.appendChild(o);
  items.forEach(function (it) { var op = h("option", null, it[1]); op.value = it[0]; sel.appendChild(op); });
  sel.value = cur;
  if (sel.value !== cur) sel.value = "";
}
function tlRefreshOptions() {
  var tl = S.tl, w = S.world;
  var tags = Object.keys(S.ix.tags).sort(function (a, b) { return S.ix.tags[b] - S.ix.tags[a] || (a < b ? -1 : 1); });
  fillSelect(tl.tagSel, "any tag", tags.map(function (t) { return [t, t + " (" + S.ix.tags[t] + ")"]; }), tl.f.tag);
  var ps = objVals(w.polities).sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  fillSelect(tl.polSel, "any polity", ps.map(function (p) { return [String(p.id), p.name + (p.ended != null ? " †" : "")]; }), tl.f.polity);
  tl.optKey = Object.keys(S.ix.tags).length + ":" + ps.length;
}
function tlBrushDraw() {
  var tl = S.tl, sp = timeSpan(), N = 72, i;
  clear(tl.brush);
  var bins = new Array(N), mx = 1;
  for (i = 0; i < N; i++) bins[i] = 0;
  S.world.chronicle.forEach(function (e) {
    var b = Math.min(N - 1, Math.floor((e.year - sp[0]) / (sp[1] - sp[0]) * N));
    if (b >= 0) { bins[b]++; if (bins[b] > mx) mx = bins[b]; }
  });
  for (i = 0; i < N; i++) { var bar = h("i"); bar.style.height = Math.max(1, Math.round(bins[i] / mx * 100)) + "%"; tl.brush.appendChild(bar); }
  tl.sel = h("b");
  tl.brush.appendChild(tl.sel);
  var f = tl.f;
  if (f.from != null || f.to != null) {
    var a = ((f.from != null ? f.from : sp[0]) - sp[0]) / (sp[1] - sp[0]), b2 = ((f.to != null ? f.to : sp[1]) - sp[0]) / (sp[1] - sp[0]);
    tl.sel.style.left = (a * 100) + "%"; tl.sel.style.width = Math.max(0.5, (b2 - a) * 100) + "%";
    tl.range.textContent = yr(f.from != null ? f.from : sp[0]) + " → " + yr(f.to != null ? f.to : sp[1]);
  } else { tl.sel.style.display = "none"; tl.range.textContent = "all years (drag to select)"; }
}
function buildTimeline() {
  var tl = S.tl = { f: { minImp: 1, tag: "", polity: "", from: null, to: null }, measured: {}, nodes: {}, rows: [], heights: [], offsets: [0], frame: 0 };
  var wrap = tl.el = h("div", "ch-tlwrap"), fb = h("div", "ch-filters");
  tl.imp = h("input", "ch-input"); tl.imp.type = "range"; tl.imp.min = "1"; tl.imp.max = "5"; tl.imp.value = "1"; tl.imp.setAttribute("aria-label", "Importance threshold");
  tl.impLabel = h("span", null, IMP_LABEL[1]);
  tl.tagSel = h("select", "ch-input"); tl.polSel = h("select", "ch-input");
  tl.tagSel.setAttribute("aria-label", "Filter by tag"); tl.polSel.setAttribute("aria-label", "Filter by polity");
  var rb = h("button", "ch-btn", "Reset filters"); rb.type = "button";
  tl.count = h("span", "ch-count");
  var l1 = h("label", null, "Importance "); add(l1, tl.imp, tl.impLabel);
  add(fb, l1, tl.tagSel, tl.polSel, rb, tl.count);
  var br = h("div", "ch-brushrow");
  tl.brush = h("div", "ch-brush"); tl.brush.setAttribute("title", "Drag to choose a year range; double-click to clear");
  tl.range = h("span");
  add(br, tl.brush, tl.range);
  fb.appendChild(br);
  tl.scroller = h("div", "ch-tl"); tl.scroller.tabIndex = 0;
  tl.inner = h("div", "ch-tlin");
  tl.empty = h("div", "ch-empty"); tl.empty.style.padding = "40px 20px"; tl.empty.style.textAlign = "center";
  add(tl.scroller, tl.inner);
  add(wrap, fb, tl.empty, tl.scroller);

  tl.imp.addEventListener("input", function () { tl.f.minImp = +tl.imp.value; tl.impLabel.textContent = IMP_LABEL[tl.f.minImp]; tlSetRows(); });
  tl.tagSel.addEventListener("change", function () { tl.f.tag = tl.tagSel.value; tlSetRows(); });
  tl.polSel.addEventListener("change", function () { tl.f.polity = tl.polSel.value; tlSetRows(); });
  rb.addEventListener("click", function () { resetFilters(); });
  tl.scroller.addEventListener("scroll", tlSchedule);
  tl.scroller.addEventListener("click", function (ev) {
    var t = ev.target.getAttribute && ev.target.getAttribute("data-ch-tag");
    if (t) { tl.f.tag = t; tl.tagSel.value = t; tlSetRows(); tl.scroller.scrollTop = 0; }
  });
  var lastW = 0;
  function onResize() {
    var wd = tl.scroller.clientWidth;
    if (wd !== lastW) { lastW = wd; tl.measured = {}; if (tl.rows.length) tlSetRows(); }
    else tlSchedule();
  }
  if (window.ResizeObserver) new window.ResizeObserver(onResize).observe(tl.scroller);
  else window.addEventListener("resize", onResize);

  var drag = null;
  function yearAt(ev) {
    var r = tl.brush.getBoundingClientRect(), sp = timeSpan();
    var fr = Math.max(0, Math.min(1, (ev.clientX - r.left) / Math.max(1, r.width)));
    return Math.round(sp[0] + fr * (sp[1] - sp[0]));
  }
  tl.brush.addEventListener("pointerdown", function (ev) {
    drag = yearAt(ev);
    call(function () { tl.brush.setPointerCapture(ev.pointerId); });
  });
  tl.brush.addEventListener("pointermove", function (ev) {
    if (drag == null) return;
    var y = yearAt(ev);
    tl.f.from = Math.min(drag, y); tl.f.to = Math.max(drag, y);
    tlBrushDraw();
  });
  tl.brush.addEventListener("pointerup", function () {
    if (drag == null) return;
    var sp = timeSpan();
    drag = null;
    if (tl.f.from == null || (tl.f.to - tl.f.from) < (sp[1] - sp[0]) / 200) { tl.f.from = tl.f.to = null; }
    tlBrushDraw(); tlSetRows();
  });
  tl.brush.addEventListener("dblclick", function () { tl.f.from = tl.f.to = null; tlBrushDraw(); tlSetRows(); });
  tlRefreshOptions();
  tlBrushDraw();
  tlSetRows();
}
function tlUpdate() {
  var tl = S.tl;
  if (!tl) return;
  if (tl.optKey !== Object.keys(S.ix.tags).length + ":" + Object.keys(S.world.polities).length) tlRefreshOptions();
  tlBrushDraw();
  var sc = tl.scroller, top = sc.scrollTop;
  tlSetRows();
  sc.scrollTop = top;
}

/* ---------- page building blocks ---------- */
function section(page, title) {
  var s = h("section", "ch-sec");
  s.appendChild(h("h2", "ch-h2", title));
  page.appendChild(s);
  return s;
}
function empty(text) { return h("p", "ch-empty", text); }
function stat(label, value) {
  var d = h("div", "ch-stat");
  d.appendChild(h("b", null, label));
  if (value && value.nodeType) d.appendChild(value); else d.appendChild(document.createTextNode(String(value)));
  return d;
}
function bars(obj, keys) {
  var g = h("div", "ch-bars");
  keys.forEach(function (k) {
    if (!obj || obj[k] == null) return;
    var b = h("div", "ch-barx"), i = h("i");
    i.style.width = pct(obj[k]) + "%";
    b.appendChild(i);
    b.title = pct(obj[k]) + "%";
    add(g, h("span", null, cap(k)), b);
  });
  return g;
}
function eventList(evs, host, limit) {
  limit = limit || PAGE_STEP;
  var box = h("div", "ch-evlist"), more = h("div", "ch-more"), shown = 0;
  function step() {
    var to = Math.min(evs.length, shown + limit);
    for (; shown < to; shown++) box.appendChild(entryNode(evs[shown]));
    clear(more);
    if (shown < evs.length) {
      var b = h("button", "ch-btn", "Show " + Math.min(limit, evs.length - shown) + " more (" + (evs.length - shown) + " remaining)");
      b.type = "button";
      b.addEventListener("click", step);
      more.appendChild(b);
    }
  }
  host = host || h("div");
  if (!evs.length) { host.appendChild(empty("Nothing has been recorded.")); return host; }
  step();
  add(host, box, more);
  return host;
}
function sorted(evs) { return evs.slice().sort(function (a, b) { return a.year - b.year || a.id - b.id; }); }
function sparkline(pts, x0, x1) {
  var W = 480, H = 90, pad = 4, ymax = 1;
  pts.forEach(function (p) { if (p.v > ymax) ymax = p.v; });
  var sx = function (y) { return pad + (y - x0) / Math.max(1, x1 - x0) * (W - 2 * pad); };
  var sy = function (v) { return H - pad - v / ymax * (H - 2 * pad); };
  var d = "", i;
  for (i = 0; i < pts.length; i++) {
    var x = sx(pts[i].year).toFixed(1);
    if (i === 0) d += "M" + x + " " + sy(0).toFixed(1) + " L" + x + " " + sy(pts[i].v).toFixed(1);
    else d += " L" + x + " " + sy(pts[i - 1].v).toFixed(1) + " L" + x + " " + sy(pts[i].v).toFixed(1);
  }
  var last = pts[pts.length - 1];
  var line = d, area = d + " L" + sx(last.year).toFixed(1) + " " + sy(0).toFixed(1) + " Z";
  var s = svg("svg", { "class": "ch-spark", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Territory size over time, peaking at " + ymax + " regions" });
  s.appendChild(svg("path", { d: area, fill: "currentColor", "fill-opacity": "0.18" }));
  s.appendChild(svg("path", { d: line, fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linejoin": "round" }));
  var t = svg("title", {}); t.textContent = "Peak: " + plural(ymax, "region"); s.appendChild(t);
  return s;
}
function missing(kind, id) {
  var pg = h("div", "ch-page");
  add(pg, h("div", "ch-kicker", KIND_LABEL[kind] || kind), h("h1", "ch-h1", "Not in the record"),
    empty("No " + kind + " with the identifier “" + id + "” is known to this chronicle (yet)."));
  return pg;
}
function header(kind, title, sub, color) {
  var box = h("header");
  box.appendChild(h("div", "ch-kicker", kind));
  var t = h("h1", "ch-h1");
  if (color) { var sw = h("span", "ch-swatch"); sw.style.background = safeColor(color); t.appendChild(sw); }
  t.appendChild(document.createTextNode(title || "(unnamed)"));
  box.appendChild(t);
  if (sub) { var s = h("p", "ch-sub"); if (sub.nodeType) s.appendChild(sub); else s.textContent = sub; box.appendChild(s); }
  return box;
}
function lifespan(a, b, now, aliveWord, endWord) {
  if (b == null) return "founded " + yr(a) + ", " + aliveWord + " — " + plural(Math.max(0, now - a), "year") + " and counting";
  return "founded " + yr(a) + ", " + endWord + " " + yr(b) + " — " + plural(Math.max(0, b - a), "year");
}

/* ---------- entity pages ---------- */
function pagePolity(id) {
  var w = S.world, p = w.polities[id], d = derived();
  if (!p) return missing("polity", id);
  var pg = h("div", "ch-page ch-wide"), arch = archetype(p.archetypeId);
  var sub = (arch ? arch.name : (p.archetypeId || "Polity")) + (p.adjective ? " · " + p.adjective : "") + " — " + lifespan(p.founded, p.ended, w.year, "still standing", "fell");
  pg.appendChild(header("Polity", p.name, sub, p.color));
  if (arch && arch.blurb) pg.appendChild(h("p", "ch-sub", arch.blurb));
  if (p.fate) pg.appendChild(h("blockquote", "ch-fate", p.fate));
  else if (p.ended == null) pg.appendChild(h("p", "ch-fate", "Its story is not yet finished."));
  var st = h("div", "ch-stats");
  add(st, stat("Capital", p.capital != null && w.regions[p.capital] ? link("region", p.capital) : "none"),
    stat("Regions held", plural((p.regions || []).length, "region")), stat("Peak size", plural(peakSize(id), "region")),
    stat("Population", (p.population || 0).toLocaleString()), stat("Technology", pct(p.tech) + "%"),
    stat("Wealth", Math.round(p.wealth || 0).toLocaleString()), stat("Military", Math.round((p.military || 0) * 100) / 100),
    stat("Prestige", Math.round((p.prestige || 0) * 100) / 100));
  pg.appendChild(st);
  var s = section(pg, "Character");
  s.appendChild(bars(p.traits, ["aggression", "piety", "curiosity", "stability", "cunning"]));

  s = section(pg, "Territory over time");
  var pts = territory(id), sp = timeSpan();
  if (pts.length < 2) s.appendChild(empty("No territorial history could be reconstructed for this polity."));
  else {
    s.appendChild(sparkline(pts, Math.min(p.founded, pts[0].year), Math.max(polityEnd(p), pts[pts.length - 1].year)));
    var ax = h("div", "ch-axis");
    add(ax, h("span", null, yr(Math.min(p.founded, pts[0].year))), h("span", null, "peak " + plural(peakSize(id), "region")), h("span", null, yr(polityEnd(p))));
    s.appendChild(ax);
  }

  s = section(pg, "Rulers");
  var rl = (p.rulers || []).slice();
  if (p.ruler != null && rl.indexOf(p.ruler) < 0) rl.push(p.ruler);
  if (!rl.length) s.appendChild(empty("No rulers are recorded."));
  else {
    var tb = h("table", "ch-table"), hd = h("tr");
    ["#", "Ruler", "Title", "Lived", "Deeds"].forEach(function (c) { hd.appendChild(h("th", null, c)); });
    tb.appendChild(hd);
    rl.forEach(function (fid, i) {
      var f = w.figures[fid], tr = h("tr");
      if (!f) { add(tr, h("td", null, i + 1), h("td", null, "(lost)"), h("td"), h("td"), h("td")); }
      else {
        var td = h("td"); td.appendChild(link("figure", fid, f.name));
        add(tr, h("td", null, i + 1), td, h("td", null, f.title || f.role || ""),
          h("td", null, yr(f.born) + " – " + (f.died != null ? yr(f.died) : "living")), h("td", null, (f.deeds || []).length));
      }
      tb.appendChild(tr);
    });
    s.appendChild(tb);
  }

  s = section(pg, "Wars");
  var wars = d.wars.filter(function (x) { return x.a === id || x.b === id; });
  if (!wars.length) s.appendChild(empty("No wars involving " + p.name + " have been recorded."));
  else {
    var ul = h("ul", "ch-ul");
    wars.forEach(function (x) {
      var li = h("li"), foe = x.a === id ? x.b : x.a;
      add(li, "War with ", ent("polity", foe) ? link("polity", foe) : "an unknown power", ", " + yr(x.start) + (x.end !== x.start ? " – " + yr(x.end) : "") +
        " (" + plural(x.events.length, "engagement") + "): " + x.outcome + ". ");
      var first = h("a", "ch-link", "read the first entry");
      first.href = "#"; first.setAttribute("data-ch-kind", "event"); first.setAttribute("data-ch-id", String(x.events[0].id));
      li.appendChild(first);
      ul.appendChild(li);
    });
    s.appendChild(ul);
  }

  s = section(pg, "Lands");
  var held = {}, cur = {};
  (p.regions || []).forEach(function (r) { cur[r] = 1; held[r] = 1; });
  for (var rid in d.own) d.own[rid].forEach(function (seg) { if (seg.owner === id) held[rid] = 1; });
  var hk = Object.keys(held).map(Number);
  if (!hk.length) s.appendChild(empty("This polity never held a recorded region."));
  else {
    var cp = h("p");
    cp.appendChild(document.createTextNode("Held now: "));
    var nowL = hk.filter(function (r) { return cur[r]; });
    if (!nowL.length) cp.appendChild(document.createTextNode("nothing."));
    nowL.forEach(function (r, i) { if (i) cp.appendChild(document.createTextNode(", ")); cp.appendChild(link("region", r)); });
    s.appendChild(cp);
    var former = hk.filter(function (r) { return !cur[r]; });
    if (former.length) {
      var fp = h("p");
      fp.appendChild(document.createTextNode("Held formerly: "));
      former.forEach(function (r, i) { if (i) fp.appendChild(document.createTextNode(", ")); fp.appendChild(link("region", r)); });
      s.appendChild(fp);
    }
  }
  var rel = [];
  for (var oid in (p.relations || {})) if (Math.abs(p.relations[oid]) >= 0.5 && w.polities[oid]) rel.push([oid, p.relations[oid]]);
  if (rel.length) {
    s = section(pg, "Relations");
    var rul = h("ul", "ch-ul");
    rel.sort(function (a, b) { return a[1] - b[1]; }).forEach(function (r) {
      var li = h("li"); add(li, link("polity", +r[0]), " — " + (r[1] < 0 ? "hostile" : "friendly") + " (" + (Math.round(r[1] * 100) / 100) + ")");
      rul.appendChild(li);
    });
    s.appendChild(rul);
  }

  s = section(pg, "In the chronicle");
  var evs = sorted(eventsOf("polity", id));
  s.appendChild(h("p", "ch-sub", plural(evs.length, "entry", "entries")));
  eventList(evs, s);
  return pg;
}

function pageFigure(id) {
  var w = S.world, f = w.figures[id];
  if (!f) return missing("figure", id);
  var pg = h("div", "ch-page"), pol = w.polities[f.polityId];
  var sub = h("span");
  sub.appendChild(document.createTextNode([f.title, f.role].filter(Boolean).join(", ") + (pol ? " of " : "")));
  if (pol) sub.appendChild(link("polity", pol.id));
  pg.appendChild(header("Figure", f.name, sub, pol ? pol.color : null));
  var st = h("div", "ch-stats");
  add(st, stat("Born", yr(f.born)), stat("Died", f.died != null ? yr(f.died) : "still living"),
    stat(f.died != null ? "Lifespan" : "Age", plural(Math.max(0, (f.died != null ? f.died : w.year) - f.born), "year")));
  pg.appendChild(st);
  if (f.epitaph) pg.appendChild(h("blockquote", "ch-epitaph", f.epitaph));
  else if (f.died == null) pg.appendChild(h("p", "ch-sub", "Still living; no epitaph has been written."));
  var s = section(pg, "Temperament");
  s.appendChild(bars(f.traits, ["ambition", "wisdom", "cruelty", "charisma"]));
  s = section(pg, "Succession");
  var rl = pol ? (pol.rulers || []) : [], i = rl.indexOf(f.id);
  if (i < 0) s.appendChild(empty("Not recorded as a ruler" + (pol ? " of " + pol.name : "") + "."));
  else {
    var ul = h("ul", "ch-ul"), li;
    li = h("li"); add(li, "Preceded by: ", i > 0 && w.figures[rl[i - 1]] ? link("figure", rl[i - 1]) : "no one — the first ruler on record"); ul.appendChild(li);
    li = h("li"); add(li, "Followed by: ", i < rl.length - 1 && w.figures[rl[i + 1]] ? link("figure", rl[i + 1]) : (f.died == null ? "no one yet" : "no recorded successor")); ul.appendChild(li);
    s.appendChild(ul);
  }
  s = section(pg, "Deeds");
  var seen = {}, evs = [];
  (f.deeds || []).forEach(function (eid) { var e = S.ix.byEv[eid]; if (e && !seen[e.id]) { seen[e.id] = 1; evs.push(e); } });
  eventsOf("figure", id).forEach(function (e) { if (!seen[e.id]) { seen[e.id] = 1; evs.push(e); } });
  evs = sorted(evs);
  eventList(evs, s);
  return pg;
}

var VERBS = [[/destroy|shatter|ruin|lost|vanish|dissolv|consum|annihil/, "Destroyed"], [/steal|stole|theft|plunder|loot|seiz|captur/, "Taken"],
  [/forge|creat|craft|built|raise|wrought|compos|found|commission|written|authored/, "Made"], [/carri|mov|transport|brought|bore|taken|exile|relocat|gift|bequeath|sold|trad/, "Moved"],
  [/wield|used|invok|read|activat|unleash|channel|swore|crown/, "Used"], [/rediscover|found again|recover|unearth|retriev/, "Recovered"]];
function verbOf(e) {
  var s = (e.tags || []).join(" ") + " " + e.text;
  s = s.toLowerCase();
  for (var i = 0; i < VERBS.length; i++) if (VERBS[i][0].test(s)) return VERBS[i][1];
  return "Mentioned";
}
function pageArtifact(id) {
  var w = S.world, a = w.artifacts[id], d = derived();
  if (!a) return missing("artifact", id);
  var pg = h("div", "ch-page"), cr = w.figures[a.creatorId] || w.polities[a.creatorId];
  pg.appendChild(header("Artifact" + (a.kind ? " · " + a.kind : ""), a.name, a.destroyed ? "Destroyed" + (typeof a.destroyed === "number" ? " in " + yr(a.destroyed) : "") : "Extant"));
  var st = h("div", "ch-stats");
  add(st, stat("Created", yr(a.created)), stat("Maker", cr ? link(w.figures[a.creatorId] ? "figure" : "polity", a.creatorId) : "unknown"),
    stat("Power", pct(a.power) + "%"), stat("Last known place", a.location != null && w.regions[a.location] ? link("region", a.location) : "unknown"),
    stat("Regions visited", d.travel[id] || 0));
  pg.appendChild(st);
  if (a.legend) pg.appendChild(h("blockquote", "ch-epitaph", a.legend));
  var s = section(pg, "Provenance");
  var evs = sorted(eventsOf("artifact", id));
  if (!evs.length) s.appendChild(empty("No event in the chronicle mentions this object. Its history, if any, is unwritten."));
  else {
    var ol = h("ol", "ch-chain");
    var hasMade = evs.some(function (e) { return verbOf(e) === "Made"; });
    if (!hasMade && a.created != null) {
      var l0 = h("li");
      var mp = h("p", "ch-txt", a.name + " came into being" + (cr ? " at the hands of " : "."));
      add(l0, h("div", "ch-verb", "Made · " + yr(a.created)), mp);
      if (cr) { mp.appendChild(link(w.figures[a.creatorId] ? "figure" : "polity", a.creatorId)); mp.appendChild(document.createTextNode(".")); }
      ol.appendChild(l0);
    }
    evs.forEach(function (e) {
      var li = h("li"), p = h("p", "ch-txt");
      p.appendChild(linkified(e.text, e));
      var vb = h("div", "ch-verb");
      vb.appendChild(document.createTextNode(verbOf(e) + " · "));
      vb.appendChild(link("event", e.id, yr(e.year)));
      add(li, vb, p);
      ol.appendChild(li);
    });
    s.appendChild(ol);
    if (a.destroyed) s.appendChild(h("p", "ch-sub", "Here the chain ends: " + a.name + " is no more."));
  }
  return pg;
}

function pageRegion(id) {
  var w = S.world, r = w.regions[id], d = derived();
  if (!r) return missing("region", id);
  var pg = h("div", "ch-page ch-wide"), own = r.owner != null ? w.polities[r.owner] : null;
  var sub = h("span");
  sub.appendChild(document.createTextNode(biomeName(r.biome) + (r.barren ? " (barren)" : "") + " · "));
  if (own) { sub.appendChild(document.createTextNode("held by ")); sub.appendChild(link("polity", own.id)); } else sub.appendChild(document.createTextNode("unclaimed"));
  pg.appendChild(header("Region", regionLabel(r), sub, own ? own.color : null));
  var st = h("div", "ch-stats");
  add(st, stat("Grid position", r.x + ", " + r.y), stat("Population", (r.population || 0).toLocaleString()), stat("Habitability", pct(r.habitability) + "%"),
    stat("Elevation", pct(r.elevation) + "%"), stat("Temperature", pct(r.temperature) + "%"), stat("Moisture", pct(r.moisture) + "%"));
  pg.appendChild(st);
  if (r.resources) { var rs = section(pg, "Resources"); rs.appendChild(bars(r.resources, ["food", "metal", "exotic"])); }

  var s = section(pg, "Who held it");
  var segs = d.own[id] || [], sp = timeSpan(), x0 = sp[0], x1 = Math.max(sp[1], w.year);
  if (!segs.length) s.appendChild(empty("No polity is recorded as ever holding this region."));
  else {
    var band = h("div", "ch-strata"), legend = h("div", "ch-legend"), legSeen = {};
    var bounds = [{ year: x0, owner: null }].concat(segs);
    bounds.forEach(function (sg, i) {
      var to = i + 1 < bounds.length ? bounds[i + 1].year : x1, wd = (to - sg.year) / (x1 - x0) * 100;
      if (wd <= 0 && i > 0) return;
      var cell = h("div", sg.owner == null ? "ch-gap" : "");
      cell.style.width = Math.max(wd, 0.15) + "%"; cell.style.flex = "0 0 auto";
      var pol = sg.owner != null ? w.polities[sg.owner] : null;
      if (pol) {
        cell.style.background = safeColor(pol.color);
        if (!legSeen[pol.id]) {
          legSeen[pol.id] = 1;
          var lg = h("span"); var sw = h("span", "ch-swatch"); sw.style.background = safeColor(pol.color);
          add(lg, sw, link("polity", pol.id)); legend.appendChild(lg);
        }
      }
      cell.title = (pol ? pol.name : "Unclaimed") + ": " + yr(sg.year) + " – " + yr(to);
      band.appendChild(cell);
    });
    s.appendChild(band);
    var ax = h("div", "ch-axis"); ax.style.maxWidth = "none";
    add(ax, h("span", null, yr(x0)), h("span", null, yr(x1)));
    add(s, ax, legend);
    var tb = h("table", "ch-table"), hd = h("tr");
    ["From", "Holder"].forEach(function (c) { hd.appendChild(h("th", null, c)); });
    tb.appendChild(hd);
    segs.forEach(function (sg) {
      var tr = h("tr"), td = h("td");
      if (sg.owner != null && w.polities[sg.owner]) td.appendChild(link("polity", sg.owner)); else td.appendChild(document.createTextNode("unclaimed"));
      add(tr, h("td", null, yr(sg.year)), td); tb.appendChild(tr);
    });
    s.appendChild(tb);
    s.appendChild(h("p", "ch-sub", "Reconstructed from conquest, founding and collapse entries in the chronicle."));
  }
  s = section(pg, "Settlement");
  if (!r.settlement) s.appendChild(empty("No settlement stands here."));
  else s.appendChild(h("p", null, r.settlement.name + " — a " + (TIER[r.settlement.tier] || "settlement") + ", founded " + yr(r.settlement.founded) + "."));
  s = section(pg, "Features");
  if (!r.features || !r.features.length) s.appendChild(empty("Nothing remarkable marks this place."));
  else { var ch = h("div", "ch-chips"); r.features.forEach(function (f) { ch.appendChild(h("span", "ch-chip", f)); }); s.appendChild(ch); }
  if (r.neighbors && r.neighbors.length) {
    s = section(pg, "Neighbours");
    var np = h("p");
    r.neighbors.forEach(function (n, i) { if (!w.regions[n]) return; if (i) np.appendChild(document.createTextNode(", ")); np.appendChild(link("region", n)); });
    s.appendChild(np);
  }
  var arts = objVals(w.artifacts).filter(function (a) { return a.location === id && !a.destroyed; });
  if (arts.length) {
    s = section(pg, "Artifacts kept here");
    var au = h("ul", "ch-ul");
    arts.forEach(function (a) { var li = h("li"); li.appendChild(link("artifact", a.id)); au.appendChild(li); });
    s.appendChild(au);
  }
  s = section(pg, "What happened here");
  eventList(sorted(eventsOfRegion(id)), s);
  return pg;
}

function pageEvent(id) {
  var e = S.ix.byEv[id];
  if (!e) return missing("event", id);
  var w = S.world, pg = h("div", "ch-page");
  var era = eraOf(e.year);
  pg.appendChild(header("Chronicle entry · importance " + (e.importance || 1) + " of 5", yr(e.year), (era ? era.name : "") + (e.type ? " · " + e.type : "")));
  var q = h("blockquote", "ch-fate");
  q.appendChild(linkified(e.text, e));
  pg.appendChild(q);
  if (e.tags && e.tags.length) { var ch = h("div", "ch-chips"); e.tags.forEach(function (t) { ch.appendChild(h("span", "ch-chip", t)); }); pg.appendChild(ch); }
  var s = section(pg, "Named in this entry");
  var ul = h("ul", "ch-ul");
  (e.actors || []).forEach(function (a) { var li = h("li"); add(li, h("span", "ch-lead", (KIND_LABEL[a.kind] || a.kind) + ": "), ent(a.kind, a.id) ? link(a.kind, a.id) : "(unknown)"); ul.appendChild(li); });
  if (e.regionId != null && w.regions[e.regionId]) { var lr = h("li"); add(lr, h("span", "ch-lead", "Place: "), link("region", e.regionId)); ul.appendChild(lr); }
  if (ul.childNodes.length) s.appendChild(ul); else s.appendChild(empty("No actors are attached to this entry."));
  var tools = h("div", "ch-tools"), b = h("button", "ch-btn", "Show in the timeline"); b.type = "button";
  b.addEventListener("click", function () { go({ v: "timeline" }); tlScrollToEvent(e.id); });
  tools.appendChild(b); pg.appendChild(tools);
  s = section(pg, "Around the same time");
  var all = w.chronicle, idx = all.indexOf(e), near = [];
  for (var i = Math.max(0, idx - 4); i < Math.min(all.length, idx + 5); i++) if (i !== idx) near.push(all[i]);
  eventList(near, s);
  return pg;
}

/* ---------- Atlas / index ---------- */
function polityLine(p) {
  var arch = archetype(p.archetypeId), n = (p.regions || []).length;
  var s = (arch ? arch.name : "Polity") + ", " + yr(p.founded) + " – " + (p.ended != null ? yr(p.ended) : "present") +
    " (" + plural(Math.max(0, polityEnd(p) - p.founded), "year") + "), " + (p.ended != null ? "peak " + plural(peakSize(p.id), "region") : plural(n, "region"));
  if (p.ended != null && p.fate) s += ". " + trunc(p.fate, 110);
  return s;
}
function atlasRows(tab) {
  var w = S.world, q = S.atlas.q.toLowerCase(), rows = [], st = S.atlas;
  if (tab === "polity") {
    rows = objVals(w.polities).filter(function (p) { return st.state === "all" || (st.state === "living") === (p.ended == null); });
    var key = { longevity: function (p) { return -(polityEnd(p) - p.founded); }, size: function (p) { return -(p.ended == null ? Math.max((p.regions || []).length, peakSize(p.id)) : peakSize(p.id)); },
      era: function (p) { return p.founded; }, name: function (p) { return p.name; } }[st.sort] || function (p) { return p.founded; };
    rows.sort(function (a, b) { var x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; });
    return rows.filter(function (p) { return !q || String(p.name).toLowerCase().indexOf(q) >= 0; }).map(function (p) {
      return { kind: "polity", id: p.id, name: p.name, color: p.color, line: polityLine(p), dead: p.ended != null };
    });
  }
  if (tab === "figure") {
    return objVals(w.figures).sort(function (a, b) { return a.born - b.born; }).filter(function (f) { return !q || String(f.name).toLowerCase().indexOf(q) >= 0; }).map(function (f) {
      var pol = w.polities[f.polityId];
      return { kind: "figure", id: f.id, name: f.name, color: pol && pol.color, line: [f.title || f.role, pol ? pol.name : null, yr(f.born) + " – " + (f.died != null ? yr(f.died) : "living")].filter(Boolean).join(", ") };
    });
  }
  if (tab === "artifact") {
    return objVals(w.artifacts).sort(function (a, b) { return a.created - b.created; }).filter(function (a) { return !q || String(a.name).toLowerCase().indexOf(q) >= 0; }).map(function (a) {
      return { kind: "artifact", id: a.id, name: a.name, line: (a.kind || "artifact") + ", made " + yr(a.created) + ", " + (a.destroyed ? "destroyed" : "last seen at " + regionLabel(w.regions[a.location])) + ", " + plural(derived().travel[a.id] || 0, "region") + " visited" };
    });
  }
  return w.regions.filter(function (r) { return r.settlement && (!q || String(r.settlement.name).toLowerCase().indexOf(q) >= 0); })
    .sort(function (a, b) { return b.settlement.tier - a.settlement.tier || (a.settlement.name < b.settlement.name ? -1 : 1); }).map(function (r) {
      var o = r.owner != null ? w.polities[r.owner] : null;
      return { kind: "region", id: r.id, name: r.settlement.name, color: o && o.color, line: "A " + (TIER[r.settlement.tier] || "settlement") + " in " + regionLabel(r) + (o ? ", held by " + o.name : "") + ", founded " + yr(r.settlement.founded) };
    });
}
function pageAtlas() {
  var st = S.atlas, pg = h("div", "ch-page ch-wide");
  pg.appendChild(header("Atlas", "Index of the World", "Every power, person, relic and place the chronicle has named."));
  var tabs = h("div", "ch-tabs"), tools = h("div", "ch-filters"), list = h("div"), more = h("div", "ch-more");
  tools.style.padding = "8px 0"; tools.style.background = "transparent"; tools.style.border = "0";
  var names = { polity: "Polities", figure: "Figures", artifact: "Artifacts", settlement: "Settlements" };
  Object.keys(names).forEach(function (k) {
    var b = h("button", "ch-btn" + (st.tab === k ? " ch-on" : ""), names[k]); b.type = "button";
    b.addEventListener("click", function () { st.tab = k; st.limit = PAGE_STEP; render(); });
    tabs.appendChild(b);
  });
  var q = h("input", "ch-input"); q.type = "search"; q.placeholder = "Filter this list…"; q.value = st.q; q.setAttribute("aria-label", "Filter this list");
  q.addEventListener("input", function () { st.q = q.value; st.limit = PAGE_STEP; fill(); });
  tools.appendChild(q);
  if (st.tab === "polity") {
    var so = h("select", "ch-input"), sf = h("select", "ch-input");
    [["longevity", "longest-lived first"], ["size", "largest first"], ["era", "oldest first"], ["name", "by name"]].forEach(function (o) { var e = h("option", null, o[1]); e.value = o[0]; so.appendChild(e); });
    [["all", "living and dead"], ["living", "living only"], ["dead", "fallen only"]].forEach(function (o) { var e = h("option", null, o[1]); e.value = o[0]; sf.appendChild(e); });
    so.value = st.sort; sf.value = st.state;
    so.setAttribute("aria-label", "Sort"); sf.setAttribute("aria-label", "Show");
    so.addEventListener("change", function () { st.sort = so.value; fill(); });
    sf.addEventListener("change", function () { st.state = sf.value; fill(); });
    add(tools, so, sf);
  }
  function fill() {
    var rows = atlasRows(st.tab);
    clear(list); clear(more);
    if (!rows.length) {
      var msgs = { polity: "No polities match.", figure: "No figures have risen yet.", artifact: "No artifacts have been made yet.", settlement: "No settlements have been founded yet." };
      list.appendChild(empty(S.atlas.q ? "Nothing matches that filter." : msgs[st.tab]));
      return;
    }
    rows.slice(0, st.limit).forEach(function (r) {
      var row = h("div", "ch-row2");
      if (r.color) { var sw = h("span", "ch-swatch"); sw.style.background = safeColor(r.color); row.appendChild(sw); }
      var body = h("div"), nm = link(r.kind, r.id, r.name);
      if (r.dead) nm.appendChild(document.createTextNode(" †"));
      add(body, nm, h("div", "ch-line", r.line));
      row.appendChild(body); list.appendChild(row);
    });
    if (rows.length > st.limit) {
      var b = h("button", "ch-btn", "Show more (" + (rows.length - st.limit) + " remaining)"); b.type = "button";
      b.addEventListener("click", function () { st.limit += PAGE_STEP; fill(); });
      more.appendChild(b);
    }
    list.insertBefore(h("p", "ch-sub", plural(rows.length, "entry", "entries")), list.firstChild);
  }
  add(pg, tabs, tools, list, more);
  fill();
  S.live = fill;
  return pg;
}

/* ---------- Search ---------- */
function runSearch(q) {
  var w = S.world, toks = q.toLowerCase().split(/\s+/).filter(Boolean), groups = [];
  function match(name) {
    var l = String(name || "").toLowerCase();
    for (var i = 0; i < toks.length; i++) if (l.indexOf(toks[i]) < 0) return -1;
    return l.indexOf(toks[0]) === 0 ? 0 : 1;
  }
  function collect(label, items) {
    items = items.filter(function (x) { return x.s >= 0; }).sort(function (a, b) { return a.s - b.s || (a.title < b.title ? -1 : 1); });
    if (items.length) groups.push({ label: label, items: items });
  }
  collect("Polities", objVals(w.polities).map(function (p) { return { s: match(p.name), kind: "polity", id: p.id, title: p.name, sub: polityLine(p) }; }));
  collect("Figures", objVals(w.figures).map(function (f) { return { s: match(f.name), kind: "figure", id: f.id, title: f.name, sub: [f.title, (w.polities[f.polityId] || {}).name].filter(Boolean).join(", ") }; }));
  collect("Artifacts", objVals(w.artifacts).map(function (a) { return { s: match(a.name), kind: "artifact", id: a.id, title: a.name, sub: (a.kind || "") + ", made " + yr(a.created) }; }));
  collect("Regions", w.regions.map(function (r) { return { s: r.name ? match(r.name) : -1, kind: "region", id: r.id, title: r.name, sub: biomeName(r.biome) }; }));
  collect("Settlements", w.regions.map(function (r) { return { s: r.settlement ? match(r.settlement.name) : -1, kind: "region", id: r.id, title: r.settlement && r.settlement.name, sub: "in " + regionLabel(r) }; }));
  var ev = [], total = 0;
  for (var i = 0; i < w.chronicle.length; i++) {
    var e = w.chronicle[i], low = S.ix.low[e.id], ok = true;
    for (var j = 0; j < toks.length; j++) if (low.indexOf(toks[j]) < 0) { ok = false; break; }
    if (ok) { total++; if (ev.length < 40) ev.push({ s: 0, kind: "event", id: e.id, title: yr(e.year), sub: e.text, hl: toks[0] }); }
  }
  if (ev.length) groups.push({ label: "Chronicle text", items: ev, total: total });
  return groups;
}
function highlighted(text, tok) {
  var frag = document.createDocumentFragment(), i = tok ? text.toLowerCase().indexOf(tok) : -1;
  if (i < 0) { frag.appendChild(document.createTextNode(text)); return frag; }
  frag.appendChild(document.createTextNode(text.slice(0, i)));
  frag.appendChild(h("mark", null, text.slice(i, i + tok.length)));
  frag.appendChild(document.createTextNode(text.slice(i + tok.length)));
  return frag;
}
function pageSearch(q) {
  var pg = h("div", "ch-page");
  pg.appendChild(header("Search", q ? "“" + q + "”" : "Search the chronicle", "Names and chronicle text. Use the arrow keys and Enter."));
  S.resItems = []; S.sel = -1;
  if (!q.trim()) { pg.appendChild(empty("Type in the box above to search polities, figures, artifacts, places and every line of history.")); return pg; }
  var groups = runSearch(q);
  if (!groups.length) { pg.appendChild(empty("Nothing in the record matches “" + q + "”.")); return pg; }
  groups.forEach(function (g) {
    var s = section(pg, g.label + " (" + (g.total || g.items.length) + ")");
    g.items.slice(0, 40).forEach(function (it) {
      var a = h("a", "ch-res");
      a.href = "#"; a.setAttribute("data-ch-kind", it.kind); a.setAttribute("data-ch-id", String(it.id));
      var t = h("span"); t.appendChild(highlighted(String(it.title || ""), q.toLowerCase().split(/\s+/)[0]));
      var sm = h("small"); sm.appendChild(it.hl ? highlighted(trunc(it.sub, 220), it.hl) : document.createTextNode(it.sub || ""));
      add(a, t, sm);
      S.resItems.push(a); s.appendChild(a);
    });
    if (g.total && g.total > 40) s.appendChild(h("p", "ch-sub", (g.total - 40) + " further matches not shown; narrow the query."));
  });
  setSel(0);
  return pg;
}
function setSel(i) {
  var items = S.resItems || [];
  if (!items.length) return;
  i = (i + items.length) % items.length;
  if (items[S.sel]) items[S.sel].classList.remove("ch-sel");
  S.sel = i;
  items[i].classList.add("ch-sel");
  if (items[i].scrollIntoView) items[i].scrollIntoView({ block: "nearest" });
}

/* ---------- The Story So Far ---------- */
var LOWER_START = /^(The|A|An|In|On|At|After|Before|When|By|With|During|Then|Under|From|Of|For|As|While|Within|Across|Beyond)\b/;
function keyEvents(evs) {
  for (var t = 5; t >= 1; t--) { var pick = evs.filter(function (e) { return (e.importance || 1) >= t; }); if (pick.length >= 3 || t === 1) return pick; }
  return [];
}
function thin(arr, max) {
  if (arr.length <= max) return arr;
  var out = [];
  for (var i = 0; i < max; i++) out.push(arr[Math.floor(i * arr.length / max)]);
  return out;
}
function storyParagraph(evs, from) {
  var p = h("p"), prev = null;
  evs.forEach(function (e, i) {
    var lead, gap = prev ? e.year - prev.year : 0;
    if (!prev) lead = "In " + yr(e.year) + ", ";
    else if (gap <= 10) lead = "Soon afterwards, ";
    else if (gap <= 300) lead = plural(gap, "year") + " later, ";
    else lead = "In " + yr(e.year) + ", ";
    var text = String(e.text || ""), shown = LOWER_START.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
    var l = link("event", e.id, lead.replace(/,\s$/, ""));
    l.className += " ch-lead";
    p.appendChild(l);
    p.appendChild(document.createTextNode(", "));
    if (shown !== text) { var tmp = linkified(text, e); p.appendChild(lowerFirst(tmp)); } else p.appendChild(linkified(text, e));
    p.appendChild(document.createTextNode(" "));
    prev = e;
  });
  return p;
}
function lowerFirst(frag) {
  var n = frag.firstChild;
  if (n && n.nodeType === 3) n.nodeValue = n.nodeValue.charAt(0).toLowerCase() + n.nodeValue.slice(1);
  return frag;
}
function pageStory() {
  var w = S.world, d = derived(), pg = h("div", "ch-page ch-story"), evs = w.chronicle;
  var sp = timeSpan();
  pg.appendChild(header("A chronicle in brief", "The Story So Far", evs.length ? yr(sp[0]) + " to " + yr(w.year != null ? w.year : sp[1]) : null));
  if (!evs.length) {
    pg.appendChild(empty("History has not begun. Let the simulation run and the story will be written here."));
    return pg;
  }
  var pols = objVals(w.polities), fallen = pols.filter(function (p) { return p.ended != null; }).length;
  var lede = h("p", "ch-lede", "Across " + plural(Math.max(1, (w.year != null ? w.year : sp[1]) - sp[0]), "year") + ", the chronicle has set down " + plural(evs.length, "entry", "entries") + ". " +
    plural(pols.length, "polity", "polities") + " have risen, " + fallen + " of them fallen; " + plural(Object.keys(w.figures).length, "figure") + " and " + plural(Object.keys(w.artifacts).length, "artifact") + " have been named. What follows is only the part that mattered.");
  pg.appendChild(lede);
  var key = keyEvents(evs), el = eras(), groups = [];
  if (el.length) el.forEach(function (e, i) { groups.push({ name: e.name, from: e.from, to: i + 1 < el.length ? el[i + 1].from : Infinity }); });
  else groups.push({ name: "The Record", from: -Infinity, to: Infinity });
  groups.forEach(function (g) {
    var inEra = key.filter(function (e) { return e.year >= g.from && e.year < g.to; });
    if (!inEra.length) return;
    var all = evs.filter(function (e) { return e.year >= g.from && e.year < g.to; });
    pg.appendChild(h("h2", "ch-h2", g.name));
    var intro = h("p");
    intro.appendChild(document.createTextNode(plural(all.length, "entry", "entries") + " belong to this age, of which " + inEra.length + (inEra.length === 1 ? " stands" : " stand") + " out. "));
    pg.appendChild(intro);
    pg.appendChild(storyParagraph(thin(inEra, el.length ? 5 : 12), g.from));
  });
  var recs = h("h2", "ch-h2", "Records and superlatives");
  pg.appendChild(recs);
  var best = null;
  pols.forEach(function (p) { if (!best || polityEnd(p) - p.founded > polityEnd(best) - best.founded) best = p; });
  if (best) {
    var p1 = h("p");
    add(p1, "The longest-lived power was ", link("polity", best.id), ", which endured " + plural(polityEnd(best) - best.founded, "year") + " from " + yr(best.founded) +
      (best.ended != null ? " until its fall in " + yr(best.ended) + (best.fate ? ": " + best.fate : ".") : " and stands still."));
    pg.appendChild(p1);
  }
  var wr = null;
  d.wars.forEach(function (x) { if (!wr || x.score > wr.score) wr = x; });
  var p2 = h("p");
  if (wr && ent("polity", wr.a) && ent("polity", wr.b)) {
    add(p2, "The bloodiest war was that between ", link("polity", wr.a), " and ", link("polity", wr.b), ", fought from " + yr(wr.start) + " to " + yr(wr.end) + " across " + plural(wr.events.length, "recorded engagement") + "; it " + wr.outcome + ".");
  } else p2.textContent = "No war between powers has yet been recorded.";
  pg.appendChild(p2);
  var art = null;
  objVals(w.artifacts).forEach(function (a) { if (!art || (d.travel[a.id] || 0) > (d.travel[art.id] || 0)) art = a; });
  var p3 = h("p");
  if (art) add(p3, "The most-travelled artifact is ", link("artifact", art.id), ", which passed through " + plural(d.travel[art.id] || 0, "region") + (art.destroyed ? " before it was destroyed." : " and survives."));
  else p3.textContent = "No artifact has yet been made worth recording.";
  pg.appendChild(p3);
  var big = null;
  pols.forEach(function (p) { if (!big || peakSize(p.id) > peakSize(big.id)) big = p; });
  if (big && peakSize(big.id) > 1) { var p4 = h("p"); add(p4, "At its height ", link("polity", big.id), " held " + plural(peakSize(big.id), "region") + ", the greatest extent any realm achieved."); pg.appendChild(p4); }

  var tools = h("div", "ch-tools"), b1 = h("button", "ch-btn", "Read the full chronicle"), b2 = h("button", "ch-btn", "Browse the atlas"), b3 = h("button", "ch-btn", "Copy this story");
  [b1, b2, b3].forEach(function (b) { b.type = "button"; tools.appendChild(b); });
  b1.addEventListener("click", function () { go({ v: "timeline" }); });
  b2.addEventListener("click", function () { go({ v: "atlas" }); });
  b3.addEventListener("click", function () {
    var out = [];
    for (var n = pg.firstChild; n; n = n.nextSibling) if (n !== tools && n.textContent) out.push(n.textContent);
    var text = out.join("\n\n"), ok = false;
    call(function () { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text); ok = true; } });
    if (!ok) call(function () {
      var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); document.body.removeChild(ta);
    });
    b3.textContent = ok ? "Copied" : "Copy failed";
    setTimeout(function () { b3.textContent = "Copy this story"; }, 1800);
  });
  pg.appendChild(tools);
  return pg;
}

/* ---------- Graph: who is bound to whom ----------
 * Entities named in the same chronicle entry are tied by a thread; rulers are tied to their realm
 * and makers to their artifacts. Shown events become nodes of their own and carry their actors'
 * threads. Force layout, drawn on a canvas in the page's ink colours. */
var G_KINDS = [["polity", "Polities"], ["figure", "Figures"], ["artifact", "Artifacts"], ["region", "Places"], ["event", "Events"]];
var G_CAPS = [50, 100, 150, 250, 400];
var G_EVENT_CAP = 300;
var G_SHARE = { polity: 2, figure: 2, artifact: 1, region: 1 };
var G_BASE = { polity: 5, figure: 2.5, artifact: 3.5, region: 3, event: 2.5 };

function gKey(kind, id) { return kind + ":" + id; }
function gSplit(k) {
  var i = k.indexOf(":"), raw = k.slice(i + 1);
  return { kind: k.slice(0, i), id: isNaN(+raw) ? raw : +raw };
}
function gHash(s) {
  var x = 2166136261;
  for (var i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return ((x >>> 0) % 10007) / 10007;
}
function gActorKeys(e) {
  var out = [], seen = {};
  function put(kind, id) {
    if (id == null) return;
    var k = gKey(kind === "settlement" ? "region" : kind, id);
    if (!seen[k]) { seen[k] = 1; out.push(k); }
  }
  (e.actors || []).forEach(function (a) { put(a.kind, a.id); });
  if (e.regionId != null) put("region", e.regionId);
  return out;
}
function gMentions() {
  var c = S.gm;
  if (c && c.n === S.ix.n && c.world === S.world) return c.m;
  var m = {};
  S.world.chronicle.forEach(function (e) { gActorKeys(e).forEach(function (k) { m[k] = (m[k] || 0) + 1; }); });
  S.gm = { n: S.ix.n, world: S.world, m: m };
  return m;
}
function gTies(fn) {
  var w = S.world;
  objVals(w.figures).forEach(function (f) { if (f.polityId != null && w.polities[f.polityId]) fn(gKey("figure", f.id), gKey("polity", f.polityId)); });
  objVals(w.artifacts).forEach(function (a) { if (a.creatorId != null && w.figures[a.creatorId]) fn(gKey("artifact", a.id), gKey("figure", a.creatorId)); });
}
function gSig(focus) {
  var gs = S.gs;
  return JSON.stringify([gs.on, gs.n, gs.imp, gs.depth, focus ? gKey(focus.kind, focus.id) : null, S.ix.n, S.world.year]);
}

function gBuild(focus, old) {
  var w = S.world, gs = S.gs, on = gs.on, m = gMentions();
  var fk = focus ? gKey(focus.kind, focus.id) : null, pick, dist = {};
  function okKind(k) { var kd = k.slice(0, k.indexOf(":")); return k === fk || (kd !== "event" && !!on[kd]); }
  if (fk) {
    var adj = {};
    var join = function (a, b) { (adj[a] = adj[a] || {})[b] = 1; (adj[b] = adj[b] || {})[a] = 1; };
    w.chronicle.forEach(function (e) {
      var ks = gActorKeys(e).filter(okKind), i, j;
      if (fk === gKey("event", e.id)) ks.forEach(function (k) { join(fk, k); });
      for (i = 0; i < ks.length; i++) for (j = i + 1; j < ks.length; j++) join(ks[i], ks[j]);
    });
    gTies(function (a, b) { if (okKind(a) && okKind(b)) join(a, b); });
    dist[fk] = 0;
    var fr = [fk];
    for (var d = 1; d <= gs.depth && fr.length; d++) {
      var nx = [];
      fr.forEach(function (k) { for (var n in adj[k] || {}) if (dist[n] == null) { dist[n] = d; nx.push(n); } });
      fr = nx;
    }
    pick = Object.keys(dist).sort(function (a, b) { return dist[a] - dist[b] || (m[b] || 0) - (m[a] || 0) || (a < b ? -1 : 1); });
    pick = pick.filter(function (k) { var s = gSplit(k); return !!ent(s.kind, s.id); }).slice(0, gs.n);
  } else {
    /* realms are named far more often than anyone else, so each kind gets its share of the
       places in turn (G_SHARE per round), most-named first, instead of one ranking for all */
    var lists = {};
    Object.keys(m).filter(okKind).forEach(function (k) {
      var s = gSplit(k);
      if (ent(s.kind, s.id)) (lists[s.kind] = lists[s.kind] || []).push(k);
    });
    Object.keys(lists).forEach(function (kd) { lists[kd].sort(function (a, b) { return m[b] - m[a] || (a < b ? -1 : 1); }); });
    pick = [];
    var at = {}, left = true;
    while (pick.length < gs.n && left) {
      left = false;
      G_KINDS.forEach(function (kd) {
        var l = lists[kd[0]];
        for (var i = 0; l && i < (G_SHARE[kd[0]] || 1) && pick.length < gs.n; i++) {
          var j = at[kd[0]] || 0;
          if (j >= l.length) break;
          pick.push(l[j]); at[kd[0]] = j + 1; left = true;
        }
      });
    }
  }
  var sel = {};
  pick.forEach(function (k) { sel[k] = 1; });
  if (on.event) {
    var cand = w.chronicle.filter(function (e) {
      if ((e.importance || 1) < gs.imp) return false;
      var ks = gActorKeys(e);
      for (var i = 0; i < ks.length; i++) if (sel[ks[i]]) return true;
      return false;
    });
    cand.sort(function (a, b) { return (b.importance || 1) - (a.importance || 1) || a.year - b.year; });
    cand.slice(0, G_EVENT_CAP).forEach(function (e) { var k = gKey("event", e.id); if (!sel[k]) { sel[k] = 1; pick.push(k); } });
  }

  var byKey = {}, prev = old ? old.byKey : {};
  var nodes = pick.map(function (k) {
    var s = gSplit(k), e = ent(s.kind, s.id), men = s.kind === "event" ? (e.importance || 1) * 4 : (m[k] || 0);
    var n = {
      key: k, kind: s.kind, id: s.id, mentions: m[k] || 0, nb: [],
      label: s.kind === "event" ? yr(e.year) + ": " + trunc(e.text, 40) : entName(s.kind, s.id),
      color: s.kind === "polity" ? safeColor(e.color) : null, dead: s.kind === "polity" && e.ended != null,
      r: G_BASE[s.kind] + Math.min(s.kind === "polity" ? 13 : 7, Math.sqrt(men) * 0.55),
      x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null, placed: false
    };
    var p = prev[k];
    if (p) { n.x = p.x; n.y = p.y; n.vx = p.vx; n.vy = p.vy; n.placed = true; }
    byKey[k] = n;
    return n;
  });

  var lk = {};
  function tie(a, b, kind) {
    if (a === b || !byKey[a] || !byKey[b]) return;
    var k = a < b ? a + "|" + b : b + "|" + a, l = lk[k];
    if (!l) l = lk[k] = { s: byKey[a], t: byKey[b], w: 0, tie: false, war: false };
    l.w++;
    if (kind === "tie") l.tie = true;
  }
  w.chronicle.forEach(function (e) {
    var ek = gKey("event", e.id), ks = gActorKeys(e).filter(function (k) { return !!byKey[k]; }), i, j;
    if (byKey[ek]) { ks.forEach(function (k) { tie(ek, k); }); return; }
    for (i = 0; i < ks.length; i++) for (j = i + 1; j < ks.length; j++) tie(ks[i], ks[j]);
  });
  gTies(function (a, b) { tie(a, b, "tie"); });
  derived().wars.forEach(function (x) {
    var a = gKey("polity", x.a), b = gKey("polity", x.b), l = lk[a < b ? a + "|" + b : b + "|" + a];
    if (l) l.war = true;
  });
  var links = objVals(lk);
  links.forEach(function (l) { l.s.nb.push(l.t); l.t.nb.push(l.s); });
  links.forEach(function (l) {
    var ds = l.s.nb.length, dt = l.t.nb.length;
    l.bias = ds / (ds + dt);
    l.str = 1 / Math.min(ds, dt);
    l.len = 26 + l.s.r + l.t.r;
  });

  /* new nodes start beside a neighbour that already has a place, else on a sunflower spiral */
  var fresh = 0;
  nodes.forEach(function (n, i) {
    if (n.placed) return;
    var anchor = null;
    for (var j = 0; j < n.nb.length; j++) if (n.nb[j].placed) { anchor = n.nb[j]; break; }
    var a = gHash(n.key) * 6.2832;
    if (anchor) { n.x = anchor.x + Math.cos(a) * 20; n.y = anchor.y + Math.sin(a) * 20; }
    else { var rr = 12 * Math.sqrt(0.5 + i), t = i * 2.39996; n.x = rr * Math.cos(t); n.y = rr * Math.sin(t); }
    n.placed = true; fresh++;
  });

  var g = {
    nodes: nodes, links: links, byKey: byKey, focus: fk ? byKey[fk] : null,
    alpha: fresh > nodes.length / 3 ? 1 : 0.35, target: 0,
    view: old ? old.view : { x: 0, y: 0, k: 1, auto: true }, hover: null
  };
  if (g.alpha === 1) { g.view.auto = true; for (var t = 0; t < 40; t++) gTick(g); }
  return g;
}

function gTick(g) {
  var ns = g.nodes, n = ns.length, a = g.alpha, i, j;
  for (i = 0; i < n; i++) {
    var p = ns[i], cp = 1 + p.r / 5;
    for (j = i + 1; j < n; j++) {
      var q = ns[j], dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
      if (d2 > 250000) continue;
      if (d2 < 1) { dx = gHash(p.key + q.key) - 0.5; dy = 0.5 - gHash(q.key + p.key); d2 = 1; }
      var f = 40 * a / d2, fq = f * cp, fp = f * (1 + q.r / 5);
      p.vx -= dx * fp; p.vy -= dy * fp;
      q.vx += dx * fq; q.vy += dy * fq;
    }
  }
  g.links.forEach(function (l) {
    var s = l.s, t = l.t, dx = t.x + t.vx - s.x - s.vx, dy = t.y + t.vy - s.y - s.vy, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var k = (d - l.len) / d * a * l.str;
    dx *= k; dy *= k;
    t.vx -= dx * l.bias; t.vy -= dy * l.bias;
    s.vx += dx * (1 - l.bias); s.vy += dy * (1 - l.bias);
  });
  for (i = 0; i < n; i++) {
    var o = ns[i];
    o.vx -= o.x * 0.04 * a; o.vy -= o.y * 0.04 * a;
    if (o.fx != null) { o.x = o.fx; o.y = o.fy; o.vx = o.vy = 0; continue; }
    o.vx *= 0.6; o.vy *= 0.6;
    o.x += o.vx; o.y += o.vy;
  }
  g.alpha += (g.target - g.alpha) * 0.0228;
}

function gColors() {
  var cs = getComputedStyle(S.root);
  function v(name, dflt) { var x = cs.getPropertyValue(name).trim(); return x || dflt; }
  return {
    ink: v("--ch-ink", "#2a2621"), mute: v("--ch-mute", "#766d61"), accent: v("--ch-accent", "#8a3b1e"),
    bg: v("--ch-bg", "#f6f2e8"), red: v("--pp-ribbon", v("--ch-i5", "#7a1f12")), serif: v("--ch-serif", "Georgia, serif")
  };
}
/* one glyph per kind: a wax seal for a realm, an ink dot for a person, a red lozenge for a relic,
   a ruled square for a place, a red star for an entry */
function gGlyph(c, kind, x, y, r, col, fill, dead) {
  c.beginPath();
  if (kind === "polity") {
    c.arc(x, y, r, 0, 6.2832);
    c.globalAlpha *= dead ? 0.45 : 1; c.fillStyle = fill || col.mute; c.fill(); c.globalAlpha /= dead ? 0.45 : 1;
    c.lineWidth = 1.5; c.strokeStyle = col.ink; c.stroke();
  } else if (kind === "figure") {
    c.arc(x, y, r, 0, 6.2832); c.fillStyle = col.ink; c.fill();
  } else if (kind === "artifact") {
    c.moveTo(x, y - r * 1.25); c.lineTo(x + r, y); c.lineTo(x, y + r * 1.25); c.lineTo(x - r, y); c.closePath();
    c.fillStyle = col.accent; c.fill(); c.lineWidth = 1; c.strokeStyle = col.ink; c.stroke();
  } else if (kind === "region") {
    c.rect(x - r, y - r, r * 2, r * 2); c.fillStyle = col.bg; c.fill(); c.lineWidth = 1.5; c.strokeStyle = col.mute; c.stroke();
  } else {
    var q = r * 0.38;
    c.moveTo(x, y - r * 1.3); c.lineTo(x + q, y - q); c.lineTo(x + r * 1.3, y); c.lineTo(x + q, y + q);
    c.lineTo(x, y + r * 1.3); c.lineTo(x - q, y + q); c.lineTo(x - r * 1.3, y); c.lineTo(x - q, y - q); c.closePath();
    c.fillStyle = col.red; c.fill();
  }
}
function gGlyphCanvas(kind) {
  var dpr = window.devicePixelRatio || 1, cv = h("canvas"), sz = 14;
  cv.width = sz * dpr; cv.height = sz * dpr; cv.style.width = cv.style.height = sz + "px";
  var c = cv.getContext("2d");
  c.scale(dpr, dpr);
  gGlyph(c, kind, sz / 2, sz / 2, kind === "polity" ? 5 : 4, gColors(), "#b0352a", false);
  return cv;
}

function gScreen(g, n) {
  var u = S.gUI, v = g.view;
  return { x: (n.x - v.x) * v.k + u.w / 2, y: (n.y - v.y) * v.k + u.h / 2 };
}
function gFit(g, ease) {
  var u = S.gUI, ns = g.nodes;
  if (!ns.length || !u.w) return;
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  ns.forEach(function (n) { x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r); x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r); });
  var k = Math.max(0.08, Math.min(2.5, Math.min((u.w - 60) / Math.max(1, x1 - x0), (u.h - 60) / Math.max(1, y1 - y0))));
  var v = g.view, e = ease || 1;
  v.x += ((x0 + x1) / 2 - v.x) * e; v.y += ((y0 + y1) / 2 - v.y) * e; v.k += (k - v.k) * e;
}
function gHit(g, x, y) {
  var best = null, bd = Infinity, v = g.view;
  g.nodes.forEach(function (n) {
    var p = gScreen(g, n), dx = p.x - x, dy = p.y - y, d = dx * dx + dy * dy, rr = Math.max(6, n.r * v.k + 3);
    if (d < rr * rr && d < bd) { bd = d; best = n; }
  });
  return best;
}

function gDraw() {
  var g = S.g, u = S.gUI;
  if (!g || !u || !u.w) return;
  var c = u.ctx, col = gColors(), v = g.view, hv = g.hover, lit = null;
  c.setTransform(u.dpr, 0, 0, u.dpr, 0, 0);
  c.clearRect(0, 0, u.w, u.h);
  if (hv) { lit = {}; lit[hv.key] = 1; hv.nb.forEach(function (n) { lit[n.key] = 1; }); }
  var pos = {};
  g.nodes.forEach(function (n) { pos[n.key] = gScreen(g, n); });

  /* threads: batched by style; the hovered node's threads are drawn last, in full ink */
  var buckets = [[], [], [], []], hot = [];
  g.links.forEach(function (l) {
    if (hv && (l.s === hv || l.t === hv)) { hot.push(l); return; }
    buckets[(l.war ? 2 : 0) + (l.w >= 3 ? 1 : 0)].push(l);
  });
  c.lineCap = "round";
  buckets.forEach(function (b, i) {
    if (!b.length) return;
    c.beginPath();
    b.forEach(function (l) { var a = pos[l.s.key], z = pos[l.t.key]; c.moveTo(a.x, a.y); c.lineTo(z.x, z.y); });
    c.strokeStyle = i >= 2 ? col.red : col.ink;
    c.lineWidth = i % 2 ? 1.6 : 0.8;
    c.globalAlpha = (hv ? 0.25 : 1) * (i >= 2 ? 0.3 : 0.22);
    c.stroke();
  });
  c.globalAlpha = 0.9;
  hot.forEach(function (l) {
    var a = pos[l.s.key], z = pos[l.t.key];
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(z.x, z.y);
    c.strokeStyle = l.war ? col.red : col.ink; c.lineWidth = l.w >= 3 ? 2 : 1.2; c.stroke();
  });

  var k = Math.max(0.55, Math.min(1.6, Math.sqrt(v.k)));
  g.nodes.forEach(function (n) {
    var p = pos[n.key];
    if (p.x < -30 || p.y < -30 || p.x > u.w + 30 || p.y > u.h + 30) return;
    c.globalAlpha = lit && !lit[n.key] ? 0.25 : 1;
    gGlyph(c, n.kind, p.x, p.y, n.r * k, col, n.color, n.dead);
    if (n === g.focus || n === hv) {
      c.beginPath(); c.arc(p.x, p.y, n.r * k + 4, 0, 6.2832);
      c.lineWidth = 1.5; c.strokeStyle = col.red; c.globalAlpha = 1; c.stroke();
    }
  });

  /* labels: greedy, most important first, skipping any that would overlap one already set */
  var order = g.nodes.filter(function (n) {
    if (lit) return lit[n.key];
    return n === g.focus || n.r * k * v.k >= (n.kind === "polity" ? 9 : 6);
  });
  order.sort(function (a, b) {
    function rank(n) { return n === hv ? 3 : n === g.focus ? 2 : n.kind === "polity" ? 1 : 0; }
    return rank(b) - rank(a) || b.r - a.r;
  });
  var boxes = [], set = 0, most = Math.max(20, Math.round(u.w * u.h / 12000));
  c.textBaseline = "middle"; c.lineJoin = "round";
  for (var i = 0; i < order.length && set < most; i++) {
    var n = order[i], p = pos[n.key], big = n.kind === "polity";
    c.font = (big ? "" : "italic ") + (n === hv ? 14 : big ? 13 : n.kind === "event" ? 11 : 12) + "px " + col.serif;
    var tw = c.measureText(n.label).width, x = p.x - tw / 2, y = p.y + n.r * k + 10;
    var bx = { x0: x - 2, y0: y - 8, x1: x + tw + 2, y1: y + 8 };
    if (n !== hv && boxes.some(function (o) { return bx.x0 < o.x1 && bx.x1 > o.x0 && bx.y0 < o.y1 && bx.y1 > o.y0; })) continue;
    boxes.push(bx); set++;
    c.globalAlpha = 1;
    c.lineWidth = 3.5; c.strokeStyle = col.bg; c.strokeText(n.label, x, y);
    c.fillStyle = big ? col.accent : n.kind === "event" ? col.mute : col.ink;
    c.fillText(n.label, x, y);
  }
  c.globalAlpha = 1;
}

function gStatus() {
  var g = S.g, u = S.gUI;
  if (!g || !u) return;
  clear(u.status);
  var n = g.hover;
  if (!n) {
    if (!g.nodes.length) { u.status.appendChild(document.createTextNode("Nothing to draw yet: no one of this kind has been named in the chronicle.")); return; }
    u.status.appendChild(document.createTextNode(plural(g.nodes.length, "name") + ", " + plural(g.links.length, "thread") +
      ". Red threads are wars. Scroll to zoom, drag to move, click a name to open it, double-click to refit."));
    return;
  }
  var b = h("b", null, n.label);
  b.style.color = n.kind === "polity" ? "var(--ch-accent)" : "var(--ch-ink)";
  b.style.fontWeight = "600";
  var bits = [KIND_LABEL[n.kind] || n.kind];
  if (n.kind === "polity") { var p = ent("polity", n.id); if (p) bits.push(yr(p.founded) + " – " + (p.ended != null ? yr(p.ended) : "present")); }
  if (n.kind === "figure") { var f = ent("figure", n.id); if (f) bits.push(f.title || f.role); }
  if (n.kind !== "event") bits.push(plural(n.mentions, "mention"));
  bits.push(plural(n.nb.length, "thread"));
  add(u.status, b, " · " + bits.join(" · "));
}

function gRun() {
  if (S.gRaf) return;
  S.gRaf = requestAnimationFrame(gFrame);
}
function gFrame() {
  S.gRaf = 0;
  var g = S.g, en = curEntry();
  if (!g || !en || en.v !== "graph") return;
  var live = g.alpha > 0.004 || g.target > 0;
  if (live) {
    gTick(g);
    if (g.view.auto) gFit(g, 0.12);
  }
  gDraw();
  if (live) S.gRaf = requestAnimationFrame(gFrame);
}
function gResize() {
  var u = S.gUI, r = u.view.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (!r.width || !r.height) return;
  if (r.width === u.w && r.height === u.h && dpr === u.dpr) return;
  u.w = r.width; u.h = r.height; u.dpr = dpr;
  u.cv.width = Math.round(r.width * dpr); u.cv.height = Math.round(r.height * dpr);
  if (S.g && S.g.view.auto) gFit(S.g);
  gDraw();
}

function gBuildUI() {
  var u = S.gUI = { el: S.gWrap, ctrl: h("div", "ch-filters"), view: h("div", "ch-gview"), cv: h("canvas"), status: h("div", "ch-gstatus"), w: 0, h: 0, dpr: 1 };
  u.ctx = u.cv.getContext("2d");
  u.cv.setAttribute("role", "img");
  u.cv.setAttribute("aria-label", "Graph of the chronicle's polities, figures, artifacts and places");
  u.view.appendChild(u.cv);
  add(u.el, u.ctrl, u.view, u.status);

  var drag = null;
  function local(ev) { var r = u.cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function setHover(n) {
    var g = S.g;
    if (!g || g.hover === n) return;
    g.hover = n;
    u.cv.style.cursor = n ? "pointer" : "";
    gStatus(); gDraw();
  }
  u.cv.addEventListener("pointerdown", function (ev) {
    var g = S.g;
    if (!g || ev.button !== 0) return;
    var p = local(ev), n = gHit(g, p.x, p.y);
    drag = { n: n, x: p.x, y: p.y, vx: g.view.x, vy: g.view.y, moved: false };
    call(function () { u.cv.setPointerCapture(ev.pointerId); });
    if (n) { n.fx = n.x; n.fy = n.y; }
  });
  u.cv.addEventListener("pointermove", function (ev) {
    var g = S.g;
    if (!g) return;
    var p = local(ev);
    if (!drag) { setHover(gHit(g, p.x, p.y)); return; }
    var dx = p.x - drag.x, dy = p.y - drag.y;
    if (!drag.moved && dx * dx + dy * dy < 16) return;
    drag.moved = true;
    g.view.auto = false;
    if (drag.n) {
      drag.n.fx = (p.x - u.w / 2) / g.view.k + g.view.x;
      drag.n.fy = (p.y - u.h / 2) / g.view.k + g.view.y;
      g.target = 0.25; if (g.alpha < 0.25) g.alpha = 0.25;
      gRun();
    } else {
      u.cv.style.cursor = "grabbing";
      g.view.x = drag.vx - dx / g.view.k; g.view.y = drag.vy - dy / g.view.k;
      gDraw();
    }
  });
  function endDrag() {
    var g = S.g, d = drag;
    drag = null;
    u.cv.style.cursor = g && g.hover ? "pointer" : "";
    if (!g || !d) return;
    if (d.n) { d.n.fx = d.n.fy = null; g.target = 0; gRun(); }
    if (d.n && !d.moved) go({ v: "entity", kind: d.n.kind, id: d.n.id });
  }
  u.cv.addEventListener("pointerup", endDrag);
  u.cv.addEventListener("pointercancel", function () { if (drag && drag.n) drag.n.fx = drag.n.fy = null; drag = null; });
  u.cv.addEventListener("pointerleave", function () { if (!drag) setHover(null); });
  u.cv.addEventListener("wheel", function (ev) {
    var g = S.g;
    if (!g) return;
    ev.preventDefault();
    var p = local(ev), v = g.view, k = Math.max(0.05, Math.min(6, v.k * Math.exp(-ev.deltaY * 0.0015)));
    var wx = (p.x - u.w / 2) / v.k + v.x, wy = (p.y - u.h / 2) / v.k + v.y;
    v.k = k; v.x = wx - (p.x - u.w / 2) / k; v.y = wy - (p.y - u.h / 2) / k;
    v.auto = false;
    gDraw();
  }, { passive: false });
  u.cv.addEventListener("dblclick", function () { var g = S.g; if (g) { g.view.auto = true; gFit(g); gDraw(); } });
  if (window.ResizeObserver) new ResizeObserver(gResize).observe(u.view);
}

function gControls(en) {
  var u = S.gUI, gs = S.gs, row = u.ctrl;
  clear(row);
  var kinds = h("div", "ch-tabs");
  kinds.style.flexWrap = "wrap";
  G_KINDS.forEach(function (kd) {
    var b = h("button", "ch-btn ch-gk" + (gs.on[kd[0]] ? " ch-on" : ""));
    b.type = "button";
    b.setAttribute("aria-pressed", gs.on[kd[0]] ? "true" : "false");
    add(b, gGlyphCanvas(kd[0]), kd[1]);
    b.addEventListener("click", function () { gs.on[kd[0]] = !gs.on[kd[0]]; render(); });
    kinds.appendChild(b);
  });
  row.appendChild(kinds);

  var cap = h("select", "ch-input");
  G_CAPS.forEach(function (n) { var o = h("option", null, (en.focus ? "up to " : "the ") + n + (en.focus ? " names" : " most named")); o.value = n; cap.appendChild(o); });
  cap.value = String(gs.n);
  cap.setAttribute("aria-label", "How many names to show");
  cap.addEventListener("change", function () { gs.n = +cap.value; render(); });
  row.appendChild(cap);

  if (gs.on.event) {
    var imp = h("select", "ch-input");
    [5, 4, 3].forEach(function (i) { var o = h("option", null, "entries: " + IMP_LABEL[i]); o.value = i; imp.appendChild(o); });
    imp.value = String(gs.imp);
    imp.setAttribute("aria-label", "Which chronicle entries to show");
    imp.addEventListener("change", function () { gs.imp = +imp.value; render(); });
    row.appendChild(imp);
  }

  if (en.focus) {
    var f = h("label"), dep = h("select", "ch-input");
    [[1, "one thread out"], [2, "two threads out"]].forEach(function (d) { var o = h("option", null, d[1]); o.value = d[0]; dep.appendChild(o); });
    dep.value = String(gs.depth);
    dep.setAttribute("aria-label", "How far out from the centre");
    dep.addEventListener("change", function () { gs.depth = +dep.value; render(); });
    var all = h("button", "ch-btn", "whole world"); all.type = "button";
    all.addEventListener("click", function () { go({ v: "graph" }); });
    add(f, "around ", link(en.focus.kind, en.focus.id, trunc(entName(en.focus.kind, en.focus.id), 34)), dep, all);
    row.appendChild(f);
  }
}

function gShow(en) {
  var sig = gSig(en.focus);
  if (!S.g || S.g.sig !== sig) {
    var keep = S.g && S.g.focusSig === JSON.stringify(en.focus || null) ? S.g : null;
    S.g = gBuild(en.focus, keep);
    S.g.sig = sig;
    S.g.focusSig = JSON.stringify(en.focus || null);
  }
  gResize();
  gStatus();
  gDraw();
  gRun();
}
function gHost(on) {
  var host = S.root && S.root.parentNode;
  if (!host || !host.classList || host.classList.contains("ch-graphing") === on) return;
  host.classList.toggle("ch-graphing", on);
  call(function () { window.dispatchEvent(new Event("resize")); });
}

/* ---------- shell ---------- */
function render() {
  var en = curEntry();
  if (!en || !S.root) return;
  S.live = null;
  var tab = en.v === "entity" ? "" : en.v;
  Object.keys(S.tabs).forEach(function (k) { S.tabs[k].className = "ch-btn" + (k === tab ? " ch-on" : ""); });
  S.backBtn.disabled = S.pos <= 0;
  S.fwdBtn.disabled = S.pos >= S.nav.length - 1;
  gHost(en.v === "graph");
  S.gWrap.style.display = en.v === "graph" ? "flex" : "none";
  if (en.v === "graph") {
    S.pane.style.display = "none";
    S.tlWrap.style.display = "none";
    if (!S.gUI) gBuildUI();
    gControls(en);
    gShow(en);
    return;
  }
  if (en.v === "timeline") {
    S.pane.style.display = "none";
    S.tlWrap.style.display = "flex";
    if (!S.tl) { buildTimeline(); S.tlWrap.appendChild(S.tl.el); }
    else if (S.tl.dirty) { S.tl.dirty = false; tlUpdate(); }
    tlRender();
    return;
  }
  S.tlWrap.style.display = "none";
  S.pane.style.display = "";
  clear(S.pane);
  var pg;
  if (en.v === "story") pg = pageStory();
  else if (en.v === "atlas") pg = pageAtlas();
  else if (en.v === "search") pg = pageSearch(en.q || "");
  else if (en.kind === "polity") pg = pagePolity(en.id);
  else if (en.kind === "figure") pg = pageFigure(en.id);
  else if (en.kind === "artifact") pg = pageArtifact(en.id);
  else if (en.kind === "event") pg = pageEvent(en.id);
  else pg = pageRegion(en.id);
  if (en.v === "entity" && pg.firstChild && ent(en.kind, en.id)) {
    var gt = h("div", "ch-tools"), gb = h("button", "ch-btn", "Show its threads in the graph");
    gb.type = "button";
    gb.addEventListener("click", function () { go({ v: "graph", focus: { kind: en.kind, id: en.id } }); });
    gt.appendChild(gb);
    pg.insertBefore(gt, pg.firstChild.nextSibling);
  }
  S.pane.appendChild(pg);
  S.pane.scrollTop = en.scroll || 0;
}
function refresh() {
  S.timer = null;
  if (!S.root || !S.world) return;
  var en = curEntry();
  if (!en) return;
  if (S.tl) { if (en.v === "timeline") tlUpdate(); else S.tl.dirty = true; }
  if (en.v === "timeline") return;
  if (en.v === "graph") { gControls(en); gShow(en); return; }
  if (S.live && en.v === "atlas") { S.live(); return; }
  if (en.v === "search" && document.activeElement === S.searchEl) return;
  saveScroll();
  render();
}

function mount(container, world, hooks) {
  S.world = world; S.hooks = hooks || {}; S.ix = null; S.cache = null; S.tl = null; S.nav = []; S.pos = -1;
  S.gUI = null; S.g = null; S.gm = null;
  if (S.gRaf) { cancelAnimationFrame(S.gRaf); S.gRaf = 0; }
  if (S.timer) { clearTimeout(S.timer); S.timer = null; }
  indexEvents();
  injectStyle();
  clear(container);
  var root = S.root = h("div", "ch-root");
  root.setAttribute("role", "region"); root.setAttribute("aria-label", "Chronicle");
  var bar = S.bar = h("div", "ch-bar");
  S.backBtn = h("button", "ch-btn", "←"); S.fwdBtn = h("button", "ch-btn", "→");
  S.backBtn.type = S.fwdBtn.type = "button";
  S.backBtn.title = "Back (Alt+Left)"; S.fwdBtn.title = "Forward (Alt+Right)";
  S.backBtn.addEventListener("click", function () { stepNav(-1); });
  S.fwdBtn.addEventListener("click", function () { stepNav(1); });
  var tabs = h("div", "ch-tabs");
  [["story", "The Story"], ["timeline", "Timeline"], ["atlas", "Atlas"], ["graph", "Graph"]].forEach(function (t) {
    var b = h("button", "ch-btn", t[1]); b.type = "button";
    b.addEventListener("click", function () { go({ v: t[0] }); });
    S.tabs[t[0]] = b; tabs.appendChild(b);
  });
  var sb = S.tabs.search = h("button", "ch-btn", "Search"); sb.type = "button";
  sb.addEventListener("click", function () { S.searchEl.focus(); if (curEntry().v !== "search") go({ v: "search", q: S.searchEl.value }); });
  tabs.appendChild(sb);
  var si = S.searchEl = h("input", "ch-input ch-search"); si.type = "search"; si.placeholder = "Search names and text… ( / )";
  si.setAttribute("aria-label", "Search the chronicle");
  si.addEventListener("input", function () {
    var en = { v: "search", q: si.value };
    go(en, curEntry().v === "search");
  });
  si.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowDown") { ev.preventDefault(); setSel(S.sel + 1); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setSel(S.sel - 1); }
    else if (ev.key === "Enter") { var it = (S.resItems || [])[S.sel]; if (it && curEntry().v === "search") { ev.preventDefault(); it.click(); si.blur(); } }
    else if (ev.key === "Escape") { si.value = ""; si.blur(); if (curEntry().v === "search") stepNav(-1); }
  });
  add(bar, S.backBtn, S.fwdBtn, tabs, h("span", "ch-grow"), si);
  S.pane = h("div", "ch-pane"); S.tlWrap = h("div", "ch-tlwrap"); S.tlWrap.style.display = "none";
  S.gWrap = h("div", "ch-gwrap"); S.gWrap.style.display = "none";
  var main = h("div", "ch-main");
  add(main, S.pane, S.tlWrap, S.gWrap);
  add(root, bar, main);
  root.addEventListener("click", onRootClick);
  root.addEventListener("keydown", function (ev) {
    var tag = ev.target && ev.target.tagName;
    if (ev.altKey && ev.key === "ArrowLeft") { ev.preventDefault(); stepNav(-1); }
    else if (ev.altKey && ev.key === "ArrowRight") { ev.preventDefault(); stepNav(1); }
    else if (ev.key === "/" && tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") { ev.preventDefault(); si.focus(); }
  });
  container.appendChild(root);
  go({ v: "story" });
}

function update(world) {
  if (!S.root) return;
  if (world) S.world = world;
  indexEvents();
  if (!S.timer) S.timer = setTimeout(refresh, 400);
}

function show(kind, id) {
  if (!S.root || !S.world) return;
  if (kind === "settlement") kind = "region";
  if (kind === "timeline" || kind === "story" || kind === "atlas" || kind === "graph") { go({ v: kind }); return; }
  var num = +id;
  go({ v: "entity", kind: kind, id: isNaN(num) ? id : num });
}

AEON.chronicle = { mount: mount, update: update, show: show };
})();
