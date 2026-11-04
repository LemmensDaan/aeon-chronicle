/* Aeon - the reader's changes to a region's history (docs/REGION_CHAPTERS.md, step 9).

   In a chapter, the reader can pick a realm and change what happens to it, from the month shown
   on: its ruler dies, it declares war or makes peace, a revolt breaks out in it, plague strikes
   its chief town. A change is a nudge { kind, pid, other, date, year, month }: ui.js keeps them
   per square (planet._nudges) and makes the region again from its start, and the engine applies
   each in its month of its year's turn (campaigns.js setMonth), so everything before it happens as
   it did and everything after follows from it. At the chapter's end the outcome is written back
   to the world as any other (step 8). Each change is told in the chronicle, tagged "nudge". */
(function () {
"use strict";
const AEON = window.AEON = window.AEON || {};

function hidden(o, k, v) { Object.defineProperty(o, k, { value: v, enumerable: false, configurable: true, writable: true }); return v; }
const nameIn = function (p) { return p.name.replace(/^The /, "the "); };
const clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

/* the year's turn a date falls in (a turn ending in year Y covers the months after Y - 1) and its
   month, 0-11 */
function when(date) {
  const year = Math.ceil(date - 1e-6);
  return { year: year, month: clamp(Math.round((date - (year - 1)) * 12) - 1, 0, 11) };
}
function make(kind, pid, other, date) {
  const w = when(date);
  return { kind: kind, pid: pid, other: other || null, date: Math.round(date * 12) / 12, year: w.year, month: w.month };
}

/* a region made (region.js): its nudges, in the order of their dates */
function attach(world, list) {
  hidden(world, "_nudges", list.slice().sort(function (a, b) { return a.date - b.date; }));
  hidden(world, "_nudgeAt", 0);
}
/* the next nudge due by month m of this year's turn, or null */
function due(world, m) {
  const L = world._nudges;
  if (!L) return null;
  while (world._nudgeAt < L.length && L[world._nudgeAt].year < world.year) world._nudgeAt++;
  const n = L[world._nudgeAt];
  if (!n || n.year !== world.year || n.month > m) return null;
  world._nudgeAt++;
  return n;
}

/* the town a realm's plague strikes: its capital, else its biggest town */
function chiefTown(world, p) {
  const cap = world.regions[p.capital];
  if (cap && cap.settlement && cap.owner === p.id) return cap;
  let best = null;
  for (const id of p.regions) { const r = world.regions[id]; if (r.settlement && (!best || r.settlement.tier > best.settlement.tier)) best = r; }
  return best;
}
function placeOf(r) { return (r && ((r.settlement && r.settlement.name) || r.name)) || "its chief town"; }

/* a nudge in its month: what it does, and the chronicle entries it makes, tagged "nudge" */
function apply(world, n) {
  const C = AEON._core, p = world.polities[n.pid], q = n.other && world.polities[n.other];
  if (!p || p.ended) return;
  const from = world.chronicle.length;
  const rec = function (type, imp, tags, text, actors, regionId) {
    return C.recordEvent(world, type, { importance: imp, tags: tags, text: text, actors: actors || [{ kind: "polity", id: p.id }], regionId: regionId != null ? regionId : p.capital });
  };
  if (n.kind === "ruler-dies") {
    const f = p.ruler && world.figures[p.ruler];
    if (!f || f.died != null) return;
    C.killFigure(world, f, "Died suddenly.");
    p.traits.stability = clamp(p.traits.stability - 0.1, 0, 1);
    rec("nudge-ruler-dies", 3, ["death", "ruler"], (f.title ? f.title + " " : "") + f.name + " of " + nameIn(p) + " died suddenly, and the throne stood empty.",
      [{ kind: "polity", id: p.id }, { kind: "figure", id: f.id }]);
  } else if (n.kind === "war") {
    if (!q || q.ended || AEON.treatyBetween(world, p, q, "war")) return;
    const ctx = C.makeCtx(world, { kind: "polity", obj: p }), cause = "a quarrel between their rulers";
    if (world.pack.joinWar) world.pack.joinWar(ctx, p, q, { cause: cause });
    else AEON.treaty(world, "war", p, q, { cause: cause });
    rec("nudge-war", 3, ["war"], p.name + " declared war on " + nameIn(q) + ", over " + cause + ".", [{ kind: "polity", id: p.id }, { kind: "polity", id: q.id }]);
  } else if (n.kind === "peace") {
    const t = q && AEON.treatyBetween(world, p, q, "war");
    if (!t || t.end != null) return;
    C.concludePeace(world, t, AEON.warScore(world, t));
    /* the war ends with the peace's entry, in this month (core.js dateTick), not after its length so far */
    t.years = null;
  } else if (n.kind === "revolt") {
    /* the pack's own revolts, the gravest that can happen (by how rarely it may: its cooldown) */
    p.traits.stability = Math.min(p.traits.stability, 0.25);
    const ctx = C.makeCtx(world, { kind: "polity", obj: p });
    const defs = (world.pack.events || []).filter(function (d) { return d.revolt && (d.scope || "polity") === "polity"; })
      .sort(function (a, b) { return (b.cooldown || 0) - (a.cooldown || 0); });
    let done = false;
    for (const d of defs) {
      try { if (typeof d.test === "function" && !d.test(ctx)) continue; } catch (e) { continue; }
      let out = null;
      try { out = d.run(ctx); } catch (e) { console.warn("[aeon] nudge revolt " + d.id + " threw:", e); continue; }
      if (!out) continue;
      if (d.cooldown) world._cooldowns[d.id + "|" + p.id] = world.year;
      C.recordEvent(world, out.type || d.id, out);
      done = true;
      break;
    }
    if (!done) rec("nudge-unrest", 2, ["unrest"], "Unrest swept " + nameIn(p) + ", but no rising came of it.");
  } else if (n.kind === "plague") {
    const r = chiefTown(world, p);
    if (!r) return;
    /* tagged plague: the fast layer (fastlayer.js) starts the contagion there */
    rec("nudge-plague", 3, ["plague", "disaster"], "Plague broke out in " + placeOf(r) + ", in the lands of " + nameIn(p) + ".", null, r.id);
  }
  for (let i = from; i < world.chronicle.length; i++) {
    const e = world.chronicle[i];
    e.nudge = true;
    if (e.tags.indexOf("nudge") < 0) e.tags.push("nudge");
  }
}

/* what the reader may do to a realm at a date, read from the history's logs:
   [{ kind, other, label }] */
function options(world, pid, date) {
  const p = world.polities[pid];
  if (!p) return [];
  const owners = AEON.ownersAt(world, date), R = world.regions, out = [];
  if (!owners.some(function (o) { return o === pid; })) return [];
  const ruler = AEON.rulerAt(world, pid, date);
  if (ruler) out.push({ kind: "ruler-dies", label: "Its ruler, " + ruler.name + ", dies" });
  const at = function (t) { const s = t.startDate != null ? t.startDate : t.start, e = t.endDate != null ? t.endDate : t.end; return s <= date && (e == null || e > date); };
  const foes = {}, bound = {};
  for (const t of AEON.treatiesOf(world, p, null)) {
    if (!at(t)) continue;
    const o = t.a === pid ? t.b : t.a;
    if (t.kind === "war") foes[o] = true; else if (t.kind === "tribute") bound[o] = true;
  }
  for (const o of Object.keys(foes)) { const q = world.polities[o]; if (q) out.push({ kind: "peace", other: o, label: "It makes peace with " + nameIn(q) }); }
  /* neighbours: realms whose land touches its own */
  const near = {};
  for (let i = 0; i < R.length; i++) {
    if (owners[i] !== pid) continue;
    for (const nb of R[i].neighbors) { const o = owners[nb]; if (o && o !== pid) near[o] = (near[o] || 0) + 1; }
  }
  Object.keys(near).sort(function (a, b) { return near[b] - near[a]; }).slice(0, 6).forEach(function (o) {
    const q = world.polities[o];
    if (q && !foes[o] && !bound[o]) out.push({ kind: "war", other: o, label: "It declares war on " + nameIn(q) });
  });
  out.push({ kind: "revolt", label: "A revolt breaks out in it" });
  out.push({ kind: "plague", label: "Plague strikes it" });
  return out;
}

AEON.nudges = { make: make, when: when, attach: attach, due: due, apply: apply, options: options };
})();
