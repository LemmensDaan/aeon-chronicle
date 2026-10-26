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
  def.seedPolities = def.seedPolities || 7;
  /* how many realms the world tends towards: many early, consolidating into a few great ones */
  def.realmsAtStart = def.realmsAtStart || 50;
  def.realmsAtEnd = def.realmsAtEnd || 15;
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
    battleLog: [],            // [year, attackerId, defenderId, attackerMen, defenderMen, regionId|null, attackerWon, atSea, margin 1-3, event index, date]
    sackLog: [],              // [year, regionId, attackerId, victimId|null, "plundered"|"razed"]
    treaties: [],             // { id, kind, a, b, start, end, ended, ... } — see AEON.treaty
    grievanceLog: [],         // [year, fromId, toId, delta, reason] — see AEON.remember
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

  makeProvinces(world);
  seedPolities(world);
  logSettlements(world);
  /* the world sketch (js/sketch.js) has its own random stream: it never changes the history */
  if (AEON.makeSketch) AEON.makeSketch(world);
  return world;
};

/* Provinces: fixed groups of about ten land regions, laid out once when the world is made and
   never changed by history. Their seats are the best sites for settlement (AEON.siteSuitability),
   taken best first at least PROV_GAP regions apart, and every land region belongs to the seat it
   is fewest steps from over land (islands without a seat get their own). Conquest goes by
   provinces: a won battle takes the loser's part of a province, not a single region
   (AEON.provincePart). No randomness, so the history is drawn the same way. */
const PROV_GAP = 3;
function makeProvinces(world) {
  const R = world.regions, W = world.width, prov = new Int32Array(R.length).fill(-1), seeds = [], grid = {};
  const order = R.filter(function (r) { return !r.barren; })
    .map(function (r) { return [AEON.siteSuitability(r, world), r]; })
    .sort(function (a, b) { return b[0] - a[0] || a[1].id - b[1].id; });
  const cellKey = function (x, y) { return Math.floor(((x % W) + W) % W / PROV_GAP) + "," + Math.floor(y / PROV_GAP); };
  for (const e of order) {
    const r = e[1];
    let near = false;
    for (let gx = -1; gx <= 1 && !near; gx++) for (let gy = -1; gy <= 1 && !near; gy++) {
      for (const s of grid[cellKey(r.x + gx * PROV_GAP, r.y + gy * PROV_GAP)] || []) {
        let dx = Math.abs(s.x - r.x); if (dx > W / 2) dx = W - dx;
        if (dx * dx + (s.y - r.y) * (s.y - r.y) < PROV_GAP * PROV_GAP) { near = true; break; }
      }
    }
    if (near) continue;
    seeds.push(r);
    (grid[cellKey(r.x, r.y)] || (grid[cellKey(r.x, r.y)] = [])).push(r);
  }
  const spread = function (from) {
    const q = from.slice();
    for (let i = 0; i < q.length; i++) {
      for (const n of R[q[i]].neighbors || []) {
        const m = R[n];
        if (!m || m.barren || prov[n] >= 0) continue;
        prov[n] = prov[q[i]]; q.push(n);
      }
    }
  };
  seeds.forEach(function (s, i) { prov[s.id] = i; });
  spread(seeds.map(function (s) { return s.id; }));
  for (const r of R) if (!r.barren && prov[r.id] < 0) { prov[r.id] = seeds.length; seeds.push(r); spread([r.id]); }
  world.provinces = seeds.map(function (s, i) { return { id: i, seat: s.id, regions: [] }; });
  for (const r of R) if (prov[r.id] >= 0) { r.province = prov[r.id]; world.provinces[prov[r.id]].regions.push(r.id); }
}
/* the regions of a region's province held by one realm (the region itself first) */
AEON.provincePart = function (world, region, ownerId) {
  const P = world.provinces && region.province != null ? world.provinces[region.province] : null;
  if (!P) return region.owner === ownerId ? [region] : [];
  const out = region.owner === ownerId ? [region] : [];
  for (const rid of P.regions) if (rid !== region.id && world.regions[rid].owner === ownerId) out.push(world.regions[rid]);
  return out;
};
/* how many provinces a realm holds land in */
AEON.provinceCount = function (world, p) {
  const seen = {};
  let n = 0;
  for (const rid of p.regions) { const k = world.regions[rid].province; if (k != null && !seen[k]) { seen[k] = true; n++; } }
  return n;
};
/* up to n regions from a list, each in a different province (the first one kept first) */
AEON.oneEach = function (world, list, n) {
  const seen = {}, out = [];
  for (const r of list) {
    if (out.length >= n) break;
    const k = r.province != null ? r.province : "r" + r.id;
    if (seen[k]) continue;
    seen[k] = true; out.push(r);
  }
  return out;
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
  return Math.max(500, cap * techFactor(world, polity, "growth") * (1 + 0.3 * (polity.prosperity || 0)));
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
      /* a realm under truce or in alliance is no rival while that holds */
      const all = n.concat(hostile.filter(function (h) { return n.indexOf(h) < 0; }));
      return all.filter(function (o) { return !AEON.treatyBetween(world, p, o, "truce") && !AEON.treatyBetween(world, p, o, "alliance"); });
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
    /* where a realm could raise a wonder: only in its capital, without one already, and only if
       it can afford it (AEON.canBuildWonder); a capital that later becomes an ordinary city keeps
       its wonders */
    wonderSite: function (p) {
      if (!p || !AEON.canBuildWonder(world, p)) return null;
      const cap = p.capital != null ? world.regions[p.capital] : null;
      return cap && cap.settlement && AEON.wondersAt(world, cap.id, world.year).length === 0 ? cap : null;
    },
    transfer: function (region, to) { return transferRegion(world, region, to); },
    foundSettlement: function (region, tier) { return foundSettlement(world, region, tier); },
    /* how well a place can hold people (0..1), and the biggest settlement it can hold */
    siteSuitability: function (region) { return AEON.siteSuitability(region, world); },
    maxTier: function (region) { return AEON.maxTier(region, world); },
    /* how many realms the world is heading for now (see AEON.realmCap) */
    realmCap: function () { return AEON.realmCap(world); },
    /* a place to found a settlement among some regions: weighted by suitability, and only where
       one could stand; null if none */
    pickSite: function (regions) {
      const ok = (regions || []).filter(function (r) { return !r.barren && AEON.siteSuitability(r, world) >= 0.12; });
      return ok.length ? rng.weighted(ok, function (r) { const s = AEON.siteSuitability(r, world); return s * s; }) : null;
    },
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

/* How well a place can hold people, 0..1: its habitability (which already counts the biome, rivers
   and coasts), cut hard for ice, mountains, tundra, dry desert and swamp, and cut further the
   higher the ground. Decides how likely a settlement is founded there and how big it may grow
   (AEON.maxTier), so a region's look on the map follows from its land. */
AEON.siteSuitability = function (r, world) {
  if (!r || r.barren) return 0;
  const b = r.biome;
  const biome = b === "ice" ? 0.05 : b === "mountain" ? 0.25 : b === "tundra" ? 0.45
    : b === "desert" ? (r.river ? 0.8 : 0.4) : b === "swamp" ? 0.55 : (b === "forest" || b === "jungle") ? 1.1 : 1;
  const e = Math.max(0, (r.elevation - 0.5) / 0.5);          /* 0 at the shore, 1 on the peaks */
  /* water is where people settle: a river, a sea coast (harbours, fish), a lake shore */
  let water = r.river ? 1.35 : 1;
  if (world) {
    let sea = false, lake = false;
    for (const n of r.neighbors || []) { const q = world.regions[n]; if (q && q.barren) { if (q.lake) lake = true; else sea = true; } }
    water *= (sea ? 1.2 : 1) * (lake ? 1.3 : 1);
  }
  return clamp(r.habitability * biome * water * (1 - 0.7 * e * e) * 1.6, 0, 1);
};
/* the largest settlement a place can grow: a mountain or ice settlement stays a village, poor
   land tops out at a town, and only good land holds a city */
AEON.maxTier = function (r, world) {
  const s = AEON.siteSuitability(r, world);
  return s >= 0.55 ? 4 : s >= 0.36 ? 3 : s >= 0.18 ? 2 : 1;
};

/* How many living realms the world tends towards in its current year: pack.realmsAtStart at the
   beginning, falling to pack.realmsAtEnd at the end. Packs gate splits and secessions on it and
   annex small realms while the world is above it, so many small states consolidate into a few. */
AEON.realmCap = function (world) {
  const p = world.pack, t = clamp((world.year - p.startYear) / Math.max(1, p.endYear - p.startYear), 0, 1);
  return Math.round(p.realmsAtStart - (p.realmsAtStart - p.realmsAtEnd) * t);
};
/* where a polity's capital stood in a year: capitals move (to a conquered greater city, or in a
   struggle at court), and polity.capitalLog records each move */
AEON.capitalAt = function (p, year) {
  const log = p.capitalLog;
  if (!log || !log.length) return p.capital;
  let c = log[0].capital;
  for (const e of log) { if (e.year <= year) c = e.capital; else break; }
  return c;
};

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
  for (const id in world.polities) {
    const p = world.polities[id];
    if (p.ended != null || p.capital == null) continue;
    if (!p.capitalLog) p.capitalLog = [];
    const last = p.capitalLog[p.capitalLog.length - 1];
    if (!last || last.capital !== p.capital) p.capitalLog.push({ year: world.year, capital: p.capital });
  }
  const R = world.regions, obj = world._settleObj;
  for (let i = 0; i < R.length; i++) {
    if (R[i].settlement && R[i].settlement.tier > AEON.maxTier(R[i], world)) R[i].settlement.tier = AEON.maxTier(R[i], world);
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
/* The ruin standing in a region during a year: { tier, name, since } of the last settlement there
   if it has gone (every settlement that goes is destroyed: razed, burned, sacked or blighted) and
   none has been built since, else null. Ruins stay until the place is settled again. */
AEON.ruinAt = function (world, rid, year) {
  const list = settleIndex(world).by[rid];
  if (!list) return null;
  let t = 0, last = 0, since = null;
  for (const e of list) {
    if (e[0] > year) break;
    if (e[2] > 0) last = e[2];
    else if (t > 0) since = e[0];
    t = e[2];
  }
  if (t > 0 || !last || since == null) return null;
  const was = settlementAt(world, rid, since - 1);
  return { tier: last, name: was ? was.name : null, since: since };
};

/* every ruin standing in a year: [{ rid, tier, name, since }], cached for the year (the map asks
   every frame) */
AEON.ruinsAt = function (world, year) {
  const ix = settleIndex(world);
  let c = world._ruins;
  if (c && c.year === year && c.n === ix.n) return c.list;
  const list = [];
  for (const rid in ix.by) { const r = AEON.ruinAt(world, +rid, year); if (r) { r.rid = +rid; list.push(r); } }
  c = { year: year, n: ix.n, list: list };
  Object.defineProperty(world, "_ruins", { value: c, enumerable: false, configurable: true, writable: true });
  return list;
};

/* ------------------------------------------------- war aims and sacks --
   What an attacker wants from a war it is winning (AEON.warAim): to conquer (take the land and
   hold it), to plunder (carry off wealth and people, burn a little, keep no land) or to raze
   (destroy the settlements and leave the land empty, owned by no one). Realm types carry a
   `plunder` factor; temper and the age weigh in (raiding for loot is commoner in early ages).
   Packs can scale the weights (opts.conquer, opts.plunder, opts.raze). Every sack is logged in
   world.sackLog; AEON.sacksAt lists a region's. */
AEON.warAim = function (world, att, def, opts) {
  opts = opts || {};
  const k = typeOf(world, att) || {}, pl = k.plunder == null ? 1 : k.plunder, t = att.traits;
  const early = Math.max(0.6, 1.4 - 0.2 * (att.age || 0));
  const w = {
    conquer: opts.conquer == null ? 1 : opts.conquer,
    plunder: 0.35 * pl * (0.4 + t.aggression) * early * (opts.plunder == null ? 1 : opts.plunder),
    raze: 0.08 * pl * pl * (0.3 + t.aggression) * (opts.raze == null ? 1 : opts.raze),
  };
  return world.rng.weighted(["conquer", "plunder", "raze"], function (x) { return w[x]; });
};
AEON.logSack = logSack;
function logSack(world, region, att, kind) {
  (world.sackLog || (world.sackLog = [])).push([world.year, region.id, att ? att.id : null, region.owner || null, kind]);
  const victim = region.owner && world.polities[region.owner];
  /* the loot: a year's worth of what the place's people make, into the attacker's treasury */
  if (att) att.treasury = (att.treasury || 0) + Math.round((region.population || 0) * 0.0015 * (0.4 + (victim ? victim.tech : att.tech)) * (kind === "razed" ? 2 : 1) + (region.settlement ? region.settlement.tier * 20 : 0));
  if (victim && att) AEON.remember(world, victim, att, kind === "razed" ? -0.4 : -0.25, kind + " " + ((region.settlement && region.settlement.name) || region.name || "a province"));
  /* and shakes what the victim knows (lost knowledge, see forgetTick): the capital or a great city most */
  if (victim) {
    const big = region.id === victim.capital ? 0.25 : region.settlement && region.settlement.tier >= 3 ? 0.1 : 0;
    AEON.techShock(world, victim, (kind === "razed" ? 0.12 : 0.06) + big, "after " + ((region.settlement && region.settlement.name) || region.name || "its towns") + " was " + kind);
  }
}
/* a place plundered: its settlement shrinks a size (a village is burned out and left a ruin),
   and a share of its people are killed or carried off; returns how many */
AEON.plunder = function (world, region, att) {
  logSack(world, region, att, "plundered");
  const s = region.settlement, lost = Math.round((region.population || 0) * 0.4);
  if (s) { if (s.tier <= 1) ruinOf(region); else s.tier--; }
  return lost;
};
/* a place razed: the settlement destroyed and left a ruin, its people gone, and the land left
   to no one */
AEON.raze = function (world, region, att) {
  logSack(world, region, att, "razed");
  const lost = region.population || 0;
  ruinOf(region);
  region.population = 0;
  if (region.owner) transferRegion(world, region, null);
  return lost;
};
function ruinOf(region) {
  if (!region.settlement) return;
  region.ruinName = region.settlement.name;
  region.settlement = null;
  if (region.features.indexOf("ruins") < 0) region.features.push("ruins");
}
/* a region's sacks up to a year: [{ year, by, victim, kind }], oldest first */
AEON.sacksAt = function (world, rid, year) {
  const out = [];
  for (const e of world.sackLog || []) if (e[1] === rid && e[0] <= year) out.push({ year: e[0], by: e[2], victim: e[3], kind: e[4] });
  return out;
};

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
    tier: clamp(tier || 1, 1, AEON.maxTier(region, world)),
    founded: world.year,
  };
  /* built on the ruins of an older place, which it remembers (the "ruins" feature stays for the
     packs: it marks a site for digging) */
  if (region.ruinName) region.settlement.onRuins = region.ruinName;
  return region.settlement;
}

function endPolity(world, polity, fate) {
  if (!polity || polity.ended) return;
  polity.ended = world.year;
  polity.fate = fate || "It ended without record of how.";
  endTreatiesOf(world, polity);
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
    const capThen = AEON.capitalAt(p, year);
    pv.capital = owners[capThen] === id ? capThen : (first[id] !== undefined ? first[id] : capThen);
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
   successor keeps its parent's age, and is marked as its heir in p.heirOf), or, founded on empty
   land, from half the median of the realms then living. */
function inheritLearning(world, p, alive) {
  const log = world.ownerLog, want = {};
  let left = 0, best = -1;
  for (const r of p.regions) { want[r] = true; left++; }
  for (let i = log.length - 1, n = 0; i >= 0 && left > 0 && n < 50000; i--, n++) {
    const e = log[i];
    if (!want[e[1]] || e[2] === p.id || e[2] == null) continue;
    want[e[1]] = false; left--;
    const prev = world.polities[e[2]];
    if (prev && prev.learning != null && prev.learning > best) { best = prev.learning; p.heirOf = prev.id; }
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
    p.lostSinceAge = 0;
  }
}

/* --------------------------------------------------------- realm types --
   The form of state a realm has in its age (pack.realmTypes), which it can grow into and out of:
   a kingdom grown large becomes an empire, a coastal league with a strong fleet a thalassocracy,
   the heirs of a broken realm successor or warlord states. Each type is open in a span of ages
   (`ages: [first, last]`), optionally only to some kinds (`families`: archetype ids; the
   archetype stays the realm's kind), and scores how well it fits a realm (`fit(s)`, s from
   typeFacts; 0 or less: not open). Every tick a realm takes the best fit, keeping its current
   type while that stays close (within 0.5) or for its first 30 years. Types carry `army`,
   `navy`, `expansion` and `plunder` factors (default 1) and a one-off trait `shift`; a change
   is logged in p.typeLog and recorded as an event (`rise`: its sentence; {N} the realm, {aF} / {F}
   the type it was with and without "a", {aT} / {T} the new one). */
function typeFacts(world, p) {
  let coast = 0, cities = 0;
  for (const id of p.regions) {
    const r = world.regions[id];
    if (!r) continue;
    if (onSea(world, r)) coast++;
    if (r.settlement && r.settlement.tier >= 3) cities++;
  }
  const n = Math.max(1, p.regions.length), t = p.traits, years = world.year - p.founded;
  /* size against the realms of its day: rel (times the median realm) and rank (1: the largest) */
  let c = world._sizes;
  if (!c || c.year !== world.year) {
    const v = living(world).map(function (q) { return q.regions.length; }).sort(function (a, b) { return a - b; });
    c = world._sizes = { year: world.year, v: v, med: Math.max(1, v.length ? v[v.length >> 1] : 1) };
  }
  let rank = 1;
  for (let i = c.v.length - 1; i >= 0 && c.v[i] > p.regions.length; i--) rank++;
  return { p: p, age: p.age || 0, family: p.archetypeId, regions: p.regions.length, rel: p.regions.length / c.med, rank: rank,
    coast: coast / n, cities: cities,
    navy: fullNavy(world, p), army: fullArmy(world, p), years: years, heir: p.heirOf != null && years <= 80,
    piety: t.piety, aggression: t.aggression, stability: t.stability, curiosity: t.curiosity, cunning: t.cunning };
}
function typeOf(world, p) {
  const T = world.pack.realmTypes;
  if (!T || !p.typeId) return null;
  for (const t of T) if (t.id === p.typeId) return t;
  return null;
}
function anA(s) { return (/^[aeiou]/i.test(s) ? "an " : "a ") + s; }
function chooseType(world, p) {
  const T = world.pack.realmTypes;
  if (!T || !T.length) return;
  const s = typeFacts(world, p);
  let best = null, bf = 0, cur = null, cf = 0;
  for (const t of T) {
    if (s.age < t.ages[0] || s.age > t.ages[1]) continue;
    if (t.families && t.families.indexOf(s.family) < 0) continue;
    const f = t.fit(s);
    if (t.id === p.typeId) { cur = t; cf = f > 0 ? f : 0; }
    if (f > 0 && f > bf) { best = t; bf = f; }
  }
  /* the type it has is kept while it still fits nearly as well as the best, for its first 30
     years, and for 50 years after it stops fitting at all (no flickering at a threshold); a
     type that is no longer open in the realm's age or to its kind goes at once */
  if (cur && cf > 0) p.typeMiss = null;
  else if (cur && p.typeMiss == null) p.typeMiss = world.year;
  if (!best || best === cur) return;
  if (cur && (cf >= bf - 0.5 || world.year - p.typeSince < 30 || (cf === 0 && world.year - p.typeMiss < 50))) return;
  const was = typeOf(world, p);
  p.typeId = best.id; p.typeName = best.name; p.typeSince = world.year; p.typeMiss = null;
  (p.typeLog || (p.typeLog = [])).push({ year: world.year, type: best.id });
  if (best.shift) for (const k in best.shift) p.traits[k] = clamp(p.traits[k] + best.shift[k], 0.02, 0.98);
  if (!was) return;
  const text = (best.rise || "{N}, until then {aF}, was now {aT}.").replace(/\{N\}/g, p.name.replace(/^The /, "the "))
    .replace(/\{aF\}/g, anA(was.name.toLowerCase())).replace(/\{F\}/g, was.name.toLowerCase())
    .replace(/\{aT\}/g, anA(best.name.toLowerCase())).replace(/\{T\}/g, best.name.toLowerCase());
  recordEvent(world, "realm-transformed", { importance: best.importance || 2, tags: ["transformation", "type:" + best.id],
    actors: [{ kind: "polity", id: p.id }], regionId: p.capital, text: text.charAt(0).toUpperCase() + text.slice(1) });
}
/* the type a realm had in a year: the type object, or null */
AEON.typeAt = function (world, p, year) {
  const L = p.typeLog, T = world.pack.realmTypes;
  if (!L || !L.length || !T) return null;
  let e = L[0];
  for (const x of L) { if (x.year <= year) e = x; else break; }
  for (const t of T) if (t.id === e.type) return t;
  return null;
};

/* ------------------------------------------------------------ diplomacy --
   How realms stand with one another, the same for every pack. p.relations[q.id] (-1 hostile to 1
   friendly, kept equal both ways) is set by the packs' events; here it gains a memory:
   - treaties (world.treaties): "war", "truce", "peace", "alliance", "tribute" (a pays b), "trade"
     and "marriage", each with a start and an end (AEON.treaty, AEON.endTreaty; read with
     AEON.treatyBetween and AEON.treatiesOf). One made with `until` lapses that year; a realm's
     open treaties end when it falls.
   - grievances and favours (world.grievanceLog): what one realm did to another and why, which
     moves their relation (AEON.remember).
   - drift: every tick a relation moves back toward its resting level, half the way in 60 years.
     Neighbours rub (-0.1); realms of one kind (+0.1) or one culture (+0.1) warm to each other; an
     alliance (+0.5) or a marriage (+0.2) holds it up; a pack can add its own reasons
     (pack.relationBase(world, a, b), such as a shared faith). A war holds it where it is. */
const DRIFT_HALF = 60;
function pairKey(a, b) { return a < b ? a + "|" + b : b + "|" + a; }
AEON.treaty = function (world, kind, a, b, extra) {
  world._ids.treaty = (world._ids.treaty || 0) + 1;
  /* a war declared during a truce breaks it; one between allies betrays the alliance */
  if (kind === "war") {
    const truce = AEON.treatyBetween(world, a, b, "truce");
    if (truce) { AEON.endTreaty(world, truce, "broken"); AEON.remember(world, b, a, -0.3, "broke the truce of " + truce.start); }
    const pact = AEON.treatyBetween(world, a, b, "alliance");
    if (pact) { AEON.endTreaty(world, pact, "betrayed"); AEON.remember(world, b, a, -0.5, "betrayed their alliance"); betrayalNote(world, a, b); }
  }
  const t = { id: "t" + world._ids.treaty, kind: kind, a: a.id, b: b.id, start: world.year, end: null, ended: null, ev: world.chronicle.length };
  if (extra) for (const k in extra) t[k] = extra[k];
  (world.treaties || (world.treaties = [])).push(t);
  const ix = openIndex(world), k = pairKey(t.a, t.b);
  ix[k + "|" + kind] = t; ix[k + "|*"] = t;
  if (kind === "tribute") ix["lord|" + t.a] = t;
  if (kind === "war" && !t.joined) callToArms(world, t, a, b);
  return t;
};
AEON.endTreaty = function (world, t, how) {
  if (!t || t.end != null) return;
  t.end = world.year; t.ended = how || null; t.endEv = world.chronicle.length;
  /* the pair's next open treaty, if any, takes its place in the index */
  const ix = openIndex(world), k = pairKey(t.a, t.b), T = world.treaties;
  if (ix[k + "|" + t.kind] === t) { ix[k + "|" + t.kind] = null; for (let i = T.length - 1; i >= 0; i--) if (T[i].end == null && T[i].kind === t.kind && pairKey(T[i].a, T[i].b) === k) { ix[k + "|" + t.kind] = T[i]; break; } }
  if (ix[k + "|*"] === t) { ix[k + "|*"] = null; for (let i = T.length - 1; i >= 0; i--) if (T[i].end == null && pairKey(T[i].a, T[i].b) === k) { ix[k + "|*"] = T[i]; break; } }
  if (ix["lord|" + t.a] === t) { ix["lord|" + t.a] = null; for (let i = T.length - 1; i >= 0; i--) if (T[i].end == null && T[i].kind === "tribute" && T[i].a === t.a) { ix["lord|" + t.a] = T[i]; break; } }
};
/* the open treaty of a kind between two realms (any kind if kind is null), or null */
/* the open treaties, by pair and kind ("a|b|kind", and "a|b|*" for the latest of any kind), kept
   up to date as treaties are made and ended */
function openIndex(world) {
  let ix = world._openIx;
  if (!ix) {
    ix = {};
    for (const t of world.treaties || []) if (t.end == null) { const k = pairKey(t.a, t.b); ix[k + "|" + t.kind] = t; ix[k + "|*"] = t; if (t.kind === "tribute") ix["lord|" + t.a] = t; }
    Object.defineProperty(world, "_openIx", { value: ix, enumerable: false, configurable: true, writable: true });
  }
  return ix;
}
AEON.treatyBetween = function (world, a, b, kind) {
  return openIndex(world)[pairKey(a.id, b.id) + "|" + (kind == null ? "*" : kind)] || null;
};
/* a realm's treaties in force during a year (every one it ever made if year is null) */
AEON.treatiesOf = function (world, p, year) {
  return (world.treaties || []).filter(function (t) {
    return (t.a === p.id || t.b === p.id) && (year == null || (t.start <= year && (t.end == null || t.end > year)));
  });
};
/* a realm remembers what another did to it: delta moves their relation (negative a grievance,
   positive a favour), and the reason is kept */
AEON.remember = function (world, from, to, delta, reason) {
  if (!from || !to || from === to) return;
  const v = clamp((from.relations[to.id] || 0) + delta, -1, 1);
  from.relations[to.id] = v; to.relations[from.id] = v;
  (world.grievanceLog || (world.grievanceLog = [])).push([world.year, from.id, to.id, delta, reason || null]);
};
/* what two realms remember of each other up to a year: [{ year, from, to, delta, reason }], newest first */
AEON.memoriesBetween = function (world, a, b, year) {
  const out = [], L = world.grievanceLog || [];
  for (let i = L.length - 1; i >= 0; i--) {
    const e = L[i];
    if (year != null && e[0] > year) continue;
    if ((e[1] === a.id && e[2] === b.id) || (e[1] === b.id && e[2] === a.id)) out.push({ year: e[0], from: e[1], to: e[2], delta: e[3], reason: e[4] });
  }
  return out;
};
/* ---- wars: short, scored, ended by peace and a truce ----
   A war's score (AEON.warScore, -1..1, for its side a): battles won by their margin, and land
   taken, raids and sacks remembered since it began. Every tick each open war may end, the more
   likely the more one-sided it is and the longer it has run; one 8 years old ends, so none
   outlasts about 10 years. Ending it is
   the pack's peace event (pack.peaceEvent, default "peace-treaty"), run for side a with ctx.war
   and ctx.warScore set, which sets the terms; then a truce of 20-40 years. */
function firstFrom(list, y, at) {
  let lo = 0, hi = list.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (at(list[m]) < y) lo = m + 1; else hi = m; }
  return lo;
}
AEON.warScore = function (world, t) {
  let raw = 0;
  const B = world.battleLog || [];
  for (let i = firstFrom(B, t.start, function (e) { return e[0]; }); i < B.length; i++) {
    const e = B[i];
    if (!((e[1] === t.a && e[2] === t.b) || (e[1] === t.b && e[2] === t.a))) continue;
    const aWon = (e[1] === t.a) === !!e[6];
    raw += (aWon ? 1 : -1) * (e[8] || 1);
  }
  const G = world.grievanceLog || [];
  for (let i = firstFrom(G, t.start, function (e) { return e[0]; }); i < G.length; i++) {
    const e = G[i];
    if (e[3] >= 0) continue;
    if (e[1] === t.b && e[2] === t.a) raw += 1.5;        /* b holds a grievance against a: a gained */
    else if (e[1] === t.a && e[2] === t.b) raw -= 1.5;
  }
  return raw / (Math.abs(raw) + 3);
};
/* a coalition's campaign: every tick each member at war with the giant fights a battle on their
   border (if they share one), and a win takes one or two of the giant's provinces */
function campaign(world) {
  const rng = world.rng, R = world.regions;
  for (const t of (world.treaties || []).filter(function (x) { return x.kind === "war" && x.coalition && x.end == null; })) {
    const a = world.polities[t.a], H = world.polities[t.b];
    if (!a || !H || a.ended || H.ended) continue;
    const fr = [];
    for (const rid of H.regions) if (R[rid].neighbors.some(function (n) { return R[n] && R[n].owner === a.id; })) fr.push(R[rid]);
    if (!fr.length) continue;
    /* each side's army is split over the wars it is fighting, as in the packs' battles */
    let wa = 0, wh = 0;
    for (const x of world.treaties) if (x.kind === "war" && x.end == null) { if (x.a === a.id || x.b === a.id) wa++; if (x.a === H.id || x.b === H.id) wh++; }
    const site = rng.pick(fr), o = AEON.battle(world, a, H, { region: site.id, frontier: fr.length, shareA: 1 / Math.max(1, wa), shareD: 1 / Math.max(1, wh) });
    if (!o.won) continue;
    for (const r of AEON.oneEach(world, [site].concat(rng.shuffle(fr.filter(function (x) { return x !== site; }))), Math.min(2, o.take))) {
      if (r.owner !== H.id || H.ended) continue;
      AEON.remember(world, H, a, -0.15, "took " + (r.name || "a province"));
      for (const x of AEON.provincePart(world, r, H.id)) transferRegion(world, x, a);
    }
  }
}
function warClock(world) {
  campaign(world);
  const T = world.treaties || [], rng = world.rng;
  const open = T.filter(function (t) { return t.kind === "war" && t.end == null; });
  for (const t of open) {
    if (t.end != null) continue;
    const a = world.polities[t.a], b = world.polities[t.b];
    if (!a || !b || a.ended || b.ended) { AEON.endTreaty(world, t, "fall"); continue; }
    const years = world.year - (t.startDate != null ? t.startDate : t.start), sc = AEON.warScore(world, t);
    const lead = t.leader && (world.treaties || []).filter(function (x) { return x.id === t.leader; })[0];
    const chance = years >= 8 || (lead && lead.end != null) ? 1 : 0.3 + 0.6 * Math.abs(sc) + (years >= 4 ? 0.35 : 0);
    if (!rng.chance(chance)) continue;
    concludePeace(world, t, sc);
  }
}
function concludePeace(world, t, sc) {
  t.score = Math.round(sc * 100) / 100;                  /* for the war's page: + favours side a */
  const a = world.polities[t.a], b = world.polities[t.b];
  const id = world.pack.peaceEvent || "peace-treaty";
  const def = (world.pack.events || []).filter(function (d) { return d.id === id; })[0];
  let out = null;
  if (def) {
    const ctx = makeCtx(world, { kind: "polity", obj: a });
    ctx.war = t; ctx.warScore = sc;
    try { out = def.run(ctx); } catch (e) { console.warn("[aeon] peace for " + t.id + " threw:", e); }
  }
  if (out) recordEvent(world, id, out);
  else recordEvent(world, "peace", { importance: 2, tags: ["peace"], actors: [{ kind: "polity", id: a.id }, { kind: "polity", id: b.id }], regionId: a.capital,
    text: a.name + " and " + b.name.replace(/^The /, "the ") + " made peace." });
  if (t.end == null) AEON.endTreaty(world, t, "peace");
  AEON.makeTruce(world, a, b);
  /* a giant that loses the war a coalition led against it breaks apart */
  if (t.coalition && !t.joined && sc >= 0.25 && !b.ended) breakUp(world, b, a);
}
/* The far provinces of a beaten giant break away: about a third of its provinces, the ones farthest
   from its capital, gathered round two or three of the farthest, each group a realm of its own
   (heirs of the giant: successor or warlord states, core.js realm types), hostile to it. */
function breakUp(world, H, victor) {
  const R = world.regions, cap = R[H.capital], W = world.width;
  const far = function (r) { let dx = Math.abs(r.x - cap.x); if (dx > W / 2) dx = W - dx; return dx * dx + (r.y - cap.y) * (r.y - cap.y); };
  const provs = {};
  for (const rid of H.regions) { const r = R[rid], k = r.province != null ? r.province : "r" + rid; (provs[k] || (provs[k] = [])).push(r); }
  const list = Object.keys(provs).map(function (k) { const rs = provs[k]; return { rs: rs, d: far(rs[0]), at: rs[0] }; })
    .filter(function (pv) { return pv.rs.every(function (r) { return r.id !== H.capital; }); })
    .sort(function (x, y) { return y.d - x.d; });
  const n = Math.floor(list.length / 3);
  if (n < 2) return;
  const lost = list.slice(0, n), seeds = [lost[0]];
  for (const pv of lost) {
    if (seeds.length >= Math.min(3, Math.ceil(n / 3))) break;
    if (seeds.every(function (s2) { let dx = Math.abs(s2.at.x - pv.at.x); if (dx > W / 2) dx = W - dx; return dx * dx + (s2.at.y - pv.at.y) ** 2 > 400; })) seeds.push(pv);
  }
  const groups = seeds.map(function () { return []; });
  for (const pv of lost) {
    let best = 0, bd = Infinity;
    seeds.forEach(function (s2, i) { let dx = Math.abs(s2.at.x - pv.at.x); if (dx > W / 2) dx = W - dx; const d = dx * dx + (s2.at.y - pv.at.y) ** 2; if (d < bd) { bd = d; best = i; } });
    groups[best].push(pv);
  }
  const born = [];
  let moved = 0;
  for (const g of groups) {
    const regs = [].concat.apply([], g.map(function (pv) { return pv.rs; })).filter(function (r) { return r.owner === H.id; });
    if (!regs.length) continue;
    regs.sort(function (x, y) { return ((y.settlement && y.settlement.tier) || 0) - ((x.settlement && x.settlement.tier) || 0); });
    transferRegion(world, regs[0], null);
    const np = spawnPolity(world, regs[0], H.archetypeId);
    for (let i = 1; i < regs.length; i++) transferRegion(world, regs[i], np);
    const share = regs.length / Math.max(1, H.regions.length + regs.length);
    np.population = Math.max(600, Math.round(H.population * share));
    H.population = Math.max(60, H.population - np.population);
    np.tech = H.tech * 0.95;
    np.relations[H.id] = H.relations[np.id] = -0.6;
    moved += regs.length;
    born.push(np);
  }
  if (!born.length) return;
  H.traits.stability = clamp(H.traits.stability - 0.1, 0.02, 0.98);
  recordEvent(world, "empire-breaks-up", { importance: 5, tags: ["coalition", "breakup", "territory", "split"],
    actors: [{ kind: "polity", id: H.id }, { kind: "polity", id: victor.id }].concat(born.map(function (q) { return { kind: "polity", id: q.id }; })), regionId: H.capital,
    text: "Beaten by the coalition that " + victor.name.replace(/^The /, "the ") + " had led against it, " + H.name.replace(/^The /, "the ") + " could no longer hold its far provinces: " +
      born.map(function (q) { return q.name; }).join(", ").replace(/, ([^,]*)$/, " and $1") + " broke away as realms of their own, taking " + moved + " regions with them." });
}
/* a truce of 20-40 years after a war, unless one is already in force or a side has fallen */
AEON.makeTruce = function (world, a, b) {
  if (!a || !b || a.ended || b.ended || AEON.treatyBetween(world, a, b, "truce")) return null;
  return AEON.treaty(world, "truce", a, b, { until: world.year + 20 + 5 * world.rng.int(0, 4) });
};
/* how long a war that is ending has lasted, in years (to the half year): from the date it began,
   or, for one begun in this very tick, a season to a few years; kept as t.years */
AEON.warLength = function (world, t) {
  if (!t) return null;
  if (t.years == null) {
    const from = t.startDate != null ? t.startDate : world.year - world.timeStep * world.rng.range(0.1, 0.6);
    t.years = Math.min(10, Math.max(0.3, Math.round((world.year - world.rng.range(0, 2) - from) * 2) / 2));
  }
  return t.years;
};
/* the dates of a tick's events: spread evenly through its years, in the order they happened,
   to the month (ev.date, a fractional year; ev.year stays the tick's); treaties take the dates of
   the events that made and ended them, and a war its length in years */
function dateTick(world, from) {
  const C = world.chronicle, n = C.length - from, y0 = world.year - world.timeStep;
  for (let i = from; i < C.length; i++) C[i].date = Math.round((y0 + (i - from + 1) / (n + 1) * world.timeStep) * 12) / 12;
  const dateOf = function (k) { return k != null && C[k] && C[k].year === world.year ? C[k].date : null; };
  /* a battle takes the date of the event it came before (or after, at the end of the tick) */
  const B = world.battleLog || [];
  for (let i = B.length - 1; i >= 0 && B[i][0] === world.year; i--) {
    const k = B[i][9];
    B[i][10] = dateOf(k) != null ? dateOf(k) : dateOf(k - 1) != null ? dateOf(k - 1) : world.year;
  }
  for (const t of world.treaties || []) {
    if (t.start === world.year && t.startDate == null) t.startDate = dateOf(t.ev) != null ? dateOf(t.ev) : world.year;
    if (t.end === world.year && t.endDate == null) {
      t.endDate = t.kind === "war" && t.years != null ? Math.round((t.startDate + t.years) * 12) / 12
        : Math.max(t.startDate || t.start, dateOf(t.endEv) != null ? dateOf(t.endEv) : world.year);
      if (t.kind === "war" && t.years == null) t.years = Math.min(10, Math.round((t.endDate - t.startDate) * 10) / 10);
    }
  }
}

/* ---- alliances, calls to arms, coalitions ----
   Allies are bound to defend each other: when a realm is attacked, each of its allies is called to
   arms and joins (a war of its own against the attacker, `joined` and led by the first, ending
   when that one does) if it likes the attacked better than the attacker and is not bound to the
   attacker too; refusing is remembered and may break the alliance. A threatened realm (a stronger,
   hostile neighbour) seeks an ally among friendly neighbours. A realm grown far beyond all others
   (four times the median realm and twice the next) draws a coalition of its uneasy neighbours,
   who ally and go to war against it together, at most once a century. An alliance whose two sides
   have come to dislike each other lapses. A pack joins a realm to a war with
   pack.joinWar(ctx, ally, enemy, extra), so its own war records are kept (default: a war treaty). */
function alliesOf(world, p) {
  const out = [];
  for (const t of world.treaties || []) {
    if (t.end != null || t.kind !== "alliance" || (t.a !== p.id && t.b !== p.id)) continue;
    const o = world.polities[t.a === p.id ? t.b : t.a];
    if (o && !o.ended && out.indexOf(o) < 0) out.push(o);
  }
  return out;
}
AEON.alliesOf = alliesOf;
function joinWar(world, ally, enemy, extra) {
  if (AEON.treatyBetween(world, ally, enemy, "war")) return;
  extra = Object.assign({ joined: true }, extra);
  if (world.pack.joinWar) world.pack.joinWar(makeCtx(world, { kind: "polity", obj: ally }), ally, enemy, extra);
  else AEON.treaty(world, "war", ally, enemy, extra);
  if (!AEON.treatyBetween(world, ally, enemy, "war")) AEON.treaty(world, "war", ally, enemy, extra);
}
function nameOf(p) { return p.name.replace(/^The /, "the "); }
function callToArms(world, t, att, def) {
  /* a vassal owes its lord its troops, in the lord's wars of attack as well as defence (a war of
     its own, unrecorded in the chronicle: it is what vassals do) */
  for (const v of AEON.vassalsOf(world, att).concat(AEON.vassalsOf(world, def))) {
    const lord = AEON.lordOf(world, v), foe = lord === att ? def : att;
    if (v === foe || AEON.treatyBetween(world, v, foe, "alliance")) continue;
    joinWar(world, v, foe, { leader: t.id, levy: true, cause: "its duty to " + nameOf(lord) });
  }
  /* and a lord defends its vassal, being paid to */
  const lord = AEON.lordOf(world, def);
  if (lord && lord !== att && !AEON.treatyBetween(world, lord, att, "alliance") && world.rng.chance(0.8)) {
    joinWar(world, lord, att, { leader: t.id, cause: "the defence of " + nameOf(def) });
    recordEvent(world, "lord-defends", { importance: 2, tags: ["war", "vassal", "diplomacy"],
      actors: [{ kind: "polity", id: lord.id }, { kind: "polity", id: def.id }, { kind: "polity", id: att.id }], regionId: lord.capital,
      text: nameOf(lord).charAt(0).toUpperCase() + nameOf(lord).slice(1) + " took up the defence of its vassal " + nameOf(def) + " and went to war against " + nameOf(att) + "." });
  }
  for (const ally of alliesOf(world, def)) {
    if (ally === att) continue;
    /* bound to the attacker by an alliance it will not march; a truce with it only makes it slower to */
    const bound = AEON.treatyBetween(world, ally, att, "alliance");
    const keen = (ally.relations[def.id] || 0) - (ally.relations[att.id] || 0) + (ally.traits.aggression - 0.5) * 0.4 - (AEON.treatyBetween(world, ally, att, "truce") ? 0.3 : 0);
    /* a coalition's members stand together against the realm they allied against */
    const sworn = AEON.treatyBetween(world, ally, def, "alliance");
    if (!bound && (keen > 0.2 || (sworn && (sworn.coalition === att.id || sworn.against === att.id)))) {
      joinWar(world, ally, att, { leader: t.id, cause: "the call of " + nameOf(def) });
      AEON.remember(world, def, ally, 0.2, "answered its call to arms");
      recordEvent(world, "call-to-arms", { importance: 3, tags: ["war", "alliance", "diplomacy"],
        actors: [{ kind: "polity", id: ally.id }, { kind: "polity", id: def.id }, { kind: "polity", id: att.id }], regionId: ally.capital,
        text: ally.name + " answered the call of its ally " + nameOf(def) + " and went to war against " + nameOf(att) + "." });
    } else {
      AEON.remember(world, def, ally, -0.3, "refused its call to arms");
      const pact = AEON.treatyBetween(world, ally, def, "alliance");
      const broke = pact && world.rng.chance(0.5);
      if (broke) AEON.endTreaty(world, pact, "refused");
      recordEvent(world, "call-refused", { importance: 2, tags: ["alliance", "diplomacy"],
        actors: [{ kind: "polity", id: ally.id }, { kind: "polity", id: def.id }], regionId: ally.capital,
        text: ally.name + " was called to arms by its ally " + nameOf(def) + " against " + nameOf(att) + " and did not come" +
          (bound ? ", being bound to " + nameOf(att) + " as well." : ".") + (broke ? " The alliance did not survive the refusal." : "") });
    }
  }
}
function betrayalNote(world, a, b) {
  recordEvent(world, "alliance-betrayed", { importance: 3, tags: ["war", "alliance", "betrayal", "diplomacy"],
    actors: [{ kind: "polity", id: a.id }, { kind: "polity", id: b.id }], regionId: b.capital,
    text: a.name + " turned on its ally " + nameOf(b) + "; the alliance between them was not spoken of again except as a warning." });
}
function strengthOf(world, p) { return Math.max(1, AEON.fieldArmy(world, p)) * (0.5 + p.tech); }
function allianceTick(world, alive) {
  const rng = world.rng;
  /* alliances lapse when the two have come to dislike each other */
  for (const t of world.treaties || []) {
    if (t.end != null || t.kind !== "alliance") continue;
    const a = world.polities[t.a];
    if (a && (a.relations[t.b] || 0) < -0.2) AEON.endTreaty(world, t, "estranged");
  }
  /* the threatened seek allies */
  for (const p of alive) {
    if (p.ended || !rng.chance(0.08)) continue;
    const near = neighborPolities(world, p), me = strengthOf(world, p);
    const threat = near.filter(function (q) { return (p.relations[q.id] || 0) < -0.3 && strengthOf(world, q) > me * 1.2; })
      .sort(function (x, y) { return strengthOf(world, y) - strengthOf(world, x); })[0];
    if (!threat) continue;
    const friend = near.concat(neighborPolities(world, threat)).filter(function (q) {
      return q !== p && q !== threat && !q.ended && (p.relations[q.id] || 0) >= 0.05 && !AEON.treatyBetween(world, p, q, "alliance") && !AEON.treatyBetween(world, p, q, "war") && !AEON.treatyBetween(world, q, threat, "alliance");
    }).sort(function (x, y) { return (p.relations[y.id] || 0) - (p.relations[x.id] || 0); })[0];
    if (!friend) continue;
    AEON.treaty(world, "alliance", p, friend, { against: threat.id, until: world.year + 40 + 10 * rng.int(0, 4) });
    AEON.remember(world, p, friend, 0.2, "swore a defensive alliance with it");
    recordEvent(world, "alliance", { importance: 3, tags: ["alliance", "diplomacy"],
      actors: [{ kind: "polity", id: p.id }, { kind: "polity", id: friend.id }, { kind: "polity", id: threat.id }], regionId: p.capital,
      text: "Fearing " + nameOf(threat) + ", " + nameOf(p) + " and " + nameOf(friend) + " swore to defend each other, each promising to march if the other were attacked." });
  }
  /* a coalition against a realm grown far beyond all others */
  const big = alive.filter(function (p) { return !p.ended; }).sort(function (x, y) { return y.regions.length - x.regions.length; });
  if (big.length < 3) return;
  const H = big[0], sizes = big.map(function (p) { return p.regions.length; }), med = sizes[sizes.length >> 1];
  if (H.regions.length < 4 * med || H.regions.length < 2 * big[1].regions.length) return;
  if (H.coalitionYear != null && world.year - H.coalitionYear < 100) return;
  if (!rng.chance(0.25)) return;
  const members = neighborPolities(world, H).filter(function (q) {
    return (q.relations[H.id] || 0) < 0.2 && !AEON.treatyBetween(world, q, H, "alliance") && !AEON.treatyBetween(world, q, H, "truce") && !AEON.treatyBetween(world, q, H, "tribute");
  }).sort(function (x, y) { return strengthOf(world, y) - strengthOf(world, x); }).slice(0, 5);
  if (members.length < 2) return;
  H.coalitionYear = world.year;
  const lead = members[0];
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++)
    if (!AEON.treatyBetween(world, members[i], members[j], "alliance")) AEON.treaty(world, "alliance", members[i], members[j], { coalition: H.id, until: world.year + 30 });
  recordEvent(world, "coalition", { importance: 4, tags: ["war", "alliance", "coalition", "diplomacy"],
    actors: [{ kind: "polity", id: H.id }].concat(members.map(function (q) { return { kind: "polity", id: q.id }; })), regionId: lead.capital,
    text: "Alarmed at the size of " + nameOf(H) + ", which now held " + H.regions.length + " provinces, " + members.map(nameOf).join(", ").replace(/, ([^,]*)$/, " and $1") +
      " made common cause against it, and " + nameOf(lead) + " led them to war." });
  joinWar(world, lead, H, { joined: false, coalition: true, cause: "the coalition against " + nameOf(H) });
  const lt = AEON.treatyBetween(world, lead, H, "war");
  for (const q of members.slice(1)) joinWar(world, q, H, { leader: lt && lt.id, coalition: true, cause: "the coalition against " + nameOf(H) });
}

/* ---- vassals ----
   A "tribute" treaty (a pays b) makes a the vassal of b: it pays a share of its income (see the
   economy), sends its levies to its lord's wars and is defended by it (see
   callToArms). After 30 years a vassal a third of its lord's size or less may be absorbed, its land
   passing to the lord without a fight, most readily while the world holds more realms than it is
   heading for. A vassal grown nearly as strong as its lord (0.8 of its field army) after 20 years,
   or whose lord is fighting two wars, may break free, and the lord may go to war over it. A realm has at most one
   lord. */
AEON.lordOf = function (world, p) { const t = p && openIndex(world)["lord|" + p.id]; return t ? world.polities[t.b] || null : null; };
AEON.vassalsOf = function (world, p) {
  const out = [];
  for (const t of world.treaties || []) if (t.end == null && t.kind === "tribute" && t.b === p.id) { const v = world.polities[t.a]; if (v && !v.ended && out.indexOf(v) < 0) out.push(v); }
  return out;
};
/* make a realm the vassal of another (ending any lord it had) */
AEON.makeVassal = function (world, v, lord, extra) {
  const old = AEON.lordOf(world, v);
  if (old === lord) return AEON.treatyBetween(world, v, lord, "tribute");
  if (old) AEON.endTreaty(world, AEON.treatyBetween(world, v, old, "tribute"), "new lord");
  return AEON.treaty(world, "tribute", v, lord, extra);
};

function vassalTick(world) {
  const rng = world.rng, over = living(world).length > AEON.realmCap(world);
  const open = (world.treaties || []).filter(function (t) { return t.end == null && t.kind === "tribute"; });
  for (const t of open) {
    const v = world.polities[t.a], l = world.polities[t.b];
    if (!v || !l || v.ended || l.ended || t.end != null) continue;
    let lordWars = 0;
    for (const x of world.treaties) if (x.end == null && x.kind === "war" && (x.a === l.id || x.b === l.id)) lordWars++;
    if (((world.year - t.start >= 20 && AEON.fieldArmy(world, v) >= 0.8 * AEON.fieldArmy(world, l)) || lordWars >= 2) && rng.chance(0.2)) {
      AEON.endTreaty(world, t, "revolt");
      AEON.remember(world, l, v, -0.4, "threw off its overlordship");
      const war = rng.chance(0.5);
      recordEvent(world, "vassal-breaks-free", { importance: 3, tags: ["vassal", "revolt", "diplomacy"].concat(war ? ["war"] : []),
        actors: [{ kind: "polity", id: v.id }, { kind: "polity", id: l.id }], regionId: v.capital,
        text: v.name + " stopped paying " + nameOf(l) + " after " + (world.year - t.start) + " years as its vassal" +
          (lordWars >= 2 ? ", while its lord had wars enough elsewhere" : ", having grown too strong to be told") + "." +
          (war ? " " + nameOf(l).charAt(0).toUpperCase() + nameOf(l).slice(1) + " went to war to bring it back." : " Its lord let it go.") });
      if (war) joinWar(world, l, v, { joined: false, cause: "the defection of " + nameOf(v) });
      continue;
    }
    if (world.year - t.start >= 30 && v.regions.length * 3 <= l.regions.length && (l.relations[v.id] || 0) > -0.3 && rng.chance(over ? 0.25 : 0.06)) {
      const n = v.regions.length, cap = world.regions[v.capital], seat = cap && (cap.settlement ? cap.settlement.name : cap.name);
      recordEvent(world, "vassal-absorbed", { importance: 4, tags: ["vassal", "annexation", "territory", "fall", "diplomacy"],
        actors: [{ kind: "polity", id: l.id }, { kind: "polity", id: v.id }], regionId: v.capital,
        text: "After " + (world.year - t.start) + " years as its vassal, " + nameOf(v) + " was folded into " + nameOf(l) + ": its " + (n === 1 ? "province was" : n + " provinces were") +
          " governed from " + (world.regions[l.capital].settlement ? world.regions[l.capital].settlement.name : "the lord's capital") + " from then on" + (seat ? ", and " + seat + " became a provincial town" : "") + "." });
      for (const rid of v.regions.slice()) transferRegion(world, world.regions[rid], l);
      v.fate = "Folded into " + l.name + " in " + world.year + " after " + (world.year - t.start) + " years as its vassal.";
    }
  }
}

/* How every living realm stood with one realm (focus) in a year, for the diplomacy map: { id:
   stance } with "self", "war", "lord" (its overlord), "vassal", "alliance", "truce", "friend"
   (trade or marriage) or nothing (neutral). With no focus every realm is neutral. */
AEON.stancesAt = function (world, focusId, year) {
  const out = {}, RANK = { war: 6, lord: 5, vassal: 4, alliance: 3, truce: 2, friend: 1 };
  if (focusId == null) return out;
  const put = function (id, st) { if (!out[id] || RANK[st] > RANK[out[id]]) out[id] = st; };
  for (const t of world.treaties || []) {
    if (t.start > year || (t.end != null && t.end <= year)) continue;
    if (t.a !== focusId && t.b !== focusId) continue;
    const o = t.a === focusId ? t.b : t.a;
    if (t.kind === "war") put(o, "war");
    else if (t.kind === "tribute") put(o, t.a === focusId ? "lord" : "vassal");
    else if (t.kind === "alliance") put(o, "alliance");
    else if (t.kind === "truce") put(o, "truce");
    else if (t.kind === "trade" || t.kind === "marriage") put(o, "friend");
  }
  if (focusId != null) out[focusId] = "self";
  return out;
};

/* an event's date for reading: its season and year ("spring 1203 BC") from ev.date (dateTick), or
   just the year of its tick for events made before dates existed; seasons from pack.seasons
   (winter, spring, summer, autumn by default; months 12-2, 3-5, 6-8, 9-11) */
AEON.dateLabel = function (world, ev) {
  const pack = world.pack, label = function (y) { return pack.yearLabel ? pack.yearLabel(y) : String(y); };
  if (!ev || ev.date == null) return ev ? label(ev.year) : "";
  const y = Math.floor(ev.date), m = Math.floor((ev.date - y) * 12) % 12;
  const S = pack.seasons || ["winter", "spring", "summer", "autumn"];
  return S[m === 11 || m < 2 ? 0 : m < 5 ? 1 : m < 8 ? 2 : 3] + " " + label(y);
};

function endTreatiesOf(world, p) {
  for (const t of world.treaties || []) if (t.end == null && (t.a === p.id || t.b === p.id)) AEON.endTreaty(world, t, "fall");
}
function driftRelations(world, alive) {
  const k = 1 - Math.pow(0.5, world.timeStep / DRIFT_HALF), war = {}, held = {};
  for (const t of world.treaties || []) {
    if (t.end != null) continue;
    if (t.until != null && world.year >= t.until) { AEON.endTreaty(world, t, "lapsed"); continue; }
    const key = pairKey(t.a, t.b);
    if (t.kind === "war") war[key] = true;
    else if (t.kind === "alliance") held[key] = (held[key] || 0) + 0.5;
    else if (t.kind === "marriage") held[key] = (held[key] || 0) + 0.2;
  }
  for (const p of alive) {
    if (p.ended) continue;
    let near = null;
    for (const qid in p.relations) {
      if (!(p.id < qid)) continue;                         /* each pair once */
      const q = world.polities[qid];
      if (!q || q.ended) continue;
      const key = pairKey(p.id, qid);
      if (war[key]) continue;
      if (!near) { near = {}; for (const n of neighborPolities(world, p)) near[n.id] = true; }
      let base = (near[qid] ? -0.1 : 0) + (p.archetypeId === q.archetypeId ? 0.1 : 0) + (p.culture && p.culture === q.culture ? 0.1 : 0) + (held[key] || 0);
      if (world.pack.relationBase) base += world.pack.relationBase(world, p, q) || 0;
      base = clamp(base, -1, 1);
      const v = Math.round((p.relations[qid] + (base - p.relations[qid]) * k) * 1000) / 1000;
      p.relations[qid] = v; q.relations[p.id] = v;
    }
  }
}

/* --------------------------------------------------------------- economy --
   Every realm's yearly income and its treasury, in the pack's currency (pack.currency: { one,
   many }, default talents). Income: what its people make (0.0015 a head a year, times 0.4 + tech,
   times its technologies' wealth factor), its mines and luxuries (the metal and exotic resources
   of its land), its ports (by the size of the town), its trade (each trade treaty adds a twentieth
   of what its people make, at most four), and its vassals' tribute (each pays its lord 15% of its
   income). Upkeep: 0.05 a soldier and 0.8 a ship a year, half again while at war. The balance goes
   into the treasury every tick; what is left after spending (spend()) is capped at three years'
   income (the rest goes on the court). A realm may run into debt up to twice its income; beyond that it cannot pay its soldiers:
   a third of its army leaves, its stability falls and its debts are written down. The treasury
   colours p.wealth (0..1, which the packs read): a full one adds up to 0.15, debt takes up to 0.15
   away. What is above a reserve is spent (see spend()). Income, upkeep and treasury are logged with the size history. */
/* ------------------------------------------------------------ technologies --
   Named discoveries (pack.technologies: { id, name, age, needs: [ids], effects: { army, navy,
   growth, wealth }, verb }). A realm can take up one once it has reached the technology's age and
   knows what it needs. Most are learned from others: each neighbour, trade partner, ally, marriage
   partner, lord or vassal that knows it adds 12% a tick (at most 60%); the first realm to find one
   does so alone, at about 1.5% a tick for a curious realm (only living realms count: what only fallen
   realms knew is found again this way, see lost knowledge below). The first discovery is a chronicle entry (told by
   pack.techStory(world, p, t, "first" | "again" | "relearned" | "learned", since) when the pack has one, which may also tell
   some of the later adoptions); the rest spread quietly (p.techs: id -> year, p.techLog). Effects multiply: army and navy the
   quality of its men and ships in battle, growth the people its land can feed, wealth what its
   people make. Each one also nudges p.tech up a little. */
function contactsOf(world, p) {
  const out = neighborPolities(world, p);
  for (const t of world.treaties || []) {
    if (t.end != null || t.kind === "war" || (t.a !== p.id && t.b !== p.id)) continue;
    const o = world.polities[t.a === p.id ? t.b : t.a];
    if (o && !o.ended && out.indexOf(o) < 0) out.push(o);
  }
  return out;
}
function techTick(world, alive) {
  const T = world.pack.technologies;
  if (!T || !T.length) return;
  forgetTick(world, alive, T);
  const rng = world.rng, known = knownBy(alive, T);
  for (const p of alive) {
    if (p.ended) continue;
    let contacts = null;
    for (const t of T) {
      if (!canLearn(world, p, t, known)) continue;
      let chance;
      if (!known[t.id]) chance = 0.004 + 0.02 * p.traits.curiosity * p.tech;
      else {
        contacts = contacts || contactsOf(world, p);
        let n = 0;
        for (const o of contacts) if (o.techs && o.techs[t.id] != null) n++;
        chance = Math.min(0.6, 0.12 * n) + 0.01;
      }
      if (rng.chance(chance)) learnTech(world, p, t, known, false);
    }
  }
  world._techHolders = holdersOf(alive, T);
}
/* whether p could take up t now: its age reached, what it needs known, not just forgotten (nor
   lost to the world within a generation) */
function canLearn(world, p, t, known) {
  const mine = p.techs || (p.techs = {}), lost = world.techLost || {};
  if (mine[t.id] != null || (p.age || 0) < t.age) return false;
  if (t.needs && t.needs.some(function (n) { return mine[n] == null; })) return false;
  if (p.forgot && p.forgot[t.id] != null && world.year - p.forgot[t.id] < RELEARN_AFTER) return false;
  if (!known[t.id] && lost[t.id] != null && world.year - lost[t.id] < RELEARN_AFTER) return false;
  return true;
}
/* p takes up t: logged, and told unless quiet (the caller tells it). Returns how: "first" in the
   world, "again" (rediscovered after it was lost to the world), "relearned" (from others, after p
   forgot it) or "learned" (from others). */
function learnTech(world, p, t, known, quiet) {
  const lost = world.techLost || (world.techLost = {});
  const again = !known[t.id] && lost[t.id] != null, relearn = known[t.id] && p.forgot && p.forgot[t.id] != null;
  const how = again ? "again" : !known[t.id] ? "first" : relearn ? "relearned" : "learned";
  const forgotAt = relearn ? p.forgot[t.id] : null;
  p.techs[t.id] = world.year;
  (p.techLog || (p.techLog = [])).push(again ? { year: world.year, tech: t.id, first: true, again: true } : { year: world.year, tech: t.id, first: !known[t.id] });
  p.tech = clamp(p.tech + 0.01, 0, 1);
  const since = lost[t.id];
  if (again) delete lost[t.id];
  known[t.id] = true;
  if (quiet) return how;
  /* the pack may tell it its own way (pack.techStory: an entry, or null to leave it to the
     defaults below); a realm merely taking up what others know gets no entry otherwise */
  const story = world.pack.techStory ? world.pack.techStory(world, p, t, how, again ? since : forgotAt) : null;
  if (story) {
    recordEvent(world, story.type || (how === "first" ? "discovery" : how === "again" ? "rediscovery" : "adoption"), { importance: story.importance || 2,
      tags: (story.tags || []).concat(["tech:" + t.id]).concat(story.tags && story.tags.indexOf("technology") >= 0 ? [] : ["technology"]),
      actors: story.actors || [{ kind: "polity", id: p.id }], regionId: story.regionId == null ? p.capital : story.regionId, text: story.text });
  } else if (again) {
    recordEvent(world, "rediscovery", { importance: 3, tags: ["technology", "rediscovery", "tech:" + t.id], actors: [{ kind: "polity", id: p.id }], regionId: p.capital,
      text: p.name + " learned again to " + (t.verb || "master " + t.name.toLowerCase()) + ", which no realm had known how to do since " + (world.pack.yearLabel ? world.pack.yearLabel(since) : since) + ". Its neighbours were soon learning it from " + p.name + "." });
  } else if (how === "first") {
    recordEvent(world, "discovery", { importance: 3, tags: ["technology", "discovery", "tech:" + t.id], actors: [{ kind: "polity", id: p.id }], regionId: p.capital,
      text: p.name + " was the first realm in the record to " + (t.verb || "master " + t.name.toLowerCase()) + ". Within a few generations its neighbours had learned it too." });
  }
  return how;
}
function livingRealms(world) {
  const out = [];
  for (const id in world.polities) if (!world.polities[id].ended) out.push(world.polities[id]);
  return out;
}
/* for pack events: the technologies p could take up now from a living realm that knows them */
AEON.learnableTechs = function (world, p) {
  const T = world.pack.technologies || [], known = knownBy(livingRealms(world), T);
  return T.filter(function (t) { return known[t.id] && canLearn(world, p, t, known); });
};
/* for pack events: p takes up technology id now, quietly (the event tells it); returns how, or
   null when it could not */
AEON.learnTech = function (world, p, id) {
  const T = world.pack.technologies || [], t = T.filter(function (x) { return x.id === id; })[0], known = knownBy(livingRealms(world), T);
  if (!t || !p || p.ended || !canLearn(world, p, t, known)) return null;
  return learnTech(world, p, t, known, true);
};
/* which technologies some living realm knows */
function knownBy(alive, T) {
  const known = {};
  for (const t of T) known[t.id] = false;
  for (const q of alive) if (!q.ended && q.techs) for (const k in q.techs) known[k] = true;
  return known;
}
function holdersOf(alive, T) {
  const out = {};
  for (const q of alive) if (!q.ended && q.techs) for (const k in q.techs) (out[k] || (out[k] = [])).push(q.id);
  return out;
}

/* ------------------------------------------------------------ lost knowledge --
   What a realm knows can be forgotten when it is shaken: its towns plundered or razed (the
   capital most of all), a large share of its land lost in a few years, its library burned, a dark
   age (packs call AEON.techShock). The shock (p.techShock, 0..1.5) fades by more than half each
   tick (land counts only for a realm of four regions or more that loses a fifth of them in a tick).
   While it lasts, each technology the realm knows that nothing else it knows depends on (the
   most advanced first) may be forgotten, at most two a tick: the more of its neighbours and
   partners still know it, the less likely, since the craft survives next door. A realm that forgets
   four technologies within one age falls back an age (its learning set just short of the age it
   lost, so it climbs back in a few generations) and forgets everything beyond the age it fell to.
   Forgotten technologies are logged in p.techLog ({ lost: true }) and can be learned again like any
   other, after a generation (RELEARN_AFTER years; a technology lost to the world, too). When no living realm knows one any more, by forgetting or because the last realms that
   knew it fell, it is lost to the world (world.techLost: id -> year, a chronicle entry), and the
   next realm to find it alone rediscovers it. */
AEON.newFigure = function (world, p, role) { return newFigure(world, p, role); };
AEON.techShock = function (world, p, amount, cause) {
  if (!p || p.ended || !(amount > 0)) return;
  p.techShock = Math.min(1.5, (p.techShock || 0) + amount);
  if (cause && (!p.techCause || amount >= (p.techCauseAt || 0))) { p.techCause = cause; p.techCauseAt = amount; }
};
const FORGET_PER_TICK = 2, FALL_AFTER = 4, RELEARN_AFTER = 25;
function forgetTick(world, alive, T) {
  const rng = world.rng, ages = world.pack.ages, byId = {};
  for (const t of T) byId[t.id] = t;
  for (const p of alive) {
    if (p.ended) continue;
    /* land lost since the last tick shakes it too */
    const n = p.regions.length, before = p.techSize || n;
    p.techSize = n;
    if (before >= 4 && n < before && (before - n) / before > 0.2) AEON.techShock(world, p, (before - n) / before, "as its provinces fell away");
    const s = p.techShock || 0, cause = p.techCause;
    p.techShock = s < 0.05 ? 0 : s * 0.4;
    if (s < 0.05) { p.techCause = null; p.techCauseAt = 0; continue; }
    const leaves = leavesOf(p, byId);
    if (!leaves.length) continue;
    const contacts = contactsOf(world, p), gone = [];
    for (const id of leaves) {
      if (gone.length >= FORGET_PER_TICK) break;
      let k = 0;
      for (const o of contacts) if (o.techs && o.techs[id] != null) k++;
      if (rng.chance(Math.min(0.7, s * 0.6) / (1 + 0.5 * k))) gone.push(id);
    }
    if (!gone.length) continue;
    for (const id of gone) forget(world, p, id);
    const names = gone.map(function (id) { return byId[id].verb || "master " + byId[id].name.toLowerCase(); });
    recordEvent(world, "technology-lost", { importance: 2, tags: ["technology", "lost-knowledge"].concat(gone.map(function (id) { return "tech:" + id; })), actors: [{ kind: "polity", id: p.id }], regionId: p.capital,
      text: p.name + ", " + (cause || "in its troubles") + ", lost the last of the people who knew how to " + names.join(", or to ") + ", and within a generation no one there could." });
    fallBack(world, p, byId);
  }
  /* lost to the world: known by some living realm last tick, by none now */
  const was = world._techHolders || {}, known = knownBy(alive, T), lost = world.techLost || (world.techLost = {});
  for (const t of T) {
    if (known[t.id] || !was[t.id] || !was[t.id].length) continue;
    lost[t.id] = world.year;
    const last = was[t.id].map(function (id) { return world.polities[id]; }).filter(Boolean);
    recordEvent(world, "lost-to-world", { importance: 4, tags: ["technology", "lost-knowledge", "lost-to-world", "tech:" + t.id], actors: last.slice(0, 3).map(function (q) { return { kind: "polity", id: q.id }; }), regionId: last[0] ? last[0].capital : null,
      text: "No realm then living knew how to " + (t.verb || "master " + t.name.toLowerCase()) + " any longer. The last to have done it " + (last.length > 1 ? "were " + last.map(function (q) { return q.name; }).join(" and ") : last.length ? "was " + last[0].name : "are forgotten") + "; what " + (last.length > 1 ? "they" : "it") + " had made was still in use, and no one could make more." });
  }
}
/* what p knows that nothing else it knows depends on, the newest age first */
function leavesOf(p, byId) {
  const ids = p.techs ? Object.keys(p.techs) : [], needed = {};
  for (const id of ids) for (const nd of (byId[id] && byId[id].needs) || []) needed[nd] = true;
  return ids.filter(function (id) { return byId[id] && !needed[id]; }).sort(function (a, b) { return byId[b].age - byId[a].age || (a < b ? -1 : 1); });
}
function forget(world, p, id, counts) {
  delete p.techs[id];
  (p.forgot || (p.forgot = {}))[id] = world.year;
  (p.techLog || (p.techLog = [])).push({ year: world.year, tech: id, lost: true });
  p.tech = clamp(p.tech - 0.01, 0, 1);
  if (counts !== false) p.lostSinceAge = (p.lostSinceAge || 0) + 1;
}
/* too much forgotten in this age: back an age, and everything beyond it forgotten too */
function fallBack(world, p, byId) {
  const ages = world.pack.ages, mine = p.techs || {};
  if (!ages || !((p.age || 0) > 0) || !(p.lostSinceAge >= FALL_AFTER)) return;
  const from = p.age, to = from - 1, lo = ages[to].at, hi = ages[from].at;
  p.age = to;
  p.learning = Math.round((hi - 0.15 * (hi - lo)) * 1000) / 1000;
  p.ageLog.push({ age: to, year: world.year, fell: true });
  const beyond = Object.keys(mine).filter(function (id) { return byId[id] && byId[id].age > to; });
  for (const id of beyond) forget(world, p, id, false);
  p.lostSinceAge = 0;
  recordEvent(world, "age-lost", { importance: 4, tags: ["technology", "lost-knowledge", "age-lost", "age:" + ages[to].id], actors: [{ kind: "polity", id: p.id }], regionId: p.capital,
    text: p.name + " fell back from " + ages[from].name + " into " + ages[to].name + ". So much had been forgotten that what was left was the learning of an earlier time" +
      (beyond.length ? "; " + beyond.length + " more of the newer arts went with it" : "") + ", and the buildings of its grandfathers were looked at as the work of another people." });
}
function techsById(world) { const byId = {}; for (const t of world.pack.technologies || []) byId[t.id] = t; return byId; }
/* for pack events (a library burned, a dark age): p forgets one technology now, the newest it can
   lose, quietly (the event tells it); counts toward falling back an age. Returns it, or null. */
AEON.forgetTech = function (world, p) {
  if (!p || p.ended) return null;
  const byId = techsById(world), leaves = leavesOf(p, byId);
  if (!leaves.length) return null;
  const t = byId[leaves[0]];
  forget(world, p, t.id);
  fallBack(world, p, byId);
  return t;
};
/* the technologies p knew in a year (the current ones without a year) */
AEON.techsOf = function (world, p, year) {
  const T = world.pack.technologies || [], out = [];
  if (year == null || year >= world.year) {
    for (const t of T) if (p.techs && p.techs[t.id] != null) out.push(t);
    return out;
  }
  const have = {};
  for (const e of p.techLog || []) { if (e.year > year) break; have[e.tech] = !e.lost; }
  for (const t of T) if (have[t.id]) out.push(t);
  return out;
};
function techFactor(world, p, key) {
  if (!p.techs || !world.pack.technologies) return 1;
  let f = 1;
  for (const t of world.pack.technologies) if (p.techs[t.id] && t.effects && t.effects[key]) f *= t.effects[key];
  return f;
}
AEON.techFactor = function (world, p, key) { return techFactor(world, p, key); };
/* Wonders are for the very prosperous: a realm making half again the median realm's income, with
   a treasury of at least two and a half years' income, which the wonder then costs (packs call
   AEON.payForWonder when they raise one). */
AEON.canBuildWonder = function (world, p) {
  if (!p || !p.income || (p.treasury || 0) < 2.5 * p.income) return false;
  const inc = living(world).map(function (q) { return q.income || 0; }).sort(function (a, b) { return a - b; });
  return p.income >= 1.5 * (inc[inc.length >> 1] || 0);
};
AEON.payForWonder = function (world, p) { if (p) p.treasury = Math.round((p.treasury || 0) - 2.5 * (p.income || 0)); };
AEON.currency = function (world) { return world.pack.currency || { one: "talent", many: "talents" }; };
function economyTick(world, alive) {
  const live = alive.filter(function (p) { return !p.ended; }), base = {}, make = {}, trade = {}, paid = {}, war = {};
  for (const p of live) {
    const people = p.population * 0.0015 * (0.4 + p.tech) * techFactor(world, p, "wealth") * (1 + 0.25 * (p.prosperity || 0));
    let land = 0, ports = 0;
    for (const id of p.regions) {
      const r = world.regions[id];
      if (!r) continue;
      if (r.resources) land += (r.resources.metal || 0) * 4 + (r.resources.exotic || 0) * 8;
      if (r.settlement && onSea(world, r)) ports += Math.min(4, r.settlement.tier);
    }
    make[p.id] = people;
    base[p.id] = people + (land + ports * 6) * (0.5 + p.tech);
  }
  for (const t of world.treaties || []) {
    if (t.end != null) continue;
    if (t.kind === "trade") {
      if (make[t.a] != null && (trade[t.a] || 0) < 4 * 0.05 * make[t.a]) trade[t.a] = (trade[t.a] || 0) + 0.05 * make[t.a];
      if (make[t.b] != null && (trade[t.b] || 0) < 4 * 0.05 * make[t.b]) trade[t.b] = (trade[t.b] || 0) + 0.05 * make[t.b];
    } else if (t.kind === "tribute" && base[t.a] != null && base[t.b] != null) {
      const due = 0.15 * (base[t.a] + (trade[t.a] || 0));
      paid[t.a] = (paid[t.a] || 0) - due; paid[t.b] = (paid[t.b] || 0) + due;
    } else if (t.kind === "war") { war[t.a] = true; war[t.b] = true; }
  }
  for (const p of live) {
    const income = Math.max(1, Math.round(base[p.id] + (trade[p.id] || 0) + (paid[p.id] || 0)));
    const upkeep = Math.round(((p.army || 0) * 0.05 + (p.navy || 0) * 0.8) * (war[p.id] ? 1.5 : 1));
    p.income = income; p.upkeep = upkeep; p.trade = Math.round(trade[p.id] || 0); p.tributeNet = Math.round(paid[p.id] || 0);
    p.treasury = Math.round((p.treasury || 0) + (income - upkeep) * world.timeStep);
    if (p.treasury < -2 * income) {
      p.armyDebt = (p.armyDebt || 0) + fullArmy(world, p) * 0.33;
      p.traits.stability = clamp(p.traits.stability - 0.08, 0.02, 0.98);
      p.treasury = -income;
      if (p.bankrupt == null || world.year - p.bankrupt >= 50) {
        const cur = AEON.currency(world);
        recordEvent(world, "bankruptcy", { importance: 3, tags: ["economy", "bankruptcy"], actors: [{ kind: "polity", id: p.id }], regionId: p.capital,
          text: p.name + " could no longer pay its soldiers: it owed more than twice its yearly income of " + income.toLocaleString("en") + " " + cur.many +
            ", a third of its army went home unpaid, and its creditors were made to take a fraction of what they were owed." });
      }
      p.bankrupt = world.year;
    }
    spend(world, p, !!war[p.id]);
    p.treasury = Math.min(income * 3, p.treasury);
    p.wealth = clamp(p.wealth + clamp(p.treasury / (income * 3), -1, 1) * 0.15, 0, 1);
  }
}
/* What a realm does with its money: it keeps a reserve (a year's income; two and a half years for a
   realm at peace rich enough to raise a wonder, see AEON.canBuildWonder) and spends the rest. At war
   or facing a stronger, hostile neighbour mostly on soldiers (first making good its losses, then
   enlisting more, up to a third above its levy) and on ships if it has a coast; at peace mostly on
   prosperity (p.prosperity, 0..1; eighty years' income buys all of it): roads, granaries, harbours,
   schools, which let its land feed more people (+30% at full) and make each of them earn more
   (+25%). Soldiers cost 1 each to raise, ships 10. Prosperity wears away (4% a tick) and bought soldiers and ships go home again (10% a tick), so they must be paid for again. */
function spend(world, p, atWar) {
  p.armyExtra = (p.armyExtra || 0) * 0.9; p.navyExtra = (p.navyExtra || 0) * 0.9;
  p.prosperity = (p.prosperity || 0) * 0.96;
  const income = p.income || 1;
  let threat = atWar;
  if (!threat) {
    const me = AEON.fieldArmy(world, p);
    for (const q of neighborPolities(world, p)) if ((p.relations[q.id] || 0) < -0.3 && AEON.fieldArmy(world, q) > me * 1.2) { threat = true; break; }
  }
  const rich = !threat && AEON.canBuildWonder(world, Object.assign({}, p, { treasury: Infinity }));
  const reserve = income * (rich ? 2.5 : 1), budget = (p.treasury || 0) - reserve;
  if (budget <= 0) return;
  let coast = 0;
  for (const id of p.regions) if (onSea(world, world.regions[id])) { coast = 1; break; }
  const t = p.traits, warlike = 0.15 + t.aggression * 0.5;
  const toArmy = threat ? 0.7 : warlike * 0.6, toNavy = coast ? (threat ? 0.2 : warlike * 0.25) : 0, toLand = Math.max(0, 1 - toArmy - toNavy);
  /* soldiers: 1 a man to raise and arm (twenty years' pay); losses first */
  let men = budget * toArmy / 1;
  const healed = Math.min(p.armyDebt || 0, men);
  p.armyDebt = (p.armyDebt || 0) - healed; men -= healed;
  const full = fullArmy(world, Object.assign({}, p, { armyExtra: 0 }));
  if (full > 0) p.armyExtra = Math.min(0.33, (p.armyExtra || 0) + men / full);
  /* ships: 10 a hull */
  let ships = budget * toNavy / 10;
  const mended = Math.min(p.navyDebt || 0, ships);
  p.navyDebt = (p.navyDebt || 0) - mended; ships -= mended;
  const fleet = fullNavy(world, Object.assign({}, p, { navyExtra: 0 }));
  if (fleet > 0) p.navyExtra = Math.min(0.5, (p.navyExtra || 0) + ships / fleet);
  /* prosperity: eighty years' income buys the whole of it */
  p.prosperity = Math.min(1, (p.prosperity || 0) + budget * toLand / (income * 80));
  p.treasury = Math.round(reserve);
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

/* Armed strength in men and ships. Army: a share of the people under arms (the realm's kind and
   temper set how many), times readiness (stability, a ruler on the throne, war-weariness from the
   pack). Navy: the realm's sea ports, the bigger the town the more hulls (a few boats along open
   shore too), times wealth, learning and its kind. Kinds and types (realmTypes) carry `army` and `navy` factors in the
   pack's archetypes (default 1). Men and ships lost in battle are owed (`armyDebt`, `navyDebt`)
   and made good over the following decades. Worked out fresh whenever asked, and logged with the
   size history at the end of every tick. */
function archetypeOf(world, p) {
  const list = world.pack.archetypes || [];
  for (const a of list) if (a.id === p.archetypeId) return a;
  return null;
}
/* whether a region touches the open sea (not a lake), worked out once per region: sea and lakes
   do not change during a history */
function onSea(world, r) {
  let c = world._onSea;
  if (!c) { c = new Int8Array(world.regions.length).fill(-1); Object.defineProperty(world, "_onSea", { value: c, enumerable: false, configurable: true, writable: true }); }
  if (c[r.id] < 0) {
    c[r.id] = 0;
    for (const n of r.neighbors || []) { const q = world.regions[n]; if (q && q.barren && !q.lake) { c[r.id] = 1; break; } }
  }
  return c[r.id] === 1;
}
function roundForce(n) { return n >= 1000 ? Math.round(n / 100) * 100 : n >= 100 ? Math.round(n / 10) * 10 : Math.round(n); }
function fullArmy(world, p) {
  const a = archetypeOf(world, p) || {}, t = p.traits;
  const weary = world.pack.warWeariness ? clamp(world.pack.warWeariness(world, p) || 0, 0, 1) : 0;
  const readiness = (0.6 + t.stability * 0.5) * (p.ruler ? 1 : 0.85) * (1 - weary * 0.4);
  const k = typeOf(world, p) || {};
  return p.population * 0.012 * (a.army == null ? 1 : a.army) * (k.army == null ? 1 : k.army) * (0.7 + t.aggression * 0.6) * readiness * (1 + (p.armyExtra || 0));
}
function fullNavy(world, p) {
  const a = archetypeOf(world, p) || {}, k = typeOf(world, p) || {};
  let hulls = 0;
  for (const id of p.regions) {
    const r = world.regions[id];
    if (!r || !onSea(world, r)) continue;
    if (r.settlement) hulls += Math.min(4, r.settlement.tier) + (id === p.capital ? 2 : 0);
    else hulls += 0.25;                                  /* fishing boats along an open shore */
  }
  return hulls * 5 * (0.4 + p.wealth) * (0.5 + p.tech) * (a.navy == null ? 1 : a.navy) * (k.navy == null ? 1 : k.navy) * (1 + (p.navyExtra || 0));
}
/* what a realm can put in the field and at sea now: never below a tenth of its full strength */
AEON.armyOf = function (world, p) { const f = fullArmy(world, p); return Math.round(Math.max(f * 0.1, f - (p.armyDebt || 0))); };
AEON.navyOf = function (world, p) { const f = fullNavy(world, p); return Math.round(Math.max(f * 0.1, f - (p.navyDebt || 0))); };
/* the army a realm can bring to any one front: a great realm's is spread along all its borders,
   so past two dozen regions only part of it reaches (fleets gather where they are needed) */
AEON.fieldArmy = function (world, p) { return Math.round(AEON.armyOf(world, p) * Math.min(1, Math.sqrt(24 / Math.max(1, p.regions.length)))); };
function musterForces(world, p) {
  /* losses are made good at about a fifth every five years */
  const heal = Math.pow(0.8, world.timeStep / 5);
  if (p.armyDebt) p.armyDebt = p.armyDebt * heal < 1 ? 0 : p.armyDebt * heal;
  if (p.navyDebt) p.navyDebt = p.navyDebt * heal < 1 ? 0 : p.navyDebt * heal;
  p.army = roundForce(AEON.armyOf(world, p));
  p.navy = AEON.navyOf(world, p);
  let ports = 0;
  for (const id of p.regions) { const r = world.regions[id]; if (r && r.settlement && onSea(world, r)) ports++; }
  p.ports = ports;
}

/* A battle between two realms, on land at a region or at sea, decided by strength plus chance.
   Strength: the men (or ships) each side brings, times quality (learning), times the ground: a
   defender gains from mountains, hills, forest and marsh, a river line, walls and its capital, and
   a realm whose kind is at home on that ground (archetype `ground`: biomes) fights better there.
   Packs add their own edges as multipliers (`bonusA`, `bonusD`) and say what share of each side's
   force is there (`shareA`, `shareD`, default 1). The odds go with the square of the strength
   ratio (2:1 wins four times in five). The margin sets the outcome: "narrow", "clear" or
   "crushing", with `take` the regions a winning attacker should take (1, 1-2, or a block of up to
   six), and `pushBack` when a defender crushes the attack. Both sides lose men, which are owed
   and rebuilt. Every battle goes into world.battleLog for the map. */
function groundFactor(world, p, r) {
  const g = (archetypeOf(world, p) || {}).ground;
  return g && r && g.indexOf(r.biome) >= 0 ? 1.3 : 1;
}
function defenceOf(world, def, r) {
  if (!r) return 1;
  let f = 1;
  if (r.biome === "mountain") f *= 1.5;
  else if (r.elevation > 0.75) f *= 1.2;
  if (r.biome === "forest" || r.biome === "jungle" || r.biome === "swamp" || r.biome === "taiga") f *= 1.15;
  if (r.river) f *= 1.15;
  if (r.settlement && r.settlement.tier >= 3) f *= 1.25;
  if (r.id === def.capital) f *= 1.15;
  return f;
}
AEON.battle = function (world, att, def, opts) {
  opts = opts || {};
  const rng = world.rng, sea = !!opts.sea, r = opts.region == null ? null : world.regions[opts.region];
  const men = sea ? AEON.navyOf : AEON.fieldArmy;
  const ea = Math.max(1, Math.round(men(world, att) * (opts.shareA == null ? 1 : opts.shareA)));
  const ed = Math.max(1, Math.round(men(world, def) * (opts.shareD == null ? 1 : opts.shareD)));
  const arm = sea ? "navy" : "army";
  let sa = ea * (0.5 + att.tech) * techFactor(world, att, arm) * (opts.bonusA || 1);
  let sd = ed * (0.5 + def.tech) * techFactor(world, def, arm) * (opts.bonusD || 1);
  if (!sea) { sa *= groundFactor(world, att, r); sd *= groundFactor(world, def, r) * defenceOf(world, def, r); }
  const odds = (sa * sa) / (sa * sa + sd * sd);
  const won = rng.chance(odds);
  const ratio = (won ? sa / sd : sd / sa) * rng.range(0.7, 1.3);
  const margin = ratio < 1.3 ? "narrow" : ratio < 2.5 ? "clear" : "crushing";
  const LOSS = { narrow: [0.08, 0.15, 0.06, 0.12], clear: [0.15, 0.25, 0.05, 0.1], crushing: [0.3, 0.45, 0.02, 0.06] }[margin];
  /* the fighting is as big as the smaller side lets it be */
  const fought = Math.min(ea, ed) * 1.5;
  const lostL = Math.round(Math.min(won ? ed : ea, fought) * rng.range(LOSS[0], LOSS[1]));
  const lostW = Math.round(Math.min(won ? ea : ed, fought) * rng.range(LOSS[2], LOSS[3]));
  const W = won ? att : def, L = won ? def : att, debt = sea ? "navyDebt" : "armyDebt";
  W[debt] = (W[debt] || 0) + lostW;
  L[debt] = (L[debt] || 0) + lostL;
  let take = 0;
  if (won) take = margin === "narrow" ? 1 : margin === "clear" ? (rng.chance(0.5) ? 2 : 1) : Math.max(2, Math.min(6, Math.round((opts.frontier || 2) * 0.35)));
  (world.battleLog || (world.battleLog = [])).push([world.year, att.id, def.id, ea, ed, r ? r.id : null, won, sea, margin === "narrow" ? 1 : margin === "clear" ? 2 : 3, world.chronicle.length, null]);
  return { won: won, W: W, L: L, margin: margin, odds: odds, ratio: ratio, take: take, pushBack: !won && margin === "crushing",
           men: { att: ea, def: ed }, lost: { W: lostW, L: lostL } };
};
/* a polity's army and fleet in a year, from its size history (null before it was founded) */
AEON.forcesAt = function (p, year) {
  const h = p.sizeHistory;
  if (!h || !h.length || year < h[0].year) return null;
  let lo = 0, hi = h.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (h[mid].year <= year) lo = mid; else hi = mid - 1; }
  return { army: h[lo].army || 0, navy: h[lo].navy || 0, income: h[lo].income || 0, treasury: h[lo].treasury || 0 };
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
    chooseType(world, p);
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
    const kind = typeOf(world, p);
    const expansionChance = (0.07 + p.traits.aggression * 0.10 + p.wealth * 0.05) * (kind && kind.expansion != null ? kind.expansion : 1);
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
        if (rng.chance(0.07 * Math.min(1, AEON.siteSuitability(target, world) * 1.6))) foundSettlement(world, target, rng.int(1, 2));
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

  driftRelations(world, alive);
  techTick(world, alive);
  economyTick(world, alive);

  /* record territory size occasionally for sparklines */
  if (world.chronicle.length % 1 === 0) {
    for (const p of alive) {
      if (p.ended) continue;
      musterForces(world, p);
      p.sizeHistory.push({ year: world.year, size: p.regions.length, pop: p.population, army: p.army, navy: p.navy, income: p.income || 0, treasury: p.treasury || 0 });
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

function fireOne(world, scope, subject, consolidateOnly) {
  const defs = world.pack.events.filter(function (d) { return (d.scope || "polity") === scope && (!consolidateOnly || d.consolidate); });
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
  /* an event may file its entry under another type (historical: an invention that is the printing press) */
  recordEvent(world, out.type || def.id, out);
}

AEON.tick = function (world) {
  if (world.year >= world.endYear) return false;
  world.year += world.timeStep;
  const ev0 = world.chronicle.length;
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

  /* Consolidation pressure: while the world holds more realms than it is heading for
     (AEON.realmCap), big realms get up to three extra turns, spent only on events a pack marks
     consolidate: true (annexation, conquest, war). So fifty early states fold into a dozen or so
     without the ordinary event budget having to make room. */
  const living0 = living(world), over = living0.length - AEON.realmCap(world);
  for (let i = 0; i < Math.min(3, Math.ceil(over / 6)); i++) {
    const p = rng.weighted(living(world), function (x) { return x.regions.length; });
    if (p) fireOne(world, "polity", { kind: "polity", obj: p }, true);
  }

  /* a coalition's members press their war: an extra turn each, spent on war (consolidate events) */
  let pressed = 0;
  for (const t of world.treaties || []) {
    if (pressed >= 5 || t.end != null || t.kind !== "war" || !t.coalition) continue;
    const m = world.polities[t.a];
    if (m && !m.ended) { fireOne(world, "polity", { kind: "polity", obj: m }, true); pressed++; }
  }

  let figs = 0;
  for (const p of rng.shuffle(alive)) {
    if (figs >= 1) break;
    if (p.ended || !p.ruler) continue;
    const f = world.figures[p.ruler];
    if (f && rng.chance(0.12)) { fireOne(world, "figure", { kind: "figure", obj: f }); figs++; }
  }

  const worldRolls = 1 + (rng.chance(0.3) ? 1 : 0);
  for (let i = 0; i < worldRolls; i++) {
    if (rng.chance(0.5)) fireOne(world, "world", null);
  }

  warClock(world);
  allianceTick(world, living(world));
  vassalTick(world);
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

  dateTick(world, ev0);
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
