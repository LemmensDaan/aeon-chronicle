/* Aeon chronicle: pages.js. Page building blocks and the entity pages: polity, figure, artifact, region, event.
 * Part of the chronicle browser; see js/chronicle/base.js for how the parts fit together. */
(function () {
"use strict";
var AEON = window.AEON, C = AEON._chronicle;
var KIND_LABEL = C.KIND_LABEL, TIER = C.TIER, PAGE_STEP = C.PAGE_STEP, S = C.S, h = C.h, add = C.add,
  clear = C.clear, svg = C.svg, safeColor = C.safeColor, plural = C.plural, cap = C.cap, pct = C.pct,
  objVals = C.objVals, yr = C.yr, eraOf = C.eraOf, archetype = C.archetype, biomeName = C.biomeName,
  regionLabel = C.regionLabel, ent = C.ent, polityEnd = C.polityEnd, eventsOf = C.eventsOf,
  eventsOfRegion = C.eventsOfRegion, timeSpan = C.timeSpan, derived = C.derived, territory = C.territory,
  peakSize = C.peakSize, go = C.go, link = C.link, linkified = C.linkified, entryNode = C.entryNode,
  tlScrollToEvent = C.tlScrollToEvent;

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
  var pg = h("div", "ch-page ch-wide"), arch = archetype(p.archetypeId), form = AEON.typeAt(w, p, w.year);
  /* its form of state in the year shown, then its kind when that is a different word */
  var kind = arch ? arch.name : (p.archetypeId || "Polity");
  var sub = (form ? form.name + (form.name !== kind ? " · " + kind : "") : kind) + (p.adjective ? " · " + p.adjective : "") + " — " + lifespan(p.founded, p.ended, w.year, "still standing", "fell");
  pg.appendChild(header("Polity", p.name, sub, p.color));
  if (arch && arch.blurb) pg.appendChild(h("p", "ch-sub", arch.blurb));
  if (p.fate) pg.appendChild(h("blockquote", "ch-fate", p.fate));
  else if (p.ended == null) pg.appendChild(h("p", "ch-fate", "Its story is not yet finished."));
  var st = h("div", "ch-stats"), forces = AEON.forcesAt(p, w.year) || { army: p.army || 0, navy: p.navy || 0 };
  add(st, stat("Capital", p.capital != null && w.regions[p.capital] ? link("region", p.capital) : "none"),
    stat("Regions held", plural((p.regions || []).length, "region")), stat("Peak size", plural(peakSize(id), "region")),
    stat("Population", (p.population || 0).toLocaleString()), stat("Technology", pct(p.tech) + "%"),
    stat("Cities", (function () { var n = 0; (p.regions || []).forEach(function (rid) { var st = w.regions[rid].settlement; if (st && st.tier >= 3) n++; }); return n; })()),
    stat("Wealth", Math.round(p.wealth || 0).toLocaleString()),
    stat("Army", forces.army.toLocaleString() + (forces.army === 1 ? " soldier" : " soldiers")),
    stat("Fleet", forces.navy.toLocaleString() + (forces.navy === 1 ? " ship" : " ships")),
    stat("Prestige", Math.round((p.prestige || 0) * 100) / 100));
  var ages = (S.world.pack && S.world.pack.ages) || null;
  if (ages && p.ageLog && p.ageLog.length) st.appendChild(stat("Age", ages[p.age] ? ages[p.age].name : "unknown"));
  pg.appendChild(st);
  var s = section(pg, "Character");
  s.appendChild(bars(p.traits, ["aggression", "piety", "curiosity", "stability", "cunning"]));

  /* the ages it advanced through; the first is where it began, inherited from its land */
  if (ages && p.ageLog && p.ageLog.length) {
    s = section(pg, "Ages");
    var au = h("ul", "ch-ul");
    p.ageLog.forEach(function (e, i) {
      var a = ages[e.age];
      if (!a) return;
      var li = h("li");
      add(li, h("b", null, a.name), " — " + (i === 0 ? (e.inherited && e.age > 0 ? "inherited at its founding, " : "at its founding, ") : "reached in ") + yr(e.year));
      au.appendChild(li);
    });
    if (p.age + 1 < ages.length) {
      var nx = h("li", "ch-lead");
      nx.textContent = "Not yet reached: " + ages.slice(p.age + 1).map(function (a) { return a.name; }).join(", ") + ".";
      au.appendChild(nx);
    }
    s.appendChild(au);
  }

  /* the forms of state it took, from the realm types of its pack */
  if (p.typeLog && p.typeLog.length > 1) {
    s = section(pg, "Forms of state");
    var tu = h("ul", "ch-ul"), types = S.world.pack.realmTypes || [];
    p.typeLog.forEach(function (e, i) {
      var t = types.filter(function (x) { return x.id === e.type; })[0];
      if (!t || e.year > w.year) return;
      var li = h("li");
      add(li, h("b", null, t.name), " — " + (i === 0 ? "at its founding, " : "from ") + yr(e.year));
      tu.appendChild(li);
    });
    s.appendChild(tu);
  }

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
  /* how it stood with the others: the strong feelings and every treaty in force, each with the
     last things they remembered of each other (core.js diplomacy) */
  var rel = [], open = AEON.treatiesOf ? AEON.treatiesOf(w, p, w.year) : [], seen = {};
  for (var oid in (p.relations || {})) if (Math.abs(p.relations[oid]) >= 0.5 && w.polities[oid]) { rel.push([oid, p.relations[oid]]); seen[oid] = 1; }
  open.forEach(function (t) { var o = t.a === p.id ? t.b : t.a; if (!seen[o] && w.polities[o]) { rel.push([o, p.relations[o] || 0]); seen[o] = 1; } });
  if (rel.length) {
    s = section(pg, "Relations");
    var rul = h("ul", "ch-ul");
    var TIE = { war: "at war", truce: "in truce", alliance: "allied", marriage: "joined by marriage", trade: "trading" };
    rel.sort(function (a, b) { return a[1] - b[1]; }).forEach(function (r) {
      var o = w.polities[r[0]], ties = open.filter(function (t) { return t.a === r[0] || t.b === r[0]; }).map(function (t) {
        return t.kind === "tribute" ? (t.a === p.id ? "pays it tribute" : "takes tribute from it") : TIE[t.kind] || t.kind;
      });
      var mood = r[1] <= -0.5 ? "hostile" : r[1] >= 0.5 ? "friendly" : r[1] < -0.15 ? "cool" : r[1] > 0.15 ? "warm" : "indifferent";
      var li = h("li"); add(li, link("polity", r[0]), " — " + [mood + " (" + (Math.round(r[1] * 100) / 100) + ")"].concat(ties).join(", "));
      var mem = AEON.memoriesBetween ? AEON.memoriesBetween(w, p, o, w.year).filter(function (m) { return m.reason; }).slice(0, 3) : [];
      if (mem.length) li.appendChild(h("div", "ch-lead", mem.map(function (m) {
        return (m.from === p.id ? "they " : "it ") + m.reason + " (" + yr(m.year) + ")";
      }).join("; ")));
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

  /* sacks and ruins: who plundered or razed the place, and what stands there now */
  var sacks = AEON.sacksAt ? AEON.sacksAt(w, id, w.year) : [], ruin = AEON.ruinAt ? AEON.ruinAt(w, id, w.year) : null;
  if (sacks.length || ruin || (r.settlement && r.settlement.onRuins)) {
    var ss = section(pg, sacks.length > 1 ? "Sacked " + sacks.length + " times" : sacks.length ? "Sacked" : "Ruins");
    var su = h("ul", "ch-ul");
    sacks.forEach(function (e) {
      var li = h("li");
      add(li, h("b", null, e.kind === "razed" ? "Razed" : "Plundered"), " in " + yr(e.year));
      if (e.by != null && w.polities[e.by]) { li.appendChild(document.createTextNode(" by ")); li.appendChild(link("polity", e.by)); }
      su.appendChild(li);
    });
    if (ruin) su.appendChild(h("li", "ch-lead", "Its ruins" + (ruin.name ? ", once " + ruin.name + "," : "") + " have stood empty since " + yr(ruin.since) + "."));
    else if (r.settlement && r.settlement.onRuins && r.settlement.onRuins !== r.settlement.name) su.appendChild(h("li", "ch-lead", r.settlement.name + " was built on the ruins of " + r.settlement.onRuins + "."));
    ss.appendChild(su);
  }

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
  else {
    var seat = AEON.capitalOf ? AEON.capitalOf(w, id) : null, sp = h("p");
    add(sp, r.settlement.name + " — a " + (TIER[r.settlement.tier] || "settlement") + ", founded " + yr(r.settlement.founded));
    if (seat) add(sp, ", and the capital of ", link("polity", seat.id));
    add(sp, ".");
    s.appendChild(sp);
  }
  /* how it grew and shrank, from the engine's settlement log */
  var hist = AEON.settlementHistory ? AEON.settlementHistory(w, id) : [];
  if (hist.length > 1 || (hist.length === 1 && !r.settlement)) {
    var gu = h("ul", "ch-ul");
    var shown = null;
    hist.forEach(function (e, i) {
      var prev = i ? hist[i - 1][2] : 0, li = h("li"), name = e[2] ? TIER[e[2]] : "";
      if (i && name === shown) return;        /* a change of size that keeps its name */
      shown = name;
      var what = !e[2] ? "abandoned or destroyed" : !prev ? "founded as a " + name : e[2] > prev ? "grew into a " + name : "shrank to a " + name;
      add(li, h("span", "ch-lead", yr(e[0]) + ": "), what);
      gu.appendChild(li);
    });
    s.appendChild(gu);
  }
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

/* shared with the later parts */
C.section = section; C.empty = empty; C.header = header; C.pagePolity = pagePolity;
C.pageFigure = pageFigure; C.pageArtifact = pageArtifact; C.pageRegion = pageRegion;
C.pageEvent = pageEvent;
})();
