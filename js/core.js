/* Aeon — the genre-agnostic simulation engine.
   Knows about regions, polities, figures, artifacts and events. Knows nothing
   about knights or starships: that all lives in packs. */
(function () {
"use strict";

const AEON = window.AEON = window.AEON || {};

AEON.packs = {};
AEON.registerPack = function (def) {
  if (!def || !def.id) { console.error("[aeon] pack needs an id", def); return; }
  def.scale = "planet";        /* galaxy-scale packs moved to the galaxy-generator project */
  def.timeStep = def.timeStep || 5;
  def.seedPolities = def.seedPolities || 8;
  def.events = def.events || [];
  def.eras = def.eras || [{ id: "default", name: "The Age", from: -Infinity }];
  def.archetypes = def.archetypes || [{ id: "state", name: "State", traitBias: {} }];
  def.flavor = def.flavor || {};
  def.yearLabel = def.yearLabel || function (y) { return String(y); };
  AEON.packs[def.id] = def;
};

const PALETTE = [
  "#c0504d", "#4f81bd", "#9bbb59", "#8064a2", "#4bacc6", "#f79646",
  "#d16a7c", "#5b9bd5", "#70ad47", "#a5739a", "#c9a227", "#5f9ea0",
  "#b85450", "#6a8caf", "#8aa84a", "#7d6b9e", "#3f9aa8", "#dd8452",
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TRAIT_KEYS = ["aggression", "piety", "curiosity", "stability", "cunning"];

/* ------------------------------------------------------------ creation -- */

AEON.createWorld = function (opts) {
  opts = opts || {};
  const pack = AEON.packs[opts.packId];
  if (!pack) throw new Error("unknown pack: " + opts.packId);

  const seed = opts.seed == null ? Date.now() % 1000000 : opts.seed;
  const rng = AEON.RNG(seed);

  const world = {
    seed: seed,
    packId: pack.id,
    pack: pack,
    scale: pack.scale,
    width: opts.width || 150,
    height: opts.height || 95,
    startYear: pack.startYear,
    endYear: pack.endYear,
    timeStep: pack.timeStep,
    year: pack.startYear,
    era: pack.eras[0].id,
    regions: [],
    polities: {},
    figures: {},
    artifacts: {},
    chronicle: [],
    ownerLog: [],             // [year, regionId, ownerId|null] — lets any year be reconstructed
    settleLog: [],            // [year, regionId, tier] whenever a settlement appears, changes size or goes (0)
    rng: rng,
    _ids: { polity: 1, figure: 1, artifact: 1, event: 1 },
    _cooldowns: {},
    _colorIdx: 0,
    stats: { wars: 0, foundings: 0, collapses: 0, deaths: 0 },
  };

  if (!AEON.worldgen || !AEON.worldgen.generate) throw new Error("worldgen missing");
  AEON.worldgen.generate(world, pack, rng);

  for (const r of world.regions) {
    if (r.owner === undefined) r.owner = null;
    if (r.population === undefined) r.population = 0;
    if (!r.features) r.features = [];
    if (!r.settlement) r.settlement = null;
    if (!r.resources) r.resources = { food: 0.5, metal: 0.3, exotic: 0.1 };
  }

  seedPolities(world);
  logSettlements(world);
  return world;
};

function seedPolities(world) {
  const rng = world.rng;
  const habitable = world.regions
    .filter(function (r) { return !r.barren && r.habitability > 0.35; })
    .sort(function (a, b) { return b.habitability - a.habitability; });

  const candidates = habitable.slice(0, Math.max(world.pack.seedPolities * 12, 40));
  const chosen = [];
  const minDist = 11;

  for (const r of rng.shuffle(candidates)) {
    if (chosen.length >= world.pack.seedPolities) break;
    let ok = true;
    for (const c of chosen) {
      const dx = c.x - r.x, dy = c.y - r.y;
      if (Math.sqrt(dx * dx + dy * dy) < minDist) { ok = false; break; }
    }
    if (ok) chosen.push(r);
  }
  while (chosen.length < Math.min(3, candidates.length)) chosen.push(rng.pick(candidates));

  for (const r of chosen) spawnPolity(world, r, null);
}

function spawnPolity(world, region, archetypeId) {
  const rng = world.rng;
  const pack = world.pack;
  const arch = archetypeId
    ? (pack.archetypes.find(function (a) { return a.id === archetypeId; }) || rng.pick(pack.archetypes))
    : rng.pick(pack.archetypes);

  const id = "p" + (world._ids.polity++);
  const naming = callName(world, "polity", { region: region, archetype: arch }) || { name: "Polity " + id };

  const traits = {};
  for (const k of TRAIT_KEYS) {
    traits[k] = clamp(rng.trait(0.5, 0.2) + ((arch.traitBias && arch.traitBias[k]) || 0), 0.02, 0.98);
  }

  const polity = {
    id: id,
    name: naming.name || String(naming),
    adjective: naming.adjective || naming.name || String(naming),
    culture: naming.culture || null,
    archetypeId: arch.id,
    archetypeName: arch.name,
    founded: world.year,
    ended: null,
    capital: region.id,
    regions: [region.id],
    traits: traits,
    tech: 0.05 + rng.range(0, 0.05),
    population: Math.round(1200 + rng.range(0, 2500)),
    wealth: 0.3, military: 0.3, prestige: 0.2,
    ruler: null,
    rulers: [],
    relations: {},
    color: PALETTE[(world._colorIdx++) % PALETTE.length],
    fate: null,
    sizeHistory: [],
  };

  world.polities[id] = polity;
  region.owner = id;
  logOwner(world, region.id, id);
  region.population = Math.round(polity.population * 0.6);
  if (!region.name) region.name = callName(world, "place", { region: region, polity: polity });
  if (!region.settlement) {
    region.settlement = {
      name: callName(world, "settlement", { region: region, polity: polity }) || region.name,
      tier: 3, founded: world.year,
    };
  }
  world.stats.foundings++;
  return polity;
}

function callName(world, kind, extra) {
  const fn = world.pack.names && world.pack.names[kind];
  if (typeof fn !== "function") {
    return kind === "polity" ? { name: "Unnamed", adjective: "Unnamed" } : "Unnamed";
  }
  try {
    return fn(world.rng, Object.assign({ world: world }, extra || {}));
  } catch (e) {
    console.warn("[aeon] name generator '" + kind + "' failed:", e);
    return kind === "polity" ? { name: "Unnamed", adjective: "Unnamed" } : "Unnamed";
  }
}

/* -------------------------------------------------------------- helpers -- */

function living(world) {
  const out = [];
  for (const id in world.polities) {
    const p = world.polities[id];
    if (!p.ended) out.push(p);
  }
  return out;
}

function regionsOf(world, polity) {
  return polity.regions.map(function (i) { return world.regions[i]; }).filter(Boolean);
}

function neighborPolities(world, polity) {
  const seen = {};
  for (const rid of polity.regions) {
    const r = world.regions[rid];
    if (!r) continue;
    for (const nid of (r.neighbors || [])) {
      const n = world.regions[nid];
      if (n && n.owner && n.owner !== polity.id) seen[n.owner] = true;
    }
  }
  return Object.keys(seen).map(function (id) { return world.polities[id]; })
    .filter(function (p) { return p && !p.ended; });
}

function capacity(world, polity) {
  let cap = 0;
  for (const r of regionsOf(world, polity)) {
    cap += r.habitability * 9000 * (1 + polity.tech * 2.2);
  }
  return Math.max(500, cap);
}

function recordEvent(world, type, payload) {
  const ev = {
    id: "e" + (world._ids.event++),
    year: world.year,
    type: type,
    packId: world.packId,
    importance: clamp(payload.importance || 1, 1, 5),
    actors: payload.actors || [],
    regionId: payload.regionId == null ? null : payload.regionId,
    text: String(payload.text || "").trim(),
    tags: payload.tags || [],
  };
  if (!ev.text) return null;
  world.chronicle.push(ev);
  const ti = world._tagIndex || (world._tagIndex = {});
  for (const t of ev.tags) (ti[t] || (ti[t] = [])).push(ev);
  const yi = world._typeIndex || (world._typeIndex = {});
  (yi[ev.type] || (yi[ev.type] = [])).push(ev);
  for (const a of ev.actors) {
    if (a.kind === "figure" && world.figures[a.id]) world.figures[a.id].deeds.push(ev.id);
  }
  return ev;
}
AEON.recordEvent = recordEvent;

function newestFirst(list, limit) {
  if (!list || !list.length) return [];
  const n = limit ? Math.min(limit, list.length) : list.length;
  const out = new Array(n);
  for (let k = 0; k < n; k++) out[k] = list[list.length - 1 - k];
  return out;
}

/* --------------------------------------------------------- event context */

function makeCtx(world, subject) {
  const rng = world.rng;
  const ctx = {
    world: world,
    rng: rng,
    year: world.year,
    era: world.era,
    polity: subject && subject.kind === "polity" ? subject.obj : null,
    figure: subject && subject.kind === "figure" ? subject.obj : null,
    region: subject && subject.kind === "region" ? subject.obj : null,

    pick: function (a) { return rng.pick(a); },
    choice: function (a) { return rng.pick(a); },
    chance: function (p) { return rng.chance(p); },
    int: function (a, b) { return rng.int(a, b); },
    range: function (a, b) { return rng.range(a, b); },
    shuffle: function (a) { return rng.shuffle(a); },

    living: function () { return living(world); },
    regionsOf: function (p) { return regionsOf(world, p || ctx.polity); },
    neighbors: function (p) { return neighborPolities(world, p || ctx.polity); },

    rivals: function (p) {
      p = p || ctx.polity;
      if (!p) return [];
      const n = neighborPolities(world, p);
      const hostile = living(world).filter(function (o) {
        return o !== p && (p.relations[o.id] || 0) < -0.2;
      });
      const all = n.concat(hostile.filter(function (h) { return n.indexOf(h) < 0; }));
      return all;
    },

    actor: function (obj) {
      if (!obj) return null;
      if (obj.archetypeId !== undefined) return { kind: "polity", id: obj.id };
      if (obj.traits && obj.born !== undefined) return { kind: "figure", id: obj.id };
      if (obj.kind !== undefined && obj.created !== undefined) return { kind: "artifact", id: obj.id };
      if (obj.biome !== undefined) return { kind: "region", id: obj.id };
      return null;
    },

    name: function (kind, extra) { return callName(world, kind, extra); },

    newFigure: function (polity, role) { return newFigure(world, polity, role); },
    kill: function (fig, epitaph) { return killFigure(world, fig, epitaph); },
    newArtifact: function (o) { return newArtifact(world, o); },
    /* where a polity can raise a wonder: each city or capital holds at most one. Its capital if
       that has a settlement and no wonder standing, else its largest city without one, else null. */
    wonderSite: function (p) {
      if (!p) return null;
      const free = function (rid) { return AEON.wondersAt(world, rid, world.year).length === 0; };
      const cap = p.capital != null ? world.regions[p.capital] : null;
      if (cap && cap.settlement && free(cap.id)) return cap;
      let best = null;
      for (const rid of p.regions) {
        const r = world.regions[rid];
        if (r.settlement && r.settlement.tier >= 3 && free(rid) && (!best || r.settlement.tier > best.settlement.tier)) best = r;
      }
      return best;
    },
    transfer: function (region, to) { return transferRegion(world, region, to); },
    foundSettlement: function (region, tier) { return foundSettlement(world, region, tier); },
    endPolity: function (p, fate) { return endPolity(world, p, fate); },
    spawnPolity: function (region, archetypeId) { return spawnPolity(world, region, archetypeId); },

    /* chronicle search — the hook that lets packs reference their own past */
    past: function (predicate, limit) {
      const out = [];
      for (let i = world.chronicle.length - 1; i >= 0; i--) {
        const ev = world.chronicle[i];
        try { if (predicate(ev)) out.push(ev); } catch (e) { /* ignore */ }
        if (limit && out.length >= limit) break;
      }
      return out;
    },
    /* indexed lookups: newest first, without scanning the whole chronicle */
    pastByTag: function (tag, limit) {
      return newestFirst((world._tagIndex || {})[tag], limit);
    },
    pastByType: function (type, limit) {
      return newestFirst((world._typeIndex || {})[type], limit);
    },
  };
  return ctx;
}

/* ------------------------------------------------------- state mutators -- */

function newFigure(world, polity, role) {
  const rng = world.rng;
  const id = "f" + (world._ids.figure++);
  const nm = callName(world, "figure", { polity: polity, role: role });
  const fig = {
    id: id,
    name: typeof nm === "string" ? nm : (nm && nm.name) || ("Figure " + id),
    title: (nm && nm.title) || (role || "Ruler"),
    role: role || "ruler",
    polityId: polity ? polity.id : null,
    born: world.year - rng.int(18, 45),
    died: null,
    traits: {
      ambition: rng.trait(0.5, 0.22),
      wisdom: rng.trait(0.5, 0.22),
      cruelty: rng.trait(0.4, 0.24),
      charisma: rng.trait(0.5, 0.22),
    },
    deeds: [],
    epitaph: null,
  };
  world.figures[id] = fig;
  return fig;
}

function killFigure(world, fig, epitaph) {
  if (!fig || fig.died != null) return fig;
  fig.died = world.year;
  fig.epitaph = epitaph || null;
  world.stats.deaths++;
  const p = fig.polityId && world.polities[fig.polityId];
  if (p && p.ruler === fig.id) p.ruler = null;
  return fig;
}

function newArtifact(world, o) {
  o = o || {};
  const id = "a" + (world._ids.artifact++);
  const art = {
    id: id,
    name: o.name || callName(world, "artifact", { polity: o.polity, region: o.region }) || ("Relic " + id),
    kind: o.kind || "relic",
    created: world.year,
    creatorId: o.creator ? o.creator.id : null,
    location: o.region ? o.region.id : (o.location == null ? null : o.location),
    power: o.power == null ? world.rng.range(0.2, 0.9) : o.power,
    legend: o.legend || null,
    destroyed: null,
  };
  world.artifacts[id] = art;
  return art;
}

function transferRegion(world, region, to) {
  if (!region) return false;
  const from = region.owner && world.polities[region.owner];
  if (from) {
    const i = from.regions.indexOf(region.id);
    if (i >= 0) from.regions.splice(i, 1);
    if (from.capital === region.id) from.capital = from.regions.length ? from.regions[0] : from.capital;
  }
  region.owner = to ? to.id : null;
  logOwner(world, region.id, region.owner);
  if (to && to.regions.indexOf(region.id) < 0) to.regions.push(region.id);
  if (to && !region.name) region.name = callName(world, "place", { region: region, polity: to });
  if (from && from.regions.length === 0 && !from.ended) {
    endPolity(world, from, "Its last territory was lost, and it simply ceased to be counted among the powers.");
  }
  return true;
}

/* Settlement sizes are tiers 1..4 (tier 4 is a city that has outgrown its walls; packs use
   the difference). Shown as four types: village, town, city, and capital, which is any
   settlement that is a living realm's seat, whatever its size. A pack may rename the
   sizes (pack.settlementTiers). */
AEON.SETTLEMENT_TIERS = ["", "village", "town", "city", "city"];
AEON.tierName = function (pack, tier) {
  const t = (pack && pack.settlementTiers) || AEON.SETTLEMENT_TIERS;
  return t[tier] || "settlement";
};
/* the polity a region is the seat of, in a world or a past-year view, or null */
AEON.capitalOf = function (w, rid) {
  for (const id in w.polities) { const p = w.polities[id]; if (p.ended == null && p.capital === rid) return p; }
  return null;
};
AEON.settlementType = function (w, rid) {
  const r = w.regions[rid];
  if (!r || !r.settlement) return null;
  return AEON.capitalOf(w, rid) ? "capital" : AEON.tierName(w.pack, r.settlement.tier);
};
/* Packs found, grow, shrink and raze settlements inside their events, so the engine notes the
   outcome once a tick: world.settleLog gets [year, regionId, tier] whenever a settlement
   appears, changes size or is gone (tier 0). Only views and statistics read it, so it
   changes no history. */
function logSettlements(world) {
  let now = world._tierNow;
  if (!now) {
    now = new Int8Array(world.regions.length);
    const hidden = function (k, v) { Object.defineProperty(world, k, { value: v, enumerable: false, configurable: true, writable: true }); };
    hidden("_tierNow", now);
    hidden("_settleObj", new Array(world.regions.length).fill(null));
    hidden("_pastSettle", {});            /* regionId -> [{ s, until }]: settlements since razed or replaced */
  }
  const R = world.regions, obj = world._settleObj;
  for (let i = 0; i < R.length; i++) {
    const cur = R[i].settlement || null, t = cur ? cur.tier : 0;
    if (cur !== obj[i]) {
      if (obj[i]) (world._pastSettle[i] || (world._pastSettle[i] = [])).push({ s: obj[i], until: world.year });
      obj[i] = cur;
      if (cur && t === now[i]) world.settleLog.push([world.year, i, t]);   /* refounded at the same size */
    }
    if (t !== now[i]) { now[i] = t; world.settleLog.push([world.year, i, t]); }
  }
}
/* the settlement object that stood in a region during a year, even one razed since */
function settlementAt(world, rid, year) {
  const past = world._pastSettle && world._pastSettle[rid];
  if (past) for (const x of past) if (year < x.until) return x.s;
  return world.regions[rid].settlement || null;
}
/* the size of the settlement in a region during a year (0: none yet, or gone) */
function settleIndex(world) {
  let ix = world._settleIx;
  const L = world.settleLog || [];
  if (ix && ix.n === L.length) return ix;
  ix = { n: L.length, by: {} };
  for (const e of L) (ix.by[e[1]] || (ix.by[e[1]] = [])).push(e);
  Object.defineProperty(world, "_settleIx", { value: ix, enumerable: false, configurable: true, writable: true });
  return ix;
}
AEON.tierAt = function (world, rid, year) {
  const list = settleIndex(world).by[rid];
  let t = 0;
  if (list) for (const e of list) { if (e[0] <= year) t = e[2]; else break; }
  return t;
};
AEON.settlementHistory = function (world, rid) { return (settleIndex(world).by[rid] || []).slice(); };

/* Wonders: great buildings that stay where they were raised. They are artifacts (so they get
   chronicle pages, atlas entries and graph nodes) marked either with `wonder: true` or by a kind
   the pack lists in `pack.wonderKinds`. They stand from `created` until `destroyed`. */
AEON.isWonder = function (world, a) {
  return !!a && (a.wonder === true || ((world.pack && world.pack.wonderKinds) || []).indexOf(a.kind) >= 0);
};
AEON.wonders = function (world) {
  const out = [];
  for (const id in world.artifacts) if (AEON.isWonder(world, world.artifacts[id])) out.push(world.artifacts[id]);
  return out;
};
/* the wonders standing in a region during a year */
AEON.wondersAt = function (world, rid, year) {
  let ix = world._wonderIx;
  const n = world._ids.artifact;
  if (!ix || ix.n !== n) {
    ix = { n: n, by: {} };
    for (const a of AEON.wonders(world)) if (a.location != null) (ix.by[a.location] || (ix.by[a.location] = [])).push(a);
    Object.defineProperty(world, "_wonderIx", { value: ix, enumerable: false, configurable: true, writable: true });
  }
  return (ix.by[rid] || []).filter(function (a) { return a.created <= year && (a.destroyed == null || a.destroyed > year); });
};

function foundSettlement(world, region, tier) {
  if (!region || region.barren) return null;
  const polity = region.owner && world.polities[region.owner];
  if (!region.name) region.name = callName(world, "place", { region: region, polity: polity });
  region.settlement = {
    name: callName(world, "settlement", { region: region, polity: polity }) || region.name,
    tier: clamp(tier || 1, 1, 4),
    founded: world.year,
  };
  return region.settlement;
}

function endPolity(world, polity, fate) {
  if (!polity || polity.ended) return;
  polity.ended = world.year;
  polity.fate = fate || "It ended without record of how.";
  for (const rid of polity.regions.slice()) {
    const r = world.regions[rid];
    if (r) { r.owner = null; logOwner(world, r.id, null); }
  }
  polity.regions = [];
  if (polity.ruler && world.figures[polity.ruler]) {
    killFigure(world, world.figures[polity.ruler], "Died in the fall of " + polity.name + ".");
  }
  world.stats.collapses++;
}

function logOwner(world, rid, owner) {
  if (world.ownerLog) world.ownerLog.push([world.year, rid, owner]);
}

/* --------------------------------------------------- the past, as a view --

   viewAt(world, year) returns an object shaped exactly like `world`, but whose
   regions and polities report ownership, settlements, capitals and survival as
   they stood in `year`. It inherits everything else from the real objects via
   Object.create, so consumers such as the renderer need no changes. The view is
   one stable object per world, updated in place, so identity-keyed caches hold. */

const CHECKPOINT_EVERY = 4000;

function ownersAt(world, year) {
  const log = world.ownerLog, N = world.regions.length;
  let cps = world._ownerCps;
  if (!cps || cps.len !== log.length) {
    cps = { len: log.length, list: [] };
    const cur = new Array(N).fill(null);
    for (let k = 0; k < log.length; k++) {
      if (k % CHECKPOINT_EVERY === 0) cps.list.push({ idx: k, owners: cur.slice() });
      cur[log[k][1]] = log[k][2];
    }
    world._ownerCps = cps;
  }
  /* a checkpoint at idx k is the state before log[k]; it is a valid starting point
     if every entry before it happened on or before `year` */
  let cp = cps.list[0];
  for (const c of cps.list) {
    if (c.idx === 0 || log[c.idx - 1][0] <= year) cp = c; else break;
  }
  const owners = cp ? cp.owners.slice() : new Array(N).fill(null);
  for (let k = cp ? cp.idx : 0; k < log.length && log[k][0] <= year; k++) owners[log[k][1]] = log[k][2];
  return owners;
}

/* Who reigned over a polity in a year: the ruler crowned most recently before it. If they had
   died by then, the heir crowned within two ticks of the death counts as already reigning (the
   engine crowns on the tick after a death); a longer gap is an interregnum. null if none. */
AEON.rulerAt = function (world, pid, year) {
  let ix = world._reigns;
  const nFig = world._ids.figure;
  if (!ix || ix.n !== nFig) {
    ix = { n: nFig, by: {} };
    for (const id in world.figures) {
      const f = world.figures[id];
      if (f.crowned == null || f.reignOf == null) continue;
      (ix.by[f.reignOf] = ix.by[f.reignOf] || []).push(f);
    }
    for (const k in ix.by) ix.by[k].sort(function (a, b) { return a.crowned - b.crowned; });
    Object.defineProperty(world, "_reigns", { value: ix, enumerable: false, configurable: true, writable: true });
  }
  const list = ix.by[pid];
  if (!list) return null;
  let k = -1;
  while (k + 1 < list.length && list[k + 1].crowned <= year) k++;
  if (k < 0) return null;
  const best = list[k], next = list[k + 1];
  if (best.died == null || best.died > year) return best;
  return next && next.crowned - best.died <= 2 * world.timeStep ? next : null;
};

/* The age a polity was in during a year: { index, age, since, inherited } or null (no ages in
   this pack, or the realm had not been counted yet). */
AEON.ageAt = function (world, pid, year) {
  const p = world.polities[pid], ages = world.pack.ages;
  if (!p || !ages || !p.ageLog || !p.ageLog.length) return null;
  let e = null;
  for (const x of p.ageLog) { if (x.year <= year) e = x; else break; }
  if (!e) e = p.ageLog[0];
  return { index: e.age, age: ages[e.age], since: e.year, inherited: !!e.inherited };
};

AEON.viewAt = function (world, year) {
  if (year == null || year >= world.year) year = world.year;
  let v = world._view;
  if (!v) {
    v = world._view = Object.create(world);
    v.regions = world.regions.map(function (r) { return Object.create(r); });
    v._pv = {};
    v._sv = {};
  }
  const sLen = world.settleLog ? world.settleLog.length : 0;
  if (v._year === year && v._logLen === world.ownerLog.length && v._sLen === sLen) return v;

  const owners = ownersAt(world, year);
  const first = {};
  for (let i = 0; i < owners.length; i++) {
    const o = owners[i], rv = v.regions[i], s = world.regions[i].settlement;
    rv.owner = o;
    /* the settlement as it stood that year: none before it was founded or after it fell,
       and at the size it had then */
    const tier = sLen ? AEON.tierAt(world, i, year) : (s && s.founded <= year ? s.tier : 0);
    const so = tier ? (sLen ? settlementAt(world, i, year) : s) : null;
    if (!so) rv.settlement = null;
    else if (tier === so.tier) rv.settlement = so;
    else {
      let sv = v._sv[i];
      if (!sv || Object.getPrototypeOf(sv) !== so) sv = v._sv[i] = Object.create(so);
      sv.tier = tier; rv.settlement = sv;
    }
    if (o != null && first[o] === undefined) first[o] = i;
  }

  const pols = {};
  for (const id in world.polities) {
    const p = world.polities[id];
    if (p.founded > year) continue;
    const pv = v._pv[id] || (v._pv[id] = Object.create(p));
    const alive = p.ended == null || p.ended > year;
    pv.ended = alive ? null : p.ended;
    pv.fate = alive ? null : p.fate;
    pv.capital = owners[p.capital] === id ? p.capital : (first[id] !== undefined ? first[id] : p.capital);
    pols[id] = pv;
  }
  v.polities = pols;
  v.year = year;
  v._year = year;
  v._logLen = world.ownerLog.length;
  v._sLen = sLen;
  return v;
};

/* --------------------------------------------------------------- ticking */

function updateEra(world) {
  let era = world.pack.eras[0];
  for (const e of world.pack.eras) if (world.year >= e.from) era = e;
  if (era.id !== world.era) {
    world.era = era.id;
    recordEvent(world, "era-change", {
      importance: 4, tags: ["era"],
      text: "The age turned. Those who lived through it would later be said to belong to " + era.name + ".",
    });
  }
}

/* --------------------------------------------------------------- ages --
   Each realm's progress toward the pack's ages (pack.ages: [{ id, name, at }], the first one
   where every realm starts). `learning` grows by tech x years, so it keeps rising after tech
   saturates and curious, advanced realms pull ahead. Nothing in the simulation reads it, so
   it changes no history. A new realm starts from whoever held its land before it (a
   successor keeps its parent's age), or, founded on empty land, from half the median of the
   realms then living. */
function inheritLearning(world, p, alive) {
  const log = world.ownerLog, want = {};
  let left = 0, best = -1;
  for (const r of p.regions) { want[r] = true; left++; }
  for (let i = log.length - 1, n = 0; i >= 0 && left > 0 && n < 50000; i--, n++) {
    const e = log[i];
    if (!want[e[1]] || e[2] === p.id) continue;
    want[e[1]] = false; left--;
    const prev = e[2] != null ? world.polities[e[2]] : null;
    if (prev && prev.learning != null && prev.learning > best) best = prev.learning;
  }
  if (best >= 0) return best * 0.95;
  const ls = alive.filter(function (q) { return q !== p && q.learning != null; }).map(function (q) { return q.learning; }).sort(function (a, b) { return a - b; });
  return ls.length ? ls[Math.floor(ls.length / 2)] * 0.5 : 0;
}
function ageFor(pack, learning) {
  const ages = pack.ages || [];
  let k = 0;
  while (k + 1 < ages.length && learning >= ages[k + 1].at) k++;
  return k;
}
function advanceAge(world, p, alive) {
  if (p.learning == null) {
    p.learning = inheritLearning(world, p, alive);
    p.age = ageFor(world.pack, p.learning);
    p.ageLog = [{ age: p.age, year: world.year, inherited: true }];
  }
  p.learning = Math.round((p.learning + p.tech * world.timeStep) * 1000) / 1000;
  const ages = world.pack.ages;
  while (ages && p.age + 1 < ages.length && p.learning >= ages[p.age + 1].at) {
    p.age++;
    p.ageLog.push({ age: p.age, year: world.year });
  }
}

/* How a realm's people spread over its land: by habitability, and far more thickly where there is a
   settlement (a capital most of all). Only the map and tooltips read region populations, so this
   shapes no history. */
const SETTLE_DRAW = [1, 2.5, 6, 14, 22];
AEON.popWeight = function (region, isCapital) {
  const s = region.settlement;
  return Math.max(0.05, region.habitability) * SETTLE_DRAW[s ? Math.min(4, s.tier) : 0] * (isCapital ? 3 : 1);
};
/* a polity's population in a year, from its size history (null before it was founded) */
AEON.populationAt = function (p, year) {
  const h = p.sizeHistory;
  if (!h || !h.length || year < h[0].year) return null;
  let lo = 0, hi = h.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (h[mid].year <= year) lo = mid; else hi = mid - 1; }
  return h[lo].pop;
};

function baselineTick(world) {
  const rng = world.rng;
  const alive = living(world);

  for (const p of alive) {
    const cap = capacity(world, p);
    const growth = (1 - p.population / cap) * 0.09 * (0.6 + p.traits.stability * 0.8);
    p.population = Math.max(60, Math.round(p.population * (1 + growth)));

    p.tech = clamp(p.tech + 0.0016 * (0.4 + p.traits.curiosity * 1.6) * (1 + p.regions.length * 0.015), 0, 1);
    advanceAge(world, p, alive);
    p.wealth = clamp(0.2 + (p.population / cap) * 0.5 + p.tech * 0.4, 0, 1);
    p.military = clamp(0.1 + p.traits.aggression * 0.5 + p.tech * 0.3 + p.regions.length * 0.01, 0, 1);
    p.prestige = clamp(p.prestige * 0.995 + p.regions.length * 0.004 + p.tech * 0.004, 0, 1);

    /* distribute population across regions for the map */
    const rs = regionsOf(world, p);
    let totalW = 0;
    for (const r of rs) totalW += AEON.popWeight(r, r.id === p.capital);
    for (const r of rs) {
      r.population = Math.round(p.population * (AEON.popWeight(r, r.id === p.capital) / (totalW || 1)));
    }

    /* natural expansion into adjacent unclaimed ground */
    const expansionChance = 0.07 + p.traits.aggression * 0.10 + p.wealth * 0.05;
    if (rng.chance(expansionChance)) {
      const open = [];
      for (const r of rs) {
        for (const nid of (r.neighbors || [])) {
          const n = world.regions[nid];
          if (n && !n.barren && !n.owner && n.habitability > 0.03) open.push(n);
        }
      }
      if (open.length) {
        /* harsh land is settled too, only far less eagerly: a soft frontier, not a wall */
        const target = rng.weighted(open, function (r) { return r.habitability * r.habitability + 0.004; });
        transferRegion(world, target, p);
        if (rng.chance(0.12)) foundSettlement(world, target, rng.int(1, 2));
      }
    }

    /* rulers */
    if (!p.ruler) {
      const f = newFigure(world, p, "ruler");
      p.ruler = f.id;
      p.rulers.push(f.id);
    } else {
      const r = world.figures[p.ruler];
      if (r) {
        const age = world.year - r.born;
        const deathChance = age > 70 ? 0.42 : age > 55 ? 0.16 : age > 40 ? 0.06 : 0.02;
        if (rng.chance(deathChance * (world.timeStep / 5))) {
          killFigure(world, r, pickFlavor(world, "epitaphs") || null);
          p.ruler = null;
        }
      } else { p.ruler = null; }
    }
    /* when each reign began, so any year can name its ruler. Packs crown heirs and usurpers
       inside events, so those reigns are stamped here on the next tick, a few years late. */
    if (p.ruler && world.figures[p.ruler] && world.figures[p.ruler].crowned == null) {
      world.figures[p.ruler].crowned = world.year;
      world.figures[p.ruler].reignOf = p.id;
    }

    if (p.regions.length === 0) {
      endPolity(world, p, "Its territory dwindled to nothing and its name passed out of use.");
    }
  }

  /* record territory size occasionally for sparklines */
  if (world.chronicle.length % 1 === 0) {
    for (const p of alive) {
      if (!p.ended) p.sizeHistory.push({ year: world.year, size: p.regions.length, pop: p.population });
    }
  }
}

function pickFlavor(world, key) {
  const pool = world.pack.flavor && world.pack.flavor[key];
  if (!pool || !pool.length) return null;
  return world.rng.pick(pool);
}

function eraIndex(pack, eraId) {
  for (let i = 0; i < pack.eras.length; i++) if (pack.eras[i].id === eraId) return i;
  return 0;
}

function eligible(world, def, ctx, subjectKey) {
  const pack = world.pack;
  if (def.minEra && eraIndex(pack, world.era) < eraIndex(pack, def.minEra)) return false;
  if (def.maxEra && eraIndex(pack, world.era) > eraIndex(pack, def.maxEra)) return false;
  if (def.cooldown) {
    const key = def.id + "|" + subjectKey;
    const last = world._cooldowns[key];
    if (last != null && world.year - last < def.cooldown) return false;
  }
  if (typeof def.test === "function") {
    try { if (!def.test(ctx)) return false; } catch (e) { return false; }
  }
  return true;
}

function fireOne(world, scope, subject) {
  const defs = world.pack.events.filter(function (d) { return (d.scope || "polity") === scope; });
  if (!defs.length) return;
  const ctx = makeCtx(world, subject);
  const subjectKey = subject ? (subject.obj.id || "w") : "w";

  const ok = defs.filter(function (d) { return eligible(world, d, ctx, subjectKey); });
  if (!ok.length) return;

  const def = world.rng.weighted(ok, function (d) { return d.weight || 1; });
  if (!def) return;

  let out = null;
  try { out = def.run(ctx); }
  catch (e) { console.warn("[aeon] event '" + def.id + "' threw:", e); return; }
  if (!out) return;

  if (def.cooldown) world._cooldowns[def.id + "|" + subjectKey] = world.year;
  recordEvent(world, def.id, out);
}

AEON.tick = function (world) {
  if (world.year >= world.endYear) return false;
  world.year += world.timeStep;
  updateEra(world);
  baselineTick(world);

  const alive = living(world);
  const rng = world.rng;

  /* A per-turn budget keeps chronicles readable however many polities are alive:
     a crowded world gets the same density of history as a sparse one, spread
     across a random selection of its powers. */
  const budget = world.pack.eventsPerTick || 7;
  let fired = 0;
  for (const p of rng.shuffle(alive)) {
    if (fired >= budget) break;
    if (p.ended || !rng.chance(0.6)) continue;
    fireOne(world, "polity", { kind: "polity", obj: p });
    fired++;
  }

  let figs = 0;
  for (const p of rng.shuffle(alive)) {
    if (figs >= 2) break;
    if (p.ended || !p.ruler) continue;
    const f = world.figures[p.ruler];
    if (f && rng.chance(0.12)) { fireOne(world, "figure", { kind: "figure", obj: f }); figs++; }
  }

  const worldRolls = 1 + (rng.chance(0.3) ? 1 : 0);
  for (let i = 0; i < worldRolls; i++) {
    if (rng.chance(0.5)) fireOne(world, "world", null);
  }

  logSettlements(world);

  /* if everyone is gone, let a new polity rise from the ashes */
  if (living(world).length === 0) {
    const spots = world.regions.filter(function (r) { return !r.barren && r.habitability > 0.4; });
    if (spots.length && world.year < world.endYear - world.timeStep * 10) {
      const r = rng.pick(spots);
      const p = spawnPolity(world, r, null);
      recordEvent(world, "refounding", {
        importance: 4, tags: ["founding"], actors: [{ kind: "polity", id: p.id }], regionId: r.id,
        text: "After an interval in which no power was recorded, " + p.name +
              " rose at " + (r.settlement ? r.settlement.name : r.name) + ".",
      });
    }
  }

  return true;
};

AEON.runTo = function (world, targetYear, budgetMs) {
  const t0 = Date.now();
  let ticks = 0;
  while (world.year < Math.min(targetYear, world.endYear)) {
    if (!AEON.tick(world)) break;
    ticks++;
    if (budgetMs && (Date.now() - t0) > budgetMs) break;
  }
  return ticks;
};

AEON.runAll = function (world, onProgress) {
  while (world.year < world.endYear) {
    AEON.tick(world);
    if (onProgress) onProgress(world);
  }
  finish(world);
  return world;
};

function finish(world) {
  for (const id in world.polities) {
    const p = world.polities[id];
    if (!p.ended) p.fate = p.fate || "Still standing when the record ends.";
  }
  recordEvent(world, "record-ends", {
    importance: 5, tags: ["end"],
    text: "Here the record ends. What followed was not written down, or was written down and lost.",
  });
}
AEON.finish = finish;

/* ---------------------------------------------------------- derived info */

/* Memoised: it's read by the status bar every playback frame, and recomputing it
   meant scanning the whole chronicle. Every pass below is linear. */
AEON.summary = function (world) {
  const memo = world._summary;
  if (memo && memo.events === world.chronicle.length && memo.year === world.year) return memo;

  const all = Object.keys(world.polities).map(function (k) { return world.polities[k]; });
  let longest = null, longestSpan = -1, largest = null, largestSize = -1;
  for (const p of all) {
    const span = (p.ended == null ? world.year : p.ended) - p.founded;
    if (span > longestSpan) { longestSpan = span; longest = p; }
    let peak = 0;
    for (const s of p.sizeHistory) if (s.size > peak) peak = s.size;
    if (peak > largestSize) { largestSize = peak; largest = p; }
  }

  const mentions = {};
  const major = [];
  for (const e of world.chronicle) {
    if (e.importance >= 4) major.push(e);
    for (const a of e.actors) if (a.kind === "artifact") mentions[a.id] = (mentions[a.id] || 0) + 1;
  }
  let travelled = null, most = -1;
  for (const id in mentions) if (mentions[id] > most) { most = mentions[id]; travelled = world.artifacts[id] || null; }

  return (world._summary = {
    polities: all.length,
    living: living(world).length,
    figures: Object.keys(world.figures).length,
    artifacts: Object.keys(world.artifacts).length,
    events: world.chronicle.length,
    year: world.year,
    majorEvents: major,
    longestLived: longest,
    largest: largest,
    mostTravelledArtifact: travelled,
    stats: world.stats,
  });
};

})();
