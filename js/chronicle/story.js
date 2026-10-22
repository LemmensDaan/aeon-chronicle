/* Aeon chronicle: story.js. The Story So Far.
 * Part of the chronicle browser; see js/chronicle/base.js for how the parts fit together. */
(function () {
"use strict";
var AEON = window.AEON, C = AEON._chronicle;
var S = C.S, h = C.h, add = C.add, plural = C.plural, call = C.call, objVals = C.objVals, yr = C.yr,
  eras = C.eras, ent = C.ent, polityEnd = C.polityEnd, timeSpan = C.timeSpan, derived = C.derived,
  peakSize = C.peakSize, go = C.go, link = C.link, linkified = C.linkified, empty = C.empty,
  header = C.header;

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

/* shared with the later parts */
C.pageStory = pageStory;
})();
