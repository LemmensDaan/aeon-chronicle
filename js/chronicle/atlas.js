/* Aeon chronicle: atlas.js. The atlas (index of the world) and search.
 * Part of the chronicle browser; see js/chronicle/base.js for how the parts fit together. */
(function () {
"use strict";
var AEON = window.AEON, C = AEON._chronicle;
var TIER = C.TIER, PAGE_STEP = C.PAGE_STEP, S = C.S, h = C.h, add = C.add, clear = C.clear,
  safeColor = C.safeColor, plural = C.plural, trunc = C.trunc, objVals = C.objVals, yr = C.yr,
  archetype = C.archetype, biomeName = C.biomeName, regionLabel = C.regionLabel, polityEnd = C.polityEnd,
  derived = C.derived, peakSize = C.peakSize, link = C.link, section = C.section, empty = C.empty,
  header = C.header;

/* ---------- Atlas / index ---------- */
function polityLine(p) {
  var arch = archetype(p.archetypeId), n = (p.regions || []).length, form = AEON.typeAt(S.world, p, S.world.year);
  var s = (form ? form.name : arch ? arch.name : "Polity") + ", " + yr(p.founded) + " – " + (p.ended != null ? yr(p.ended) : "present") +
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
  if (tab === "war") {
    /* every war in the record, newest first, without the wars allies and vassals joined */
    return (w.treaties || []).filter(function (t) { return t.kind === "war" && !t.leader; }).slice().reverse().map(function (t) {
      var a = w.polities[t.a], b = w.polities[t.b], nm = C.warName(t);
      return { kind: "war", id: t.id, name: nm, color: a && a.color,
        line: (a ? a.name : "?") + " against " + (b ? b.name : "?") + ", " + yr(t.startDate != null ? Math.floor(t.startDate) : t.start) +
          (t.years != null ? ", " + (t.years < 1 ? "a single season" : Math.round(t.years) + " years") : t.end == null ? ", still fought" : "") + (t.coalition ? ", a coalition's war" : "") };
    }).filter(function (r) { return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.line.toLowerCase().indexOf(q) >= 0; });
  }
  if (tab === "artifact") {
    return objVals(w.artifacts).sort(function (a, b) { return a.created - b.created; }).filter(function (a) { return !q || String(a.name).toLowerCase().indexOf(q) >= 0; }).map(function (a) {
      return { kind: "artifact", id: a.id, name: a.name, line: (a.kind || "artifact") + ", made " + yr(a.created) + ", " + (a.destroyed ? "destroyed" : "last seen at " + regionLabel(w.regions[a.location])) + ", " + plural(derived().travel[a.id] || 0, "region") + " visited" };
    });
  }
  return w.regions.filter(function (r) { return r.settlement && (!q || String(r.settlement.name).toLowerCase().indexOf(q) >= 0); })
    .sort(function (a, b) { return b.settlement.tier - a.settlement.tier || (a.settlement.name < b.settlement.name ? -1 : 1); }).map(function (r) {
      var o = r.owner != null ? w.polities[r.owner] : null;
      return { kind: "region", id: r.id, name: r.settlement.name, color: o && o.color, line: (o && o.capital === r.id && o.ended == null ? "The capital of " + o.name + ", a " + (TIER[r.settlement.tier] || "settlement") + " in " + regionLabel(r) : "A " + (TIER[r.settlement.tier] || "settlement") + " in " + regionLabel(r) + (o ? ", held by " + o.name : "")) + ", founded " + yr(r.settlement.founded) };
    });
}
function pageAtlas() {
  var st = S.atlas, pg = h("div", "ch-page ch-wide");
  pg.appendChild(header("Atlas", "Index of the World", "Every power, person, relic and place the chronicle has named."));
  var tabs = h("div", "ch-tabs"), tools = h("div", "ch-filters"), list = h("div"), more = h("div", "ch-more");
  tools.style.padding = "8px 0"; tools.style.background = "transparent"; tools.style.border = "0";
  var names = { polity: "Polities", war: "Wars", figure: "Figures", artifact: "Artifacts", settlement: "Settlements" };
  Object.keys(names).forEach(function (k) {
    var b = h("button", "ch-btn" + (st.tab === k ? " ch-on" : ""), names[k]); b.type = "button";
    b.addEventListener("click", function () { st.tab = k; st.limit = PAGE_STEP; C.render(); });
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
      var msgs = { polity: "No polities match.", war: "No wars have been fought yet.", figure: "No figures have risen yet.", artifact: "No artifacts have been made yet.", settlement: "No settlements have been founded yet." };
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
    if (ok) { total++; if (ev.length < 40) ev.push({ s: 0, kind: "event", id: e.id, title: C.when(e), sub: e.text, hl: toks[0] }); }
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

/* shared with the later parts */
C.pageAtlas = pageAtlas; C.pageSearch = pageSearch; C.setSel = setSel;
})();
