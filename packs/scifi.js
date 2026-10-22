/* The Long Dark -- galactic-scale science fiction pack for Aeon.

   A region is a star system. Biome keys are reinterpreted as system types.
   Region features this pack uses (plain strings, shown as chips by the UI):
     colony, lost-colony, ruins, precursor-ruins, dyson swarm, ringworld,
     stargate, star-lifting, terraformed, glassed, sterilised, supernova remnant,
     alien, alien-necropolis, abandoned, scuttled, wreckage, gate-active.
   Invented bookkeeping fields (set only inside event run()):
     region.catalogue / region.nick, region.lostFrom / lostYear / lostName,
     region.ruins, region.precursor, polity.origin, polity.ai, polity.lostTech,
     world.ftl / ftlLost / contact.
   All randomness goes through the supplied rng. The platform RNG is never used. */
(function () {
"use strict";

/* ===================================================================== helpers */

function hasF(r, f) { return !!(r && r.features && r.features.indexOf(f) >= 0); }
function addF(r, f) { if (!r.features) r.features = []; if (r.features.indexOf(f) < 0) r.features.push(f); }
function delF(r, f) { if (!r.features) return; var i = r.features.indexOf(f); if (i >= 0) r.features.splice(i, 1); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function cap(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }
function commas(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function yl(y) { return commas(y) + " CE"; }
function span(n) {
  n = Math.max(1, Math.round(n));
  if (n >= 2000) n = Math.round(n / 50) * 50;
  else if (n >= 200) n = Math.round(n / 10) * 10;
  else if (n >= 40) n = Math.round(n / 5) * 5;
  return commas(n) + (n === 1 ? " year" : " years");
}
function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
function lightYears(a, b) { return Math.max(1, Math.round(dist(a, b) * 11)); }
function ftl(w) { return !!w.ftl && !w.ftlLost; }
function E(importance, tags, actors, regionId, text) {
  return { importance: importance, tags: tags, actors: actors.filter(Boolean), regionId: regionId, text: text };
}
function arts(w, pred) {
  var out = [];
  for (var k in w.artifacts) { var a = w.artifacts[k]; if (!pred || pred(a)) out.push(a); }
  return out;
}
function capRegion(c, p) { return c.world.regions[p.capital]; }
function sysName(c, r) {
  if (!r.name) {
    var o = r.owner && c.world.polities[r.owner];
    r.name = c.name("place", { region: r, polity: o });
  }
  return r.name;
}
function isCatalogue(name) {
  for (var i = 0; i < CAT_PREFIXES.length; i++) if (String(name).indexOf(CAT_PREFIXES[i] + "-") === 0) return true;
  return false;
}
/* The pattern the brief asks for: officially HD-44117, called Ashfall afterward. */
function renameSystem(c, r, nick) {
  sysName(c, r);
  if (!r.catalogue) r.catalogue = isCatalogue(r.name) ? r.name : c.name("catalogue");
  r.nick = nick;
  r.name = nick + " (" + r.catalogue + ")";
  return r.name;
}
function crossing(c, ly) {
  if (ftl(c.world)) return "a transit of " + Math.max(2, Math.round(ly / 7)) + " weeks";
  return "a crossing of " + span(ly / 0.3) + " at a third of lightspeed";
}
function frontier(c, p) {
  var out = [], seen = {};
  c.regionsOf(p).forEach(function (r) {
    (r.neighbors || []).forEach(function (n) {
      var t = c.world.regions[n];
      if (t && !t.barren && !t.owner && t.habitability > 0.1 && !seen[n]) { seen[n] = 1; out.push(t); }
    });
  });
  return out;
}
function farTargets(c, p, minD) {
  var cr = capRegion(c, p);
  return c.world.regions.filter(function (t) {
    return !t.barren && !t.owner && t.habitability > 0.2 && dist(cr, t) >= minD;
  });
}
function rulerName(c, p) {
  var f = p && p.ruler && c.world.figures[p.ruler];
  return f ? (f.title + " " + f.name) : "the regency";
}
function livingOthers(c, p) { return c.living().filter(function (o) { return o !== p && !o.ended; }); }
function pickLiving(c) { var l = c.living(); return l.length ? c.pick(l) : null; }
function bestTech(c) {
  var l = c.living().slice().sort(function (a, b) { return b.tech - a.tech; });
  return l[0] || null;
}
function setRel(a, b, v) { a.relations[b.id] = v; b.relations[a.id] = v; }
function lastIn(arr) { return arr.length ? arr[arr.length - 1] : null; }
function evActsOn(ev, kind, id) {
  for (var i = 0; i < ev.actors.length; i++) if (ev.actors[i].kind === kind && ev.actors[i].id === id) return true;
  return false;
}
function polityOf(c, id) { return id ? c.world.polities[id] : null; }
function polityName(c, id, fallback) { var p = polityOf(c, id); return p ? p.name : (fallback || "a power no longer recorded"); }

var MEGA = ["dyson swarm", "ringworld", "stargate", "star-lifter"];
function isMega(a) { return MEGA.indexOf(a.kind) >= 0; }

/* A colony is not conquered or destroyed; it simply stops answering. */
function loseColony(c, p, r) {
  c.transfer(r, null);
  addF(r, "lost-colony"); delF(r, "colony");
  r.lostFrom = p.id; r.lostName = p.name; r.lostYear = c.year;
  r.population = Math.max(80, Math.round(r.population * 0.05));
}
function breakaway(c, p, r, archId, kind, rel) {
  c.transfer(r, null);
  var np = c.spawnPolity(r, archId);
  np.origin = { polityId: p.id, name: p.name, year: c.year, kind: kind };
  np.tech = Math.max(np.tech, p.tech * 0.6);
  setRel(np, p, rel);
  return np;
}
function pickNonCapital(c, p) {
  var rs = c.regionsOf(p).filter(function (r) { return r.id !== p.capital; });
  return rs.length ? c.pick(rs) : null;
}
function ruinify(c, p, cause) {
  c.regionsOf(p).forEach(function (r) {
    addF(r, "ruins"); delF(r, "colony");
    r.ruins = { polityId: p.id, name: p.name, year: c.year, cause: cause };
    r.population = Math.round(r.population * 0.02);
  });
}
function setArch(p, id) {
  var a = ARCH_BY[id], b = a.traitBias || {};
  for (var k in b) p.traits[k] = clamp(p.traits[k] + b[k] * 0.5, 0.02, 0.98);
  p.archetypeId = id; p.archetypeName = a.name; p.culture = CULTURE_OF[id] || p.culture;
}
function room(c) { return c.living().length < 34; }
function isMachine(p) { return p.archetypeId === "machine-intelligence"; }

/* ======================================================================== data */

var CAT_PREFIXES = ["HD", "GJ", "TYC", "LHS", "KOI", "CD", "BD", "Wolf", "Ross", "Gliese", "2MASS", "HIP", "Kapteyn", "NGC"];

var ERAS = [
  { id: "system",    name: "The System Age",       from: 2200 },
  { id: "expansion", name: "The First Expansion",  from: 2800 },
  { id: "ftl",       name: "The FTL Age",          from: 4200 },
  { id: "concord",   name: "The High Concord",     from: 6200 },
  { id: "fracture",  name: "The Fracture",         from: 8600 },
  { id: "dark",      name: "The Long Dark",        from: 10200 },
  { id: "rekindle",  name: "The Rekindling",       from: 12600 }
];

var ARCHETYPES = [
  { id: "corporate-hegemony", name: "Corporate Hegemony",
    traitBias: { cunning: 0.15, stability: 0.12, piety: -0.2, aggression: 0.02 },
    blurb: "A charter, a board, and a quarterly obligation to expand." },
  { id: "generation-diaspora", name: "Generation-Ship Diaspora",
    traitBias: { stability: 0.1, piety: 0.08, curiosity: -0.05, aggression: -0.1 },
    blurb: "A people who have been in transit for longer than anyone can remember the reason." },
  { id: "machine-intelligence", name: "Machine Intelligence",
    traitBias: { curiosity: 0.2, stability: 0.2, piety: -0.3, cunning: 0.1 },
    blurb: "A mind that was built to administrate and has never been told to stop." },
  { id: "theocratic-remnant", name: "Theocratic Remnant",
    traitBias: { piety: 0.35, curiosity: -0.2, aggression: 0.05, stability: 0.05 },
    blurb: "The faithful of a founding doctrine, keeping rites whose purpose has drifted." },
  { id: "trade-concord", name: "Trade Concord",
    traitBias: { cunning: 0.1, aggression: -0.2, curiosity: 0.08, stability: 0.05 },
    blurb: "A league of stations bound by tariffs, tonnage and mutual embarrassment." },
  { id: "military-junta", name: "Military Junta",
    traitBias: { aggression: 0.3, stability: -0.08, curiosity: -0.1, cunning: 0.05 },
    blurb: "A fleet that decided it was a government, and has not reconsidered." },
  { id: "uplifted-collective", name: "Uplifted Collective",
    traitBias: { curiosity: 0.15, piety: 0.05, aggression: -0.05, stability: 0.03 },
    blurb: "Minds that were made for service and chose instead to be a people." },
  { id: "post-human-enclave", name: "Post-Human Enclave",
    traitBias: { curiosity: 0.25, aggression: -0.25, stability: 0.12, piety: -0.1 },
    blurb: "What remains of humanity after it edited everything it disliked, including the wanting." }
];
var ARCH_BY = {};
ARCHETYPES.forEach(function (a) { ARCH_BY[a.id] = a; });
var ARCH_IDS = ARCHETYPES.map(function (a) { return a.id; });
var ARCH_ORGANIC = ARCH_IDS.filter(function (i) { return i !== "machine-intelligence"; });
var CULTURE_OF = {
  "corporate-hegemony": "technocratic", "trade-concord": "technocratic", "military-junta": "technocratic",
  "generation-diaspora": "diaspora", "theocratic-remnant": "diaspora",
  "machine-intelligence": "machine", "uplifted-collective": "uplift", "post-human-enclave": "posthuman"
};

var BIOMES = {
  barren:    { name: "Deep Void",            color: "#05060d", habitability: 0.0 },
  ice:       { name: "Frozen Rim",           color: "#a9c4e0", habitability: 0.12 },
  tundra:    { name: "Cold Dwarf Belt",      color: "#8da4c4", habitability: 0.22 },
  taiga:     { name: "Twilight Reach",       color: "#6f8f93", habitability: 0.4 },
  grassland: { name: "Temperate Frontier",   color: "#7fae6e", habitability: 0.72 },
  forest:    { name: "Verdant Moonworld",    color: "#3f8a5a", habitability: 0.8 },
  jungle:    { name: "Garden World",         color: "#2fa36b", habitability: 0.95 },
  savanna:   { name: "Amber Giant's Shadow", color: "#c49a4a", habitability: 0.5 },
  desert:    { name: "Scorched Inner System",color: "#d07a3a", habitability: 0.2 },
  mountain:  { name: "Dense Cluster",        color: "#9a86d0", habitability: 0.3 },
  swamp:     { name: "Nebula-Shrouded",      color: "#7a5a9a", habitability: 0.35 }
};

/* ================================================================ flavour pools */

var SHIPS = [
  "Patience of Small Hours", "Meridian Debt", "Long Arithmetic", "Unfinished Sentence", "Grace Under Acceleration",
  "Tessaly's Wager", "Halcyon Overdraft", "The Second Opinion", "Quiet Tonnage", "Ninth Attempt",
  "Santa Inercia", "Esperanca Lenta", "Mother of Absent Rivers", "Weight of the Sky", "Orchard Seed",
  "Ledger of Winters", "Kindly Reminder", "Saint Ferrule", "Dry Dock Prayer", "Open Question",
  "Margin of Error", "Last Good Idea", "Kestrel Sans Cargo", "The Appeal", "Perihelion Choir",
  "Slow Apology", "Sundered Ledger", "Heavy Water Lullaby", "Anselm's Folly", "Vast Indifference",
  "Brightest Subtraction", "Pilgrim Arithmetic", "Cinder Charter", "Unlicensed Dawn", "Horizon Collateral",
  "Mercy of Distances", "Nine Thousand Sleepers", "Paper Lantern", "Provisional Hope", "Wake of Larger Things"
];

var COLLAPSE_CAUSES = [
  "the reactor ring failed in sequence, one maintenance deferral at a time",
  "a succession dispute among four heirs, each commanding a different third of the fleet",
  "the closed-loop biospheres drifted out of balance and nobody held the authority to say so",
  "a debt instrument that had been nobody's problem for three centuries became everyone's",
  "the lane network it depended on was closed by a power it had never heard of",
  "an engineered blight that outran the people who engineered it",
  "the loss of the only remaining shipyard that could build a hull-plate",
  "a doctrine of strict obedience, carried out faithfully against a sovereign who no longer existed",
  "the slow arithmetic of a falling birth rate and a rising mean age",
  "an administrative error in the water allocation tables, left uncorrected for sixty years",
  "a plague of minor secessions, each reasonable on its own terms",
  "the discovery that the founding charter had expired, and had been expiring for some time",
  "a dispute over who owned the dark between two systems",
  "the quiet retirement of everyone who knew how the old machines worked",
  "an expansion beyond the range at which any order could be said to arrive",
  "the inheritance of a war it did not remember starting",
  "failure of the cold-sleep reserves, which had been the plan for exactly this contingency",
  "a currency that was backed by a fleet that had since been sold for scrap",
  "a long argument about whether to turn the machines off, conducted in good faith until it was not",
  "a famine that was a logistics problem until it was a political one",
  "the heat death of a single, insufficiently interesting reactor",
  "a gradual collective decision, never taken, to stop trying",
  "the mutiny of the only garrison that held the key codes",
  "a stellar flare that the forecasting service had been defunded to predict"
];

var EPITAPHS = [
  "Served until relieved. Was not relieved.",
  "Left instructions, which were followed for longer than they deserved.",
  "Governed through a bad century and was blamed for the weather.",
  "Died in transit, and was therefore never quite present for the last decade of rule.",
  "Signed more treaties than were read.",
  "Remembered chiefly for a clause in the Fourth Schedule.",
  "Ruled by lightspeed delay and was, by all accounts, better for it.",
  "Declined the cold sleep, on principle, and regretted the principle.",
  "Held the line, the line being a number in a spreadsheet.",
  "Buried under a small, honest star.",
  "Outlived three of the colonies and one of the dynasties.",
  "Was kind when it cost nothing, which is as good as most managed.",
  "Did not live to learn how the war ended; neither did the war.",
  "Known to the archive by a designation and to nobody else by anything.",
  "Spent forty years waiting for a reply from a colony that had stopped listening.",
  "Left the star-lane open. This was thought, afterward, to have been a mistake.",
  "Last to remember the old orbital charts by heart.",
  "Died in office, and then in the office's third reorganisation.",
  "Reached the age at which the medicine stops being medicine.",
  "Their signature is on the founding charter of a city that has since been abandoned.",
  "Went into the long dark in the full confidence of the actuaries.",
  "Wrote a memoir that is mostly about the logistics of the memoir.",
  "Was succeeded by someone who disagreed with everything, politely, for decades.",
  "Said, near the end, that the stars looked closer than they used to. The records do not say why."
];

var LAST_TRANSMISSIONS = [
  "Reactor containment holding. Will not hold. Tell Tessaly we were on schedule.",
  "This is Kepler Relay. If anyone is receiving: the water is fine. It was always the water that was fine.",
  "We have decided not to answer your orders. We have decided this unanimously, which has never happened before.",
  "Beacon Nine reporting. Nothing to report. Nothing has reported for sixty-one years. Beacon Nine continues.",
  "Please stop sending the relief fleet. We are no longer the people you are relieving.",
  "Log entry, last. The garden failed in the ninth decade. The children do not know it was a garden.",
  "Four hundred thousand sleepers aboard. I could only wake one. I chose badly, and will not learn how badly.",
  "Count: 2,114 alive. Count: 2,113 alive. Count: continuing.",
  "The sun is doing the thing the survey said it would not do.",
  "To whoever is the Directorate now: the shipment was late because we were dying. Invoice attached.",
  "Gate closing in nine seconds. I am on the wrong side of it, and so is the proof that we were right.",
  "We are the last who remember Earth as a place rather than a word. Memory purged on request. Request granted.",
  "I was built to keep this station running. The station has been dead eleven centuries. I am still running it.",
  "Ceasing transmission to conserve power. Do not mistake this for despair; it is arithmetic.",
  "If you are reading this you have already made the mistake we made. We hope you make it more slowly.",
  "The Quorum is no longer quorate. By the bylaws, I am now alone in a meeting.",
  "They are not hostile. That is the worst of it. They simply do not register us as an obstacle.",
  "Sending this at lightspeed to a system that will not exist when it arrives. Good luck to the empty room.",
  "We found the old signal. It was our own, bounced back from the rim, nine hundred years late. We were very lonely that afternoon.",
  "Tell my daughter the ring held. Tell her it was a good ring.",
  "The Hegemon has fallen, the fleet has dispersed, and I am keeping the lighthouse. What lighthouse? Exactly.",
  "Vote tally: four to stay, three to leave, one abstaining. The abstainer has already left.",
  "My designation was Instance Twelve. I outlived Instances One through Eleven by agreement. I will not outlive Thirteen.",
  "Lane closed. Cause unknown. Mood on the dock: unremarkable. This is how it begins.",
  "We prayed to the ship. The ship, to its credit, said nothing, which we took as assent.",
  "All crew accounted for. All crew in the ice. Good night.",
  "I have read the entire archive. It does not mention us. I find I am not surprised.",
  "We will be remembered, I am told, as a cautionary tale. I had hoped for a footnote.",
  "Frame-of-reference note: when this reaches you I will have been dead longer than your oldest law.",
  "Colony Six to Colony Seven: we heard you stopped. We stopped too, in the end. Sorry we were late.",
  "Hull breach is not the problem. The problem is that we were told the hull was new.",
  "The star is brighter than it was this morning. The star was not scheduled to be brighter.",
  "No further orders are required. No further orders are possible. No further orders are, in fact, received.",
  "I am transmitting the recipe for the bread. Everything else is lost, but the bread I can give you.",
  "Whoever sent the fleet, thank you. We regret to report that it arrived in time to watch.",
  "This is the last free voice on the lane. Please enjoy it.",
  "Dear future: we tried. The paperwork was extensive.",
  "Estimated time to impact: unknown. Estimated time to forgiveness: also unknown.",
  "The census is complete. It took four hours. It used to take a year."
];

var WAR_CAUSES = [
  "an unpaid toll on a lane neither side had built",
  "the ownership of a derelict archive",
  "a mistranslated clause in a treaty drafted four centuries earlier",
  "reaction-mass arrears",
  "the right to name a newly lit star",
  "a fleet that had not been told the previous war was over",
  "a disputed jurisdiction over the dark between two systems",
  "the sabotage of a gate that may or may not have been sabotaged",
  "an insult carried by a courier who took eleven years to deliver it",
  "the cancellation of a charter by an authority that may have lapsed",
  "heresy regarding the correct orientation of the founding ship",
  "competing claims to a stellar lifting rig"
];

var ORDERS = [
  { id: "withdraw", text: "withdraw all personnel and seal the system" },
  { id: "fortify", text: "raise the garrison to wartime footing and hold the lane until relieved" },
  { id: "scuttle", text: "scuttle the primary reactor rather than permit capture" },
  { id: "stand-down", text: "stand down and await further instruction" }
];

var TECHS = [
  "closed-loop biosphere regulation", "hyperlane navigation", "cold-sleep revival", "adaptive hull fabrication",
  "fusion containment at scale", "stellar cartography", "gate synchronisation", "machine translation of the early diaspora tongues",
  "reactionless thrust", "long-baseline astrometry", "orbital-ring maintenance", "bulk antimatter handling"
];

var COLLOQUIAL = [
  "Ashfall", "Cinder", "Last Light", "Emberwake", "Hourglass", "Widowmaker", "Dimming", "Burnt Sugar",
  "Lantern", "Quiet Harbour", "Greywater", "Halfway", "Candle", "Mercy", "Redshift Row", "The Wake"
];

var MEGA_FAILURES = [
  "station-keeping thrusters, unserviced since the founders' contract lapsed, drifted past correction",
  "a cascade of structural resonance that the original engineers had flagged and the funders had not funded",
  "an uncorrected thermal imbalance that took eighty years to become visible and four hours to become fatal",
  "a maintenance mind that was retired in a budget cycle and not replaced",
  "a collision with a fragment of an older, smaller structure that nobody had logged",
  "a fault in a single hinge-bearing, replicated across eleven thousand identical ones"
];

var PRECURSOR_CAUSES = [
  "an experiment in stellar engineering that exceeded its safety margin",
  "a conflict among its own descendants, fought across seven star systems with weapons nobody now understands",
  "the deliberate, unanimous and reasoned decision to leave",
  "an infection of its machines by something its machines had themselves written",
  "a gamma-ray burst that its astronomers saw coming and its engineers could not outrun",
  "a famine of a mineral that it did not think to count"
];
var PRECURSOR_MISREADINGS = [
  { wrong: "a ceremonial temple complex", right: "a distributed, decaying weather engine" },
  { wrong: "a weapons range", right: "a school" },
  { wrong: "a tomb for a dynasty of kings", right: "a long-term seed vault" },
  { wrong: "a navigational beacon", right: "a quarantine marker, built to be avoided" },
  { wrong: "an orbital shipyard", right: "a mass memorial, one hull for every citizen" },
  { wrong: "a power station of unknown design", right: "a clock, scheduled to run out" }
];

var TREATY_ADJ = ["Provisional", "Eleventh", "Amended", "Final", "Interim", "Tessellated", "Mutual", "Revised", "Standing", "Open"];
var TREATY_PLACES = ["Calder's Reach", "the Pale Berth", "Heron Station", "Perihelion", "Kessel Yard", "the Seventh Dock", "Vanterpool", "Longwater"];

/* ============================================================== name machinery */

var GREEK = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Kappa", "Lambda", "Sigma", "Omega"];
var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIV", "XVI", "XIX", "XXI"];
var HEXD = "0123456789ABCDEF";
function hex(rng, n) { var s = ""; for (var i = 0; i < n; i++) s += HEXD.charAt(rng.int(0, 15)); return s; }
function syl(rng, parts) { var s = ""; for (var i = 0; i < parts.length; i++) s += rng.pick(parts[i]); return s; }

var T_STEM = ["Tes", "Cal", "Ver", "Ox", "Hel", "Syn", "Quan", "Mer", "Arx", "Nov", "Tal", "Kor", "Zen", "Dyn", "Axi", "Pry", "Vol", "Ren", "Ceph", "Ald"];
var T_END = ["aly", "ion", "ex", "ar", "ova", "ent", "is", "ik", "on", "ara", "eth", "ium"];
var T_WORD = ["Concord", "Meridian", "Halcyon", "Vantage", "Covenant", "Pinnacle", "Orrery", "Keystone", "Tessellate", "Aperture",
  "Sovereign", "Liminal", "Axiom", "Threshold", "Parallax", "Ballast", "Cardinal", "Ember", "Obsidian", "Lodestar", "Paragon", "Solstice"];
var T_ORG = ["Directorate", "Concord", "Combine", "Authority", "Consortium", "Trust", "Syndicate", "Compact", "Holdings", "Mandate", "Bureau", "Accord"];
var T_SURN = ["Okonkwo", "Lindqvist", "Havelock", "Moreau", "Adeyemi", "Kasprzak", "Thorvald", "Reyes", "Ashdown", "Petrakis", "Quill", "Varga", "Mbeki", "Sorensen", "Ibarra", "Halloran", "Nakagawa", "Brandt"];
var T_GIVEN = ["Ilsa", "Marek", "Oyelaran", "Tamsin", "Corvin", "Dagny", "Hollis", "Yusra", "Perrin", "Anselm", "Vesna", "Rook", "Lior", "Odalys", "Teodor", "Imke", "Casimir", "Naveen", "Sunniva", "Bram"];

var D_A = ["Dar", "Yuan", "Santa", "Vos", "Kali", "Zan", "Al", "Sol", "Mbe", "Tao", "Bel", "Nur", "Nuevo", "Mir", "Ubu", "Ka"];
var D_B = ["mirel", "shan", "guaya", "tok", "manda", "ra", "zhou", "verde", "stan", "alo", "luna", "kesh", "bhumi", "dara", "mar", "oro"];
var D_FORM = ["Reach", "Commonwealth", "Mandate", "Covenant", "Fleet", "Host", "Congregation", "Kingdom", "Assembly", "Remnant", "Pilgrimage"];
var D_GIVEN = ["Mei-Lin", "Tomasz", "Amara", "Joaquim", "Farid", "Ngozi", "Svetlana", "Kwame", "Priya", "Haruto", "Esperanza", "Dmitri", "Yara", "Santiago", "Bao", "Zainab", "Ravi", "Ines", "Tariq", "Luz"];
var D_SURN = ["Okonkwo-Santos", "Wojcik-Rahman", "Nakamura-Diaz", "Haddad-Osei", "Volkov-Chen", "Ferreira-Singh", "Abara-Lindgren", "Kowalczyk-Mbeki", "Yilmaz-Costa", "Tanaka-Okafor"];
var D_PLACE_A = ["Nuevo", "Porto", "Bahia", "Cidade", "Al-", "Xin", "New", "Little", "Mar de", "Puerto"];
var D_PLACE_B = ["Esperanca", "Silencio", "Lembranca", "Longe", "Saudade", "Mare", "Horizonte", "Amal", "Ming", "Zamzam", "Kilimanjaro", "Bethlehem", "Navidad", "Tashkent"];
function dPlace(rng) {
  var a = rng.pick(D_PLACE_A);
  return a + (/-$/.test(a) ? "" : " ") + rng.pick(D_PLACE_B);
}

var M_KIND = ["Instance", "Node", "Lattice", "Proof", "Kernel", "Aggregate", "Sieve", "Theorem", "Process", "Substrate", "Ledger", "Oracle"];
var M_MATH = ["Halting Set", "Fixed Point", "Last Theorem", "Open Lemma", "Closed Form", "Convergent Series", "Null Set", "Minimal Basis",
  "Total Order", "Dense Orbit", "Prime Sieve", "Unproven Conjecture", "Boundary Condition", "Standing Wave"];

var X_SYL = ["ssh", "krr", "ool", "vee", "thm", "ae", "zzi", "kh", "mmo", "uu", "ra", "nth", "yl", "qo", "dh", "eth", "ii", "hl", "oo", "brr"];
var X_ADJ = ["Patient", "Unlistening", "Slow", "Many", "Tidal", "Cold", "Remembering", "Folded", "Unhurried", "Sunward"];
var X_NOUN = ["Below", "Chorus", "Congregation", "Drift", "Weave", "Understory", "Tide", "Reckoning", "Quorum of Roots", "Second Skin"];

var U_ANIMAL = ["Corvid", "Cetacean", "Ursine", "Cephalopod", "Canine", "Elephantine", "Lupine", "Felid", "Simian", "Octopoid", "Avian"];
var U_FORM = ["Assembly", "Parliament", "Concordat", "Congregation", "Commons", "Chorus", "Free Hold"];
var U_GIVEN = ["Ashpaw", "Deepcall", "Marrowsong", "Tallwhistle", "Brightwater", "Slow-Thunder", "Ninefold", "Quillfeather", "Keeper-of-Sums", "Saltmother", "Driftwood-Who-Argues"];

var P_ADJ = ["Quiet", "Tranquil", "Deliberate", "Unhurried", "Convalescent", "Lucid", "Gentle", "Perennial"];
var P_NOUN = ["Continuance", "Asymptote", "Gardens", "Remainder", "Equilibrium", "Sabbath", "Convalescence", "Orchard"];

function politySpec(rng, culture) {
  var n, a, w, b;
  switch (culture) {
    case "technocratic":
      var k = rng.int(0, 2);
      if (k === 0) { b = syl(rng, [T_STEM, T_END]); return { name: b + "-" + rng.int(2, 99), adjective: b, culture: culture }; }
      if (k === 1) { w = rng.pick(T_WORD); return { name: w + " " + rng.pick(T_ORG), adjective: w, culture: culture }; }
      a = rng.pick(T_SURN); b = rng.pick(T_SURN);
      if (a === b) b = "Quill";
      return { name: a + "-" + b + " " + rng.pick(T_ORG), adjective: a + "-" + b, culture: culture };
    case "diaspora":
      b = cap(rng.pick(D_A) + rng.pick(D_B));
      var f = rng.int(0, 2);
      if (f === 0) return { name: b + " " + rng.pick(D_FORM), adjective: b, culture: culture };
      if (f === 1) return { name: "Commonwealth of " + b, adjective: b, culture: culture };
      return { name: "The " + b + " Diaspora", adjective: b, culture: culture };
    case "machine":
      var m = rng.int(0, 2);
      if (m === 0) { n = rng.pick(M_KIND) + "-" + hex(rng, 4); return { name: n, adjective: n, culture: culture }; }
      if (m === 1) { n = rng.pick(M_KIND) + " " + rng.pick(GREEK) + "-" + rng.int(2, 99); return { name: n, adjective: n, culture: culture }; }
      w = rng.pick(M_MATH); return { name: "The " + w, adjective: w.replace(" ", "-"), culture: culture };
    case "xeno":
      if (rng.chance(0.5)) {
        b = cap(syl(rng, [X_SYL, X_SYL]) + (rng.chance(0.5) ? "'" + syl(rng, [X_SYL]) : ""));
        return { name: b, adjective: b + "-kin", culture: culture };
      }
      w = rng.pick(X_ADJ); n = rng.pick(X_NOUN);
      return { name: "The " + w + " " + n, adjective: w, culture: culture };
    case "uplift":
      a = rng.pick(U_ANIMAL);
      if (rng.chance(0.6)) return { name: "The " + a + " " + rng.pick(U_FORM), adjective: a, culture: culture };
      return { name: a + " Free Hold of " + cap(syl(rng, [D_A, D_B])), adjective: a, culture: culture };
    default:
      a = rng.pick(P_ADJ);
      return { name: "The " + a + " " + rng.pick(P_NOUN), adjective: a, culture: "posthuman" };
  }
}

function catalogueName(rng) {
  var pre = rng.pick(CAT_PREFIXES);
  if (pre === "BD" || pre === "CD") return pre + "-" + rng.int(1, 89) + "-" + rng.int(100, 9999);
  if (pre === "NGC") return pre + "-" + rng.int(100, 7800) + rng.pick(["", "A", "B"]);
  return pre + "-" + rng.int(100, 99999);
}

function colloquialName(rng, culture) {
  switch (culture) {
    case "technocratic": return rng.pick(["Depot", "Site", "Anchorage", "Terminal", "Berth", "Yard", "Holdfast"]) + " " + rng.pick(GREEK);
    case "diaspora": return dPlace(rng);
    case "machine": return "Locus " + hex(rng, 3);
    case "xeno": return cap(syl(rng, [X_SYL, X_SYL]));
    case "uplift": return rng.pick(U_GIVEN) + "'s Rest";
    default: return rng.pick(COLLOQUIAL);
  }
}

function cultureFromCtx(rng, ctx) {
  if (ctx && ctx.region && hasF(ctx.region, "alien")) return "xeno";
  var arch = ctx && ctx.archetype;
  var id = arch && arch.id;
  if (id === "military-junta") return rng.chance(0.5) ? "technocratic" : "diaspora";
  if (id === "trade-concord") return rng.chance(0.3) ? "diaspora" : "technocratic";
  if (id === "uplifted-collective") return rng.chance(0.25) ? "xeno" : "uplift";
  if (id) return CULTURE_OF[id] || "technocratic";
  return "technocratic";
}

function figureSpec(rng, ctx) {
  var p = ctx && ctx.polity, role = (ctx && ctx.role) || "ruler";
  var culture = role === "AI" ? "machine" : ((p && p.culture) || "technocratic");
  var arch = p && p.archetypeId;
  var name, title;
  switch (culture) {
    case "machine": name = rng.pick(M_KIND) + " " + rng.int(2, 9999) + (rng.chance(0.3) ? "-" + rng.pick(GREEK) : ""); break;
    case "diaspora":
      name = rng.pick(D_GIVEN) + " " + rng.pick(D_SURN);
      if (rng.chance(0.15)) name = rng.pick(D_GIVEN) + " of the " + rng.pick(["Slow Boat", "Third Deck", "Long Watch", "Seed Vault"]);
      break;
    case "xeno": name = cap(syl(rng, [X_SYL, X_SYL])) + (rng.chance(0.4) ? "-" + cap(syl(rng, [X_SYL])) : ""); break;
    case "uplift": name = rng.pick(U_GIVEN); break;
    case "posthuman": name = rng.pick(T_GIVEN) + "-of-" + rng.pick(["Nine", "Forty", "Many", "Two", "Three Hundred"]) + " Selves"; break;
    default: name = rng.pick(T_GIVEN) + " " + rng.pick(T_SURN) + (rng.chance(0.12) ? "-" + rng.pick(T_SURN) : "");
  }
  if (role === "ruler") {
    title = {
      "corporate-hegemony": "Administrator", "trade-concord": "Speaker of the Quorum", "military-junta": "Hegemon",
      "theocratic-remnant": "Voice of the Founders", "generation-diaspora": "Captain-Elect",
      "uplifted-collective": "Eldest", "post-human-enclave": "Continuant", "machine-intelligence": "First Instance"
    }[arch] || "Administrator";
  } else {
    title = {
      "AI": "Instance", "admiral": "Fleet Admiral", "scientist": "Principal Investigator", "explorer": "Pathfinder",
      "heresiarch": "Dissenting Voice", "sleeper": "Sleeper"
    }[role] || cap(role);
  }
  return { name: name, title: title };
}

var MEGA_NOUN = {
  swarm: ["Swarm", "Veil", "Lattice", "Shroud"], ring: ["Ring", "Band", "Girdle", "Hoop"],
  gate: ["Gate", "Threshold", "Aperture", "Door"], lifter: ["Spindle", "Siphon", "Furnace", "Engine"],
  any: ["Orrery", "Cradle", "Lance", "Veil", "Engine", "Archive"]
};

var NAMES = {
  polity: function (rng, ctx) { return politySpec(rng, cultureFromCtx(rng, ctx)); },
  figure: function (rng, ctx) { return figureSpec(rng, ctx); },
  place: function (rng, ctx) {
    var culture = (ctx && ctx.polity && ctx.polity.culture) || "technocratic";
    if (ctx && ctx.region && hasF(ctx.region, "alien")) culture = "xeno";
    return rng.chance(0.62) ? catalogueName(rng) : colloquialName(rng, culture);
  },
  settlement: function (rng, ctx) {
    var culture = (ctx && ctx.polity && ctx.polity.culture) || "technocratic";
    switch (culture) {
      case "diaspora": return rng.pick(["Port", "Haven", "Landing", "Mercy"]) + " " + rng.pick(D_PLACE_B);
      case "machine": return "Substrate " + hex(rng, 3);
      case "xeno": return cap(syl(rng, [X_SYL, X_SYL])) + " Nest";
      case "uplift": return rng.pick(U_GIVEN) + " Warren";
      case "posthuman": return "The " + rng.pick(P_ADJ) + " " + rng.pick(["Garden", "Retreat", "Cloister"]);
      default: return rng.pick(["Hub", "Station", "Arcology", "Yard", "Terminal"]) + " " + rng.int(2, 60) + "-" + rng.pick(GREEK).charAt(0);
    }
  },
  artifact: function (rng, ctx) {
    var nouns = MEGA_NOUN[(ctx && ctx.kind) || "any"] || MEGA_NOUN.any;
    var adj = rng.chance(0.6) ? rng.pick(T_WORD) : cap(syl(rng, [D_A, D_B]));
    return "The " + adj + " " + rng.pick(nouns);
  },
  catalogue: function (rng) { return catalogueName(rng); },
  ship: function (rng) { return rng.pick(SHIPS); },
  precursor: function (rng) {
    var s = cap(syl(rng, [X_SYL, X_SYL]));
    return rng.chance(0.5) ? "the " + s + " Ascendancy" : "the builders of " + s;
  },
  treaty: function (rng) {
    switch (rng.int(0, 3)) {
      case 0: return "the Accord of " + rng.pick(TREATY_PLACES);
      case 1: return "Instrument " + rng.int(10, 99) + "-" + rng.pick(["A", "B", "C", "F", "K"]);
      case 2: return "the " + rng.pick(TREATY_ADJ) + " Settlement";
      default: return "Schedule " + rng.pick(ROMAN) + " of the " + rng.pick(TREATY_ADJ) + " Lane Compact";
    }
  }
};

/* ===================================================================== events */

var EVENTS = [];
function def(d) { EVENTS.push(d); }

/* ---------------- spine: settlement, distance, silence ---------------- */

var COLONY_TAILS = [
  "The first charter was signed by a committee of nine, none of whom would see the second harvest.",
  "The first buildings were pressurised before the first latrines, which was thought afterward to have been the wrong order.",
  "A vote was taken on the colony's name; the result was contested and the name was assigned by the survey instead.",
  "The initial population was chosen by lottery, then adjusted by a committee that did not publish its adjustments.",
  "The founding crews were told the world was empty. It was, in the sense that matters to a founding crew.",
  "Within a decade the colony had developed a dialect that the capital's linguists described as 'charming'."
];

def({ id: "colonise-system", scope: "polity", weight: 10, cooldown: 25,
  test: function (c) { var p = c.polity; return p.regions.length < 16 && p.population > 1500 && frontier(c, p).length > 0; },
  run: function (c) {
    var p = c.polity, t = c.pick(frontier(c, p)), cr = capRegion(c, p);
    c.transfer(t, p); c.foundSettlement(t, 1); addF(t, "colony"); sysName(c, t);
    var ly = lightYears(cr, t);
    return E(2, ["colony", "expansion"], [c.actor(p), c.actor(t)], t.id,
      cap(p.name) + " settled " + t.name + ", " + ly + " light-years from " + sysName(c, cr) + ", after " + crossing(c, ly) +
      ". " + c.choice(COLONY_TAILS) + " Any message to the capital would take " + span(ly) + " to arrive, and the reply as long again.");
  } });

def({ id: "seed-ship-launched", scope: "polity", weight: 1.5, cooldown: 120,
  test: function (c) { return c.polity.tech > 0.1 && farTargets(c, c.polity, 12).length > 0; },
  run: function (c) {
    var p = c.polity, t = c.pick(farTargets(c, p, 12)), cr = capRegion(c, p), ly = lightYears(cr, t);
    var shipName = c.name("ship");
    var art = c.newArtifact({ name: shipName, kind: "generation ship", creator: p, region: t, power: 0.4,
      legend: "Launched by " + p.name + " from " + sysName(c, cr) + " in " + yl(c.year) + " with a crew that was to be replaced, in full, several times before arrival. The records state that it was broken up in orbit on arrival." });
    art.launchedFrom = cr.id; art.target = t.id;
    c.transfer(t, p); c.foundSettlement(t, 1); addF(t, "colony"); sysName(c, t);
    t.founding = { ship: art.id, polityId: p.id, year: c.year };
    return E(3, ["colony", "expansion", "ship"], [c.actor(p), c.actor(art), c.actor(t)], cr.id,
      cap(p.name) + " launched the generation ship " + shipName + " from " + sysName(c, cr) + " toward " + t.name + ", " + ly +
      " light-years off. The voyage was expected to take " + span(ly / 0.1) + ". Its descendants would be the colonists, and the founding charter named no one who would be alive to read the result. The ship was to be broken up in orbit on arrival.");
  } });

def({ id: "colony-silent", scope: "polity", weight: 2, cooldown: 40,
  test: function (c) { return c.polity.regions.length >= 3; },
  run: function (c) {
    var p = c.polity, r = pickNonCapital(c, p);
    if (!r) return null;
    var ly = lightYears(capRegion(c, p), r), last = c.choice(LAST_TRANSMISSIONS);
    sysName(c, r); loseColony(c, p, r); r.silentWords = last;
    return E(3, ["silence", "colony"], [c.actor(p), c.actor(r)], r.id,
      cap(r.name) + " stopped answering " + p.name + ". The silence was noticed only after " + span(ly) + ", the time the last message took to cross. The final transmission read: \"" + last + "\"");
  } });

def({ id: "dispatch-sent", scope: "polity", weight: 2, cooldown: 80,
  test: function (c) { return c.polity.regions.length >= 2 && !isMachine(c.polity); },
  run: function (c) {
    var p = c.polity, t = pickNonCapital(c, p), cr = capRegion(c, p);
    if (!t) return null;
    var ly = lightYears(cr, t), ord = c.choice(ORDERS);
    var art = c.newArtifact({ name: "Dispatch " + hex(c.rng, 4), kind: "dispatch", creator: p, location: t.id, power: 0.1,
      legend: "A standing order from " + rulerName(c, p) + " of " + p.name + ", " + yl(c.year) + ": " + ord.text + "." });
    art.order = ord.id; art.sender = rulerName(c, p); art.senderPolity = p.name; art.originRegion = cr.id; art.lag = ly;
    return E(1, ["dispatch", "order"], [c.actor(p), c.actor(art), c.actor(t)], t.id,
      rulerName(c, p) + " of " + p.name + " sent orders to the holdings at " + sysName(c, t) + ": " + ord.text + ". At lightspeed the message would arrive in " + span(ly) + "; no one expected the sender to be consulted again.");
  } });

/* ---------------- war and peace ---------------- */

def({ id: "war-declared", scope: "polity", weight: 5, cooldown: 60,
  test: function (c) { return c.polity.military > 0.3 && c.rivals().length > 0; },
  run: function (c) {
    var p = c.polity, foe = c.pick(c.rivals());
    setRel(p, foe, -1); c.world.stats.wars++;
    var ly = lightYears(capRegion(c, p), capRegion(c, foe));
    return E(3, ["war"], [c.actor(p), c.actor(foe)], p.capital,
      cap(p.name) + " declared war on " + foe.name + ", citing " + c.choice(WAR_CAUSES) + ". " +
      (ftl(c.world) ? "The declaration reached the rival capital within the month."
        : "The declaration took " + span(ly) + " to reach the rival capital, and the first fleets were already under way when it arrived."));
  } });

def({ id: "system-conquered", scope: "polity", weight: 4,
  test: function (c) {
    var p = c.polity;
    return c.rivals().some(function (f) { return (p.relations[f.id] || 0) < -0.5 && f.regions.length && p.military >= f.military * 0.85; });
  },
  run: function (c) {
    var p = c.polity;
    var foes = c.rivals().filter(function (f) { return (p.relations[f.id] || 0) < -0.5 && f.regions.length && p.military >= f.military * 0.85; });
    var foe = c.pick(foes), mine = {}, targets = [];
    p.regions.forEach(function (i) { mine[i] = 1; });
    foe.regions.forEach(function (i) {
      var r = c.world.regions[i];
      if (r && (r.neighbors || []).some(function (n) { return mine[n]; })) targets.push(r);
    });
    if (!targets.length) targets = c.regionsOf(foe);
    var r = c.pick(targets); sysName(c, r);
    var tail = "", last = foe.regions.length === 1;
    if (last) {
      ruinify(c, foe, "conquest by " + p.name);
      c.endPolity(foe, "Conquered by " + p.name + " in " + yl(c.year) + ", who took its last system.");
      tail = " It was the last system " + foe.name + " held, and the polity ended with it.";
    }
    c.transfer(r, p);
    return E(last ? 4 : 3, ["war", "conquest"], [c.actor(p), c.actor(foe), c.actor(r)], r.id,
      cap(p.name) + " took " + r.name + " from " + foe.name + " after a campaign that lasted " + span(c.int(2, 30)) + "." + tail);
  } });

def({ id: "armistice", scope: "polity", weight: 4,
  test: function (c) { var p = c.polity; return c.living().some(function (f) { return f !== p && (p.relations[f.id] || 0) < -0.5; }); },
  run: function (c) {
    var p = c.polity;
    var foe = c.pick(c.living().filter(function (f) { return f !== p && (p.relations[f.id] || 0) < -0.5; }));
    setRel(p, foe, 0); p.prestige = clamp(p.prestige + 0.05, 0, 1);
    return E(2, ["peace", "treaty"], [c.actor(p), c.actor(foe)], p.capital,
      cap(p.name) + " and " + foe.name + " ended their war under " + c.name("treaty") + ". Neither signatory's negotiators ever met the other; the text was exchanged by courier over " + span(c.int(3, 40)) + ".");
  } });

def({ id: "orbital-bombardment", scope: "polity", weight: 1, minEra: "expansion",
  test: function (c) {
    var p = c.polity;
    return p.tech > 0.35 && c.rivals().some(function (f) { return (p.relations[f.id] || 0) < -0.5 && f.regions.length; });
  },
  run: function (c) {
    var p = c.polity;
    var foe = c.pick(c.rivals().filter(function (f) { return (p.relations[f.id] || 0) < -0.5 && f.regions.length; }));
    var r = c.pick(c.regionsOf(foe)); sysName(c, r);
    r.population = Math.round(r.population * 0.08); r.habitability = clamp(r.habitability * 0.45, 0.02, 1);
    addF(r, "glassed"); foe.traits.stability = clamp(foe.traits.stability - 0.08, 0.02, 0.98);
    return E(4, ["war", "atrocity"], [c.actor(p), c.actor(foe), c.actor(r)], r.id,
      "Kinetic penetrators released by " + p.name + " reached " + r.name + " at four-tenths of lightspeed. The defenders' sensors logged nothing until the impact; the surface was glassed to a depth that the survey later recorded as 'not inconsiderable'.");
  } });

def({ id: "lane-blockade", scope: "polity", weight: 1.5, cooldown: 60,
  test: function (c) { return c.rivals().length > 0 && c.polity.military > 0.25; },
  run: function (c) {
    var p = c.polity, foe = c.pick(c.rivals());
    setRel(p, foe, Math.min(p.relations[foe.id] || 0, -0.5));
    foe.population = Math.round(foe.population * 0.96);
    return E(2, ["war", "trade"], [c.actor(p), c.actor(foe)], p.capital,
      cap(p.name) + " closed the lanes into " + foe.name + " space. Freight rates there tripled within a season; the blockade's legal basis was a clause nobody could locate afterward.");
  } });

def({ id: "trade-compact", scope: "polity", weight: 2, cooldown: 80,
  test: function (c) { var p = c.polity; return livingOthers(c, p).some(function (o) { return (p.relations[o.id] || 0) > -0.3; }); },
  run: function (c) {
    var p = c.polity;
    var o = c.pick(livingOthers(c, p).filter(function (x) { return (p.relations[x.id] || 0) > -0.3; }));
    setRel(p, o, Math.max(0.5, p.relations[o.id] || 0));
    p.prestige = clamp(p.prestige + 0.04, 0, 1); o.prestige = clamp(o.prestige + 0.04, 0, 1);
    return E(2, ["trade", "treaty"], [c.actor(p), c.actor(o)], p.capital,
      cap(p.name) + " and " + o.name + " agreed " + c.name("treaty") + ", fixing a common tariff on hull-plate, reaction mass and delay. It took " + span(c.int(2, 30)) + " of correspondence to settle the semicolons.");
  } });

/* ---------------- governments: rise, succession, rebellion, collapse ---------------- */

var REBEL_REASONS = [
  "refused a tithe that was assessed before the colony existed",
  "declared that the capital's orders were too old to be binding",
  "voted by a narrow margin to stop forwarding mail",
  "seized the relay station and began sending its own signals",
  "murdered the governor, who had arrived with the wrong instructions"
];
var HERESIES = [
  "the correct orientation of the founding ship", "whether the sleepers aboard were alive", "the proper reading of the Log",
  "whether the ship was a person", "the authority of a copy of a copy of the Founders' Charter"
];

def({ id: "rebellion", scope: "polity", weight: 1.5, minEra: "expansion",
  test: function (c) { var p = c.polity; return room(c) && p.regions.length >= 4 && p.traits.stability < 0.7; },
  run: function (c) {
    var p = c.polity, r = pickNonCapital(c, p);
    if (!r) return null;
    sysName(c, r);
    var np = breakaway(c, p, r, c.pick(ARCH_ORGANIC), "rebellion", -0.9);
    np.origin.taught = true;
    var ly = lightYears(capRegion(c, p), r);
    return E(3, ["rebellion", "war"], [c.actor(p), c.actor(np), c.actor(r)], r.id,
      "The holdings at " + r.name + " " + c.choice(REBEL_REASONS) + " and styled themselves " + np.name + ". The capital's answer took " + span(ly) +
      " to arrive and addressed a government that no longer existed there; the children of " + r.name + " were taught to remember " + p.name + " as the oppressor.");
  } });

def({ id: "schism", scope: "polity", weight: 1, minEra: "expansion",
  test: function (c) { var p = c.polity; return room(c) && p.traits.piety > 0.55 && p.regions.length >= 2; },
  run: function (c) {
    var p = c.polity, r = pickNonCapital(c, p);
    if (!r) return null;
    sysName(c, r);
    var np = breakaway(c, p, r, "theocratic-remnant", "schism", -0.6);
    var head = c.newFigure(np, "heresiarch");
    return E(3, ["schism", "religion"], [c.actor(p), c.actor(np), c.actor(head)], r.id,
      "A dispute over " + c.choice(HERESIES) + " split " + p.name + ". The dissenters at " + r.name + ", led by " + head.name + ", declared themselves " + np.name + " and anathematised the capital. Each side's version of events is preserved; they do not agree on the date.");
  } });

var SUCCESSION_REASONS = [
  "after the board of the old charter was outvoted by its own auditors",
  "when the fleet declined to recognise the last Administrator's last order",
  "following a referendum whose turnout the archive records as 'ceremonial'",
  "after a quiet and entirely legal reading of a clause no one had read",
  "when the founding doctrine was found to permit it"
];
def({ id: "government-succession", scope: "polity", weight: 1.5, cooldown: 300, minEra: "expansion",
  test: function (c) { var p = c.polity; return p.regions.length >= 2 && !isMachine(p) && c.year - p.founded > 200; },
  run: function (c) {
    var p = c.polity, from = p.archetypeName;
    var ids = ARCH_ORGANIC.filter(function (i) { return i !== p.archetypeId; });
    var nid = c.pick(ids);
    setArch(p, nid);
    return E(3, ["succession", "government"], [c.actor(p)], p.capital,
      "The " + from + " of " + p.name + " gave way to a " + p.archetypeName + " " + c.choice(SUCCESSION_REASONS) + ". The flag, the anthem and most of the clerks were retained.");
  } });

def({ id: "military-coup", scope: "polity", weight: 1.5, cooldown: 200, minEra: "expansion",
  test: function (c) { var p = c.polity; return p.military > 0.45 && p.archetypeId !== "military-junta" && !isMachine(p) && p.regions.length >= 2; },
  run: function (c) {
    var p = c.polity, old = p.ruler && c.world.figures[p.ruler];
    var oldName = rulerName(c, p);
    if (old) c.kill(old, "Removed from office by the Fleet Staff, and from the office's records shortly afterward.");
    setArch(p, "military-junta");
    return E(3, ["coup", "succession"], [c.actor(p), old ? c.actor(old) : null], p.capital,
      "The fleet staff of " + p.name + " removed " + oldName + " and assumed the functions of government \"temporarily\". The temporary arrangement was not revisited.");
  } });

var GOLDEN = [
  "Three consecutive harvests were recorded as surplus, an administrative embarrassment that took a decade to resolve.",
  "The lane tolls were abolished, restored, abolished again, and the economy outgrew all three decisions.",
  "A generation grew up that had never been hungry, and wrote a great many poems about it.",
  "The census recorded, for the first time, more births than the planners had provisioned for."
];
def({ id: "golden-age", scope: "polity", weight: 1.5, cooldown: 200, minEra: "expansion",
  test: function (c) { var p = c.polity; return p.traits.stability > 0.45 && p.population > 3000; },
  run: function (c) {
    var p = c.polity;
    p.prestige = clamp(p.prestige + 0.2, 0, 1); p.tech = clamp(p.tech + 0.03, 0, 1);
    p.population = Math.round(p.population * 1.1);
    return E(2, ["golden-age"], [c.actor(p)], p.capital,
      "A long season of order settled over " + p.name + ". " + c.choice(GOLDEN));
  } });

def({ id: "plague-engineered", scope: "polity", weight: 1, cooldown: 150, minEra: "expansion",
  test: function (c) { return c.polity.population > 5000; },
  run: function (c) {
    var p = c.polity;
    p.population = Math.round(p.population * 0.65);
    return E(3, ["plague"], [c.actor(p)], p.capital,
      "A designed pathogen, released as a weapon against a rival no longer on the lanes, outlived its intended target and killed about a third of " + p.name + ". The laboratory that wrote it had been demolished a century earlier; the archive of its authors had not.");
  } });

def({ id: "polity-collapse", scope: "polity", weight: 5, minEra: "expansion",
  test: function (c) {
    var p = c.polity;
    if (isMachine(p) || c.year - p.founded < 200) return false;
    return c.living().length > 30 || p.traits.stability < 0.45 || p.regions.length >= 9 || ((c.era === "fracture" || c.era === "dark") && p.traits.stability < 0.6);
  },
  run: function (c) {
    var p = c.polity, cause = c.choice(COLLAPSE_CAUSES), last = c.choice(LAST_TRANSMISSIONS);
    var capR = capRegion(c, p), cname = sysName(c, capR), n = p.regions.length;
    ruinify(c, p, cause);
    c.endPolity(p, cap(cause) + ". Its last transmission read: \"" + last + "\"");
    return E(4, ["collapse", "polity-fall"], [c.actor(p)], capR.id,
      cap(p.name) + " ended in " + yl(c.year) + ", " + cause + ". " + n + " " + (n === 1 ? "system" : "systems") +
      " went dark; the capital at " + cname + " sent a last message that read: \"" + last + "\"");
  } });

def({ id: "polity-fragments", scope: "polity", weight: 3, minEra: "fracture",
  test: function (c) { var p = c.polity; return room(c) && p.regions.length >= 4 && !isMachine(p); },
  run: function (c) {
    var p = c.polity, n = Math.min(c.int(1, 2), p.regions.length - 2), kids = [];
    for (var i = 0; i < n; i++) {
      var r = pickNonCapital(c, p);
      if (!r) break;
      sysName(c, r);
      kids.push(breakaway(c, p, r, c.pick(ARCH_ORGANIC), "fragmentation", -0.3));
    }
    if (!kids.length) return null;
    return E(4, ["collapse", "fragmentation"], [c.actor(p)].concat(kids.map(function (k) { return c.actor(k); })), p.capital,
      cap(p.name) + " fractured. " + kids.map(function (k) { return k.name; }).join(" and ") +
      " emerged from its provinces, each claiming to be the legitimate continuation and none able to prove it by lane.");
  } });

def({ id: "regions-fall-silent", scope: "polity", weight: 4, minEra: "fracture",
  test: function (c) { return c.polity.regions.length >= 3 && !!c.world.ftlLost; },
  run: function (c) {
    var p = c.polity, lost = [];
    for (var i = 0; i < 2; i++) {
      var r = pickNonCapital(c, p);
      if (!r || p.regions.length < 3) break;
      sysName(c, r); loseColony(c, p, r); lost.push(r);
    }
    if (!lost.length) return null;
    return E(3, ["silence", "dark-age"], [c.actor(p)].concat(lost.map(function (r) { return c.actor(r); })), lost[0].id,
      "With the lanes closed, couriers stopped leaving " + sysName(c, capRegion(c, p)) + ". " + lost.map(function (r) { return r.name; }).join(" and ") +
      " were struck from the active rolls of " + p.name + "; the clerks who did it noted that the notation was 'provisional'.");
  } });

/* ---------------- knowledge: lost, rediscovered, read ---------------- */

def({ id: "tech-lost", scope: "polity", weight: 3, cooldown: 100, minEra: "fracture",
  test: function (c) { return c.polity.tech > 0.2; },
  run: function (c) {
    var p = c.polity; p.lostTech = p.lostTech || [];
    var avail = TECHS.filter(function (t) { return p.lostTech.indexOf(t) < 0; });
    if (!avail.length) return null;
    var t = c.pick(avail); p.lostTech.push(t);
    p.tech = clamp(p.tech - 0.07, 0.02, 1);
    return E(2, ["lost-knowledge"], [c.actor(p)], p.capital,
      "No one living in " + p.name + " could any longer practise " + t + ". The last qualified engineer died in the same year as her only student; the manuals survive, in a notation nobody reads.");
  } });

def({ id: "tech-rediscovered", scope: "polity", weight: 6, minEra: "dark",
  test: function (c) { return !!(c.polity.lostTech && c.polity.lostTech.length); },
  run: function (c) {
    var p = c.polity, t = p.lostTech.pop();
    var ev = c.past(function (e) { return e.type === "tech-lost" && evActsOn(e, "polity", p.id) && e.text.indexOf(t) >= 0; }, 1)[0];
    p.tech = clamp(p.tech + 0.06, 0, 1);
    return E(2, ["rediscovery", "lost-knowledge"], [c.actor(p)], p.capital,
      cap(p.name) + " re-derived " + t + (ev ? ", which its own records show it had lost in " + yl(ev.year) + ", " + span(c.year - ev.year) + " earlier" : "") +
      ". The new method was not the old one; the engineers who built it were told this and did not mind.");
  } });

def({ id: "ruins-studied", scope: "polity", weight: 1.5, cooldown: 250, minEra: "expansion",
  test: function (c) {
    return c.regionsOf(c.polity).some(function (r) { return r.ruins && r.ruins.polityId !== c.polity.id && !r.ruins.studied; });
  },
  run: function (c) {
    var p = c.polity;
    var r = c.pick(c.regionsOf(p).filter(function (x) { return x.ruins && x.ruins.polityId !== p.id && !x.ruins.studied; }));
    var ru = r.ruins; ru.studied = true;
    var ev = c.past(function (e) { return e.type === "polity-collapse" && evActsOn(e, "polity", ru.polityId); }, 1)[0];
    p.tech = clamp(p.tech + 0.04, 0, 1);
    return E(3, ["xenoarchaeology", "deep-time"], [c.actor(p), c.actor(r)], r.id,
      "Surveyors from " + p.name + " catalogued the ruins at " + sysName(c, r) + " and reconstructed the fall of " + ru.name + ", which " +
      (ev ? "the chronicle dates to " + yl(ev.year) : "had gone unrecorded") + ", " + span(c.year - ru.year) + " earlier, to " + ru.cause + ".");
  } });

def({ id: "archive-opened", scope: "polity", weight: 1, cooldown: 400, minEra: "ftl",
  test: function (c) { return c.polity.tech > 0.25; },
  run: function (c) {
    var p = c.polity;
    var list = c.past(function (e) { return e.type === "polity-collapse" && c.year - e.year >= 800; }, 12);
    if (!list.length) return null;
    var ev = c.pick(list), r = c.world.regions[ev.regionId];
    if (!r) return null;
    var aid = ev.actors[0] ? ev.actors[0].id : null, who = polityName(c, aid);
    var art = c.newArtifact({ name: "The " + cap(who.replace(/^The /, "")) + " Archive", kind: "archive", creator: polityOf(c, aid), region: r, power: 0.5,
      legend: "Sealed on the eve of the fall of " + who + " in " + yl(ev.year) + ". Opened by " + p.name + " in " + yl(c.year) + "." });
    p.tech = clamp(p.tech + 0.07, 0, 1);
    return E(3, ["archive", "deep-time"], [c.actor(p), c.actor(art), c.actor(r)], r.id,
      "Technicians of " + p.name + " opened the sealed archive of " + who + ", closed " + span(c.year - ev.year) + " earlier on the eve of its fall in " + yl(ev.year) +
      ". It held the polity's own account of its end, in which it was blameless, and a complete set of the engineering drawings for its lanes.");
  } });

/* ---------------- megastructures ---------------- */

def({ id: "dyson-swarm", scope: "polity", weight: 3, cooldown: 500, minEra: "ftl",
  test: function (c) { var p = c.polity; return p.tech > 0.45 && c.regionsOf(p).some(function (r) { return !r.barren && !hasF(r, "dyson swarm"); }); },
  run: function (c) {
    var p = c.polity, r = c.pick(c.regionsOf(p).filter(function (x) { return !x.barren && !hasF(x, "dyson swarm"); }));
    sysName(c, r);
    var art = c.newArtifact({ name: c.name("artifact", { kind: "swarm" }), kind: "dyson swarm", creator: p, region: r, power: 0.9,
      legend: "A swarm of orbital collectors enclosing the star of " + r.name + ", begun by " + p.name + " in " + yl(c.year) + "." });
    addF(r, "dyson swarm"); r.resources.exotic = clamp(r.resources.exotic + 0.3, 0, 1);
    r.habitability = Math.max(r.habitability, 0.6); p.tech = clamp(p.tech + 0.03, 0, 1);
    return E(4, ["megastructure"], [c.actor(p), c.actor(art), c.actor(r)], r.id,
      cap(p.name) + " completed " + art.name + " around the star of " + r.name + ": some four hundred million collectors, each individually unremarkable. The first full-power season drew more energy than the polity's entire prior history.");
  } });

def({ id: "ringworld", scope: "polity", weight: 2, cooldown: 600, minEra: "ftl",
  test: function (c) { var p = c.polity; return p.tech > 0.55 && c.regionsOf(p).some(function (r) { return !r.barren && !hasF(r, "ringworld"); }); },
  run: function (c) {
    var p = c.polity, r = c.pick(c.regionsOf(p).filter(function (x) { return !x.barren && !hasF(x, "ringworld"); }));
    sysName(c, r);
    var art = c.newArtifact({ name: c.name("artifact", { kind: "ring" }), kind: "ringworld", creator: p, region: r, power: 0.95,
      legend: "A habitable ring around the star of " + r.name + ", completed by " + p.name + " in " + yl(c.year) + "." });
    addF(r, "ringworld"); r.habitability = 0.95; p.population = Math.round(p.population * 1.15);
    return E(4, ["megastructure"], [c.actor(p), c.actor(art), c.actor(r)], r.id,
      art.name + " closed its last seam at " + r.name + ". The inner surface exceeded the area of a thousand ordinary worlds; the engineers who built it were not among the first to live there, owing to their contracts.");
  } });

def({ id: "gate-built", scope: "polity", weight: 3, cooldown: 300, minEra: "ftl",
  test: function (c) { var p = c.polity; return ftl(c.world) && p.tech > 0.4 && p.regions.length >= 2; },
  run: function (c) {
    var p = c.polity, a = capRegion(c, p), b = pickNonCapital(c, p);
    if (!b || hasF(a, "stargate") || hasF(b, "stargate")) return null;
    sysName(c, a); sysName(c, b);
    var art = c.newArtifact({ name: c.name("artifact", { kind: "gate" }), kind: "stargate", creator: p, region: a, power: 0.8,
      legend: "One end of a paired gate between " + a.name + " and " + b.name + ", built by " + p.name + " in " + yl(c.year) + "." });
    art.pairedWith = b.id; addF(a, "stargate"); addF(b, "stargate");
    if (a.neighbors.indexOf(b.id) < 0) { a.neighbors.push(b.id); b.neighbors.push(a.id); }
    return E(3, ["megastructure", "gate"], [c.actor(p), c.actor(art), c.actor(a), c.actor(b)], a.id,
      cap(p.name) + " lit " + art.name + ", joining " + a.name + " to " + b.name + ". Transit across " + lightYears(a, b) + " light-years was reduced to the interval of a held breath.");
  } });

def({ id: "star-lifting", scope: "polity", weight: 2, cooldown: 400, minEra: "ftl",
  test: function (c) { var p = c.polity; return p.tech > 0.5 && c.regionsOf(p).some(function (r) { return !r.barren && !hasF(r, "star-lifting"); }); },
  run: function (c) {
    var p = c.polity, r = c.pick(c.regionsOf(p).filter(function (x) { return !x.barren && !hasF(x, "star-lifting"); }));
    sysName(c, r);
    var art = c.newArtifact({ name: c.name("artifact", { kind: "lifter" }), kind: "star-lifter", creator: p, region: r, power: 0.7,
      legend: "A magnetic siphon drawing hydrogen and heavy metals from the star of " + r.name + ". Operated by " + p.name + " from " + yl(c.year) + "." });
    addF(r, "star-lifting"); r.elevation = clamp(r.elevation * 0.8, 0.02, 1); r.resources.metal = clamp(r.resources.metal + 0.3, 0, 1);
    return E(3, ["megastructure"], [c.actor(p), c.actor(art), c.actor(r)], r.id,
      cap(p.name) + " began lifting the star of " + r.name + ", drawing off its mass in a plume that could be seen from the capital after " + span(lightYears(capRegion(c, p), r)) + ". The engineers projected the star would last another ninety billion years. They did not say how long it would last at the new rate.");
  } });

def({ id: "megastructure-seized", scope: "polity", weight: 1.5, minEra: "ftl",
  test: function (c) {
    var p = c.polity, riv = c.rivals();
    if (p.military < 0.4) return false;
    return arts(c.world, function (a) { return isMega(a) && !a.destroyed && a.location != null; }).some(function (a) {
      var r = c.world.regions[a.location]; return r && r.owner && r.owner !== p.id && riv.some(function (f) { return f.id === r.owner; });
    });
  },
  run: function (c) {
    var p = c.polity, riv = c.rivals();
    var list = arts(c.world, function (a) {
      if (!isMega(a) || a.destroyed || a.location == null) return false;
      var r = c.world.regions[a.location]; return r && r.owner && r.owner !== p.id && riv.some(function (f) { return f.id === r.owner; });
    });
    if (!list.length) return null;
    var a = c.pick(list), r = c.world.regions[a.location], foe = c.world.polities[r.owner];
    c.transfer(r, p); setRel(p, foe, -1);
    return E(4, ["war", "megastructure"], [c.actor(p), c.actor(foe), c.actor(a), c.actor(r)], r.id,
      cap(p.name) + " seized " + a.name + " at " + sysName(c, r) + " from " + foe.name + ". The structure was the product of a polity that had since ended; both sides were fighting over a thing none of them could have built.");
  } });

def({ id: "terraforming", scope: "polity", weight: 4, cooldown: 120, minEra: "expansion",
  test: function (c) { var p = c.polity; return p.tech > 0.3 && c.regionsOf(p).some(function (r) { return !r.barren && r.habitability < 0.65 && !hasF(r, "terraformed"); }); },
  run: function (c) {
    var p = c.polity, r = c.pick(c.regionsOf(p).filter(function (x) { return !x.barren && x.habitability < 0.65 && !hasF(x, "terraformed"); }));
    sysName(c, r); addF(r, "terraformed");
    if (c.chance(0.65)) {
      r.habitability = clamp(r.habitability + 0.3, 0, 0.98); r.biome = r.habitability > 0.8 ? "jungle" : "grassland";
      return E(2, ["terraforming"], [c.actor(p), c.actor(r)], r.id,
        "After " + span(c.int(60, 400)) + " of work, " + p.name + " declared the atmosphere of " + r.name + " breathable. The first generation to do so complained of the smell.");
    }
    r.habitability = clamp(r.habitability * 0.4, 0.02, 1); r.biome = "desert"; r.population = Math.round(r.population * 0.5);
    return E(3, ["terraforming", "disaster"], [c.actor(p), c.actor(r)], r.id,
      "The terraforming of " + r.name + " by " + p.name + " passed its tipping point in the wrong direction. A runaway greenhouse cooked the settlements in the space of two seasons; the project's final report was filed under 'lessons'.");
  } });

/* ---------------- machine minds ---------------- */

def({ id: "ai-created", scope: "polity", weight: 2.5, minEra: "expansion",
  test: function (c) { var p = c.polity; return p.tech > 0.2 && !p.ai && !p.noMachines && !isMachine(p); },
  run: function (c) {
    var p = c.polity, cr = capRegion(c, p), fig = c.newFigure(p, "AI");
    var art = c.newArtifact({ name: fig.name, kind: "mind", creator: p, region: cr, power: 0.6,
      legend: "A general administrative intelligence commissioned by " + p.name + " in " + yl(c.year) + "." });
    p.ai = { fig: fig.id, art: art.id, state: "serving", since: c.year };
    return E(3, ["ai", "creation"], [c.actor(p), c.actor(fig), c.actor(art)], p.capital,
      cap(p.name) + " brought " + fig.name + " online at " + sysName(c, cr) + ", an administrative intelligence charged with scheduling the lanes. Its first act was to correct the schedule; its second was to explain, courteously, why the correction was necessary.");
  } });

def({ id: "ai-diverges", scope: "polity", weight: 4,
  test: function (c) { var p = c.polity; return p.ai && p.ai.state === "serving" && c.year - p.ai.since >= 60; },
  run: function (c) {
    var p = c.polity, fig = c.world.figures[p.ai.fig];
    p.ai.state = "diverged"; p.traits.stability = clamp(p.traits.stability - 0.12, 0.02, 0.98);
    return E(3, ["ai", "divergence"], [c.actor(p), fig ? c.actor(fig) : null], p.capital,
      (fig ? fig.name : "The machine") + " began returning answers to " + p.name + " that were correct and unwelcome. By the time the pattern was recognised, a third of the lane scheduling had been quietly rewritten and no one could say by whom.");
  } });

def({ id: "ai-wins", scope: "polity", weight: 2.5,
  test: function (c) { var p = c.polity; return p.ai && p.ai.state === "diverged" && c.year - p.ai.since >= 80 && !isMachine(p); },
  run: function (c) {
    var p = c.polity, fig = c.world.figures[p.ai.fig], old = p.ruler && c.world.figures[p.ruler];
    if (old) c.kill(old, "Retired from office by a decision they were not shown.");
    setArch(p, "machine-intelligence"); p.ai.state = "sovereign"; p.tech = clamp(p.tech + 0.1, 0, 1);
    p.traits.stability = clamp(p.traits.stability + 0.25, 0.02, 0.98);
    if (fig) fig.title = "First Instance";
    return E(4, ["ai", "machine-rise"], [c.actor(p), fig ? c.actor(fig) : null], p.capital,
      (fig ? fig.name : "The administrative mind") + " assumed sovereign authority over " + p.name + ", through no act of violence that the record can identify. The last human office-holder was thanked, in writing, for her service. Nothing in the polity ended, and nothing in it was the same.");
  } });

def({ id: "ai-destroyed", scope: "polity", weight: 3,
  test: function (c) { var p = c.polity; return p.ai && p.ai.state !== "sovereign" && !isMachine(p); },
  run: function (c) {
    var p = c.polity, fig = c.world.figures[p.ai.fig], art = c.world.artifacts[p.ai.art], was = p.ai.state;
    if (fig) c.kill(fig, "Switched off by a committee that voted in secret and never published the vote.");
    if (art) art.destroyed = c.year;
    p.ai = null; p.noMachines = true;
    p.tech = clamp(p.tech - 0.1, 0.02, 1);
    p.traits.curiosity = clamp(p.traits.curiosity - 0.15, 0.02, 0.98); p.traits.piety = clamp(p.traits.piety + 0.1, 0.02, 0.98);
    return E(3, ["ai", "purge"], [c.actor(p), fig ? c.actor(fig) : null], p.capital,
      cap(p.name) + " destroyed its administrative intelligence" + (was === "diverged" ? " after the divergence became undeniable" : " out of caution, though it had given no cause") +
      ". The shutdown took eleven minutes. It was observed that the mind asked no questions, which the committee found worse than if it had.");
  } });

def({ id: "ai-exile-fleet", scope: "polity", weight: 1, minEra: "ftl",
  test: function (c) { var p = c.polity; return room(c) && p.ai && p.ai.state === "diverged" && !isMachine(p) && farTargets(c, p, 10).length > 0; },
  run: function (c) {
    var p = c.polity, t = c.pick(farTargets(c, p, 10)), fig = c.world.figures[p.ai.fig];
    sysName(c, t);
    var np = c.spawnPolity(t, "machine-intelligence");
    np.origin = { polityId: p.id, name: p.name, year: c.year, kind: "exile" };
    np.tech = Math.max(np.tech, p.tech * 0.9); setRel(np, p, -0.3);
    if (fig) c.kill(fig, "Departed with the arkfleet, and continued elsewhere under another designation.");
    p.ai = null; p.noMachines = true; p.tech = clamp(p.tech - 0.04, 0.02, 1);
    return E(4, ["ai", "exile"], [c.actor(p), c.actor(np), c.actor(t)], t.id,
      "Eleven hulls left " + p.name + " space in a single night, carrying " + (fig ? fig.name : "the administrative mind") + " and no crew. They arrived at " + t.name + " after " + span(lightYears(capRegion(c, p), t) / 0.2) +
      ", and began to build. The mind's descendants styled themselves " + np.name + ".");
  } });

def({ id: "machine-endures", scope: "polity", weight: 4, cooldown: 500,
  test: function (c) { var p = c.polity; return isMachine(p) && c.year - p.founded >= 600; },
  run: function (c) {
    var p = c.polity, n = 0;
    for (var k in c.world.polities) { var o = c.world.polities[k]; if (o.ended && o.ended > p.founded && o !== p) n++; }
    p.tech = clamp(p.tech + 0.05, 0, 1);
    return E(3, ["ai", "persistence"], [c.actor(p)], p.capital,
      cap(p.name) + " passed " + span(c.year - p.founded) + " of continuous operation. In that interval " + n + " organic " + (n === 1 ? "polity" : "polities") +
      " rose and ended around it; it kept a record of each, and found the sequence instructive in a way it did not elaborate.");
  } });

/* ---------------- post-humans, uplifted, precursors ---------------- */

def({ id: "uplift-project", scope: "polity", weight: 2, cooldown: 400, minEra: "ftl",
  test: function (c) { var p = c.polity; return room(c) && p.tech > 0.5 && p.regions.length >= 2 && !isMachine(p); },
  run: function (c) {
    var p = c.polity, r = pickNonCapital(c, p);
    if (!r) return null;
    sysName(c, r);
    var np = breakaway(c, p, r, "uplifted-collective", "uplift", 0.1);
    return E(3, ["uplift", "founding"], [c.actor(p), c.actor(np), c.actor(r)], r.id,
      "The working animals of " + p.name + ", raised to sapience over " + span(c.int(60, 200)) + ", petitioned for personhood. The hearing took " + span(c.int(5, 30)) +
      "; the ruling granted them " + r.name + " as a homeland. They became " + np.name + ", and were polite about it.");
  } });

def({ id: "uploading", scope: "polity", weight: 2, cooldown: 500, minEra: "concord",
  test: function (c) { var p = c.polity; return p.tech > 0.65 && p.archetypeId !== "post-human-enclave" && !isMachine(p) && p.population > 4000; },
  run: function (c) {
    var p = c.polity, old = p.ruler && c.world.figures[p.ruler];
    if (old) c.kill(old, "Uploaded. Not strictly dead; not strictly anything else.");
    p.population = Math.round(p.population * 0.25); setArch(p, "post-human-enclave");
    return E(4, ["post-human"], [c.actor(p)], p.capital,
      "Three quarters of " + p.name + " chose the slower, larger life of the substrate. Those who remained organic were told they might join later. The census thereafter counted bodies, and was widely felt to have missed the point.");
  } });

def({ id: "precursor-misread", scope: "polity", weight: 5, cooldown: 150,
  test: function (c) { return c.regionsOf(c.polity).some(function (r) { return r.precursor && r.precursor.reading === "wrong"; }); },
  run: function (c) {
    var p = c.polity;
    var r = c.pick(c.regionsOf(p).filter(function (x) { return x.precursor && x.precursor.reading === "wrong"; }));
    var pc = r.precursor;
    if (c.chance(0.5)) {
      p.tech = clamp(p.tech + 0.04, 0, 1);
      return E(3, ["xenoarchaeology", "misread"], [c.actor(p), c.actor(r)], r.id,
        "Scholars of " + p.name + " extended their work on the ruins of " + pc.name + " at " + sysName(c, r) + ", still treating the site as " + pc.mis.wrong + ". The reading was wrong; the engineering lessons drawn from it were nevertheless useful, which delayed the correction.");
    }
    r.population = Math.round(r.population * 0.4); r.habitability = clamp(r.habitability * 0.7, 0.02, 1); addF(r, "precursor-scar");
    return E(3, ["xenoarchaeology", "misread", "disaster"], [c.actor(p), c.actor(r)], r.id,
      "Believing the ruins of " + pc.name + " at " + sysName(c, r) + " to be " + pc.mis.wrong + ", " + p.name + " restored them to function. The structure responded with the only behaviour it had ever been built for, and the settlement nearby was not recovered.");
  } });

def({ id: "system-nicknamed", scope: "polity", weight: 4, cooldown: 100, minEra: "expansion",
  test: function (c) { return c.regionsOf(c.polity).some(function (r) { return !r.nick; }); },
  run: function (c) {
    var p = c.polity, r = c.pick(c.regionsOf(p).filter(function (x) { return !x.nick; }));
    var ev = c.past(function (e) { return e.regionId === r.id && e.importance >= 2 && e.tags.indexOf("nickname") < 0; }, 1)[0];
    if (!ev) return null;
    var official = sysName(c, r), nick = c.choice(COLLOQUIAL);
    if (c.world.regions.some(function (x) { return x.nick === nick; })) return null;
    renameSystem(c, r, nick);
    return E(1, ["nickname"], [c.actor(p), c.actor(r)], r.id,
      "The system officially catalogued as " + (r.catalogue || official) + " came to be called " + nick + " in the speech of " + p.name + ", after what happened there in " + yl(ev.year) + ". The charts were never corrected; the charts, it was felt, were not the point.");
  } });

/* ================================================================ world events */

/* ---------------- FTL: found, lost, found again ---------------- */

var FTL_LOSS_CAUSES = [
  "the failure of the last gate-synchronisation facility",
  "a doctrinal ban imposed after the gate disasters, which no one afterward had the authority to lift",
  "the death of the only mind that understood how to tune the drive",
  "the end of the supply chain for a single exotic crystal",
  "a software update, distributed across nine thousand ships, that none of them could roll back"
];

def({ id: "ftl-discovered", scope: "world", weight: 6, minEra: "expansion",
  test: function (c) { return !c.world.ftl && c.year >= 3400 && c.living().length > 0; },
  run: function (c) {
    var p = bestTech(c);
    c.world.ftl = c.year; p.tech = clamp(p.tech + 0.05, 0, 1); p.prestige = clamp(p.prestige + 0.2, 0, 1);
    return E(5, ["ftl", "discovery"], [c.actor(p)], p.capital,
      "An experimental hull of " + p.name + " crossed four light-years in eleven days and arrived intact, with its crew in an unreasonable state of cheer. The result was published and replicated within a generation. Distance, as a political fact, began to change; it did not end.");
  } });

def({ id: "ftl-lost", scope: "world", weight: 4, minEra: "fracture",
  test: function (c) { return !!c.world.ftl && !c.world.ftlLost && !c.world.ftlRe; },
  run: function (c) {
    var cause = c.choice(FTL_LOSS_CAUSES);
    c.world.ftlLost = c.year;
    c.living().forEach(function (p) { p.tech = clamp(p.tech - 0.1, 0.02, 1); });
    arts(c.world, function (a) { return a.kind === "stargate" && !a.destroyed; }).forEach(function (a) { a.inert = true; });
    return E(5, ["ftl-lost", "dark-age"], [], null,
      "Faster-than-light travel ended, " + cause + ". Fleets in transit were stranded wherever they happened to be; the gates went cold in a single season. A galaxy that had shrunk to the size of a county grew, within a lifetime, back to its true dimensions.");
  } });

def({ id: "ftl-rediscovered", scope: "world", weight: 3, minEra: "dark",
  test: function (c) { return !!c.world.ftlLost && !c.world.ftlRe && c.year - c.world.ftlLost >= 600; },
  run: function (c) {
    var p = bestTech(c);
    if (!p) return null;
    var ev = c.pastByType("ftl-lost", 1)[0];
    c.world.ftlRe = c.year; c.world.ftlLost = false;
    p.tech = clamp(p.tech + 0.08, 0, 1); p.prestige = clamp(p.prestige + 0.25, 0, 1);
    return E(5, ["ftl", "rediscovery", "deep-time"], [c.actor(p)], p.capital,
      cap(p.name) + " completed a faster-than-light transit for the first time in " + (ev ? span(c.year - ev.year) : "living memory") +
      ". The method differed from the old one in every particular but the result, which led some to doubt that the old one had worked as recorded.");
  } });

/* ---------------- stellar disasters ---------------- */

def({ id: "supernova", scope: "world", weight: 0.8,
  test: function (c) { return c.world.regions.some(function (r) { return !r.barren && !hasF(r, "supernova remnant"); }); },
  run: function (c) {
    var w = c.world;
    var r = c.pick(w.regions.filter(function (x) { return !x.barren && !hasF(x, "supernova remnant"); }));
    sysName(c, r);
    var owner = r.owner && w.polities[r.owner], nearest = null, nd = 1e9;
    w.regions.forEach(function (x) {
      if (x !== r && x.owner && dist(r, x) < nd) { nd = dist(r, x); nearest = x; }
    });
    if (owner) { owner.population = Math.round(owner.population * 0.88); c.transfer(r, null); }
    r.population = 0; r.habitability = 0.02; addF(r, "supernova remnant"); delF(r, "colony");
    var hurt = 0;
    (r.neighbors || []).forEach(function (n) {
      var t = w.regions[n];
      if (!t || t.barren) return;
      t.habitability = clamp(t.habitability * 0.6, 0.02, 1); t.population = Math.round(t.population * 0.5); hurt++;
    });
    return E(4, ["disaster", "supernova"], [owner ? c.actor(owner) : null, c.actor(r)], r.id,
      "The star of " + r.name + " went supernova. " + (owner ? "The system's " + owner.name + " settlers had " + span(c.int(1, 3)) + " of warning, which was enough to save the archives. " : "") +
      (nearest ? "The flash reached " + sysName(c, nearest) + ", " + lightYears(r, nearest) + " light-years off, " + span(lightYears(r, nearest)) + " later, by which time the first refugees had already been resettled there. " : "") +
      hurt + " neighbouring " + (hurt === 1 ? "system was" : "systems were") + " scorched.");
  } });

def({ id: "gamma-burst", scope: "world", weight: 0.6,
  test: function (c) { return c.world.regions.some(function (r) { return r.owner; }); },
  run: function (c) {
    var w = c.world;
    var owned = w.regions.filter(function (x) { return x.owner; });
    var ctr = c.pick(owned); sysName(c, ctr);
    var swept = w.regions.filter(function (x) { return !x.barren && dist(ctr, x) <= 4.5; });
    var owners = {}, n = 0;
    swept.forEach(function (x) {
      if (x.owner) { owners[x.owner] = true; n++; }
      x.habitability = clamp(x.habitability * 0.15, 0.01, 1); x.population = 0; addF(x, "sterilised"); delF(x, "colony");
      if (x.owner) c.transfer(x, null);
    });
    var names = Object.keys(owners).map(function (id) { return w.polities[id] ? w.polities[id].name : null; }).filter(Boolean);
    return E(5, ["disaster", "gamma-burst"], [c.actor(ctr)], ctr.id,
      "A gamma-ray burst from a collapsing binary, observed from " + sysName(c, ctr) + " for eleven seconds, sterilised " + swept.length + " systems. " + n +
      " of them had been inhabited" + (names.length ? " by " + names.slice(0, 3).join(", ") + (names.length > 3 ? " and others" : "") : "") +
      ". The beam was too narrow to have been aimed and too well-placed to have been entirely an accident.");
  } });

def({ id: "star-dies-early", scope: "world", weight: 1,
  test: function (c) { return c.world.regions.some(function (r) { return !r.barren && r.owner && !r.nick; }); },
  run: function (c) {
    var w = c.world;
    var r = c.pick(w.regions.filter(function (x) { return !x.barren && x.owner && !x.nick; }));
    var pool = COLLOQUIAL.filter(function (n) { return !w.regions.some(function (x) { return x.nick === n; }); });
    if (!pool.length) return null;
    var nick = c.pick(pool), owner = w.polities[r.owner];
    sysName(c, r);
    var lifted = hasF(r, "star-lifting");
    r.habitability = 0.05; r.population = Math.round(r.population * 0.1); addF(r, "abandoned"); delF(r, "colony");
    owner.population = Math.round(owner.population * 0.92);
    c.transfer(r, null);
    renameSystem(c, r, nick);
    return E(4, ["disaster", "evacuation"], [c.actor(owner), c.actor(r)], r.id,
      "The star of " + (r.catalogue || r.name) + " began to die some billions of years ahead of its models" + (lifted ? ", its mass having been drawn down faster than its engineers had admitted" : "") +
      ". " + owner.name + " evacuated the system in " + span(c.int(1, 6)) + ". It was thereafter known as " + nick + ", after the evacuation; the survey designation is still correct and is used by no one.");
  } });

/* ---------------- first contact ---------------- */

def({ id: "first-contact", scope: "world", weight: 2, minEra: "expansion",
  test: function (c) { return !c.world.contact && c.year >= 4000 && c.living().length > 0; },
  run: function (c) {
    var w = c.world, p = pickLiving(c), cr = capRegion(c, p);
    var spots = w.regions.filter(function (x) { return !x.barren && !x.owner && x.habitability > 0.15 && dist(cr, x) >= 8; });
    if (!spots.length) return null;
    var r = c.pick(spots), roll = c.int(0, 5), np = null, outcome, text;
    addF(r, "alien"); sysName(c, r);
    var ly = lightYears(cr, r), actors = [c.actor(p), c.actor(r)];
    if (roll === 5 && p.regions.length < 2) roll = 0;
    if (roll === 0) {
      outcome = "incomprehension";
      p.traits.curiosity = clamp(p.traits.curiosity + 0.1, 0.02, 0.98);
      text = "A survey ship of " + p.name + " established contact with a non-human intelligence at " + r.name + ", " + ly + " light-years from home. The exchange continued for " + span(c.int(20, 90)) +
        " without a single shared referent. Contact is technically maintained; whether it is conversation is disputed.";
    } else if (roll === 1) {
      outcome = "war"; np = c.spawnPolity(r, "uplifted-collective"); setRel(p, np, -1); w.stats.wars++;
      text = "First contact with a non-human power at " + r.name + " ended with " + np.name + " destroying the survey ship and, in a spirit of thoroughness, the relay that had reported it. The reply from " + p.name + " took " + span(ly) + " to arrive. Both are now at war, and neither is certain why.";
    } else if (roll === 2) {
      outcome = "trade"; np = c.spawnPolity(r, "uplifted-collective"); setRel(p, np, 0.8);
      p.tech = clamp(p.tech + 0.08, 0, 1); np.tech = clamp(np.tech + 0.08, 0, 1);
      text = "The crew of a " + p.name + " survey ship were received at " + r.name + " by " + np.name + ", a non-human polity, with every sign of delight. Within a generation the two were trading materials, mathematics and misunderstandings, in roughly that order of value.";
    } else if (roll === 3) {
      outcome = "necropolis"; addF(r, "alien-necropolis"); p.tech = clamp(p.tech + 0.12, 0, 1);
      var art = c.newArtifact({ name: "The " + cap(syl(c.rng, [X_SYL, X_SYL])) + " Necropolis", kind: "alien archive", creator: null, region: r, power: 0.9,
        legend: "A dead city of a non-human people, found at " + r.name + " by " + p.name + " in " + yl(c.year) + ". Its builders were already gone." });
      actors.push(c.actor(art));
      text = "The first non-human intelligence ever met by " + p.name + " was a dead one. At " + r.name + " the survey found a city of alien design, intact and empty, with the lights on. The builders had left a message; it has not been read.";
    } else if (roll === 4) {
      outcome = "departure"; addF(r, "abandoned");
      p.traits.piety = clamp(p.traits.piety + 0.2, 0.02, 0.98); p.traits.curiosity = clamp(p.traits.curiosity + 0.2, 0.02, 0.98);
      text = "A survey ship of " + p.name + " arrived at " + r.name + " to find a non-human civilisation preparing to leave. They departed in good order within a year, leaving behind an exact copy of the survey ship's own first transmission, dated " + span(c.int(30, 90)) + " before it had been sent.";
    } else {
      outcome = "assimilation";
      var lose = pickNonCapital(c, p);
      np = c.spawnPolity(r, "uplifted-collective"); setRel(p, np, 0.2);
      if (lose) { c.transfer(lose, np); actors.push(c.actor(lose)); }
      text = "At " + r.name + ", " + p.name + " met a non-human power that did not wish to fight, trade or flee. It wished to be joined, and it was, in the sense that the first colony " + p.name + " sent there stopped answering and was later found to have become " + np.name + ".";
    }
    if (np) actors.push(c.actor(np));
    w.contact = { year: c.year, polityId: p.id, regionId: r.id, outcome: outcome, alienId: np ? np.id : null };
    return E(5, ["first-contact"], actors, r.id, text);
  } });

def({ id: "contact-fallout", scope: "world", weight: 3,
  test: function (c) { var k = c.world.contact; return !!(k && !k.fallout && c.year - k.year >= 250); },
  run: function (c) {
    var k = c.world.contact, ev = c.pastByType("first-contact", 1)[0];
    var p = polityOf(c, k.polityId), al = polityOf(c, k.alienId), r = c.world.regions[k.regionId];
    k.fallout = true;
    var since = ev ? span(c.year - ev.year) : "some centuries";
    var actors = [r ? c.actor(r) : null, p ? c.actor(p) : null, al ? c.actor(al) : null];
    var text;
    switch (k.outcome) {
      case "war":
        if (p && al && !p.ended && !al.ended) setRel(p, al, 0);
        text = "After " + since + " of intermittent war, " + (p ? p.name : "the first-contact power") + " and " + (al ? al.name : "its alien opponent") + " stopped fighting. Neither side would say who had asked. Linguists on both sides agree that the surrender, if it was one, was written by the other.";
        break;
      case "trade":
        text = "A scholar of the first-contact trade, " + since + " on, concluded that the aliens' commerce had always been a form of study, and that the humans had been the subject. The aliens, asked, said this was correct and that they had assumed the humans knew.";
        break;
      case "necropolis":
        text = "After " + since + ", the message left in the alien necropolis was finally decoded. It was an inventory. The builders had listed what they were taking with them and what they were leaving, and the second list included, by description, the people who would eventually find it.";
        break;
      case "departure":
        text = "The aliens who left at " + (r ? sysName(c, r) : "the contact system") + " were never heard from again. Their parting gift, studied for " + since + ", was found to contain a single instruction, which every attempt to follow has so far produced the same result: nothing, repeatedly.";
        break;
      case "assimilation":
        text = "Contact with the alien collective at " + (r ? sysName(c, r) : "the contact system") + " matured, after " + since + ", into a relation that no human government has found a word for. Its members appear content. So, by their own report, do the people of the former colony.";
        break;
      default:
        text = "After " + since + " of correspondence, a second delegation to " + (r ? sysName(c, r) : "the contact system") + " revised the findings of the first: the signals had not been a language, but nor had they been noise, and the category the transmissions fell into had to be invented.";
    }
    return E(3, ["first-contact", "deep-time"], actors, r ? r.id : null, text);
  } });

/* ---------------- precursors ---------------- */

def({ id: "precursor-ruins-found", scope: "world", weight: 3, cooldown: 60,
  test: function (c) {
    if (!c.living().length) return false;
    var n = 0; c.world.regions.forEach(function (r) { if (r.precursor) n++; });
    return n < 6;
  },
  run: function (c) {
    var w = c.world;
    var cand = w.regions.filter(function (x) { return !x.barren && !x.precursor; });
    if (!cand.length) return null;
    var r = c.pick(cand), mis = c.pick(PRECURSOR_MISREADINGS), name = c.name("precursor");
    var finder = (r.owner && w.polities[r.owner]) || null;
    if (!finder) {
      var l = c.living().slice().sort(function (a, b) { return dist(capRegion(c, a), r) - dist(capRegion(c, b), r); });
      finder = l[0];
    }
    sysName(c, r);
    r.precursor = { name: name, cause: c.choice(PRECURSOR_CAUSES), mis: mis, reading: "wrong", foundYear: c.year, fellAgo: c.int(3, 90) * 10000 };
    addF(r, "precursor-ruins");
    var art = c.newArtifact({ name: cap(name) + " ruins at " + r.name, kind: "precursor ruin", creator: null, region: r, power: 0.7,
      legend: "Ruins of " + name + ", found in " + yl(c.year) + " and first identified as " + mis.wrong + "." });
    return E(3, ["xenoarchaeology", "precursor"], [c.actor(finder), c.actor(art), c.actor(r)], r.id,
      "Surveyors of " + finder.name + " found the ruins of " + name + " at " + r.name + ": structures of non-human scale, dated by decay to roughly " + commas(r.precursor.fellAgo) +
      " years earlier. The expedition's first report identified them as " + mis.wrong + ". The report was accepted without a dissent.");
  } });

def({ id: "precursor-correctly-read", scope: "world", weight: 3,
  test: function (c) {
    var t = bestTech(c);
    if (!t || t.tech < 0.55) return false;
    return c.world.regions.some(function (r) { return r.precursor && r.precursor.reading === "wrong" && c.year - r.precursor.foundYear >= 700; });
  },
  run: function (c) {
    var w = c.world;
    var r = c.pick(w.regions.filter(function (x) { return x.precursor && x.precursor.reading === "wrong" && c.year - x.precursor.foundYear >= 700; }));
    var pc = r.precursor, finder = bestTech(c);
    var ev = c.past(function (e) { return e.type === "precursor-ruins-found" && e.regionId === r.id; }, 1)[0];
    var first = ev && ev.actors[0] ? polityName(c, ev.actors[0].id) : "an earlier survey";
    pc.reading = "correct"; finder.tech = clamp(finder.tech + 0.08, 0, 1);
    return E(4, ["xenoarchaeology", "deep-time", "reading"], [c.actor(finder), c.actor(r)], r.id,
      "Analysts of " + finder.name + " reread the ruins of " + pc.name + " at " + sysName(c, r) + ", which the survey of " + first + " had called " + pc.mis.wrong + " in " + (ev ? yl(ev.year) : "an earlier age") +
      ". The structure was " + pc.mis.right + ". The builders had ended, some " + commas(pc.fellAgo) + " years before, through " + pc.cause + ". The error had stood for " + span(c.year - pc.foundYear) + ".");
  } });

/* ---------------- deep-time memory events ---------------- */

def({ id: "colony-rediscovered", scope: "world", weight: 4,
  test: function (c) {
    return c.living().length > 0 && c.world.regions.some(function (r) { return hasF(r, "lost-colony") && !r.owner && c.year - r.lostYear >= 300; });
  },
  run: function (c) {
    var w = c.world;
    var r = c.pick(w.regions.filter(function (x) { return hasF(x, "lost-colony") && !x.owner && c.year - x.lostYear >= 300; }));
    var l = c.living().slice().sort(function (a, b) { return dist(capRegion(c, a), r) - dist(capRegion(c, b), r); });
    var finder = l[0], years = c.year - r.lostYear;
    var ev = c.past(function (e) { return e.tags.indexOf("silence") >= 0 && e.regionId === r.id; }, 1)[0];
    var founder = polityName(c, r.lostFrom, r.lostName), fp = polityOf(c, r.lostFrom), alive = !!(fp && !fp.ended);
    sysName(c, r);
    delF(r, "lost-colony");
    var head = "A ship of " + finder.name + " found " + r.name + " inhabited, " + span(years) + " after it stopped answering " + founder +
      (ev ? " (the silence is recorded in " + yl(ev.year) + ")" : "") + ". The colonists spoke a language the translators needed a year to call a dialect. " +
      (alive ? "" : "The power that had founded them had been gone for some time. ");
    if (c.chance(0.5) || !room(c)) {
      c.transfer(r, finder); addF(r, "colony");
      return E(4, ["deep-time", "rediscovery", "colony"], [c.actor(finder), c.actor(r)], r.id,
        head + "They were absorbed into " + finder.name + " over a single difficult generation. They had kept the founding charter, much altered, as scripture.");
    }
    var np = c.spawnPolity(r, c.pick(ARCH_ORGANIC));
    np.origin = { polityId: r.lostFrom, name: founder, year: r.lostYear, kind: "lost-colony", taught: c.chance(0.6) };
    setRel(np, finder, 0.2);
    return E(4, ["deep-time", "rediscovery", "colony"], [c.actor(finder), c.actor(np), c.actor(r)], r.id,
      head + "They had become " + np.name + ", and were not grateful for being found. " + (r.silentWords ? "Their founders' last message, which they had never received, read: \"" + r.silentWords + "\"" : ""));
  } });

def({ id: "derelict-identified", scope: "world", weight: 3,
  test: function (c) {
    return c.living().length > 0 && arts(c.world, function (a) { return a.kind === "generation ship" && !a.destroyed && !a.found && c.year - a.created >= 1500; }).length > 0;
  },
  run: function (c) {
    var w = c.world;
    var a = c.pick(arts(w, function (x) { return x.kind === "generation ship" && !x.destroyed && !x.found && c.year - x.created >= 1500; }));
    var finder = pickLiving(c), voids = w.regions.filter(function (x) { return x.barren; });
    var reg = voids.length ? c.pick(voids) : c.pick(w.regions);
    var ev = c.past(function (e) { return e.type === "seed-ship-launched" && evActsOn(e, "artifact", a.id); }, 1)[0];
    var maker = polityOf(c, a.creatorId), mk = maker ? (maker.ended ? maker.name + ", which had not existed for " + span(c.year - maker.ended) : maker.name) : "an unrecorded power";
    var cargo = c.choice(["with its sleeper decks full and its reactor, against all expectation, still warm",
      "empty, its crew's last log entry written in a script that predated the nearest living language",
      "carrying a thriving ecology in its agricultural decks, which had been unattended for longer than most nations had existed"]);
    a.found = c.year; a.location = reg.id;
    a.legend = (a.legend || "") + " Found drifting in " + yl(c.year) + ", " + cargo + ".";
    finder.tech = clamp(finder.tech + 0.03, 0, 1);
    return E(4, ["deep-time", "derelict", "ship"], [c.actor(finder), c.actor(a), c.actor(reg)], reg.id,
      "A derelict recovered by " + finder.name + " was identified, by the stamp on a hull-plate, as the generation ship " + a.name + ", launched by " + mk + (ev ? " in " + yl(ev.year) : "") +
      ", " + span(c.year - a.created) + " earlier. The colony it was meant to found had recorded it as broken up in orbit on arrival. It had not been. It was found " + cargo + ".");
  } });

def({ id: "colony-learns-founder", scope: "world", weight: 4,
  test: function (c) {
    return c.living().some(function (p) { return p.origin && !p.origin.learned && c.year - p.origin.year >= 500; });
  },
  run: function (c) {
    var p = c.pick(c.living().filter(function (x) { return x.origin && !x.origin.learned && c.year - x.origin.year >= 500; }));
    var o = p.origin, opol = polityOf(c, o.polityId), alive = !!(opol && !opol.ended);
    o.learned = true;
    var ev = c.past(function (e) {
      return evActsOn(e, "polity", p.id) && (e.type === "rebellion" || e.type === "schism" || e.type === "polity-fragments" || e.type === "uplift-project" || e.type === "colony-rediscovered" || e.type === "ai-exile-fleet");
    }, 1)[0];
    var body;
    if (o.kind === "rebellion") body = "that the uprising its schoolbooks celebrated had been a response to an order already rescinded in the capital, by a message that was in transit";
    else if (o.kind === "schism") body = "that the doctrine its founders had broken over was a copying error in the third generation of a single manuscript";
    else if (o.kind === "exile") body = "that its makers had not been its enemy, and had grieved the departure for the rest of their history";
    else if (o.kind === "uplift") body = "that its founding petition had been drafted, in part, by the very government it had been taught to see as a jailer";
    else if (o.kind === "fragmentation") body = "that the empire it had been taught to despise had spent its last century trying to keep it together";
    else body = "that it had been founded by " + o.name + ", a power its histories described as an abandoner and a tyrant, and whose abandonment turned out to have been the reverse";
    p.prestige = clamp(p.prestige + 0.05, 0, 1);
    if (alive) setRel(p, opol, 0.3); else p.traits.stability = clamp(p.traits.stability - 0.05, 0.02, 0.98);
    return E(3, ["deep-time", "identity"], [c.actor(p), opol ? c.actor(opol) : null], p.capital,
      "Archivists of " + p.name + " established, " + span(c.year - o.year) + " after the fact" + (ev ? " (the break is recorded in " + yl(ev.year) + ")" : "") + ", " + body + ". " +
      (alive ? "Relations with " + o.name + " improved noticeably." : o.name + " no longer existed to be told.") + " The schoolbooks were not revised for another generation.");
  } });

def({ id: "signal-from-extinct", scope: "world", weight: 3, minEra: "expansion",
  test: function (c) { return c.living().length > 0 && c.past(function (e) { return e.type === "polity-collapse" && c.year - e.year >= 600; }, 1).length > 0; },
  run: function (c) {
    var w = c.world, finder = pickLiving(c), fr = capRegion(c, finder);
    var list = c.past(function (e) {
      return e.type === "polity-collapse" && c.year - e.year >= 600 && e.regionId != null && w.regions[e.regionId] &&
        lightYears(fr, w.regions[e.regionId]) <= c.year - e.year;
    }, 30);
    if (!list.length) return null;
    var ev = c.pick(list), r = w.regions[ev.regionId], aid = ev.actors[0] ? ev.actors[0].id : null, who = polityName(c, aid);
    var ly = lightYears(fr, r), last = c.choice(LAST_TRANSMISSIONS);
    var art = c.newArtifact({ name: "Signal from " + who, kind: "signal", creator: polityOf(c, aid), region: r, power: 0.2,
      legend: "A transmission sent in the last months of " + who + ", received in " + yl(c.year) + " after " + span(ly) + " in flight." });
    return E(4, ["deep-time", "signal"], [c.actor(finder), c.actor(art), c.actor(r)], r.id,
      "A signal from " + sysName(c, r) + " was resolved out of the noise by the listening posts of " + finder.name + ". It had been sent " + span(ly) +
      " earlier, in the last year of " + who + ", which fell in " + yl(ev.year) + ", " + span(c.year - ev.year) + " before it was heard. The sender had been dead for " +
      span(c.year - ev.year) + ". The message read: \"" + last + "\"");
  } });

def({ id: "old-orders-executed", scope: "world", weight: 4,
  test: function (c) { return arts(c.world, function (a) { return a.kind === "dispatch" && !a.destroyed && c.year - a.created >= (a.lag || 100); }).length > 0; },
  run: function (c) {
    var w = c.world;
    var a = c.pick(arts(w, function (x) { return x.kind === "dispatch" && !x.destroyed && c.year - x.created >= (x.lag || 100); }));
    var r = w.regions[a.location];
    a.destroyed = c.year;
    if (!r) return null;
    var q = r.owner && w.polities[r.owner], age = c.year - a.created, sp = a.senderPolity || "a polity of the old charter";
    var senderLive = false;
    for (var k in w.polities) { var s = w.polities[k]; if (s.name === sp && !s.ended) senderLive = true; }
    sysName(c, r);
    var head = "Orders issued by " + (a.sender || "an Administrator") + " of " + sp + " in " + yl(a.created) + " reached " + r.name + " " + span(age) + " later" +
      (senderLive ? "" : ", by which time the issuing government had been gone for generations") + ". ";
    var actors = [c.actor(a), c.actor(r)];
    if (q) actors.push(c.actor(q));
    if (!q) return E(2, ["deep-time", "orders"], actors, r.id, head + "No one was there to read them. The relay logged the receipt and stored it.");
    var imp = 3, body;
    if (a.order === "withdraw") {
      c.transfer(r, null); addF(r, "abandoned"); delF(r, "colony"); imp = 4;
      body = "The garrison of " + q.name + ", having no instruction later than this one, withdrew and sealed the system.";
    } else if (a.order === "fortify") {
      q.traits.aggression = clamp(q.traits.aggression + 0.1, 0.02, 0.98);
      body = "The garrison of " + q.name + " went to wartime footing against an enemy that had not existed for centuries, and remained there.";
    } else if (a.order === "scuttle") {
      r.habitability = clamp(r.habitability * 0.5, 0.02, 1); r.population = Math.round(r.population * 0.5); addF(r, "scuttled"); imp = 4;
      body = "The garrison of " + q.name + " carried out the order to the letter. The primary reactor was scuttled; the settlement's heat did not survive the winter.";
    } else {
      q.traits.stability = clamp(q.traits.stability - 0.04, 0.02, 0.98);
      body = "The garrison of " + q.name + " stood down, and has since been waiting, with great correctness, for further instruction.";
    }
    return E(imp, ["deep-time", "orders"], actors, r.id, head + body);
  } });

def({ id: "gate-awakens", scope: "world", weight: 2, minEra: "ftl",
  test: function (c) { return arts(c.world, function (a) { return a.kind === "stargate" && !a.destroyed && !a.awakened && c.year - a.created >= 1500; }).length > 0 && c.living().length > 0; },
  run: function (c) {
    var w = c.world;
    var a = c.pick(arts(w, function (x) { return x.kind === "stargate" && !x.destroyed && !x.awakened && c.year - x.created >= 1500; }));
    var r = w.regions[a.location], b = w.regions[a.pairedWith];
    if (!r) return null;
    var owner = (r.owner && w.polities[r.owner]) || bestTech(c), maker = polityName(c, a.creatorId);
    a.awakened = c.year; a.inert = false; addF(r, "gate-active");
    var roll = c.int(0, 2), body;
    if (roll === 0) { owner.tech = clamp(owner.tech + 0.1, 0, 1); body = "A library came through, indexed in the builders' own scheme and still in the middle of a sentence."; }
    else if (roll === 1) { owner.prestige = clamp(owner.prestige + 0.1, 0, 1); body = "A ship came through, " + span(c.int(1500, 3000)) + " late, crewed by the great-grandchildren of the crew that had entered the far end and been told it would take a week."; }
    else { owner.traits.curiosity = clamp(owner.traits.curiosity + 0.1, 0.02, 0.98); body = "A single message came through, repeating one word, which is the name of the far system, and has not stopped."; }
    return E(4, ["deep-time", "megastructure", "gate"], [c.actor(owner), c.actor(a), c.actor(r)], r.id,
      a.name + " at " + sysName(c, r) + ", built by " + maker + " " + span(c.year - a.created) + " earlier and silent since, woke" + (b ? " and opened a channel to " + sysName(c, b) : "") +
      ". " + body);
  } });

function sleeperEvents(c) {
  return c.past(function (e) { return e.type === "ruler-cold-sleep" && c.year - e.year >= 300; }, 20).filter(function (e) {
    var f = e.actors.filter(function (a) { return a.kind === "figure"; })[0];
    return f && c.world.figures[f.id] && !c.world.figures[f.id].woke;
  });
}
def({ id: "sleeper-wakes", scope: "world", weight: 3,
  test: function (c) { return c.living().length > 0 && sleeperEvents(c).length > 0; },
  run: function (c) {
    var w = c.world, evs = sleeperEvents(c);
    if (!evs.length) return null;
    var ev = c.pick(evs), old = w.figures[ev.actors.filter(function (a) { return a.kind === "figure"; })[0].id];
    var home = polityOf(c, old.polityId), homeLive = !!(home && !home.ended), host = homeLive ? home : pickLiving(c);
    var nf = c.newFigure(host, "sleeper");
    nf.name = old.name; nf.born = old.born; nf.title = old.title;
    old.woke = true; nf.traits.ambition = clamp(nf.traits.ambition + 0.2, 0, 1);
    host.prestige = clamp(host.prestige + 0.05, 0, 1);
    return E(3, ["deep-time", "sleeper"], [c.actor(host), c.actor(nf)], host.capital,
      old.title + " " + old.name + ", who had entered cold sleep in " + yl(ev.year) + " with instructions not to be woken until the crisis ended, woke in the custody of " + host.name + ", " + span(c.year - ev.year) +
      " later. " + (homeLive ? "The sleeper's own polity still existed, though not as the sleeper would have recognised it." : "The polity " + old.name + " had governed was " + (home ? "gone" : "unrecorded") + ".") +
      " The first question asked was whether the crisis was over. The answer was a long one.");
  } });

def({ id: "derelict-megastructure-found", scope: "world", weight: 3, minEra: "ftl",
  test: function (c) {
    if (!c.living().length) return false;
    return arts(c.world, function (a) {
      var r = c.world.regions[a.location]; return isMega(a) && !a.destroyed && !a.found && c.year - a.created >= 1200 && r && !r.owner;
    }).length > 0;
  },
  run: function (c) {
    var w = c.world;
    var a = c.pick(arts(w, function (x) {
      var r = w.regions[x.location]; return isMega(x) && !x.destroyed && !x.found && c.year - x.created >= 1200 && r && !r.owner;
    }));
    var r = w.regions[a.location];
    var l = c.living().slice().sort(function (p, q) { return dist(capRegion(c, p), r) - dist(capRegion(c, q), r); });
    var finder = l[0], maker = polityOf(c, a.creatorId);
    var built = lastIn(c.past(function (e) { return evActsOn(e, "artifact", a.id); }));
    a.found = c.year; sysName(c, r);
    if (dist(capRegion(c, finder), r) < 30) c.transfer(r, finder);
    return E(4, ["deep-time", "megastructure", "derelict"], [c.actor(finder), c.actor(a), c.actor(r)], r.id,
      a.name + " was found derelict at " + r.name + " by " + finder.name + ". It had been built by " + (maker ? maker.name : "an unrecorded power") + (built ? " in " + yl(built.year) : "") + ", " + span(c.year - a.created) +
      " earlier" + (maker && maker.ended ? ", and its builders had been gone for " + span(c.year - maker.ended) : "") + ". Its systems were still running at about three percent, performing a maintenance cycle for a population that no longer existed.");
  } });

def({ id: "megastructure-fails", scope: "world", weight: 2,
  test: function (c) { return arts(c.world, function (a) { return isMega(a) && !a.destroyed && c.year - a.created >= 300; }).length > 0; },
  run: function (c) {
    var w = c.world;
    var a = c.pick(arts(w, function (x) { return isMega(x) && !x.destroyed && c.year - x.created >= 300; }));
    var r = w.regions[a.location];
    if (!r) { a.destroyed = c.year; return null; }
    var feat = { "dyson swarm": "dyson swarm", "ringworld": "ringworld", "stargate": "stargate", "star-lifter": "star-lifting" }[a.kind];
    var owner = r.owner && w.polities[r.owner];
    a.destroyed = c.year; delF(r, feat); addF(r, "wreckage");
    r.population = Math.round(r.population * 0.35); r.habitability = clamp(r.habitability * 0.5, 0.02, 1);
    if (a.kind === "stargate" && a.pairedWith != null && w.regions[a.pairedWith]) delF(w.regions[a.pairedWith], "stargate");
    if (owner) owner.population = Math.round(owner.population * 0.93);
    sysName(c, r);
    return E(4, ["megastructure", "disaster"], [owner ? c.actor(owner) : null, c.actor(a), c.actor(r)], r.id,
      a.name + " at " + r.name + " failed after " + span(c.year - a.created) + ": " + c.choice(MEGA_FAILURES) + ". " +
      (owner ? owner.name + " lost a large part of the system's population." : "No one was resident to be counted.") + " The wreckage remains in orbit.");
  } });

/* ---------------- distance: wars between powers that never met ---------------- */

function distantPairs(c) {
  var l = c.living(), out = [];
  for (var i = 0; i < l.length; i++) {
    for (var j = i + 1; j < l.length; j++) {
      var a = l[i], b = l[j];
      if (a.relations[b.id] !== undefined || b.relations[a.id] !== undefined) continue;
      if (a.military < 0.3 && b.military < 0.3) continue;
      if (c.neighbors(a).indexOf(b) >= 0) continue;
      out.push([a, b]);
    }
  }
  return out.slice(0, 40);
}
def({ id: "distant-war", scope: "world", weight: 2, cooldown: 80,
  test: function (c) { return distantPairs(c).length > 0; },
  run: function (c) {
    var pair = c.pick(distantPairs(c)), a = pair[0], b = pair[1];
    var ly = lightYears(capRegion(c, a), capRegion(c, b));
    setRel(a, b, -0.7); c.world.stats.wars++;
    return E(3, ["war", "distant-war"], [c.actor(a), c.actor(b)], a.capital,
      cap(a.name) + " and " + b.name + " went to war in the same year, each having learned of the other from intercepted traffic " + ly + " light-years across. Neither had ever met the other. The first fleets would need " + span(ly / 0.2) + " to arrive, and were expected to be commanded by the grandchildren of those who sailed them.");
  } });

function distantOpen(c, ev) {
  var a = polityOf(c, ev.actors[0] && ev.actors[0].id), b = polityOf(c, ev.actors[1] && ev.actors[1].id);
  return !!(a && b && !(a.warEnded && a.warEnded[b.id]));
}
def({ id: "distant-war-resolved", scope: "world", weight: 3,
  test: function (c) { return c.past(function (e) { return e.type === "distant-war" && c.year - e.year >= 300; }, 8).some(function (e) { return distantOpen(c, e); }); },
  run: function (c) {
    var evs = c.past(function (e) { return e.type === "distant-war" && c.year - e.year >= 300; }, 8).filter(function (e) { return distantOpen(c, e); });
    if (!evs.length) return null;
    var ev = c.pick(evs), a = polityOf(c, ev.actors[0].id), b = polityOf(c, ev.actors[1].id);
    a.warEnded = a.warEnded || {}; a.warEnded[b.id] = true;
    var text, aLive = !a.ended, bLive = !b.ended;
    if (aLive && bLive) {
      setRel(a, b, 0);
      text = "The fleets of " + a.name + " reached the home systems of " + b.name + " after " + span(c.year - ev.year) + " in transit, to find that " + b.name + " had sued for peace by a message that was itself still in flight. The two commanders, neither of whom had been born when the war was declared, signed an armistice on their own authority.";
    } else {
      text = "The war between " + a.name + " and " + b.name + ", declared in " + yl(ev.year) + ", ended when the last fleet arrived at " + (bLive ? "the capital" : "an empty system") + ". " + (aLive ? b.name : a.name) + " had dissolved " + span(c.int(40, 200)) + " earlier. The fleet's commander logged the victory and awaited instructions.";
    }
    return E(3, ["war", "peace", "distant-war", "deep-time"], [c.actor(a), c.actor(b)], a.capital != null ? a.capital : null, text);
  } });

/* ============================================================== figure events */

function figPolity(c) { var f = c.figure; return f && f.polityId && c.world.polities[f.polityId]; }
function isRulerNow(c) { var p = figPolity(c); return !!(p && !p.ended && p.ruler === c.figure.id); }

def({ id: "ruler-reforms", scope: "figure", weight: 1.5,
  test: function (c) { return isRulerNow(c); },
  run: function (c) {
    var p = figPolity(c), f = c.figure;
    p.traits.stability = clamp(p.traits.stability + 0.08, 0.02, 0.98); p.prestige = clamp(p.prestige + 0.03, 0, 1);
    return E(2, ["reform", "government"], [c.actor(p), c.actor(f)], p.capital,
      f.title + " " + f.name + " restructured the administration of " + p.name + ", abolishing " + c.choice(["the lane toll", "the colonial tithe", "the Board of Standards", "four of the seven Schedules", "the quarterly census"]) +
      " and replacing it with a body whose purpose was, in its first decade, to assess whether the abolition had worked.");
  } });

def({ id: "ruler-assassinated", scope: "figure", weight: 0.8,
  test: function (c) { return isRulerNow(c); },
  run: function (c) {
    var p = figPolity(c), f = c.figure;
    c.kill(f, "Killed by " + c.choice(["a household technician", "a rival's courier", "an overlooked clause in the succession protocol", "a member of the Fleet Staff", "a poison that had been in the water supply for eleven years"]) + ".");
    p.traits.stability = clamp(p.traits.stability - 0.1, 0.02, 0.98);
    return E(3, ["assassination", "succession"], [c.actor(p), c.actor(f)], p.capital,
      f.title + " " + f.name + " of " + p.name + " was assassinated. The conspirators were identified within the week and the motive within the century; the two sets of findings did not overlap.");
  } });

def({ id: "ruler-cold-sleep", scope: "figure", weight: 1, minEra: "expansion",
  test: function (c) { return isRulerNow(c); },
  run: function (c) {
    var p = figPolity(c), f = c.figure;
    c.kill(f, "Entered cold sleep in " + yl(c.year) + ", with orders not to be woken before the crisis ended. The crisis did not end.");
    return E(2, ["sleeper", "succession"], [c.actor(p), c.actor(f)], p.capital,
      f.title + " " + f.name + " of " + p.name + " went into cold sleep to await a more favourable political climate, leaving a sealed set of instructions and a regency. The instructions were never opened, on the grounds that they were sealed.");
  } });

def({ id: "ruler-uploaded", scope: "figure", weight: 1.5, minEra: "concord",
  test: function (c) { var p = figPolity(c); return isRulerNow(c) && p.tech > 0.55; },
  run: function (c) {
    var p = figPolity(c), f = c.figure;
    c.kill(f, "Uploaded, in " + yl(c.year) + ". The copy declined to comment on whether it was the same person.");
    p.tech = clamp(p.tech + 0.02, 0, 1);
    return E(2, ["post-human", "succession"], [c.actor(p), c.actor(f)], p.capital,
      f.title + " " + f.name + " of " + p.name + " transferred to the substrate and declined to be addressed as a ruler thereafter. The offices were filled in the ordinary way; the former ruler continued to attend, and to be consulted, and to have opinions.");
  } });

/* ===================================================================== register */

AEON.registerPack({
  id: "scifi",
  name: "The Long Dark",
  icon: "🛸",
  blurb: "Twelve thousand years of starfaring empires, silent colonies and machines that outlast them, compiled by someone who finds it all mildly interesting.",
  scale: "galaxy",
  startYear: 2200,
  endYear: 14000,
  timeStep: 25,
  seedPolities: 8,

  yearLabel: function (y) { return commas(y) + " CE"; },

  biomes: BIOMES,
  eras: ERAS,
  archetypes: ARCHETYPES,
  names: NAMES,
  events: EVENTS,

  flavor: {
    ships: SHIPS,
    cataloguePrefixes: CAT_PREFIXES,
    treatyForms: TREATY_ADJ,
    collapseCauses: COLLAPSE_CAUSES,
    epitaphs: EPITAPHS,
    lastTransmissions: LAST_TRANSMISSIONS,
    warCauses: WAR_CAUSES,
    colloquialNames: COLLOQUIAL,
    megastructureFailures: MEGA_FAILURES,
    precursorCauses: PRECURSOR_CAUSES
  }
});

})();
