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
  } else if (n.kind === "stance") {
    /* standing orders for a realm the reader plays: its temper moves with them (the engine's own
       choices read it), and war weighs more or less in its turns (core.js fireOne) */
    const S = world.stances || (world.stances = {}), A0 = world.stanceAggr || (world.stanceAggr = {});
    if (A0[p.id] == null) A0[p.id] = p.traits.aggression;
    S[p.id] = n.stance;
    p.traits.aggression = n.stance === "warlike" ? Math.max(A0[p.id], 0.85) : n.stance === "peaceful" ? Math.min(A0[p.id], 0.15) : A0[p.id];
    return;
  } else if (n.kind === "aim") {
    /* what its wars are for: the land, the plunder, or laying the land waste (core.js warAim) */
    const M = world.aims || (world.aims = {});
    if (n.aim === "own") delete M[p.id]; else M[p.id] = n.aim;
    return;
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

/* how much a realm the reader plays leans to war (its standing orders): a weight for its turns */
const LEAN = { warlike: 2.5, peaceful: 0.25 };
function warlike(world, pid) { const s = world.stances && world.stances[pid]; return (s && LEAN[s]) || 1; }
function aimOf(world, pid) { return (world.aims && world.aims[pid]) || null; }
/* has the reader refused this, here and now? what: "event" (a: the event's subject, ev: its id;
   in this month), "join" (a joining b's enemy b: a to war on b), "peace" or "alliance" (a and b) */
function vetoed(world, what, a, b, ev) {
  const L = world._nudges;
  if (!L || !L.length) return false;
  for (const n of L) {
    if (n.kind !== "veto" || n.what !== what || n.year !== world.year) continue;
    if (what === "event") { if (n.subject === a && n.ev === ev && n.month === world._month) return true; continue; }
    if (what === "join" || what === "free" || what === "absorb") { if (n.a === a && n.b === b) return true; continue; }
    if ((n.a === a && n.b === b) || (n.a === b && n.b === a)) return true;
  }
  return false;
}

/* The decisions of a realm the reader plays, in the history as worked out, between two dates:
   going to war, answering an ally's call, making peace, swearing an alliance. Each with the
   refusal that would undo it: [{ key, date, what, other, text, ask, yes, no, veto }] */
function decisions(world, pid, from, to) {
  const out = [], P = world.polities, me = P[pid];
  if (!me) return out;
  const nm = function (id) { const q = P[id]; return q ? nameIn(q) : "a neighbour"; };
  const refuse = function (t, what, date, extra) {
    const w = when(date), base = { kind: "veto", pid: pid, other: t.a === pid ? t.b : t.a, date: Math.round(date * 12) / 12, year: what === "peace" ? t.end : t.start, month: w.month };
    if (t.src && what !== "peace" && what !== "join") return Object.assign(base, { what: "event", ev: t.src.ev, subject: t.src.subject, month: t.src.month, about: extra });
    return Object.assign(base, { what: what, a: what === "join" ? pid : t.a, b: what === "join" ? (t.a === pid ? t.b : t.a) : t.b, about: extra });
  };
  for (const t of world.treaties || []) {
    if (t.a !== pid && t.b !== pid) continue;
    {
      const other = t.a === pid ? t.b : t.a, s = t.startDate != null ? t.startDate : t.start, e = t.endDate != null ? t.endDate : t.end;
      if (t.kind === "marriage" && t.src && s > from && s <= to) out.push({ key: t.id + ":marriage:" + t.start + ":" + other, date: s, what: "marriage", other: other,
        text: "The ruling houses of " + nameIn(me) + " and " + nm(other) + " are about to be joined by a marriage.", ask: "Agree to the marriage?", yes: "Agree", no: "Refuse", veto: refuse(t, "marriage", s, "marriage") });
      if (t.kind === "tribute" && t.src && s > from && s <= to) out.push(t.a === pid
        ? { key: t.id + ":submit:" + t.start + ":" + other, date: s, what: "submit", other: other, text: me.name + " is about to bow to " + nm(other) + " and pay it tribute as its vassal.", ask: "Submit?", yes: "Submit", no: "Refuse", veto: refuse(t, "submit", s, "submit") }
        : { key: t.id + ":vassal:" + t.start + ":" + other, date: s, what: "vassal", other: other, text: me.name + " is about to take " + nm(other) + " as its vassal.", ask: "Take the vassal?", yes: "Take it", no: "Let it be", veto: refuse(t, "vassal", s, "vassal") });
      if (t.kind === "tribute" && t.a === pid && t.ended === "revolt" && e != null && e > from && e <= to) out.push({ key: t.id + ":free", date: e, what: "free", other: other,
        text: me.name + " could stop paying tribute to " + nm(other) + ".", ask: "Throw off its overlordship?", yes: "Break free", no: "Keep paying",
        veto: { kind: "veto", pid: pid, other: other, date: Math.round(e * 12) / 12, year: t.end, month: when(e).month, what: "free", a: pid, b: other, about: "free" } });
    }
    const other = t.a === pid ? t.b : t.a, s = t.startDate != null ? t.startDate : t.start, e = t.endDate != null ? t.endDate : t.end;
    if (t.kind === "war" && t.a === pid && s > from && s <= to && !t.levy && !t.coalition) {
      if (!t.joined && t.src) out.push({ key: t.id + ":war:" + t.start + ":" + other, date: s, what: "war", other: other,
        text: me.name + " is about to go to war with " + nm(other) + (t.cause ? ", over " + t.cause : "") + ".", ask: "Go to war?", yes: "Go to war", no: "Keep the peace", veto: refuse(t, "war", s, "war") });
      else if (t.joined) out.push({ key: t.id + ":join:" + t.start + ":" + other, date: s, what: "join", other: other,
        text: me.name + " is called to war against " + nm(other) + (t.cause ? ", by " + t.cause.replace(/^the call of /, "") : "") + ".", ask: "Answer the call?", yes: "March", no: "Stay out", veto: refuse(t, "join", s, "join") });
    }
    if (t.kind === "alliance" && s > from && s <= to && !t.coalition) out.push({ key: t.id + ":alliance:" + t.start + ":" + other, date: s, what: "alliance", other: other,
      text: me.name + " and " + nm(other) + " are about to swear an alliance.", ask: "Swear it?", yes: "Swear it", no: "Refuse", veto: refuse(t, "alliance", s, "alliance") });
    /* a war ends in peace once: its key leaves out the end year, which a remade later stretch can move */
    if (t.kind === "war" && t.peaceBy === "clock" && e != null && e > from && e <= to) out.push({ key: t.id + ":peace:" + other, date: e, what: "peace", other: other,
      text: "Envoys come to " + nameIn(me) + " with terms of peace from " + nm(other) + ".", ask: "Make peace?", yes: "Make peace", no: "Fight on", veto: refuse(t, "peace", e, "peace") });
  }
  /* folding a vassal in (core.js vassalTick): told by an entry, not a treaty */
  for (const e of world._typeIndex && world._typeIndex["vassal-absorbed"] || []) {
    const d = e.date != null ? e.date : e.year, v = e.actors[1] && e.actors[1].id;
    if (!e.actors[0] || e.actors[0].id !== pid || d <= from || d > to) continue;
    out.push({ key: e.id + ":absorb", date: d, what: "absorb", other: v, text: me.name + " could fold its vassal " + nm(v) + " into its own realm.", ask: "Fold it in?", yes: "Fold it in", no: "Leave it a vassal",
      veto: { kind: "veto", pid: pid, other: v, date: Math.round(d * 12) / 12, year: e.year, month: when(d).month, what: "absorb", a: pid, b: v, about: "absorb" } });
  }
  return out.sort(function (x, y) { return x.date - y.date; });
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

AEON.nudges = { make: make, when: when, attach: attach, due: due, apply: apply, options: options, warlike: warlike, aimOf: aimOf, vetoed: vetoed, decisions: decisions };
})();
