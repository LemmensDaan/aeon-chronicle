/* Aeon chronicle: graph.js. The graph view.
 * Part of the chronicle browser; see js/chronicle/base.js for how the parts fit together. */
(function () {
"use strict";
var AEON = window.AEON, C = AEON._chronicle;
var KIND_LABEL = C.KIND_LABEL, IMP_LABEL = C.IMP_LABEL, S = C.S, h = C.h, add = C.add, clear = C.clear,
  safeColor = C.safeColor, plural = C.plural, trunc = C.trunc, call = C.call,
  objVals = C.objVals, yr = C.yr, ent = C.ent, entName = C.entName, derived = C.derived,
  curEntry = C.curEntry, go = C.go, link = C.link;

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
      label: s.kind === "event" ? C.when(e) + ": " + trunc(e.text, 40) : entName(s.kind, s.id),
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
    b.addEventListener("click", function () { gs.on[kd[0]] = !gs.on[kd[0]]; C.render(); });
    kinds.appendChild(b);
  });
  row.appendChild(kinds);

  var cap = h("select", "ch-input");
  G_CAPS.forEach(function (n) { var o = h("option", null, (en.focus ? "up to " : "the ") + n + (en.focus ? " names" : " most named")); o.value = n; cap.appendChild(o); });
  cap.value = String(gs.n);
  cap.setAttribute("aria-label", "How many names to show");
  cap.addEventListener("change", function () { gs.n = +cap.value; C.render(); });
  row.appendChild(cap);

  if (gs.on.event) {
    var imp = h("select", "ch-input");
    [5, 4, 3].forEach(function (i) { var o = h("option", null, "entries: " + IMP_LABEL[i]); o.value = i; imp.appendChild(o); });
    imp.value = String(gs.imp);
    imp.setAttribute("aria-label", "Which chronicle entries to show");
    imp.addEventListener("change", function () { gs.imp = +imp.value; C.render(); });
    row.appendChild(imp);
  }

  if (en.focus) {
    var f = h("label"), dep = h("select", "ch-input");
    [[1, "one thread out"], [2, "two threads out"]].forEach(function (d) { var o = h("option", null, d[1]); o.value = d[0]; dep.appendChild(o); });
    dep.value = String(gs.depth);
    dep.setAttribute("aria-label", "How far out from the centre");
    dep.addEventListener("change", function () { gs.depth = +dep.value; C.render(); });
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

/* shared with the later parts */
C.gBuildUI = gBuildUI; C.gControls = gControls; C.gShow = gShow; C.gHost = gHost;
})();
