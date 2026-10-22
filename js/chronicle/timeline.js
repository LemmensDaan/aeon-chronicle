/* Aeon chronicle: timeline.js. Linkified prose and the virtualised timeline.
 * Part of the chronicle browser; see js/chronicle/base.js for how the parts fit together. */
(function () {
"use strict";
var AEON = window.AEON, C = AEON._chronicle;
var IMP_LABEL = C.IMP_LABEL, S = C.S, h = C.h, add = C.add, clear = C.clear, call = C.call,
  objVals = C.objVals, yr = C.yr, eras = C.eras, eraOf = C.eraOf, ent = C.ent, hasTag = C.hasTag,
  timeSpan = C.timeSpan, link = C.link;

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

/* shared with the later parts */
C.linkified = linkified; C.entryNode = entryNode; C.tlRender = tlRender;
C.tlScrollToEvent = tlScrollToEvent; C.buildTimeline = buildTimeline; C.tlUpdate = tlUpdate;
})();
