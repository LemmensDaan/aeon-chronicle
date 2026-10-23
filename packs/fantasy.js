/* Aeon pack: Age of Myth -- high fantasy in which the gods interfere.
   A chronicle compiled by scribes who believe the supernatural parts. */
(function () {
"use strict";

/* ====================================================================== */
/* small utilities                                                        */
/* ====================================================================== */

const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
const cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
const fixTriples = function (s) { return s.replace(/(.)\1\1+/g, "$1$1"); };
function yl(y) { return y < 0 ? (-y) + " BR" : y + " AR"; }

/* ====================================================================== */
/* flavour pools                                                          */
/* ====================================================================== */

const EPITAPHS = [
  "He kept the Eastern road open for thirty winters and died without having walked it.",
  "She buried three sons and a husband, and was buried by none of them.",
  "Died at table, mid-sentence; the sentence was recorded as a decree.",
  "Held the throne by the strength of her grandmother's reputation.",
  "Fell from a wall he had ordered built too high.",
  "Remembered chiefly for a tax on salt, which outlived the kingdom.",
  "Took a wound at the ford and a fever from the wound.",
  "Asked for water at the end and was given wine; the scribes took no side.",
  "Drowned in the cistern of his own palace, in full armour, for reasons never given.",
  "Her last act was to pardon a man whose name no one then knew.",
  "He was loved by the army and no one else, and the army outlived him by a year.",
  "Died in his sleep, which the priests called a mercy and the physicians called a poison.",
  "Left a treasury of eleven coins and a library of two thousand books.",
  "She ruled forty years and was mourned for four days.",
  "Slain by a cousin who was crowned before the body was cold.",
  "Went out to see the comet and was not seen again; a regent was appointed.",
  "Called the Pious, which the temple paid for.",
  "The last of his line who could read the old tongue.",
  "Died of a hunting fall; the horse was honoured, the huntsmen were not.",
  "Buried in a hurry, because the enemy was already at the gate.",
  "She outlived her enemies and then could not remember which had been which.",
  "He swore to build a bridge and built a tomb instead.",
  "Struck down by a sickness the healers declared was not a sickness.",
  "Died on a Tuesday. The scribe adds only that the weather was fine.",
  "His reign is described as quiet in every source that survives, which is itself suspicious.",
  "Poisoned at a wedding, though not his own.",
  "Carried the old oath and the old grudge in equal measure, and passed on both.",
  "She was the first of her house to be buried under stone and the last to be buried with honour.",
  "Gave his kingdom a name and his enemies a reason.",
  "Died unshriven, having quarrelled with the god of the house on the previous evening."
];

const OMENS = [
  "a white hart seen at noon among the market stalls",
  "three days of rain that fell upward",
  "a child born with a full set of teeth, who spoke once and was not afterwards believed",
  "the standing stones sweating a dark fluid",
  "the bees leaving the royal hives in a single night",
  "two suns reflected in the same well",
  "a spring that ran with salt for a week",
  "every dog in the city facing east and silent",
  "wolves in the streets, entirely without fear",
  "a hail of small black stones, which the priests collected",
  "the temple bells ringing with no ringer in the tower",
  "a calf with the face of a man",
  "ravens counting out the harvest on the granary roof",
  "a comet with a red tail, in daylight",
  "the river running warm at midwinter",
  "the shadow of the old tower falling the wrong way at dusk",
  "the royal banner found unfurled in a locked room",
  "fish rising dead from the lake in the shape of a spiral",
  "a bell found in the earth that rang when no one touched it",
  "an eclipse that took the whole of the afternoon"
];

const PORTENTS = [
  "the white stag is seen at noon",
  "the seventh king is born in a ditch",
  "iron grows soft in the hand of the smith",
  "the sun is eaten at harvest-time",
  "the dead are counted twice at the same gate",
  "a crown is worn by a child who cannot read it",
  "the river runs uphill past the old mill",
  "three moons are named in one night",
  "the wolf sleeps in the king's hall",
  "a bell is cast from the bones of a traitor",
  "the oaks are heard to weep in the autumn",
  "a woman with six fingers sits in judgement",
  "the salt-roads are walked by no one for a year",
  "two brothers eat from one loaf and neither is hungry",
  "the grain is full and the granaries are empty",
  "the north wind blows for forty days without once pausing",
  "a lamp burns three nights with no oil in it",
  "the last honest man is made steward of the treasury",
  "the stones of the old wall are found to have been moved in the night",
  "a debt is paid that no one remembers contracting"
];

const EPITHETS = [
  "the Sleepless", "the Many-Handed", "Mother of Tithes", "the Hunger Under Hills",
  "Keeper of the Last Door", "the Weighing One", "the Bright Refusal", "Lord of Low Water",
  "the Patient Flame", "the Ninth Voice", "Wearer of Winter", "the Unforgiving Harvest",
  "the Crowned Silence", "the Wolf at the Threshold", "Giver of Dry Roads", "the Drowned Lantern",
  "the Merciful, when it suits", "the Counting Dark", "Father of Frost", "the Judge Without a Face",
  "Shepherd of the Dead", "the Thousand Eyes of Salt", "the Unlit Sun", "Breaker of Oaths"
];

const RELIC_NAMES = [
  "The Dimming Crown", "Oathbreaker", "The Hollow Grail", "Dawnsplitter", "The Weeping Lantern",
  "Ninefold Mirror", "The Stonewright's Hammer", "Sorrowsong", "The Last Verse", "Wolfbane",
  "The Ash Throne", "The Tithe-Horn", "Mourner's Spear", "The Sleepless Eye", "Gravewhisper",
  "The Pale Signet", "Emberhelm", "The Salt Ring", "Graveward", "The Candle of Names",
  "Kingmaker", "The Unbroken Lyre", "Frostwidow", "The Drowned Bell", "The Lawgiver's Rod",
  "Thornheart", "Brightfall", "The Maiden's Knife", "Bone-of-the-World", "The Hearth-Coal"
];

const RELIC_ADJ = [
  "Dimming", "Last", "Weeping", "Unbroken", "Hollow", "Sunless", "Oathbound", "Ninefold",
  "Sleepless", "Pale", "Ashen", "Starved", "Bright", "Shorn", "Grieving", "Rust-Red",
  "Gentle", "Thirsting", "Forsworn", "Silent", "Green", "Hundred-Year"
];

const RELIC_KINDS = ["sword", "crown", "staff", "ring", "hammer", "harp", "grail", "horn", "mirror", "sceptre",
  "amulet", "book", "lantern", "spear", "helm"];

const RELIC_LEGENDS = [
  "It is said to have been quenched in the blood of a god and never fully dried.",
  "No one who bore it lived to see a grandchild, and the bearers took the bargain willingly.",
  "Its maker is remembered; the reason for its making is not.",
  "Wells run clear where it has been carried, and sour behind it.",
  "It is warm to the touch in the hands of a rightful holder, and cold in all others, by the testimony of those who tried.",
  "It was forged at the turning of an age, in a single night, and the smith did not speak again.",
  "It is said to remember every hand that has held it, and to be unimpressed.",
  "A line has been scratched into it for every owner, and the last lines are crowded.",
  "The old rite says it must be given freely, which has never once been the case.",
  "It sings in the presence of the dead, and the dead are said to listen."
];

const CURSES = [
  "may your hearths go cold and your granaries sour until the third heir is laid in earth",
  "may no king of your line die in his bed, nor any queen lie quiet in her tomb",
  "may your rivers forget the sea and your sons forget your names",
  "when the third generation sits the throne, let it be counted the last",
  "let your bread be ashes and your wine be water, and let no priest of yours be heard",
  "may your walls hold against every enemy and fall to your own mason",
  "may your line be fruitful and every fruit be bitter",
  "let the thing you love most be taken, and taken in the manner you least expect",
  "may the dead of this field walk behind you until your banners rot",
  "let your crown be wanted by every hand but the right one",
  "until your grandson's grandson, may you meet nothing but a closed door",
  "let your city be remembered only for the manner of its ending"
];

const MIRACLES = [
  "the river stood still for a day so that the army might cross dry-shod",
  "a granary burned for three days and the grain within it was found whole",
  "the sick of the lower town rose from their beds and asked for bread",
  "the dead king's eyes opened at the funeral and closed again, satisfied",
  "the enemy's arrows turned in the air and fell among their own archers",
  "a spring broke from the temple floor and has not failed since",
  "the harvest came in three weeks early and was heavy enough to break the carts",
  "the fog lay over the besiegers' camp for nine days and over the city not at all",
  "the high altar bled, and the stain was proved to be wine only by those who disliked the priests",
  "snow fell in high summer on the lands of the faithless and nowhere else",
  "the temple doors, which had been barred for a generation, were found standing open in the morning",
  "a blind child recited the names of the founders in the old tongue, and was thereafter kept at court"
];

const RUMOURS = [
  "it was said that the river had once stood still for a general, though the oldest ferryman had not seen it",
  "a shepherd reported that the standing stones had hummed, but the stones were silent when the priests came",
  "the sick of the lower town were said to have been healed at the shrine, and the shrine received a gift in thanks",
  "it was whispered that the old god had spoken from the well, though the well was dry on inspection",
  "a lantern was seen on the barrow-downs at night, and was explained variously",
  "a woman claimed the saint's relic wept; the relic was, as ever, dry on inspection",
  "the bells were said to have rung unaided, and a monk was commended for his hearing",
  "travellers spoke of a light in the old tower that had no window to show it, and went around"
];

const SPELLS = [
  "the Grey Lung", "the Withering Hand", "the Salting of Fields", "the Long Itch",
  "the Hollow Rain", "the Nine Hunger", "the Black Sap", "the Unmaking of Wells",
  "the Slow Dusk", "the Bone-Lichen", "the Weeping Ground", "the Rust Psalm"
];

const SCHOOL_A = ["Collegium", "Conclave", "Athenaeum", "Lodge", "Cloister", "Orrery", "Academy", "Chantry", "Tower", "Sodality"];
const SCHOOL_B = ["Seventh Door", "Unlit Lamp", "Grey Candle", "Nine Hands", "Hollow Star", "Patient Flame",
  "Drowned Stair", "Open Eye", "Salt Rose", "Brass Moon", "Long Silence", "Counted Stars"];

const DOMAINS = ["the sun", "the drowned dark", "the harvest", "the forge", "storms", "the dead", "wolves",
  "bees and honey", "oaths", "the moon", "fire", "childbirth", "winter", "borders", "lies", "the road",
  "salt", "rivers", "fever", "stone"];

const TRIBUTES = [
  "the first sheaf of every harvest", "one child in every hundred, to serve and not to die",
  "a tenth of all silver coined, melted and poured into the temple cistern",
  "a white bull each new moon", "the names of the dead of the year, read aloud at the god's door",
  "a month's silence, kept by the entire city", "the firstborn of each noble house, raised in the temple",
  "all the iron taken from the field of any battle", "a hundred measures of salt, cast into the river",
  "the left hand of every convicted thief, hung on the temple gate"
];

const BOONS = [
  "the harvest in the south was doubled", "the ruler's years were lengthened, and his physicians dismissed",
  "a wound in the earth was closed and sown", "plague passed over the city and went elsewhere",
  "the army's marching pace was observed to double, and its feet to hurt less",
  "wells sunk by the faithful struck sweet water at half the usual depth",
  "the women of the capital bore no stillborn child for a decade"
];

const IRONIES = [
  "the foretold event occurred on the foretold day, in a barn, to a sheep, and was recorded as a minor loss of livestock",
  "the scribes agreed the words had been fulfilled, and disagreed about everything else",
  "the sign was observed at last, by a mapmaker in a distant province who did not know he was fulfilling anything",
  "it was discovered that the old text had been copied wrongly, and the corrected reading was found to have already happened",
  "the portent came to pass in every particular, but was attended by no consequence whatever",
  "the temple declared the matter closed, which it was not, but the temple was not asked again"
];

const BIRTHS = ["in a ditch beside the royal road", "in a ferryman's boat", "under a table at a wedding",
  "in the shadow of a hanged man", "in a country with no name for kings", "with a caul that had to be cut away with a bronze knife"];

const UNDEAD_DEEDS = [
  "the dead of the old battlefield rose at dusk and walked toward the nearest hearth",
  "a barrow-wight came down from the downs and sat at a farmer's table for three nights",
  "the graves of a plague-year were found empty, and the road to the marsh was well trodden",
  "a bone-choir was heard under the temple, singing the liturgy a half-tone flat"
];

/* ====================================================================== */
/* phonology tables                                                       */
/* ====================================================================== */

const ELF = {
  C: ["l", "n", "r", "s", "th", "m", "v", "f", "y", "ll", "l", "r", "n", "s", "d", "c", "g", "gal", "ith"],
  V: ["a", "e", "i", "o", "ia", "ae", "ie", "ea", "ui", "a", "e", "i"],
  E: ["l", "n", "r", "s", "th", "riel", "lith", "wen", "ion", "dil"],
  min: 2, max: 3, vs: 0.45, ep: 0.5
};
const ELF_EPI = ["the Fair", "Star-Caller", "Dusk-Walker", "Moonwright", "the Last-Born", "of the Silver Boughs", "Songkeeper", "the Unhurried"];
const ELF_PLACE_END = ["ael", "ithil", "oren", "dalla", "nore", "viel", "anthe"];

const DW_A = ["Iron", "Stone", "Deep", "Black", "Gold", "Grim", "Anvil", "Rune", "Coal", "Silver", "Under", "Hammer", "Ember", "Thunder", "Gem", "Grey"];
const DW_B = ["hold", "delve", "deep", "vault", "hearth", "forge", "gate", "hall", "crag", "mine", "helm", "throne", "reach"];
const DW_D1 = ["Dur", "Kaz", "Zhul", "Bar", "Thrum", "Grund", "Krag", "Dun", "Brak", "Nar", "Mord", "Gor", "Thar"];
const DW_D2 = ["karn", "brokk", "gund", "dak", "thrim", "zul", "bek", "gar", "orm", "dur", "nok", "rik"];
const DW_P1 = ["Bor", "Dwal", "Thrai", "Gim", "Brok", "Dag", "Orm", "Kol", "Hrok", "Thok", "Bal", "Nar", "Fun", "Gar", "Kaz", "Vor", "Grun", "Mor"];
const DW_P2 = ["in", "grim", "din", "ek", "gar", "rik", "mund", "bur", "ald", "thar", "li", "rum", "bek", "nur"];
const DW_CLAN = ["Ironfist", "Deepdelver", "Anvilborn", "Coalbeard", "Hammerhand", "Stonebrow", "Forgeheart", "Goldvein", "Grimbeard", "Rockbreaker"];

const OLD = {
  C: ["zh", "q", "x", "kh", "ny", "v", "ish", "ul", "th", "y", "g", "k", "z", "m", "vh", "uk"],
  V: ["a", "u", "o", "y", "aa", "ue", "i"],
  E: ["x", "th", "r", "oth", "ul", "ax", "esh", "ur"],
  min: 2, max: 3, vs: 0.2, ep: 0.7
};
const DRAGON_END = ["ax", "urth", "ithrax", "azhul", "orm", "yx", "uurth", "aleth"];

const MARK_A = ["Wulf", "Eald", "Heor", "Brun", "Os", "Aethel", "Hrod", "Cyne", "Wend", "Ger", "Ed", "Ealh", "Thorn", "Hale"];
const MARK_B = ["mark", "wick", "ford", "gar", "stan", "ham", "land", "wald", "bury", "thorp", "mere", "dale"];
const MARK_P1 = ["Wulf", "Ead", "Os", "Aelf", "Cyne", "Leof", "God", "Hild", "Beorn", "Thur", "Sig", "Hereb"];
const MARK_P2 = ["ric", "gar", "wine", "red", "mund", "gyth", "frid", "helm", "stan", "wald", "burh", "thryth"];
const SUN_A = ["Val", "Aur", "Cass", "Mor", "Tar", "Sol", "Vir", "Cal", "Ner", "Pel", "Dor", "Ost", "Lav", "Sen"];
const SUN_B = ["oria", "ania", "ium", "enna", "ora", "avia", "essa", "opolis", "etia", "andra"];
const SUN_P1 = ["Marc", "Aur", "Cass", "Lucan", "Vale", "Sev", "Tib", "Octa", "Cor", "Livi", "Domit", "Cato"];
const SUN_P2 = ["us", "ia", "ander", "ina", "elius", "ian", "ona", "ius", "ara", "enna"];
const FEN_A = ["Caer", "Dun", "Aber", "Llan", "Pen", "Tre", "Glen", "Bryn", "Mor", "Cwm", "Rhos", "Nant"];
const FEN_B = ["dhu", "wyn", "garth", "avon", "rhos", "ellan", "lyn", "mor", "ogan", "idd"];
const FEN_P1 = ["Bran", "Cad", "Ryl", "Mael", "Gwen", "Ioan", "Cer", "Dyl", "Tegw", "Owa", "Eil", "Rhia"];
const FEN_P2 = ["wen", "dric", "an", "wyn", "ys", "orig", "ach", "edd", "lyn", "ydd"];
const HUMAN_EPI = ["the Elder", "the Younger", "the Red", "the Lame", "the Unready", "Ironhand", "the Pious", "the Bold",
  "Half-Hand", "the Silent", "the Fat", "Tithe-Breaker", "the Sparrow", "Fairhair"];

const MARK_SUF = { forest: ["wald", "holt", "shaw"], taiga: ["wald", "holt"], jungle: ["wald"], mountain: ["fell", "tor", "crag"],
  swamp: ["mere", "fen", "marsh"], grassland: ["ford", "ham", "field"], savanna: ["field", "heath"], tundra: ["moor", "waste"],
  desert: ["dune", "waste"], ice: ["rime"], barren: ["strand"] };
const FEN_SUF = { forest: ["llwyn", "coed"], taiga: ["coed"], jungle: ["coed"], mountain: ["fynydd", "craig"], swamp: ["cors", "mor"],
  grassland: ["dyffryn", "ton"], savanna: ["rhos"], tundra: ["rhos"], desert: ["tywod"], ice: ["rhew"], barren: ["traeth"] };

function weave(rng, o) {
  const n = rng.int(o.min, o.max);
  let s = "";
  for (let i = 0; i < n; i++) {
    const on = (i === 0 && rng.chance(o.vs || 0)) ? "" : rng.pick(o.C);
    s += on + rng.pick(o.V);
  }
  if (o.E && rng.chance(o.ep || 0.5)) s += rng.pick(o.E);
  return fixTriples(s);
}
function elfWord(rng) {
  let s = weave(rng, ELF);
  for (let i = 0; i < 4 && (s.length < 4 || s.length > 10); i++) s = weave(rng, ELF);
  return cap(s);
}
function oldWord(rng) {
  let s = weave(rng, OLD);
  if (s.length > 5 && rng.chance(0.4)) { const k = rng.int(2, 3); s = s.slice(0, k) + "'" + s.slice(k); }
  return cap(s);
}
function dragonWord(rng) {
  const base = weave(rng, { C: OLD.C, V: OLD.V, min: 1, max: 2, vs: 0.1 });
  return cap(base + rng.pick(DRAGON_END));
}
function dwarfPlaceWord(rng) {
  if (rng.chance(0.5)) return rng.pick(DW_A) + rng.pick(DW_B);
  return rng.pick(DW_D1) + "-" + cap(rng.pick(DW_D2));
}
function humanRoot(rng, style) {
  if (style === "sun") return rng.pick(SUN_A) + rng.pick(SUN_B);
  if (style === "fen") return rng.pick(FEN_A) + rng.pick(FEN_B);
  return rng.pick(MARK_A) + rng.pick(MARK_B);
}
function humanStyle(w, r) {
  if (!r) return "mark";
  const fx = r.x / (w.width || 150), fy = r.y / (w.height || 95);
  if (fy < 0.28) return "mark";
  return fx < 0.38 ? "fen" : (fx < 0.7 ? "mark" : "sun");
}
function cultureOf(ctx) {
  if (ctx.polity && ctx.polity.culture) return ctx.polity.culture;
  const w = ctx.world, r = ctx.region;
  if (r && r.owner && w.polities[r.owner] && w.polities[r.owner].culture) return w.polities[r.owner].culture;
  return humanStyle(w, r);
}
function rootFor(rng, culture) {
  if (culture === "elven") return elfWord(rng);
  if (culture === "dwarven") return dwarfPlaceWord(rng);
  if (culture === "old") return oldWord(rng);
  return humanRoot(rng, culture);
}
function adjFor(culture, n) {
  const s = n.replace(/-/g, "");
  if (culture === "elven") return /[aeiou]$/i.test(s) ? s + "n" : s + "rin";
  if (culture === "dwarven") return /[aeiou]$/i.test(s) ? s + "n" : s + "i";
  if (culture === "old") return s.replace(/'/g, "") + "ine";
  if (/ium$/.test(s)) return s.replace(/ium$/, "ian");
  if (/opolis$/.test(s)) return s.replace(/opolis$/, "opolitan");
  return /[aeiou]$/i.test(s) ? s + "n" : s + "ian";
}
function personName(rng, culture) {
  if (culture === "elven") return elfWord(rng) + (rng.chance(0.3) ? " " + rng.pick(ELF_EPI) : "");
  if (culture === "dwarven") return rng.pick(DW_P1) + rng.pick(DW_P2) + " " + rng.pick(DW_CLAN);
  if (culture === "old") return oldWord(rng);
  let n;
  if (culture === "sun") n = rng.pick(SUN_P1) + rng.pick(SUN_P2);
  else if (culture === "fen") n = rng.pick(FEN_P1) + rng.pick(FEN_P2);
  else n = rng.pick(MARK_P1) + rng.pick(MARK_P2);
  n = cap(n);
  return rng.chance(0.25) ? n + " " + rng.pick(HUMAN_EPI) : n;
}

const RULER_TITLES = {
  "theocracy": ["Hierarch", "Hierarch", "God-Speaker", "Tithe-Lord"],
  "elven-remnant": ["Dawn-King", "Warden", "Dawn-King", "Evenstar-Regent"],
  "dwarf-hold": ["Thane", "Thane", "Hold-Lord", "Forge-Warden"],
  "mortal-kingdom": ["King", "Queen", "Warden", "King", "Prince-Regent"],
  "necrocracy": ["the Unnamed", "the Unnamed", "Death-Warden"],
  "druidic-circle": ["Warden", "Archdruid", "Oak-Warden"],
  "dragon-fief": ["Wyrm", "Great Wyrm", "Gold-Drake"],
  "wizard-tyranny": ["Archmage", "Tyrant-Sage", "Warden", "Magister-Regent"],
  "free-cities": ["Archon", "Warden", "First Syndic"],
  "hill-clans": ["Thane", "Chieftain", "Warden"]
};
const ROLE_TITLES = {
  hero: ["Champion", "Oathsworn", "Sword-Thane", "Wanderer"],
  mage: ["Magister", "Hedge-Witch", "Loremaster", "Spell-Wright"],
  prophet: ["Seer", "Oracle", "Dream-Reader", "Blind Seer"],
  heretic: ["Heresiarch", "Schismatic", "Apostate"],
  thief: ["Cutpurse", "Shadow", "Sneak-Thief"],
  usurper: ["Usurper", "Pretender", "Marshal"],
  heir: ["Last Scion", "Claimant", "Heir-in-Exile"],
  priest: ["High Priest", "God-Speaker", "Censer-Bearer"],
  smith: ["Forge-Warden", "Rune-Smith", "Master Smith"]
};

function fn(f) {
  if (!f) return "an unrecorded hand";
  if (f.title === "the Unnamed") return f.name.split(" ")[0] + " the Unnamed";
  return (f.title && f.title !== "ruler" ? f.title + " " : "") + f.name;
}
function pn(p) { return p.name.replace(/^The /, "the "); }

/* ====================================================================== */
/* mutable pack state, kept on the world so that it stays deterministic   */
/* ====================================================================== */

function F(w) {
  if (!w._fan) w._fan = { gods: [], schools: [], loss: 0, openProph: 0, curses: [], barrows: [], delve: [], conquests: [], sundered: false };
  return w._fan;
}
function magic(w) {
  const m = 1 - ((w.year + 2000) / 3600) * 0.85 - F(w).loss;
  return clamp(m, 0.03, 1);
}
function drain(w, amt) { const G = F(w); G.loss = Math.min(0.45, G.loss + amt); }
function addF(r, f) { if (r && r.features.indexOf(f) < 0) r.features.push(f); }
function hasF(r, f) { return !!r && r.features.indexOf(f) >= 0; }
function delF(r, f) { if (!r) return; const i = r.features.indexOf(f); if (i >= 0) r.features.splice(i, 1); }
function livingPolities(w) {
  const out = [];
  for (const id in w.polities) if (!w.polities[id].ended) out.push(w.polities[id]);
  return out;
}
function rulerOf(w, p) { return p && p.ruler && w.figures[p.ruler] ? w.figures[p.ruler] : null; }
function rulerTxt(w, p) { const r = rulerOf(w, p); return r ? fn(r) : "the ruler of " + pn(p); }
function rn(c, r, p) {
  if (!r.name) r.name = c.name("place", { region: r, polity: p || (r.owner ? c.world.polities[r.owner] : null) });
  return r.name;
}
function sn(c, r, p) { return r.settlement ? r.settlement.name : rn(c, r, p); }
function setRel(a, b, v) { if (!a || !b) return; a.relations[b.id] = v; b.relations[a.id] = v; }
function stab(p, d) { p.traits.stability = clamp(p.traits.stability + d, 0.02, 0.98); }
function piety(p, d) { p.traits.piety = clamp(p.traits.piety + d, 0.02, 0.98); }
function stock(p, key, mul) { p[key] = Math.max(60, Math.round(p[key] * mul)); }
function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
function reshape(w, r, biome) {
  const b = w.pack.biomes[biome];
  r.biome = biome;
  r.habitability = clamp(b.habitability + ((r.resources ? r.resources.food : 0.5) - 0.5) * 0.2, 0.02, 0.98);
}
function blight(r, amt) {
  addF(r, "blighted");
  r.habitability = Math.max(0.03, r.habitability - amt);
  if (r.resources) r.resources.food = Math.max(0.02, r.resources.food * 0.5);
}
function ruinify(r) {
  if (r.settlement) { r.ruinName = r.settlement.name; r.settlement = null; addF(r, "ruins"); }
}
function quoteOf(ev) { const m = ev && ev.text ? ev.text.match(/"([^"]+)"/) : null; return m ? m[1].replace(/[.,;]+$/, "") : null; }
function tagVal(ev, prefix) {
  for (const t of ev.tags) if (t.indexOf(prefix) === 0) return t.slice(prefix.length);
  return null;
}
function lc(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

function godsAlive(w, state) {
  return F(w).gods.filter(function (g) { return state ? g.state === state : g.state !== "dead"; });
}
function godOf(w, p) {
  const l = F(w).gods.filter(function (g) { return g.cult === p.id && g.state === "awake"; });
  return l.length ? l[0] : null;
}
/* relics only: great works are artifacts too (so the chronicle can show them), but they stay
   where they were built and are never carried off, found or given */
function artList(w) { return Object.keys(w.artifacts).map(function (k) { return w.artifacts[k]; }).filter(function (a) { return !a.wonder; }); }
function held(w, p) { return artList(w).filter(function (a) { return a.holder === p.id && !a.destroyed; }); }
function lostRelics(w) { return artList(w).filter(function (a) { return !a.destroyed && !a.holder && !a.beyond && a.location != null; }); }
function relicMight(w, p) { return held(w, p).reduce(function (s, a) { return s + a.power; }, 0); }
function give(w, art, p, how) {
  art.holder = p ? p.id : null;
  if (p) art.location = p.capital;
  if (!art.provenance) art.provenance = [];
  art.provenance.push({ year: w.year, holder: p ? p.id : null, how: how });
}
function provText(w, art) {
  const pv = (art.provenance || []).filter(function (x) { return x.holder && w.polities[x.holder]; })
    .filter(function (x, i, a) { return i === 0 || a[i - 1].holder !== x.holder; }).slice(-4);
  if (pv.length < 2) return "";
  return " Its keepers had been " + pv.map(function (x) { return pn(w.polities[x.holder]) + " (" + yl(x.year) + ")"; }).join(", then ") + ".";
}
function countArch(w, id) { return livingPolities(w).filter(function (p) { return p.archetypeId === id; }).length; }
/* too many realms for new ones to split off: the world's cap for this year (core.js realmCap) */
function crowded(w) { return livingPolities(w).length >= AEON.realmCap(w); }
function dragons(w) { return livingPolities(w).filter(function (p) { return p.archetypeId === "dragon-fief"; }); }

/* prophecy bookkeeping: a prophecy is a chronicle event tagged "prophecy";
   a resolving event carries the tags "prophecy-fulfilled" and "fulfils:<id>" */
function noteProphecy(w) { F(w).openProph++; }
function openProphecies(c, kind, minAge) {
  if (!F(c.world).openProph) return [];
  const done = {};
  c.pastByTag("prophecy-fulfilled", 400).forEach(function (e) {
    const id = tagVal(e, "fulfils:");
    if (id) done[id] = true;
  });
  return c.pastByTag("prophecy", 400).filter(function (e) {
    if (done[e.id]) return false;
    if (kind && e.tags.indexOf("pk:" + kind) < 0) return false;
    return c.year - e.year >= (minAge || 0);
  });
}
function fulfilTags(pe) { return ["prophecy-fulfilled", "fulfils:" + pe.id]; }
function citeProphecy(c, pe) {
  const G = F(c.world); if (G.openProph > 0) G.openProph--;
  return "It had been foretold in " + yl(pe.year) + ": “" + (quoteOf(pe) || "the words are lost") + "”.";
}

/* region helpers for conquest */
function borderRegions(w, from, to) {
  return from.regions.map(function (i) { return w.regions[i]; }).filter(function (r) {
    return r && r.neighbors.some(function (n) { return w.regions[n] && w.regions[n].owner === to.id; });
  });
}
function hostileNeighbors(c) {
  const p = c.polity;
  return c.neighbors(p).filter(function (o) { return (p.relations[o.id] || 0) < -0.25; });
}
function scatterRelics(c, p, to, how) {
  const w = c.world, got = held(w, p);
  got.forEach(function (a) {
    give(w, a, to || null, how);
    if (!to) a.location = p.capital;
  });
  return got;
}
/* hand a region from `lose` to `win`, taking relics if it was the capital */
function annex(c, win, lose, region, fate) {
  const w = c.world;
  const wasCapital = region.id === lose.capital;
  const loot = wasCapital ? held(w, lose) : [];
  F(w).conquests.push({ win: win.id, lose: lose.id, region: region.id, year: w.year });
  if (lose.regions.length === 1) c.endPolity(lose, fate || "Its last province fell, and with it the name.");
  c.transfer(region, win);
  /* conquest burns villages and shrinks towns, and a conqueror may move to a greater fallen seat */
  const s = region.settlement;
  if (s && c.chance(wasCapital ? 0.12 : 0.2)) { if (s.tier <= 1) ruinify(region); else s.tier--; }
  if (wasCapital && region.settlement && !win.ended) {
    const own = w.regions[win.capital], ownTier = own && own.settlement ? own.settlement.tier : 0;
    if (region.settlement.tier > ownTier && c.chance(0.5)) win.capital = region.id;
  }
  loot.forEach(function (a) { give(w, a, win, "taken at the fall of " + lose.name); });
  return loot;
}

/* ====================================================================== */
/* biomes, eras, archetypes                                               */
/* ====================================================================== */

const BIOMES = {
  barren:    { name: "The Unfathomed Sea", color: "#1d3b5a", habitability: 0.0 },
  ice:       { name: "Rimewaste", color: "#e4eef5", habitability: 0.03 },
  tundra:    { name: "Barrowdowns", color: "#a9b8c4", habitability: 0.18 },
  taiga:     { name: "Pinewild", color: "#3f6652", habitability: 0.42 },
  grassland: { name: "Greenmarch", color: "#8bb55a", habitability: 0.88 },
  forest:    { name: "Elderwood", color: "#2d5a34", habitability: 0.74 },
  jungle:    { name: "Steamwood", color: "#1f6b3a", habitability: 0.5 },
  savanna:   { name: "Goldplain", color: "#c9b25a", habitability: 0.62 },
  desert:    { name: "Red Waste", color: "#d5a96a", habitability: 0.12 },
  mountain:  { name: "Highcrag", color: "#85807a", habitability: 0.26 },
  swamp:     { name: "Mirelands", color: "#56684a", habitability: 0.3 }
};

const ERAS = [
  { id: "wonders",   name: "The Age of Wonders", from: -2000, blurb: "The gods walk among their worshippers and miracles are plain labour." },
  { id: "sundering", name: "The Sundering",      from: -1100, blurb: "The heavens break, and what is left of them is quieter." },
  { id: "kingdoms",  name: "The Age of Kingdoms", from: -900, blurb: "Mortals rule, and the old powers are patrons rather than masters." },
  { id: "dusk",      name: "The Long Dusk",      from: 300,   blurb: "The gods have grown quiet. Relics are heirlooms more than weapons." },
  { id: "ash",       name: "The Age of Ash",     from: 850,   blurb: "Magic is a rumour. The scribes record it nevertheless." }
];

const ARCHETYPES = [
  { id: "theocracy", name: "God-Touched Theocracy", traitBias: { piety: 0.3, stability: 0.1, curiosity: -0.1 },
    blurb: "A realm ruled in the name of a god that sometimes answers." },
  { id: "elven-remnant", name: "Elvish Remnant", traitBias: { curiosity: 0.2, stability: 0.15, aggression: -0.15, piety: 0.05 },
    blurb: "The long-lived remains of a people who remember when the world was younger." },
  { id: "dwarf-hold", name: "Dwarf-Hold", traitBias: { stability: 0.25, cunning: 0.05, curiosity: 0.1, aggression: -0.05 },
    blurb: "A kingdom under a mountain, run like a ledger and defended like a vow." },
  { id: "mortal-kingdom", name: "Mortal Kingdom", traitBias: { aggression: 0.1, stability: 0.0 },
    blurb: "A hereditary crown, a standing levy, and a long memory for slights." },
  { id: "necrocracy", name: "Necrocracy", traitBias: { cunning: 0.2, piety: -0.25, stability: 0.2, aggression: 0.05 },
    blurb: "A court of the dead, governed by a ruler who declined to stop." },
  { id: "druidic-circle", name: "Druidic Circle", traitBias: { piety: 0.2, curiosity: 0.05, aggression: -0.2, stability: 0.15 },
    blurb: "A moot of groves and stone circles, answering to seasons rather than kings." },
  { id: "dragon-fief", name: "Dragon-Fief", traitBias: { aggression: 0.35, cunning: 0.2, curiosity: -0.2, stability: 0.1 },
    blurb: "A province held in fee by a wyrm, who collects the rent in kind." },
  { id: "wizard-tyranny", name: "Wizard-Tyranny", traitBias: { curiosity: 0.35, cunning: 0.2, piety: -0.15, stability: -0.05 },
    blurb: "A state of towers and licensed spellcraft, governed by the best-read." },
  { id: "free-cities", name: "League of Free Cities", traitBias: { cunning: 0.15, curiosity: 0.1, aggression: -0.1, stability: 0.05 },
    blurb: "Merchant-lords who vote on everything except the price of grain." },
  { id: "hill-clans", name: "Hill-Clans", traitBias: { aggression: 0.25, stability: -0.1, cunning: 0.05 },
    blurb: "Kin-bands under a thane, bound by oath and the cattle-feud." }
];

function cultureFor(rng, arch, world, region) {
  switch (arch && arch.id) {
    case "elven-remnant": return "elven";
    case "dwarf-hold": return "dwarven";
    case "necrocracy": case "dragon-fief": return "old";
    case "druidic-circle": return rng.chance(0.7) ? "fen" : "elven";
    case "wizard-tyranny": return rng.chance(0.6) ? "sun" : "elven";
    case "hill-clans": return "mark";
    default: return humanStyle(world, region);
  }
}

const FORMS = {
  "theocracy": ["The Holy See of {N}", "The Hierarchy of {N}", "The Sanctified Realm of {N}"],
  "wizard-tyranny": ["The Arcanocracy of {N}", "The Spire-Realm of {N}", "The Licensed Tyranny of {N}"],
  "necrocracy": ["The Pale Court of {N}", "The Quiet Kingdom of {N}", "The Unburied Realm of {N}"],
  "druidic-circle": ["The Circle of {N}", "The Green Moot of {N}", "The Groves of {N}"],
  "dragon-fief": ["The Hoard of {N}", "The Fee of {N}", "The Burning Seat of {N}"],
  "free-cities": ["The League of {N}", "The Concord of {N}", "The Free Cities of {N}"],
  "hill-clans": ["The Clans of {N}", "The Kin of {N}", "The Thanedom of {N}"],
  "mortal-kingdom": ["The Kingdom of {N}", "{N}", "The Realm of {N}", "The Principality of {N}", "The Marches of {N}"],
  "elven-remnant": ["{N}", "The Silver Court of {N}", "The Wardenry of {N}", "The Dawn-Realm of {N}", "{N} of the Last Light"],
  "dwarf-hold": ["The Hold of {N}", "The Deep-Kingdom of {N}", "The {N} Thanedom", "The Clan-Hold of {N}"]
};

/* ====================================================================== */
/* name generators                                                        */
/* ====================================================================== */

const NAMES = {
  polity: function (rng, ctx) {
    const arch = ctx.archetype || null;
    const aid = arch ? arch.id : "mortal-kingdom";
    const culture = cultureFor(rng, arch, ctx.world, ctx.region);
    let root;
    if (aid === "dragon-fief") root = dragonWord(rng);
    else root = rootFor(rng, culture);
    const form = rng.pick(FORMS[aid] || FORMS["mortal-kingdom"]);
    return {
      name: form.replace("{N}", root),
      adjective: aid === "dragon-fief" ? "Wyrm-" + root.replace(/'/g, "") : adjFor(culture, root),
      culture: culture
    };
  },

  figure: function (rng, ctx) {
    const p = ctx.polity;
    const role = ctx.role || "ruler";
    const culture = p && p.culture ? p.culture : "mark";
    const aid = p ? p.archetypeId : "mortal-kingdom";
    if (role === "ruler" && aid === "dragon-fief") {
      return { name: dragonWord(rng), title: rng.pick(RULER_TITLES["dragon-fief"]) };
    }
    const name = personName(rng, culture);
    let title;
    if (role === "ruler") title = rng.pick(RULER_TITLES[aid] || RULER_TITLES["mortal-kingdom"]);
    else if (ROLE_TITLES[role]) title = rng.pick(ROLE_TITLES[role]);
    else title = cap(role);
    if (role === "ruler" && aid === "mortal-kingdom" && culture === "sun" && title === "Warden") title = "Prince-Regent";
    return { name: name, title: title };
  },

  place: function (rng, ctx) {
    const culture = cultureOf(ctx);
    const biome = ctx.region ? ctx.region.biome : "grassland";
    if (culture === "elven") return elfWord(rng) + rng.pick(ELF_PLACE_END);
    if (culture === "old") return oldWord(rng);
    if (culture === "dwarven") return dwarfPlaceWord(rng);
    if (culture === "fen") {
      const s = FEN_SUF[biome] || ["ton"];
      return cap(rng.pick(FEN_A).toLowerCase()) + rng.pick(FEN_B.slice(0, 5)) + (rng.chance(0.5) ? " " + cap(rng.pick(s)) : "");
    }
    if (culture === "sun") return rng.pick(SUN_A) + rng.pick(SUN_B);
    const s = MARK_SUF[biome] || ["stead"];
    return rng.pick(MARK_A) + rng.pick(s);
  },

  settlement: function (rng, ctx) {
    const culture = cultureOf(ctx);
    if (culture === "elven") return elfWord(rng) + rng.pick(["thir", "nor", "lond", "iel", "oth"]);
    if (culture === "old") return oldWord(rng);
    if (culture === "dwarven") return dwarfPlaceWord(rng);
    if (culture === "fen") return rng.chance(0.5)
      ? rng.pick(["Caer ", "Dun ", "Aber "]) + cap(rng.pick(FEN_P1).toLowerCase()) + rng.pick(FEN_P2)
      : humanRoot(rng, "fen");
    if (culture === "sun") return rng.pick(SUN_A) + rng.pick(["polis", "castra", "portus", "ara", "um", "ago"]);
    return rng.pick(MARK_A) + rng.pick(["burg", "ton", "haven", "gate", "watch", "hold", "mouth", "cross", "bridge"]);
  },

  artifact: function (rng, ctx) {
    const kind = ctx.kind || rng.pick(RELIC_KINDS);
    const k = cap(kind);
    const culture = ctx.polity && ctx.polity.culture ? ctx.polity.culture : "mark";
    const roll = rng.int(0, 5);
    if (roll === 0) return rng.pick(RELIC_NAMES);
    if (roll === 1 || roll === 2) return "The " + rng.pick(RELIC_ADJ) + " " + k;
    if (roll === 3) return personName(rng, culture).split(" ")[0] + "'s " + k;
    if (roll === 4) return k + " of " + rootFor(rng, culture);
    return "The " + k + " of " + rng.pick(["Seven Oaths", "the Last Winter", "Unfinished Names", "Open Hands", "the Third Hour"]);
  },

  god: function (rng) { return oldWord(rng); },
  dragon: function (rng) { return dragonWord(rng); },

  school: function (rng, ctx) {
    const a = rng.pick(SCHOOL_A);
    if (ctx && ctx.polity && rng.chance(0.3)) return "The " + a + " of " + rootFor(rng, ctx.polity.culture || "mark");
    return "The " + a + " of the " + rng.pick(SCHOOL_B);
  }
};

/* ====================================================================== */
/* shared event helpers                                                   */
/* ====================================================================== */

function openNear(c, p) {
  const w = c.world, out = [];
  p.regions.forEach(function (rid) {
    w.regions[rid].neighbors.forEach(function (nid) {
      const n = w.regions[nid];
      if (n && !n.barren && !n.owner && n.habitability > 0.15 && out.indexOf(n) < 0) out.push(n);
    });
  });
  return out;
}
function ownRegions(c, p) { return c.regionsOf(p || c.polity); }
function figPolity(c) { return c.figure ? c.world.polities[c.figure.polityId] : null; }
function mk(importance, tags, actors, regionId, text) {
  const t = text.replace(/(^|[.!?] )([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
  return { importance: importance, tags: tags, actors: actors.filter(Boolean), regionId: regionId == null ? null : regionId, text: t };
}
function mkp(c, tags, actors, regionId, text) { noteProphecy(c.world); return mk(2, tags, actors, regionId, text); }
function cultOfGod(w, g) { return g.cult && w.polities[g.cult] && !w.polities[g.cult].ended ? w.polities[g.cult] : null; }
function newGod(c, name, domain, cultP, fromFig) {
  const g = F(c.world);
  const god = {
    id: "g" + (g.gods.length + 1), name: name, domain: domain, epithet: c.choice(EPITHETS),
    state: "awake", woke: c.year, silentUntil: null, died: null, cult: cultP ? cultP.id : null,
    site: cultP ? cultP.capital : null, mortal: !!fromFig
  };
  g.gods.push(god);
  return god;
}
function godTxt(g) { return g.name + ", " + g.epithet + ","; }

/* ====================================================================== */
/* EVENTS I -- the ordinary spine                                         */
/* ====================================================================== */

const CASUS_BELLI = [
  "a boundary stone that had been moved by night", "an insult delivered by a drunk ambassador and never withdrawn",
  "the unpaid dowry of a long-dead princess", "a river that had changed its bed in the spring floods",
  "a prophecy that could be read two ways", "grain-rights on the disputed meadows",
  "the murder of a merchant, whose nationality was in dispute", "a slight to a banner at a wedding",
  "an old treaty whose wording each side remembered differently", "the sheltering of a pretender"
];

const SPINE = [
  {
    id: "settlers-push-out", scope: "polity", weight: 8,
    test: function (c) { return c.polity.regions.length < 14 && openNear(c, c.polity).length > 0; },
    run: function (c) {
      const p = c.polity, t = c.pickSite(openNear(c, p)) || c.pick(openNear(c, p));
      c.transfer(t, p);
      c.foundSettlement(t, 1);
      return mk(2, ["founding", "expansion"], [c.actor(p), c.actor(t)], t.id,
        "Settlers from " + sn(c, c.world.regions[p.capital], p) + " cleared ground in the " + c.world.pack.biomes[t.biome].name.toLowerCase() +
        " and raised a palisade at " + t.settlement.name + ". The first winter took one in five of them, and the second took fewer.");
    }
  },
  {
    id: "city-founded", scope: "polity", weight: 5, cooldown: 40,
    test: function (c) { return c.polity.wealth > 0.35 && !!c.pickSite(c.regionsOf().filter(function (r) { return (r.settlement ? r.settlement.tier : 0) < Math.min(3, c.maxTier(r)); })); },
    run: function (c) {
      const p = c.polity;
      const rs = c.regionsOf().filter(function (r) { return (r.settlement ? r.settlement.tier : 0) < Math.min(3, c.maxTier(r)); });
      const r = c.pickSite(rs);
      const old = r.settlement ? r.settlement.tier : 0;
      const oldName = r.settlement ? r.settlement.name : null;
      c.foundSettlement(r, old + 1);
      if (oldName) r.settlement.name = oldName;
      p.prestige = clamp(p.prestige + 0.03, 0, 1);
      return mk(2, ["founding"], [c.actor(p), c.actor(r)], r.id,
        old ? r.settlement.name + " was granted walls and a market charter by " + rulerTxt(c.world, p) + ", and began to be called a city."
            : "A new town, " + r.settlement.name + ", was chartered by " + pn(p) + " to hold the " + c.world.pack.biomes[r.biome].name.toLowerCase() + " roads.");
    }
  },
  {
    id: "golden-reign", scope: "figure", weight: 6, cooldown: 120,
    test: function (c) { const f = c.figure; return f && f.died == null && f.traits.wisdom > 0.5 && f.traits.charisma > 0.5 && figPolity(c); },
    run: function (c) {
      const p = figPolity(c), f = c.figure;
      p.prestige = clamp(p.prestige + 0.1, 0, 1); p.tech = clamp(p.tech + 0.03, 0, 1); stab(p, 0.1);
      return mk(2, ["golden-age"], [c.actor(p), c.actor(f)], p.capital,
        "The reign of " + fn(f) + " was afterwards called a golden age by the scribes of " + pn(p) + ", who were employed at the time. Roads were mended, " +
        "the tax-rolls were honest for a decade, and the harvests were attributed to the ruler's good conscience.");
    }
  },
  {
    id: "succession-crisis", scope: "polity", weight: 5, cooldown: 60,
    test: function (c) { return c.polity.ruler && c.polity.traits.stability < 0.6; },
    run: function (c) {
      const w = c.world, p = c.polity, old = rulerOf(w, p);
      if (!old) return null;
      c.kill(old, c.choice(EPITAPHS));
      const heir = c.newFigure(p, "ruler");
      p.ruler = heir.id; p.rulers.push(heir.id);
      stab(p, -0.12); p.prestige = clamp(p.prestige - 0.04, 0, 1);
      return mk(3, ["succession", "crisis"], [c.actor(p), c.actor(old), c.actor(heir)], p.capital,
        "On the death of " + fn(old) + " two claimants were acclaimed in two halls of " + sn(c, w.regions[p.capital], p) + ". " +
        "The matter was settled in " + c.int(2, 7) + " years by the usual means, and " + fn(heir) + " was crowned over the objections of the losing party's relatives.");
    }
  },
  {
    id: "usurper-seizes-crown", scope: "figure", weight: 3, cooldown: 80,
    test: function (c) { return c.figure && c.figure.died == null && figPolity(c) && figPolity(c).traits.stability < 0.5; },
    run: function (c) {
      const w = c.world, p = figPolity(c), old = c.figure;
      const u = c.newFigure(p, "usurper");
      c.kill(old, "Put to the sword in his own hall by " + fn(u) + ", who was waiting.");
      p.ruler = u.id; p.rulers.push(u.id);
      stab(p, -0.08); piety(p, -0.04);
      return mk(3, ["succession", "usurpation"], [c.actor(p), c.actor(old), c.actor(u)], p.capital,
        fn(u) + " seized the crown of " + pn(p) + " in " + sn(c, w.regions[p.capital], p) + ", and the line of " + fn(old) + " ended on the same night. " +
        "The priests discovered within the week that the usurper had always been the god's intended.");
    }
  },
  {
    id: "ruler-falls-in-battle", scope: "figure", weight: 3, cooldown: 60,
    test: function (c) {
      const p = figPolity(c);
      return c.figure && c.figure.died == null && p && c.rivals(p).length > 0 && p.military > 0.3;
    },
    run: function (c) {
      const w = c.world, p = figPolity(c), f = c.figure, foe = c.pick(c.rivals(p));
      c.kill(f, "Fell at the head of his household guard, facing the " + foe.adjective + " line.");
      stab(p, -0.05); stock(p, "population", 0.97); p.prestige = clamp(p.prestige - 0.03, 0, 1);
      setRel(p, foe, Math.min(p.relations[foe.id] || 0, -0.6));
      return mk(3, ["death", "war"], [c.actor(p), c.actor(f), c.actor(foe)], p.capital,
        fn(f) + " of " + pn(p) + " was killed at a ford against " + pn(foe) + ". The body was recovered; the standard was not.");
    }
  },
  {
    id: "war-declared", consolidate: true, scope: "polity", weight: 9, cooldown: 30,
    test: function (c) { return c.polity.military > 0.25 && c.rivals().length > 0 && c.polity.traits.aggression > 0.3; },
    run: function (c) {
      const p = c.polity, foe = c.pick(c.rivals());
      setRel(p, foe, -1);
      c.world.stats.wars++;
      return mk(3, ["war"], [c.actor(p), c.actor(foe)], p.capital,
        p.name + " declared war upon " + pn(foe) + ", citing " + c.choice(CASUS_BELLI) + ". " +
        "The levies were called; the granaries, as ever, were consulted last.");
    }
  },
  {
    id: "border-battle", consolidate: true, scope: "polity", weight: 8, cooldown: 10,
    test: function (c) { return hostileNeighbors(c).length > 0; },
    run: function (c) {
      const w = c.world, a = c.polity, b = c.pick(hostileNeighbors(c));
      const sa = a.military + relicMight(w, a) * 0.25 + c.range(0, 0.3);
      const sb = b.military + relicMight(w, b) * 0.25 + c.range(0, 0.3);
      const win = sa >= sb ? a : b, lose = win === a ? b : a;
      const bs = borderRegions(w, lose, win);
      if (!bs.length) return null;
      const r = c.pick(bs);
      const name = sn(c, r, lose);
      const sole = lose.regions.length === 1;
      const loot = annex(c, win, lose, r, "Its last province, " + name + ", fell to " + pn(win) + ", and the " + lose.adjective + " name was struck from the rolls.");
      stock(lose, "population", 0.93); win.prestige = clamp(win.prestige + 0.05, 0, 1);
      return mk(sole ? 4 : 3, ["war", "conquest"], [c.actor(win), c.actor(lose), c.actor(r)].concat(loot.map(function (a2) { return c.actor(a2); })), r.id,
        "At " + name + " the host of " + pn(win) + " broke the " + lose.adjective + " levy and took the province. " +
        (loot.length ? "Among the spoil was " + loot[0].name + ", which was carried home in a cart under a tarpaulin." : "The garrison was permitted to leave, without its horses.") +
        (sole ? " Thereafter no one was left to call themselves " + lose.adjective + "." : ""));
    }
  },
  {
    id: "siege-and-sack", scope: "polity", weight: 6, cooldown: 30,
    test: function (c) {
      const w = c.world;
      return hostileNeighbors(c).some(function (o) { return o.regions.some(function (i) { return w.regions[i].settlement && w.regions[i].settlement.tier >= 2; }); });
    },
    run: function (c) {
      const w = c.world, a = c.polity;
      const foes = hostileNeighbors(c).filter(function (o) { return o.regions.some(function (i) { return w.regions[i].settlement && w.regions[i].settlement.tier >= 2; }); });
      const lose = c.pick(foes);
      const rs = lose.regions.map(function (i) { return w.regions[i]; }).filter(function (r) { return r.settlement && r.settlement.tier >= 2; });
      const r = c.pick(rs);
      const name = r.settlement.name;
      const held2 = r.id === lose.capital ? held(w, lose) : [];
      ruinify(r);
      stock(lose, "population", 0.88); stab(lose, -0.05);
      held2.forEach(function (art) { give(w, art, a, "plundered at the sack of " + name); });
      return mk(4, ["war", "sacked"], [c.actor(a), c.actor(lose), c.actor(r)].concat(held2.map(function (x) { return c.actor(x); })), r.id,
        name + " was stormed by the army of " + pn(a) + " after a siege of " + c.int(2, 14) + " months. The walls held until the wells failed. " +
        "The city was burned by the third day and is described by the survivors in terms the scribe declines to repeat." +
        (held2.length ? " " + held2[0].name + " was among the things carried out." : ""));
    }
  },
  {
    id: "peace-treaty", scope: "polity", weight: 6, cooldown: 20,
    test: function (c) { return c.rivals().some(function (o) { return (c.polity.relations[o.id] || 0) < -0.5; }); },
    run: function (c) {
      const p = c.polity;
      const foe = c.pick(c.rivals().filter(function (o) { return (p.relations[o.id] || 0) < -0.5; }));
      setRel(p, foe, 0.1);
      stab(p, 0.04); stab(foe, 0.04);
      return mk(2, ["peace", "diplomacy"], [c.actor(p), c.actor(foe)], p.capital,
        "Envoys of " + pn(p) + " and " + pn(foe) + " met at a ford that belonged to neither and swore peace on " + c.choice(["salt", "iron", "an open flame", "the bones of a saint", "bread broken in three"]) +
        ". The terms were read aloud in two languages, and both versions were later found to contain different borders.");
    }
  },
  {
    id: "alliance-sworn", scope: "polity", weight: 4, cooldown: 40,
    test: function (c) { return c.neighbors().some(function (o) { return (c.polity.relations[o.id] || 0) > -0.2; }); },
    run: function (c) {
      const p = c.polity;
      const o = c.pick(c.neighbors().filter(function (x) { return (p.relations[x.id] || 0) > -0.2; }));
      setRel(p, o, 0.8);
      p.prestige = clamp(p.prestige + 0.02, 0, 1);
      return mk(2, ["alliance", "diplomacy"], [c.actor(p), c.actor(o)], p.capital,
        "A marriage was arranged between the houses of " + pn(p) + " and " + pn(o) + ", and a defensive pact was sworn at the wedding feast, " +
        "where both ambassadors were too drunk to object to the wording.");
    }
  },
  {
    id: "plague", scope: "polity", weight: 4, cooldown: 60,
    test: function (c) { return c.polity.population > 1500; },
    run: function (c) {
      const w = c.world, p = c.polity;
      const nm = c.choice(["the Grey Cough", "the Red Spots", "the Weeping Fever", "the Dancing Sickness", "the Black Tongue", "the Long Thirst"]);
      stock(p, "population", c.range(0.7, 0.88));
      stab(p, -0.04);
      const f = rulerOf(w, p);
      let tail = "";
      if (f && c.chance(0.3)) { c.kill(f, "Taken by " + nm + " in the third month of the visitation."); tail = " " + fn(f) + " was among the dead."; }
      return mk(3, ["plague"], [c.actor(p)], p.capital,
        nm + " reached " + sn(c, w.regions[p.capital], p) + " by the salt-road and killed " + c.choice(["one in five", "one in four", "one in three"]) +
        " of the people of " + pn(p) + " before the first frost." + tail);
    }
  },
  {
    id: "famine", scope: "polity", weight: 4, cooldown: 40,
    test: function (c) { return c.polity.population > 1200 && c.polity.regions.length > 0; },
    run: function (c) {
      const p = c.polity;
      stock(p, "population", c.range(0.8, 0.92)); stab(p, -0.05);
      const r = c.pick(c.regionsOf());
      if (r.resources) r.resources.food = Math.max(0.05, r.resources.food - 0.1);
      return mk(2, ["famine"], [c.actor(p), c.actor(r)], r.id,
        "The rains failed in " + rn(c, r, p) + " for " + c.int(2, 4) + " successive summers and " + pn(p) + " ate its seed-grain. " +
        "The scribes record the price of bread by the year, which is the best available guide to the suffering.");
    }
  },
  {
    id: "raiders-from-the-wastes", scope: "polity", weight: 4, cooldown: 40,
    test: function (c) { return c.polity.regions.length > 0; },
    run: function (c) {
      const w = c.world, p = c.polity, r = c.pick(c.regionsOf());
      stock(p, "population", 0.94); p.wealth = clamp(p.wealth - 0.05, 0, 1);
      const raiders = c.choice(["Red-Hand reavers", "grey-cloaked horse-clans", "the sea-wolves of the western isles", "a hungry host out of the Barrowdowns", "deserters of three armies"]);
      return mk(2, ["raid"], [c.actor(p), c.actor(r)], r.id,
        "Raiders, being " + raiders + ", burned the outlying farms of " + rn(c, r, p) + " and drove off the winter stock. " +
        "They were not pursued, as the ruler of " + pn(p) + " judged the roads worse than the loss.");
    }
  },
  {
    id: "rebellion", scope: "polity", weight: 2, cooldown: 150,
    test: function (c) { return c.polity.regions.length >= 5 && c.polity.traits.stability < 0.45 && !crowded(c.world); },
    run: function (c) {
      const w = c.world, p = c.polity;
      const cand = c.regionsOf().filter(function (r) { return r.id !== p.capital; });
      if (!cand.length) return null;
      const r = c.pick(cand);
      const name = rn(c, r, p);
      c.transfer(r, null);
      const np = c.spawnPolity(r, "mortal-kingdom");
      setRel(p, np, -0.8);
      stab(p, -0.04);
      return mk(4, ["rebellion", "founding", "secession"], [c.actor(p), c.actor(np), c.actor(r)], r.id,
        "The province of " + name + " rose against " + pn(p) + " over " + c.choice(["the grain-levy", "a hated governor", "the new tithe", "the conscription of its sons", "an insult to its saint"]) +
        " and declared itself " + pn(np) + ". The crown has not, as of this record, recognised the declaration.");
    }
  },
  {
    id: "realm-collapse", scope: "polity", weight: 6,
    test: function (c) { return c.year - c.polity.founded > 80 && c.polity.regions.length <= 3 && c.polity.traits.stability < 0.4 && c.polity.prestige < 0.3; },
    run: function (c) {
      const w = c.world, p = c.polity;
      const cap2 = w.regions[p.capital];
      const capName = sn(c, cap2, p);
      const relics = scatterRelics(c, p, null, "scattered at the fall of " + p.name);
      c.regionsOf().forEach(function (r) { if (r.settlement && r.settlement.tier >= 2) ruinify(r); });
      const fate = "Collapsed in " + yl(c.year) + " when " + c.choice(["its treasury was empty and its army unpaid", "the last of its great houses declined to come to court", "its granaries failed in the fourth bad year", "its levy marched home in the middle of a campaign"]) + ".";
      c.endPolity(p, fate);
      return mk(4, ["collapse"], [c.actor(p), c.actor(cap2)].concat(relics.map(function (a) { return c.actor(a); })), cap2.id,
        p.name + " came apart in " + capName + ". The court went home, the army went elsewhere, and the roads reverted to the use of " + c.choice(["wolves", "pilgrims", "whoever was strongest", "tax-collectors from other lands"]) + "." +
        (relics.length ? " " + relics[0].name + " was lost in the confusion." : ""));
    }
  },
  {
    id: "ruins-resettled", scope: "polity", weight: 5, cooldown: 80,
    test: function (c) { return c.regionsOf().some(function (r) { return hasF(r, "ruins") && r.ruinName; }); },
    run: function (c) {
      const p = c.polity;
      const r = c.pick(c.regionsOf().filter(function (x) { return hasF(x, "ruins") && x.ruinName; }));
      const sack = c.past(function (e) { return e.regionId === r.id && e.tags.indexOf("sacked") >= 0; }, 1)[0];
      delF(r, "ruins");
      c.foundSettlement(r, 1);
      r.settlement.name = r.ruinName;
      r.habitability = clamp(r.habitability + 0.05, 0, 0.98);
      return mk(2, ["founding", "memory"], [c.actor(p), c.actor(r)], r.id,
        "Colonists from " + pn(p) + " raised a village among the fallen walls of " + r.ruinName + " and took its name back into use. " +
        (sack ? "The place had lain empty since its burning in " + yl(sack.year) + ", and the settlers reported that the ground still grew nothing in the old street-lines." : "The old stones were quarried for the new houses, which the elders thought unwise."));
    }
  },
  {
    id: "great-flood", scope: "polity", weight: 4, cooldown: 80,
    test: function (c) { return c.regionsOf().some(function (r) { return r.settlement && r.elevation < 0.55; }); },
    run: function (c) {
      const p = c.polity;
      const r = c.pick(c.regionsOf().filter(function (x) { return x.settlement && x.elevation < 0.55; }));
      stock(p, "population", 0.93);
      r.habitability = Math.max(0.04, r.habitability - 0.1);
      return mk(2, ["disaster", "flood"], [c.actor(p), c.actor(r)], r.id,
        "The river at " + r.settlement.name + " rose " + c.int(3, 9) + " cubits in a single night and took the lower town. " +
        "The temple on the hill was spared, which the priests mentioned often.");
    }
  },
  {
    id: "ashen-winter", scope: "world", weight: 5, minEra: "ash", cooldown: 90,
    test: function (c) { return true; },
    run: function (c) {
      const w = c.world;
      const al = livingPolities(w);
      al.forEach(function (p) { stock(p, "population", 0.9); stab(p, -0.03); });
      let n = 0;
      w.regions.forEach(function (r) {
        if (!r.barren && r.biome === "grassland" && n < 4 && c.chance(0.05)) { r.habitability = Math.max(0.05, r.habitability - 0.12); n++; }
      });
      return mk(3, ["disaster", "ash"], [], null,
        "For " + c.int(2, 5) + " years the sun rose pale and the snow fell grey in every kingdom, and the scribes were forced to agree it was no omen: " +
        "a mountain somewhere had burst. The cause was not located, and the harvests were not recovered for a decade.");
    }
  }
];

/* ====================================================================== */
/* EVENTS II -- the gods                                                  */
/* ====================================================================== */

const GODS = [
  {
    id: "god-wakes", scope: "world", weight: 7,
    test: function (c) { const w = c.world; return magic(w) > 0.4 && godsAlive(w).length < 6 && c.year < 600; },
    run: function (c) {
      const w = c.world;
      const cands = livingPolities(w).filter(function (p) { return !godOf(w, p); });
      if (!cands.length) return null;
      const cult = c.rng.weighted(cands, function (p) { return p.traits.piety + 0.1; });
      const god = newGod(c, c.name("god"), c.choice(DOMAINS), cult, null);
      const r = w.regions[cult.capital];
      addF(r, "shrine");
      piety(cult, 0.15); cult.prestige = clamp(cult.prestige + 0.06, 0, 1);
      return mk(4, ["god", "god-wakes"], [c.actor(cult), c.actor(r)], r.id,
        "In " + yl(c.year) + " " + godTxt(god) + " lord of " + god.domain + ", woke beneath " + sn(c, r, cult) + " and was heard speaking by " + pn(cult) +
        ". The god asked, first, what year it was, and was told, and made no comment.");
    }
  },
  {
    id: "god-demands-tribute", scope: "polity", weight: 8, cooldown: 60,
    test: function (c) { return !!godOf(c.world, c.polity) && magic(c.world) > 0.25; },
    run: function (c) {
      const w = c.world, p = c.polity, g = godOf(w, p);
      const t = c.choice(TRIBUTES);
      p.wealth = clamp(p.wealth - 0.08, 0, 1); p.prestige = clamp(p.prestige + 0.03, 0, 1); piety(p, 0.05);
      return mk(2, ["god", "tribute"], [c.actor(p)], p.capital,
        godTxt(g) + " lord of " + g.domain + ", demanded of " + pn(p) + " " + t + ", to be delivered yearly. The demand was written down and complied with, " +
        (magic(w) > 0.5 ? "the alternative having been described in some detail." : "although by now the god's voice was heard chiefly by the priests."));
    }
  },
  {
    id: "god-grants-boon", scope: "polity", weight: 7, cooldown: 50,
    test: function (c) { return !!godOf(c.world, c.polity) && magic(c.world) > 0.3; },
    run: function (c) {
      const w = c.world, p = c.polity, g = godOf(w, p);
      const roll = c.int(0, 2);
      const b = c.choice(BOONS);
      if (roll === 0) stock(p, "population", 1.12);
      else if (roll === 1) p.tech = clamp(p.tech + 0.04, 0, 1);
      else { const r = c.regionsOf().filter(function (x) { return hasF(x, "blighted"); })[0]; if (r) { delF(r, "blighted"); r.habitability = clamp(r.habitability + 0.2, 0, 0.98); } }
      stab(p, 0.06);
      return mk(3, ["god", "boon", "miracle"], [c.actor(p)], p.capital,
        "By the favour of " + g.name + ", " + g.epithet + ", " + b + " in the lands of " + pn(p) + ". The temple treasury was found a good deal fuller by the following spring.");
    }
  },
  {
    id: "god-angered", scope: "polity", weight: 5, cooldown: 80,
    test: function (c) { return !!godOf(c.world, c.polity) && c.polity.traits.piety < 0.9 && magic(c.world) > 0.2 && c.polity.regions.length > 0; },
    run: function (c) {
      const w = c.world, p = c.polity, g = godOf(w, p);
      const r = c.pick(c.regionsOf());
      blight(r, 0.3);
      stock(p, "population", 0.85); piety(p, 0.1); stab(p, -0.06);
      return mk(3, ["god", "smiting"], [c.actor(p), c.actor(r)], r.id,
        g.name + " was angered by " + pn(p) + ", the reason given in the temple records being " + c.choice(["a neglected feast", "a mixed marriage", "a well dug in a forbidden field", "the mocking of a priest", "a tax levied on the temple"]) +
        ". " + cap(rn(c, r, p)) + " went black in a single night, and the sheep of the province were found standing facing the wall.");
    }
  },
  {
    id: "god-falls-silent", scope: "world", weight: 5,
    test: function (c) { return godsAlive(c.world, "awake").some(function (g) { return c.year - g.woke > 100; }); },
    run: function (c) {
      const w = c.world;
      const g = c.pick(godsAlive(w, "awake").filter(function (x) { return c.year - x.woke > 100; }));
      g.state = "silent"; g.silentUntil = c.year + c.int(150, 400);
      const p = cultOfGod(w, g);
      if (p) piety(p, -0.1);
      return mk(4, ["god", "silence"], [p ? c.actor(p) : null], p ? p.capital : null,
        g.name + ", " + g.epithet + ", ceased to answer. The priests continued the rites; the rites continued to be accepted, as far as anyone could tell. " +
        "The scribes of " + (p ? pn(p) : "the temple") + " note that nothing else changed, and that this was the alarming part.");
    }
  },
  {
    id: "god-returns", scope: "world", weight: 9,
    test: function (c) { return godsAlive(c.world, "silent").some(function (g) { return g.silentUntil <= c.year; }) && magic(c.world) > 0.2; },
    run: function (c) {
      const w = c.world;
      const g = c.pick(godsAlive(w, "silent").filter(function (x) { return x.silentUntil <= c.year; }));
      const silent = c.year - (g.silentUntil - 0);
      g.state = "awake";
      let p = cultOfGod(w, g);
      if (!p) {
        const l = livingPolities(w);
        if (!l.length) return null;
        p = c.rng.weighted(l, function (x) { return x.traits.piety + 0.1; });
        g.cult = p.id;
      }
      piety(p, 0.1); p.prestige = clamp(p.prestige + 0.04, 0, 1);
      return mk(4, ["god", "god-returns"], [c.actor(p)], p.capital,
        g.name + ", " + g.epithet + ", spoke again after a silence of some centuries, in the dialect of " + pn(p) + " rather than the old tongue. " +
        "What was said was recorded imperfectly, but all the versions agree that the god was disappointed.");
    }
  },
  {
    id: "god-dies", scope: "world", weight: 4,
    test: function (c) { if (crowded(c.world)) return false; return godsAlive(c.world, "awake").some(function (g) { return c.year - g.woke > 200; }); },
    run: function (c) {
      const w = c.world, G = F(w);
      const cands = godsAlive(w, "awake").filter(function (g) { return c.year - g.woke > 200; });
      const open = openProphecies(c, "godfall", 20);
      let g = null, pe = null;
      for (let i = 0; i < open.length && !g; i++) {
        const gid = tagVal(open[i], "god:");
        const found = cands.filter(function (x) { return x.id === gid; })[0];
        if (found) { g = found; pe = open[i]; }
      }
      if (!g) g = c.pick(cands);
      g.state = "dead"; g.died = c.year;
      const p = cultOfGod(w, g);
      const site = p ? w.regions[p.capital] : c.pick(w.regions.filter(function (r) { return !r.barren; }));
      addF(site, "godwound"); delF(site, "shrine");
      site.habitability = Math.max(0.05, site.habitability - 0.1);
      drain(w, 0.04);
      let tail = "";
      if (p) {
        piety(p, -0.25); stab(p, -0.2);
        if (p.regions.length >= 3 && !crowded(w)) {
          const cand = p.regions.map(function (i) { return w.regions[i]; }).filter(function (r) { return r.id !== p.capital; });
          const r = c.pick(cand);
          c.transfer(r, null);
          const np = c.spawnPolity(r, "theocracy");
          setRel(p, np, -0.7);
          tail = " The clergy split over what the death meant, and the dissenting half withdrew to " + sn(c, r, np) + " and founded " + pn(np) + ", whose temple kept the god's name and nothing else.";
        } else tail = " The clergy fell to arguing over the succession of a god, and the arguments outlived the temple.";
      }
      let cite = "";
      const tags = ["god", "god-dies", "catastrophe"];
      if (pe) {
        cite = " " + citeProphecy(c, pe) + " The cult's scribes had read this as a prophecy of triumph; it was fulfilled instead by the god, quietly, in its own sanctuary, of having been forgotten.";
        fulfilTags(pe).forEach(function (t) { tags.push(t); });
      }
      return mk(5, tags, [p ? c.actor(p) : null, c.actor(site)], site.id,
        g.name + ", " + g.epithet + ", lord of " + g.domain + ", died in " + yl(c.year) + " and the miracles that depended on it stopped that evening. " +
        "A wound in the world was left at " + sn(c, site, p) + ", which has not closed." + tail + cite);
    }
  },
  {
    id: "god-born-of-mortal", scope: "figure", weight: 3, maxEra: "kingdoms",
    test: function (c) {
      const f = c.figure, w = c.world;
      return f && f.died == null && f.traits.charisma > 0.6 && f.title !== "the Unnamed" && magic(w) > 0.35 && figPolity(c) && figPolity(c).archetypeId !== "dragon-fief" && godsAlive(w).length < 7;
    },
    run: function (c) {
      const w = c.world, f = c.figure, p = figPolity(c);
      const g = newGod(c, f.name.split(" ")[0], c.choice(DOMAINS), p, f);
      c.kill(f, "Taken up living into the sky. The scribes record no body.");
      const r = w.regions[p.capital]; addF(r, "shrine");
      piety(p, 0.2); p.prestige = clamp(p.prestige + 0.12, 0, 1);
      return mk(4, ["god", "apotheosis"], [c.actor(p), c.actor(f)], r.id,
        fn(f) + " of " + pn(p) + " was seen to rise from the temple steps in the presence of the whole court and was thereafter worshipped as " + godTxt(g) + " lord of " + g.domain + ". " +
        "The physicians of the court, who had been treating " + (f.traits.cruelty > 0.5 ? "him" : "her") + " for a cough, were not consulted on the matter.");
    }
  },
  {
    id: "miracle-wrought", scope: "polity", weight: 7, maxEra: "kingdoms",
    test: function (c) { const w = c.world; return (godOf(w, c.polity) || c.polity.traits.piety > 0.65) && magic(w) > 0.5; },
    run: function (c) {
      const w = c.world, p = c.polity, g = godOf(w, p);
      stab(p, 0.07); p.prestige = clamp(p.prestige + 0.06, 0, 1);
      const bl = c.regionsOf().filter(function (x) { return hasF(x, "blighted"); })[0];
      if (bl) { delF(bl, "blighted"); bl.habitability = clamp(bl.habitability + 0.15, 0, 0.98); }
      return mk(3, ["miracle"], [c.actor(p)], p.capital,
        "At " + sn(c, w.regions[p.capital], p) + " " + c.choice(MIRACLES) + ". The matter was entered in the temple record of " + pn(p) + " beside the grain-tallies" +
        (g ? ", and attributed to " + g.name : "") + ", and no one in the city doubted either entry.");
    }
  },
  {
    id: "rumour-of-miracle", scope: "polity", weight: 5, minEra: "dusk", cooldown: 40,
    test: function (c) { return c.polity.traits.piety > 0.35; },
    run: function (c) {
      const p = c.polity;
      p.prestige = clamp(p.prestige + 0.01, 0, 1);
      return mk(1, ["rumour"], [c.actor(p)], p.capital,
        "In the lands of " + pn(p) + " " + c.choice(RUMOURS) + ". A pilgrim-road was nevertheless laid out, and the inn at its end did well.");
    }
  },
  {
    id: "holy-war", scope: "polity", weight: 5,
    test: function (c) { const p = c.polity; return p.traits.piety > 0.5 && c.rivals().length > 0 && !!godOf(c.world, p); },
    run: function (c) {
      const w = c.world, p = c.polity, g = godOf(w, p);
      const foe = c.pick(c.rivals());
      setRel(p, foe, -1); w.stats.wars++;
      p.traits.aggression = clamp(p.traits.aggression + 0.06, 0, 0.98);
      return mk(3, ["war", "holy-war"], [c.actor(p), c.actor(foe)], p.capital,
        "A holy war against " + pn(foe) + " was proclaimed in the name of " + g.name + ", " + g.epithet + ", whose priests reported a clear and personal instruction. " +
        "The same priests were unable, when asked, to say whether the god meant for the campaign to be won.");
    }
  },
  {
    id: "clergy-schism", scope: "polity", weight: 2, cooldown: 200,
    test: function (c) { return c.polity.regions.length >= 5 && c.polity.traits.piety > 0.5 && !crowded(c.world); },
    run: function (c) {
      const w = c.world, p = c.polity;
      const cand = c.regionsOf().filter(function (r) { return r.id !== p.capital; });
      const r = c.pick(cand);
      c.transfer(r, null);
      const np = c.spawnPolity(r, "theocracy");
      const h = c.newFigure(np, "heretic");
      np.ruler = h.id; np.rulers.push(h.id);
      setRel(p, np, -0.7);
      return mk(3, ["schism", "founding", "religion"], [c.actor(p), c.actor(np), c.actor(h), c.actor(r)], r.id,
        "The clergy of " + pn(p) + " split on a point of doctrine: " + c.choice(["whether the god ate", "the proper hour of the evening prayer", "the hand with which the bread is broken", "whether the dead are consulted before or after the tithe", "the number of the god's eyes"]) +
        ". " + fn(h) + " carried the dissenting temples out of the " + sn(c, r, np) + " district and founded " + pn(np) + ".");
    }
  },
  {
    id: "godwound-weeps", scope: "world", weight: 4, cooldown: 40,
    test: function (c) { return c.world.regions.some(function (r) { return hasF(r, "godwound"); }); },
    run: function (c) {
      const w = c.world;
      const r = c.pick(w.regions.filter(function (x) { return hasF(x, "godwound"); }));
      const nbs = r.neighbors.map(function (i) { return w.regions[i]; }).filter(function (n) { return n && !n.barren; });
      if (!nbs.length) return null;
      const n = c.pick(nbs);
      const nm = rn(c, r, null);
      const owner = n.owner ? w.polities[n.owner] : null;
      let tail;
      if (c.chance(0.5)) { addF(n, "ley-line"); tail = "Where it ran, a ley-line broke surface at " + rn(c, n, owner) + ", and herb-gatherers there reported dreams of great height."; }
      else { blight(n, 0.2); if (owner) stock(owner, "population", 0.96); tail = "The grass at " + rn(c, n, owner) + " died back in a ring, and the dead ground has widened a hand's breadth a year."; }
      return mk(2, ["godwound", "magic"], [owner ? c.actor(owner) : null, c.actor(r), c.actor(n)], r.id,
        "The wound in the earth at " + nm + " wept, as it does at intervals, and what it wept was not water. " + tail);
    }
  },
  {
    id: "old-god-revived", scope: "polity", weight: 2, cooldown: 200,
    test: function (c) { return godsAlive(c.world, "dead").length > 0 && magic(c.world) < 0.5 && c.polity.traits.piety > 0.5; },
    run: function (c) {
      const w = c.world, p = c.polity;
      const g = c.pick(godsAlive(w, "dead"));
      piety(p, 0.05); p.prestige = clamp(p.prestige + 0.02, 0, 1);
      const site = g.site != null ? w.regions[g.site] : null;
      return mk(2, ["religion", "memory"], [c.actor(p), site ? c.actor(site) : null], site ? site.id : p.capital,
        "A cult in " + pn(p) + " revived the worship of " + g.name + ", " + g.epithet + ", who had died in " + yl(g.died) + ". " +
        "The rites were reconstructed from a single torn liturgy and a misremembered nursery rhyme. The god did not answer, and the cult took this for an encouraging sign.");
    }
  }
];

/* ====================================================================== */
/* EVENTS III -- prophecy and its fulfilment                              */
/* ====================================================================== */

const PROPHECY = [
  {
    id: "oracle-speaks", scope: "polity", weight: 4, cooldown: 120,
    test: function (c) { const p = c.polity; return p.traits.piety > 0.35 && magic(c.world) > 0.15; },
    run: function (c) {
      const w = c.world, p = c.polity;
      const seer = c.newFigure(p, "prophet");
      const port = c.choice(PORTENTS);
      const kinds = [];
      const rivals = c.rivals();
      if (rivals.length) kinds.push("fall");
      const towns = c.regionsOf().filter(function (r) { return r.settlement && r.settlement.tier >= 1; });
      if (towns.length) kinds.push("flood");
      const gods = godsAlive(w);
      if (gods.length) kinds.push("godfall");
      const arts = artList(w).filter(function (a) { return !a.destroyed; });
      if (arts.length) kinds.push("relic");
      if (!kinds.length) return null;
      const kind = c.pick(kinds);
      const place = sn(c, w.regions[p.capital], p);
      const prefix = fn(seer) + " of " + pn(p) + " spoke in " + place + " and was written down: ";
      if (kind === "fall") {
        const t = c.pick(rivals);
        return mkp(c, ["prophecy", "pk:fall", "tgt:" + t.id], [c.actor(p), c.actor(seer), c.actor(t)], p.capital,
          prefix + "\"When " + port + ", the house of " + pn(t) + " shall be ended.\" The court of " + pn(t) + " was not informed, and learned of it within the month.");
      }
      if (kind === "flood") {
        const r = c.pick(towns);
        return mkp(c, ["prophecy", "pk:flood"], [c.actor(p), c.actor(seer), c.actor(r)], r.id,
          prefix + "\"When " + port + ", the waters shall take " + r.settlement.name + " and no wall will be consulted.\" The citizens of " + r.settlement.name + " responded by raising the quay.");
      }
      if (kind === "godfall") {
        const g = c.pick(gods);
        return mkp(c, ["prophecy", "pk:godfall", "god:" + g.id], [c.actor(p), c.actor(seer)], p.capital,
          prefix + "\"When " + port + ", " + g.name + " shall go down, and what it ruled shall go down with it.\" The temple of " + g.name + " bought the original and burned it.");
      }
      const a = c.pick(arts);
      return mkp(c, ["prophecy", "pk:relic", "art:" + a.id], [c.actor(p), c.actor(seer), c.actor(a)], p.capital,
        prefix + "\"When " + port + ", " + a.name + " shall be broken, and the hand that breaks it shall be glad.\" The keepers of " + a.name + " doubled the guard and altered nothing else.");
    }
  },
  {
    id: "deathbed-prophecy", scope: "figure", weight: 1.5, cooldown: 100,
    test: function (c) {
      const w = c.world, f = c.figure;
      if (!f || f.died != null || c.year - f.born < 48 || !figPolity(c)) return false;
      const extinct = Object.keys(w.polities).some(function (k) { const x = w.polities[k]; return x.ended && c.year - x.ended > 60 && x.archetypeId !== "dragon-fief"; });
      return extinct || dragons(w).length > 0;
    },
    run: function (c) {
      const w = c.world, f = c.figure, p = figPolity(c);
      const extinct = Object.keys(w.polities).map(function (k) { return w.polities[k]; }).filter(function (x) { return x.ended && c.year - x.ended > 60 && x.archetypeId !== "dragon-fief"; });
      const dr = dragons(w);
      let kind;
      if (extinct.length && dr.length) kind = c.chance(0.5) ? "heir" : "slayer"; else kind = extinct.length ? "heir" : "slayer";
      const place = sn(c, w.regions[p.capital], p);
      c.kill(f, "Died speaking, which the court recorded and the household regretted.");
      if (kind === "heir") {
        const old = c.pick(extinct);
        return mkp(c, ["prophecy", "pk:heir", "tgt:" + old.id], [c.actor(p), c.actor(f), c.actor(old)], p.capital,
          fn(f) + " of " + pn(p) + " died in " + place + " in the middle of a sentence, which was afterwards completed by the physicians as: \"A child of " + pn(old) + " shall come out of the east carrying the old signet, and the stones will remember the name.\"");
      }
      const d = c.pick(dr);
      return mkp(c, ["prophecy", "pk:slayer", "tgt:" + d.id], [c.actor(p), c.actor(f), c.actor(d)], d.capital,
        fn(f) + " of " + pn(p) + " said, at the last, \"One born " + c.choice(BIRTHS) + " shall unmake " + pn(d) + ", and shall not be thanked.\" The household recorded this without conviction and the court recorded it with some.");
    }
  },
  {
    id: "prophecy-fall-fulfilled", scope: "world", weight: 7,
    test: function (c) {
      return openProphecies(c, "fall", 30).some(function (e) { const t = c.world.polities[tagVal(e, "tgt:")]; return t && !t.ended && t.traits.stability < 0.55; });
    },
    run: function (c) {
      const w = c.world;
      const pe = openProphecies(c, "fall", 30).filter(function (e) { const t = w.polities[tagVal(e, "tgt:")]; return t && !t.ended && t.traits.stability < 0.55; })[0];
      const t = w.polities[tagVal(pe, "tgt:")];
      const nbs = c.neighbors(t);
      const conq = nbs.length ? c.pick(nbs) : null;
      const capR = w.regions[t.capital];
      const cname = sn(c, capR, t);
      const regs = t.regions.slice();
      scatterRelics(c, t, conq, "taken at the fall of " + t.name);
      c.endPolity(t, "Ended in " + yl(c.year) + ", as foretold in " + yl(pe.year) + "; the scribes agreed on the date and nothing else.");
      if (conq) regs.forEach(function (rid) { c.transfer(w.regions[rid], conq); });
      const tags = ["fall", "collapse", "conquest"].concat(fulfilTags(pe));
      return mk(4, tags, [conq ? c.actor(conq) : null, c.actor(t), c.actor(capR)], capR.id,
        t.name + " ended at " + cname + (conq ? ", taken by the host of " + pn(conq) + "," : ",") + " on a day when " + c.choice(["no one had thought to look at the sky", "the gates stood open for a wedding", "the garrison was at prayer"]) + ". " +
        citeProphecy(c, pe) + " The prophecy was observed to have been fulfilled to the letter, and the letter to have been of no use to anyone.");
    }
  },
  {
    id: "prophecy-fall-subverted", scope: "world", weight: 5,
    test: function (c) { return openProphecies(c, "fall", 40).some(function (e) { const t = c.world.polities[tagVal(e, "tgt:")]; return t && !t.ended && t.ruler; }); },
    run: function (c) {
      const w = c.world;
      const pe = openProphecies(c, "fall", 40).filter(function (e) { const t = w.polities[tagVal(e, "tgt:")]; return t && !t.ended && t.ruler; })[0];
      const t = w.polities[tagVal(pe, "tgt:")];
      const old = rulerOf(w, t);
      if (!old) return null;
      c.kill(old, "Last of the old house; died childless in a monastery, on the day the prophecy was read aloud in court.");
      const heir = c.newFigure(t, "ruler");
      t.ruler = heir.id; t.rulers.push(heir.id);
      stab(t, -0.05);
      const tags = ["succession", "subverted"].concat(fulfilTags(pe));
      return mk(3, tags, [c.actor(t), c.actor(old), c.actor(heir)], t.capital,
        "The house of " + pn(t) + " ended, as foretold: " + fn(old) + " died without issue in " + yl(c.year) + " and the crown passed to " + fn(heir) + ", a distant cousin by marriage. " +
        citeProphecy(c, pe) + " The prophecy had said nothing of the kingdom, and the kingdom continued under a different house, which the seers described as a technicality.");
    }
  },
  {
    id: "heir-returns", scope: "world", weight: 8,
    test: function (c) { if (crowded(c.world)) return false;
      const w = c.world;
      return Object.keys(w.polities).some(function (k) { const x = w.polities[k]; return x.ended && !x.restored && !/^Departed/.test(x.fate || "") && c.year - x.ended > 80 && x.archetypeId !== "dragon-fief"; });
    },
    run: function (c) {
      const w = c.world;
      const ext = Object.keys(w.polities).map(function (k) { return w.polities[k]; }).filter(function (x) { return x.ended && !x.restored && !/^Departed/.test(x.fate || "") && c.year - x.ended > 80 && x.archetypeId !== "dragon-fief"; });
      const open = openProphecies(c, "heir", 0);
      let old = null, pe = null;
      for (let i = 0; i < open.length && !old; i++) {
        const t = w.polities[tagVal(open[i], "tgt:")];
        if (t && t.ended && !t.restored) { old = t; pe = open[i]; }
      }
      if (!old) old = c.pick(ext);
      const cr = w.regions[old.capital];
      const cands = w.regions.filter(function (r) { return !r.barren && !r.owner && r.habitability > 0.15 && dist(r, cr) <= 9; });
      if (!cands.length) return null;
      const r = c.pick(cands);
      const np = c.spawnPolity(r, old.archetypeId);
      np.name = old.name; np.adjective = old.adjective; np.culture = old.culture; old.restored = true; np.restored = true;
      const heir = c.newFigure(np, "heir");
      np.ruler = heir.id; np.rulers.push(heir.id);
      const signet = c.newArtifact({ name: "The Signet of " + old.name.replace(/^The /, ""), kind: "signet", region: r, creator: null, power: 0.3,
        legend: "A seal-ring of the dead house of " + old.name + ", kept by a family of ferrymen who did not know what it was." });
      give(w, signet, np, "carried by " + heir.name + " out of exile");
      signet.created = old.founded;
      const yrs = c.year - old.ended;
      const tags = ["memory", "heir", "founding"];
      let cite = "";
      if (pe) { fulfilTags(pe).forEach(function (t) { tags.push(t); }); cite = " " + citeProphecy(c, pe) + " The ferrymen insisted they had always known, and no one asked why they had not said."; }
      return mk(4, tags, [c.actor(np), c.actor(old), c.actor(heir), c.actor(signet), c.actor(r)], r.id,
        fn(heir) + ", a ferryman's grandchild, presented the signet of " + pn(old) + " at " + sn(c, r, np) + " in " + yl(c.year) + ", " + yrs + " years after the house had ended (" + lc(old.fate.replace(/\.$/, "")) + ") " +
        "and was acclaimed by a crowd of people who had, in many cases, never heard of it. " + np.name + " was restored on the spot." + cite);
    }
  },
  {
    id: "drowned-city", scope: "world", weight: 6,
    test: function (c) { return openProphecies(c, "flood", 20).some(function (e) { const r = c.world.regions[e.regionId]; return r && r.settlement; }); },
    run: function (c) {
      const w = c.world;
      const pe = openProphecies(c, "flood", 20).filter(function (e) { const r = w.regions[e.regionId]; return r && r.settlement; })[0];
      const r = w.regions[pe.regionId];
      const name = r.settlement.name;
      const owner = r.owner ? w.polities[r.owner] : null;
      ruinify(r);
      addF(r, "drowned");
      reshape(w, r, "swamp");
      if (owner) { stock(owner, "population", 0.88); stab(owner, -0.06); }
      const tags = ["disaster", "flood", "memory"].concat(fulfilTags(pe));
      return mk(4, tags, [owner ? c.actor(owner) : null, c.actor(r)], r.id,
        "The sea came into " + name + " in " + yl(c.year) + ", over a wall that had stood " + c.int(100, 400) + " years. " + citeProphecy(c, pe) +
        " Those who had raised the quay were reproached for it by those who had not, and the district became marsh, which it remains.");
    }
  },
  {
    id: "prophecy-misread", scope: "world", weight: 2,
    test: function (c) { return openProphecies(c, null, 150).length > 0; },
    run: function (c) {
      const pe = openProphecies(c, null, 150)[0];
      const tags = ["subverted", "memory"].concat(fulfilTags(pe));
      return mk(2, tags, [], pe.regionId,
        "The prophecy of " + yl(pe.year) + " was declared fulfilled by a council of scribes, " + (c.year - pe.year) + " years after the fact: " + c.choice(IRONIES) + ". " + citeProphecy(c, pe));
    }
  }
];

/* ====================================================================== */
/* EVENTS IV -- magic                                                     */
/* ====================================================================== */

const TRANSFORMS = {
  desert: ["grassland", "The Greening"], swamp: ["grassland", "The Draining"], tundra: ["taiga", "The Thawing"],
  grassland: ["forest", "The Wildwood Rite"], taiga: ["forest", "The Quickening of the Pines"],
  mountain: ["grassland", "The Levelling"], forest: ["swamp", "The Drowning Rite"], savanna: ["grassland", "The Sweetening"]
};

const MAGIC = [
  {
    id: "school-founded", scope: "polity", weight: 6,
    test: function (c) { const p = c.polity; return magic(c.world) > 0.3 && p.traits.curiosity > 0.45 && p.tech > 0.12 && F(c.world).schools.length < 8; },
    run: function (c) {
      const w = c.world, p = c.polity, G = F(w);
      const nm = c.name("school", { polity: p });
      const founder = c.newFigure(p, "mage");
      G.schools.push({ name: nm, polity: p.id, year: c.year });
      p.tech = clamp(p.tech + 0.04, 0, 1); p.prestige = clamp(p.prestige + 0.05, 0, 1);
      addF(w.regions[p.capital], "arcane-school");
      return mk(3, ["magic", "school"], [c.actor(p), c.actor(founder), c.actor(w.regions[p.capital])], p.capital,
        nm + " was founded at " + sn(c, w.regions[p.capital], p) + " by " + fn(founder) + " under the patronage of " + pn(p) + ". " +
        "Its first rule was that no student might cast a spell on the premises; its second rule was never enforced.");
    }
  },
  {
    id: "ley-line-tapped", scope: "polity", weight: 5, cooldown: 60,
    test: function (c) { return magic(c.world) > 0.3 && c.regionsOf().some(function (r) { return hasF(r, "ley-line") && !hasF(r, "mageless"); }); },
    run: function (c) {
      const w = c.world, p = c.polity;
      const r = c.pick(c.regionsOf().filter(function (x) { return hasF(x, "ley-line") && !hasF(x, "mageless"); }));
      p.tech = clamp(p.tech + 0.03, 0, 1); p.wealth = clamp(p.wealth + 0.04, 0, 1);
      if (r.resources) r.resources.exotic = Math.min(1, r.resources.exotic + 0.2);
      let tail = "";
      if (c.chance(0.3)) { delF(r, "ley-line"); addF(r, "drained"); drain(w, 0.004); tail = " The channel was overdrawn in the third winter and the line ran dry; the engineers were not blamed, as there were no others."; }
      return mk(3, ["magic", "ley-line"], [c.actor(p), c.actor(r)], r.id,
        "The engineers of " + pn(p) + " sank a copper well into the ley-line at " + rn(c, r, p) + " and drew off its power into the lamps, forges and cisterns of the province." + tail);
    }
  },
  {
    id: "spell-blights-region", scope: "polity", weight: 4,
    test: function (c) {
      const p = c.polity;
      return magic(c.world) > 0.35 && c.rivals().length > 0 && (p.archetypeId === "wizard-tyranny" || p.traits.curiosity > 0.6);
    },
    run: function (c) {
      const w = c.world, p = c.polity, foe = c.pick(c.rivals());
      if (!foe.regions.length) return null;
      const r = w.regions[c.pick(foe.regions)];
      const sp = c.choice(SPELLS);
      const mage = c.newFigure(p, "mage");
      blight(r, 0.35);
      stock(foe, "population", 0.9); setRel(p, foe, -1); drain(w, 0.003);
      return mk(4, ["magic", "blight", "war"], [c.actor(p), c.actor(foe), c.actor(mage), c.actor(r)], r.id,
        fn(mage) + " of " + pn(p) + " cast " + sp + " upon " + rn(c, r, foe) + " in the territory of " + pn(foe) + ". The fields were black by the equinox and remain so. " +
        "The spell has not been cast since, partly from scruple and partly because the words were found to have been lost in the casting.");
    }
  },
  {
    id: "mage-war", scope: "world", weight: 4, cooldown: 100,
    test: function (c) {
      const w = c.world;
      return magic(w) > 0.3 && livingPolities(w).filter(function (p) { return p.traits.curiosity > 0.5 && p.regions.length; }).length >= 2;
    },
    run: function (c) {
      const w = c.world;
      const mages = livingPolities(w).filter(function (p) { return p.traits.curiosity > 0.5 && p.regions.length; });
      const two = c.shuffle(mages).slice(0, 2);
      const a = two[0], b = two[1];
      setRel(a, b, -1); w.stats.wars++;
      [a, b].forEach(function (p) {
        stock(p, "population", 0.8); stab(p, -0.08);
        for (let i = 0; i < 2; i++) { const r = w.regions[c.pick(p.regions)]; blight(r, 0.25); }
      });
      drain(w, 0.03);
      return mk(4, ["magic", "war", "mage-war"], [c.actor(a), c.actor(b)], a.capital,
        "The mage-war between " + pn(a) + " and " + pn(b) + " lasted " + c.int(4, 11) + " years and was fought mostly by people who did not know either name. " +
        "Whole districts were unpicked from the world, and the magic of both realms is said never to have fully come back.");
    }
  },
  {
    id: "magic-fails-in-region", scope: "world", weight: 4,
    test: function (c) { const w = c.world; return magic(w) < 0.75 && w.regions.some(function (r) { return (hasF(r, "ley-line") || hasF(r, "arcane-school") || hasF(r, "shrine")) && !hasF(r, "mageless"); }); },
    run: function (c) {
      const w = c.world;
      const r = c.pick(w.regions.filter(function (x) { return (hasF(x, "ley-line") || hasF(x, "arcane-school") || hasF(x, "shrine")) && !hasF(x, "mageless"); }));
      const owner = r.owner ? w.polities[r.owner] : null;
      delF(r, "ley-line"); delF(r, "arcane-school"); addF(r, "mageless");
      drain(w, 0.004);
      if (owner) { owner.tech = clamp(owner.tech - 0.03, 0, 1); piety(owner, -0.04); }
      return mk(3, ["magic", "magic-fails"], [owner ? c.actor(owner) : null, c.actor(r)], r.id,
        "In " + yl(c.year) + " the magic failed at " + rn(c, r, owner) + ". Wards fell, lamps went out, and a spell half-spoken in the market square stopped in the air and was heard no more. " +
        "It has not come back there since, and the district is now noted on the maps as quiet.");
    }
  },
  {
    id: "ritual-reshapes-land", scope: "polity", weight: 4,
    test: function (c) {
      const p = c.polity;
      return magic(c.world) > 0.3 && (p.traits.piety > 0.5 || p.traits.curiosity > 0.5) && c.regionsOf().some(function (r) { return TRANSFORMS[r.biome] && !hasF(r, "ritual-ground"); });
    },
    run: function (c) {
      const w = c.world, p = c.polity;
      const r = c.pick(c.regionsOf().filter(function (x) { return TRANSFORMS[x.biome] && !hasF(x, "ritual-ground"); }));
      const t = TRANSFORMS[r.biome];
      const before = w.pack.biomes[r.biome].name.toLowerCase();
      reshape(w, r, t[0]); addF(r, "ritual-ground");
      p.prestige = clamp(p.prestige + 0.04, 0, 1);
      return mk(3, ["magic", "ritual", "terrain"], [c.actor(p), c.actor(r)], r.id,
        "The rite called " + t[1] + " was performed at " + rn(c, r, p) + " over " + c.int(3, 9) + " nights by the priests of " + pn(p) + ", and the " + before + " there became " +
        w.pack.biomes[t[0]].name.toLowerCase() + ". The labourers who had been paid to attend reported nothing unusual until the third night.");
    }
  },
  {
    id: "the-sundering", scope: "world", weight: 100000, minEra: "sundering", maxEra: "sundering",
    test: function (c) { return c.pastByType("the-sundering", 1).length === 0; },
    run: function (c) {
      const w = c.world, G = F(w);
      const hab = w.regions.filter(function (r) { return !r.barren && r.habitability > 0.3 && r.owner; });
      const pool = hab.length ? hab : w.regions.filter(function (r) { return !r.barren; });
      const centre = c.pick(pool);
      const centreName = rn(c, centre, centre.owner ? w.polities[centre.owner] : null);
      let wounds = 1;
      w.regions.forEach(function (r) {
        if (r.barren) return;
        const d = dist(r, centre);
        if (d <= 1.5) { reshape(w, r, "desert"); addF(r, "godwound"); addF(r, "blighted"); ruinify(r); r.habitability = 0.02; }
        else if (d <= 3.5) { reshape(w, r, "desert"); addF(r, "blighted"); ruinify(r); }
        else if (d <= 5.5 && c.chance(0.5)) { blight(r, 0.3); }
      });
      addF(centre, "godwound");
      const land = w.regions.filter(function (r) { return !r.barren && dist(r, centre) > 5.5; });
      const order = c.shuffle(land.slice());
      order.slice(0, 5).forEach(function (r) { addF(r, "godwound"); wounds++; });
      order.slice(5, 11).forEach(function (r) { reshape(w, r, "mountain"); });
      const coast = land.filter(function (r) { return r.neighbors.some(function (n) { return w.regions[n].barren; }); });
      c.shuffle(coast.slice()).slice(0, 10).forEach(function (r) { reshape(w, r, "swamp"); addF(r, "drowned"); });
      w.regions.forEach(function (r) { delF(r, "ley-line"); });
      c.shuffle(w.regions.filter(function (r) { return !r.barren; })).slice(0, 12).forEach(function (r) { addF(r, "ley-line"); });
      livingPolities(w).forEach(function (p) { stock(p, "population", 0.65); stab(p, -0.15); piety(p, 0.1); });
      artList(w).forEach(function (a) { a.power = a.power * 0.75; });
      godsAlive(w, "awake").forEach(function (g) { g.state = "silent"; g.silentUntil = c.year + c.int(250, 500); });
      drain(w, 0.25); G.sundered = true;
      return mk(5, ["sundering", "catastrophe", "magic", "godwound"], [c.actor(centre)], centre.id,
        "In " + yl(c.year) + " the heavens broke over " + centreName + ". For three days the sky showed the inside of itself, and what fell from it is named in the records only as the Rending. " +
        "The land for several days' ride around " + centreName + " turned to red waste, " + wounds + " wounds were opened in the earth that have never closed, the low coasts sank into marsh, " +
        "and mountains stood up where there had been farmland. Every god then awake went silent in the same hour, and the ley-lines were found in the morning to run elsewhere. " +
        "It is called the Sundering. Magic did not end that day, but it has been ending since.");
    }
  },
  {
    id: "ley-line-awakens", scope: "world", weight: 4,
    test: function (c) { return magic(c.world) > 0.3 && c.world.regions.some(function (r) { return !r.barren && !hasF(r, "ley-line") && !hasF(r, "mageless"); }); },
    run: function (c) {
      const w = c.world;
      const cands = w.regions.filter(function (r) { return !r.barren && !hasF(r, "ley-line") && !hasF(r, "mageless"); });
      const stones = cands.filter(function (r) { return hasF(r, "standing-stones"); });
      const r = c.pick(stones.length ? stones : cands);
      addF(r, "ley-line");
      const owner = r.owner ? w.polities[r.owner] : null;
      return mk(2, ["magic", "ley-line"], [owner ? c.actor(owner) : null, c.actor(r)], r.id,
        "A ley-line woke under " + rn(c, r, owner) + ". The first sign was a single field of wheat that ripened in March; the second was a shepherd who stopped ageing for a season, to his considerable annoyance.");
    }
  },
  {
    id: "lich-ascends", scope: "figure", weight: 3, maxEra: "dusk", cooldown: 150,
    test: function (c) {
      const f = c.figure, p = figPolity(c);
      return f && f.died == null && p && p.archetypeId !== "necrocracy" && p.archetypeId !== "dragon-fief" && countArch(c.world, "necrocracy") < 3 && f.traits.wisdom > 0.5 && f.traits.cruelty > 0.45 && magic(c.world) > 0.3;
    },
    run: function (c) {
      const p = figPolity(c), f = c.figure;
      p.archetypeId = "necrocracy"; p.archetypeName = "Necrocracy";
      f.title = "the Unnamed"; f.born = c.year - 30;
      piety(p, -0.3); stab(p, 0.15);
      return mk(4, ["magic", "undead", "lich"], [c.actor(p), c.actor(f)], p.capital,
        fn(f) + " of " + pn(p) + " did not die on the night the physicians pronounced " + (f.traits.charisma > 0.5 ? "him" : "her") + " dead. " +
        "The court of " + pn(p) + " was thereafter governed from a locked chamber, by a ruler no one saw eat, and the realm is reckoned among the necrocracies from this year.");
    }
  },
  {
    id: "blight-recedes", scope: "world", weight: 3, cooldown: 30,
    test: function (c) { return c.world.regions.some(function (r) { return hasF(r, "blighted"); }); },
    run: function (c) {
      const w = c.world;
      const r = c.pick(w.regions.filter(function (x) { return hasF(x, "blighted"); }));
      delF(r, "blighted");
      r.habitability = clamp(r.habitability + 0.18, 0.05, w.pack.biomes[r.biome].habitability + 0.15);
      if (r.resources) r.resources.food = Math.min(1, r.resources.food + 0.25);
      const owner = r.owner ? w.polities[r.owner] : null;
      return mk(2, ["magic", "healing"], [owner ? c.actor(owner) : null, c.actor(r)], r.id,
        "The blight on " + rn(c, r, owner) + " lifted of its own accord in " + yl(c.year) + ". Grass was seen in the ruts of the old road, and a goat was reported to have eaten it and lived.");
    }
  },
  {
    id: "tower-raised", scope: "polity", weight: 3, cooldown: 100,
    test: function (c) { const p = c.polity; return (p.archetypeId === "wizard-tyranny" || p.traits.curiosity > 0.6) && c.regionsOf().some(function (r) { return !hasF(r, "spire"); }); },
    run: function (c) {
      const p = c.polity;
      const r = c.pick(c.regionsOf().filter(function (x) { return !hasF(x, "spire"); }));
      const old = r.settlement ? r.settlement.name : null;
      c.foundSettlement(r, 3);
      if (old) r.settlement.name = old;
      addF(r, "spire");
      p.tech = clamp(p.tech + 0.03, 0, 1); p.prestige = clamp(p.prestige + 0.04, 0, 1);
      return mk(3, ["magic", "building"], [c.actor(p), c.actor(r)], r.id,
        "A tower of black glass was raised above " + sn(c, r, p) + " by the artificers of " + pn(p) + ", " + c.int(300, 900) + " feet high by their own survey. " +
        "It was visible from three neighbouring kingdoms, all of which instituted a levy in response.");
    }
  },
  {
    id: "standing-stones-raised", scope: "polity", weight: 3, cooldown: 100,
    test: function (c) { return c.regionsOf().some(function (r) { return !hasF(r, "standing-stones") && !r.barren; }); },
    run: function (c) {
      const p = c.polity;
      const r = c.pick(c.regionsOf().filter(function (x) { return !hasF(x, "standing-stones"); }));
      addF(r, "standing-stones");
      piety(p, 0.04); p.prestige = clamp(p.prestige + 0.02, 0, 1);
      return mk(2, ["religion", "building"], [c.actor(p), c.actor(r)], r.id,
        "A ring of " + c.int(7, 19) + " standing stones was raised at " + rn(c, r, p) + " over " + c.int(3, 40) + " years by the people of " + pn(p) + ". " +
        "Their purpose is variously given as a calendar, a temple, a grave, and a boundary, and the builders left no note to settle it.");
    }
  },
  {
    id: "grove-wakes", scope: "polity", weight: 4, cooldown: 80,
    test: function (c) { const p = c.polity; return p.regions.length > 0 && (p.archetypeId === "druidic-circle" || p.archetypeId === "elven-remnant") && magic(c.world) > 0.2; },
    run: function (c) {
      const w = c.world, p = c.polity;
      const r = c.pick(c.regionsOf());
      reshape(w, r, "forest"); addF(r, "grove");
      delF(r, "blighted");
      r.habitability = clamp(r.habitability + 0.1, 0, 0.98);
      piety(p, 0.05);
      return mk(3, ["religion", "terrain"], [c.actor(p), c.actor(r)], r.id,
        "The great grove at " + rn(c, r, p) + " came into leaf in midwinter, and the wood spread " + c.int(2, 9) + " leagues in the following decade, swallowing a road, two farms and an argument about a boundary. " +
        "The folk of " + pn(p) + " declared it a gift.");
    }
  },
  {
    id: "elves-depart", scope: "polity", weight: 12, minEra: "kingdoms",
    test: function (c) { const p = c.polity; return p.archetypeId === "elven-remnant" && c.year - p.founded > 100 && magic(c.world) < 0.75 && p.regions.length > 0; },
    run: function (c) {
      const w = c.world, p = c.polity;
      const cap2 = w.regions[p.capital];
      const capName = sn(c, cap2, p);
      const rs = c.regionsOf();
      const arts = held(w, p);
      arts.forEach(function (a) { give(w, a, null, "carried over the sea by " + p.name); a.beyond = true; });
      rs.forEach(function (r) { if (r.settlement) ruinify(r); addF(r, "elf-ruins"); });
      drain(w, 0.03);
      c.endPolity(p, "Departed over the western sea in " + yl(c.year) + ". No later chronicle names a landing.");
      return mk(5, ["departure", "collapse", "magic"], [c.actor(p), c.actor(cap2)].concat(arts.map(function (a) { return c.actor(a); })), cap2.id,
        "The people of " + pn(p) + " went down to the grey shore below " + capName + " and took ship in " + yl(c.year) + ", having decided, after some thousands of years, that the world was no longer to their taste. " +
        "They left the cities standing and took the songs, and the magic of their roads went out with the last of their lanterns." +
        (arts.length ? " " + arts[0].name + " went with them, and is held to be beyond the sea." : ""));
    }
  },
  {
    id: "dwarves-delve", scope: "polity", weight: 6,
    test: function (c) { const p = c.polity; return p.archetypeId === "dwarf-hold" && c.regionsOf().some(function (r) { return !hasF(r, "delving") && !hasF(r, "the-pit"); }); },
    run: function (c) {
      const p = c.polity;
      const all = c.regionsOf().filter(function (x) { return !hasF(x, "delving") && !hasF(x, "the-pit"); });
      const mt = all.filter(function (x) { return x.biome === "mountain"; });
      const r = c.pick(mt.length ? mt : all);
      if (r.resources) r.resources.metal = Math.min(1, r.resources.metal + 0.25);
      p.wealth = clamp(p.wealth + 0.08, 0, 1); p.tech = clamp(p.tech + 0.02, 0, 1);
      const deep = c.chance(0.28);
      if (deep) { addF(r, "delving"); F(c.world).delve.push({ region: r.id, year: c.year }); }
      return mk(deep ? 3 : 2, ["delving"], [c.actor(p), c.actor(r)], r.id,
        "The miners of " + pn(p) + " drove a new gallery " + c.int(4, 22) + " hundred paces into the roots of " + rn(c, r, p) + " and struck " + c.choice(["a seam of black silver", "a vein of sky-iron", "a hall of green crystal", "a cold spring that ran backward"]) + "." +
        (deep ? " At the far end they broke into a hollow that gave back no echo, and the gallery was sealed that night, at the foreman's request." : " The thane declared a feast, and two days off."));
    }
  }
];

/* ====================================================================== */
/* EVENTS V -- monsters                                                   */
/* ====================================================================== */

const MONSTERS = [
  {
    id: "dragon-claims-region", scope: "world", weight: 4,
    test: function (c) { if (crowded(c.world)) return false; const w = c.world; return magic(w) > 0.2 && dragons(w).length < 3 && c.year < 1000; },
    run: function (c) {
      const w = c.world;
      const cands = w.regions.filter(function (r) {
        if (r.barren || r.habitability < 0.15) return false;
        if (!r.owner) return true;
        const o = w.polities[r.owner];
        return o && o.archetypeId !== "dragon-fief" && o.regions.length >= 2;
      });
      if (!cands.length) return null;
      const r = c.rng.weighted(cands, function (x) { return 1 + (x.biome === "mountain" ? 3 : 0) + (hasF(x, "ley-line") ? 2 : 0) + (hasF(x, "barrow") ? 1 : 0) + (x.owner ? 0 : 1); });
      const victim = r.owner ? w.polities[r.owner] : null;
      const rname = rn(c, r, victim);
      if (victim) c.transfer(r, null);
      const D = c.spawnPolity(r, "dragon-fief");
      const d = c.newFigure(D, "ruler");
      D.ruler = d.id; D.rulers.push(d.id);
      D.name = c.choice(FORMS["dragon-fief"]).replace("{N}", d.name); D.adjective = "Wyrm-" + d.name.replace(/'/g, "");
      D.traits.aggression = 0.95; D.traits.stability = Math.max(D.traits.stability, 0.6);
      addF(r, "dragon-lair");
      c.neighbors(D).forEach(function (n) { setRel(D, n, -0.7); });
      return mk(4, ["dragon", "monster", "founding"], [c.actor(D), c.actor(d)].concat(victim ? [c.actor(victim)] : []).concat([c.actor(r)]), r.id,
        "In " + yl(c.year) + " the wyrm " + d.name + " descended on " + rname + (victim ? ", a province of " + pn(victim) + "," : "") + " and made it " + pn(D) + ". " +
        (victim ? "The garrison was told to leave, and did. " : "") + "The name of the province has since been spoken quietly, and the road past it has been moved a day's ride east.");
    }
  },
  {
    id: "dragon-expands", scope: "polity", weight: 8,
    test: function (c) {
      const p = c.polity, w = c.world;
      return p.archetypeId === "dragon-fief" && (openNear(c, p).length > 0 || hostileNeighbors(c).some(function (o) { return borderRegions(w, o, p).length > 0; }));
    },
    run: function (c) {
      const w = c.world, D = c.polity;
      const victims = hostileNeighbors(c).filter(function (o) { return borderRegions(w, o, D).length > 0; });
      if (victims.length && c.chance(0.6)) {
        const v = c.pick(victims);
        const r = c.pick(borderRegions(w, v, D));
        const nm = sn(c, r, v);
        annex(c, D, v, r, "Burned out by " + pn(D) + " and its name forgotten by the survivors.");
        stock(v, "population", 0.9);
        addF(r, "scorched");
        return mk(4, ["dragon", "war", "conquest"], [c.actor(D), c.actor(v), c.actor(r)], r.id,
          rulerTxt(w, D) + " came out of the hills at " + nm + " and the " + v.adjective + " garrison was counted afterward in fragments. The province now pays its rent to " + pn(D) + " in cattle, and in other things.");
      }
      const open = openNear(c, D);
      if (!open.length) return null;
      const t = c.pick(open);
      c.transfer(t, D); addF(t, "scorched");
      return mk(3, ["dragon", "expansion"], [c.actor(D), c.actor(t)], t.id,
        rulerTxt(w, D) + " extended its fee to " + rn(c, t, D) + ", where nothing had stood to object. The shepherds were permitted to stay, and to pay.");
    }
  },
  {
    id: "dragon-brood-succession", scope: "polity", weight: 5, cooldown: 70,
    test: function (c) { return c.polity.archetypeId === "dragon-fief" && !!c.polity.ruler; },
    run: function (c) {
      const w = c.world, D = c.polity, old = rulerOf(w, D);
      if (!old) return null;
      c.kill(old, "Killed at the hoard by a daughter who was hungry and had waited.");
      const nd = c.newFigure(D, "ruler");
      D.ruler = nd.id; D.rulers.push(nd.id);
      let tail = "";
      if (c.chance(0.4)) {
        const art = c.newArtifact({ name: c.name("artifact", { polity: D, kind: "crown" }), kind: "crown", region: w.regions[D.capital], power: c.range(0.4, 0.8),
          legend: "Taken from the hoard of " + old.name + " and worn by no one." });
        give(w, art, D, "part of the hoard of " + old.name);
        tail = " Among the things counted in the hoard afterward was " + art.name + ", which the new wyrm did not seem to value.";
      }
      return mk(3, ["dragon", "succession"], [c.actor(D), c.actor(old), c.actor(nd)], D.capital,
        old.name + " of " + pn(D) + " was killed by its own brood in " + yl(c.year) + ", and " + nd.name + " took the hoard and the fee together. The tax was not lowered." + tail);
    }
  },
  {
    id: "tribute-to-the-wyrm", scope: "polity", weight: 5,
    test: function (c) { return c.polity.archetypeId !== "dragon-fief" && c.neighbors().some(function (o) { return o.archetypeId === "dragon-fief"; }); },
    run: function (c) {
      const p = c.polity;
      const D = c.pick(c.neighbors().filter(function (o) { return o.archetypeId === "dragon-fief"; }));
      p.wealth = clamp(p.wealth - 0.1, 0, 1); stab(p, -0.03);
      setRel(p, D, 0.1);
      return mk(2, ["dragon", "tribute"], [c.actor(p), c.actor(D)], p.capital,
        pn(p) + " sent " + c.int(20, 90) + " wagons of grain, tin and young women of no particular family to " + pn(D) + " in " + yl(c.year) + ", " +
        "in the hope that it would be remembered, and the girls, in some cases, returned.");
    }
  },
  {
    id: "hero-slays-dragon", scope: "world", weight: 5,
    test: function (c) { return dragons(c.world).some(function (D) { return c.year - D.founded >= 60; }); },
    run: function (c) {
      const w = c.world;
      const ds = dragons(w).filter(function (D) { return c.year - D.founded >= 60; });
      const open = openProphecies(c, "slayer", 0);
      let D = null, pe = null;
      for (let i = 0; i < open.length && !D; i++) {
        const d2 = w.polities[tagVal(open[i], "tgt:")];
        if (d2 && ds.indexOf(d2) >= 0) { D = d2; pe = open[i]; }
      }
      if (!D) D = c.pick(ds);
      const nbs = c.neighbors(D);
      const pool = nbs.length ? nbs : livingPolities(w).filter(function (p) { return p.archetypeId !== "dragon-fief"; });
      if (!pool.length) return null;
      const H = c.pick(pool);
      const hero = c.newFigure(H, "hero");
      const dr = rulerOf(w, D);
      const cr = w.regions[D.capital];
      const crName = sn(c, cr, D);
      const odds = 0.45 + (pe ? 0.3 : 0) + relicMight(w, H) * 0.1;
      if (!c.chance(odds)) {
        c.kill(hero, "Went into the hills for " + (dr ? dr.name : "the wyrm") + ". His armour was returned by the wyrm, politely, in a sack.");
        stab(H, -0.03);
        return mk(3, ["dragon", "failure", "hero"], [c.actor(H), c.actor(hero), c.actor(D)], cr.id,
          fn(hero) + " of " + pn(H) + " went up against " + pn(D) + " at " + crName + " in " + yl(c.year) + ". " +
          "The attempt was ended in the first hour, and the armour was returned to the family by the wyrm, which sent an invoice.");
      }
      if (dr) c.kill(dr, "Slain at its hoard by " + fn(hero) + " of " + pn(H) + ".");
      const years = c.year - D.founded;
      const hoard = c.newArtifact({ name: c.name("artifact", { polity: H, kind: "crown" }), kind: "crown", region: cr, power: c.range(0.6, 0.9),
        legend: "Pulled from the hoard of " + (dr ? dr.name : "a wyrm") + " after " + years + " years of its dominion." });
      c.endPolity(D, "Its wyrm was slain at " + crName + " by " + fn(hero) + " in " + yl(c.year) + ", after " + years + " years of rule, and the fee passed out of mind.");
      delF(cr, "dragon-lair"); addF(cr, "dragon-bones"); delF(cr, "scorched");
      c.transfer(cr, H);
      give(w, hoard, H, "won from the hoard of " + pn(D));
      H.prestige = clamp(H.prestige + 0.15, 0, 1); stab(H, 0.05);
      const tags = ["dragon", "hero", "monster-slain"];
      let cite = "";
      if (pe) {
        fulfilTags(pe).forEach(function (t) { tags.push(t); });
        cite = " " + citeProphecy(c, pe) + (c.chance(0.5)
          ? " " + hero.name + " had, in fact, been born in a tithe-barn at " + sn(c, w.regions[H.capital], H) + ", which the seers agreed was close enough."
          : " " + hero.name + " had been born in a manor-house with a view of the river, which the seers pointed out was the opposite, and then went on to say it had been fulfilled all the same.");
      }
      return mk(4, tags, [c.actor(H), c.actor(hero), c.actor(D), c.actor(hoard), c.actor(cr)], cr.id,
        fn(hero) + " of " + pn(H) + " slew " + (dr ? dr.name : "the wyrm") + " of " + pn(D) + " at " + crName + " in " + yl(c.year) + ", with a spear, in the narrow place under the hoard. " +
        "The wyrm had held the province for " + years + " years. " + hoard.name + " was carried out on twenty carts." + cite);
    }
  },
  {
    id: "undead-plague", scope: "polity", weight: 3, cooldown: 60,
    test: function (c) { const p = c.polity; return p.regions.length > 0 && (p.archetypeId === "necrocracy" || c.regionsOf().some(function (r) { return hasF(r, "barrow") || hasF(r, "haunted"); }) || c.neighbors().some(function (o) { return o.archetypeId === "necrocracy"; })); },
    run: function (c) {
      const p = c.polity;
      const r = c.pick(c.regionsOf());
      stock(p, "population", 0.84); stab(p, -0.05);
      addF(r, "haunted");
      if (p.archetypeId === "necrocracy") {
        const nb = c.neighbors().filter(function (o) { return o.archetypeId !== "necrocracy"; });
        if (nb.length) { const v = c.pick(nb); stock(v, "population", 0.9); }
      }
      return mk(3, ["undead", "plague"], [c.actor(p), c.actor(r)], r.id,
        "In " + rn(c, r, p) + " " + c.choice(UNDEAD_DEEDS) + ". The province was emptied by " + c.int(2, 6) + " springs, and the army of " + pn(p) + " was twice sent in and once came back.");
    }
  },
  {
    id: "deep-sounds", scope: "polity", weight: 2, cooldown: 200,
    test: function (c) { return c.regionsOf().some(function (r) { return r.biome === "mountain" && !hasF(r, "delving") && !hasF(r, "the-pit"); }); },
    run: function (c) {
      const p = c.polity;
      const r = c.pick(c.regionsOf().filter(function (x) { return x.biome === "mountain" && !hasF(x, "delving") && !hasF(x, "the-pit"); }));
      addF(r, "delving"); F(c.world).delve.push({ region: r.id, year: c.year });
      return mk(2, ["omen", "monster"], [c.actor(p), c.actor(r)], r.id,
        "The herders of " + rn(c, r, p) + " reported a sound under the mountain, slow and rhythmic, like something large turning over in its sleep. " +
        "The council of " + pn(p) + " sent a surveyor, who returned with no instruments and a request to be excused from further work.");
    }
  },
  {
    id: "deep-wakes", scope: "world", weight: 5,
    test: function (c) {
      const w = c.world;
      return F(w).delve.some(function (d) { return hasF(w.regions[d.region], "delving") && c.year - d.year >= 40; });
    },
    run: function (c) {
      const w = c.world;
      const ds = F(w).delve.filter(function (d) { return hasF(w.regions[d.region], "delving") && c.year - d.year >= 40; });
      const hint = c.pick(ds);
      const r = w.regions[hint.region];
      const owner = r.owner ? w.polities[r.owner] : null;
      const nm = rn(c, r, owner);
      const thing = c.name("god");
      const gap = c.year - hint.year;
      delF(r, "delving"); addF(r, "the-pit");
      r.habitability = 0.03;
      if (r.resources) r.resources.food = 0.02;
      if (owner) { stock(owner, "population", 0.82); stab(owner, -0.1); if (owner.regions.length > 1) c.transfer(r, null); }
      r.neighbors.forEach(function (i) { const n = w.regions[i]; if (n && !n.barren && c.chance(0.4)) blight(n, 0.15); });
      return mk(4, ["monster", "memory", "catastrophe"], [owner ? c.actor(owner) : null, c.actor(r)], r.id,
        "In " + yl(c.year) + " the thing beneath " + nm + " woke. " + gap + " years earlier, in " + yl(hint.year) + ", the herders and the miners had heard it turning, and had been told that mountains settle. " +
        "It rose through the floor of the old gallery as " + thing + ", and what it was has not been agreed on. The province was abandoned, and a hole remains where the market had been.");
    }
  }
];

/* ====================================================================== */
/* EVENTS VI -- relics and their provenance                               */
/* ====================================================================== */

const RELICS = [
  {
    id: "relic-forged", scope: "polity", weight: 6, maxEra: "kingdoms",
    test: function (c) {
      const w = c.world, p = c.polity;
      return magic(w) > 0.5 && p.tech > 0.1 && artList(w).filter(function (a) { return !a.destroyed; }).length < 24;
    },
    run: function (c) {
      const w = c.world, p = c.polity;
      const smith = c.newFigure(p, p.archetypeId === "dwarf-hold" ? "smith" : "mage");
      const kind = c.choice(RELIC_KINDS);
      const power = clamp(magic(w) * 0.6 + c.range(0.15, 0.4), 0.2, 0.98);
      const art = c.newArtifact({ name: c.name("artifact", { polity: p, kind: kind }), kind: kind, region: w.regions[p.capital], creator: smith, power: power, legend: c.choice(RELIC_LEGENDS) });
      give(w, art, p, "made for " + p.name);
      p.prestige = clamp(p.prestige + 0.05, 0, 1);
      return mk(3, ["relic", "forged", "magic"], [c.actor(p), c.actor(smith), c.actor(art)], p.capital,
        art.name + " was made at " + sn(c, w.regions[p.capital], p) + " by " + fn(smith) + " for " + pn(p) + ", over " + c.int(3, 9) + " years, using " +
        c.choice(["the iron of a fallen star", "a king's wedding-ring, melted", "silver taken from a temple that was no longer used", "the bones of a stag that had been seen at noon", "seven kinds of water"]) + ". " + art.legend);
    }
  },
  {
    id: "relic-lost", scope: "polity", weight: 5,
    test: function (c) { return held(c.world, c.polity).length > 0; },
    run: function (c) {
      const w = c.world, p = c.polity;
      const art = c.pick(held(w, p));
      const rs = w.regions.filter(function (r) { return !r.barren; });
      const where = c.chance(0.5) ? w.regions[p.regions.length ? c.pick(p.regions) : p.capital] : c.pick(rs);
      give(w, art, null, "lost");
      art.location = where.id;
      return mk(3, ["relic", "lost"], [c.actor(p), c.actor(art), c.actor(where)], where.id,
        art.name + " was lost by " + pn(p) + " in " + yl(c.year) + ", " +
        c.choice(["carried off in the baggage of a routed army", "dropped from a bridge by a servant whose name was not recorded", "left behind at an inn on the salt-road", "buried by a steward who died before saying where", "swallowed, by tradition, by a river"]) +
        ", somewhere in " + rn(c, where, null) + "." + provText(w, art));
    }
  },
  {
    id: "relic-found", scope: "polity", weight: 5,
    test: function (c) {
      const w = c.world, p = c.polity;
      return lostRelics(w).some(function (a) { const r = w.regions[a.location]; return r && r.owner === p.id; });
    },
    run: function (c) {
      const w = c.world, p = c.polity;
      const art = c.pick(lostRelics(w).filter(function (a) { const r = w.regions[a.location]; return r && r.owner === p.id; }));
      const r = w.regions[art.location];
      const last = (art.provenance || []).filter(function (x) { return x.holder && w.polities[x.holder]; }).slice(-1)[0];
      const lostAt = (art.provenance || []).slice(-1)[0];
      give(w, art, p, "found in " + rn(c, r, p));
      p.prestige = clamp(p.prestige + 0.06, 0, 1);
      return mk(3, ["relic", "found", "memory"], [c.actor(p), c.actor(art), c.actor(r)], r.id,
        art.name + " was found by a ploughman at " + rn(c, r, p) + " in " + yl(c.year) + "." +
        (last ? " It had last been borne by " + pn(w.polities[last.holder]) + " (" + yl(last.year) + (lostAt && lostAt.how === "lost" ? ", lost " + yl(lostAt.year) : "") + ")." : "") +
        " The ploughman was rewarded and told to say nothing, and said a great deal.");
    }
  },
  {
    id: "relic-stolen", scope: "polity", weight: 3, cooldown: 50,
    test: function (c) {
      const w = c.world, p = c.polity;
      return p.traits.cunning > 0.4 && c.rivals().some(function (o) { return held(w, o).length > 0; });
    },
    run: function (c) {
      const w = c.world, p = c.polity;
      const owner = c.pick(c.rivals().filter(function (o) { return held(w, o).length > 0; }));
      const art = c.pick(held(w, owner));
      const thief = c.newFigure(p, "thief");
      if (c.chance(0.55 + p.traits.cunning * 0.2)) {
        give(w, art, p, "stolen by " + thief.name);
        setRel(p, owner, Math.min(p.relations[owner.id] || 0, -0.5));
        p.prestige = clamp(p.prestige + 0.04, 0, 1); owner.prestige = clamp(owner.prestige - 0.05, 0, 1);
        return mk(3, ["relic", "theft"], [c.actor(p), c.actor(owner), c.actor(thief), c.actor(art)], owner.capital,
          fn(thief) + ", in the pay of " + pn(p) + ", took " + art.name + " from the keeping of " + pn(owner) + " in " + yl(c.year) + ". " +
          "The substitute left in its place was convincing for eleven days." + provText(w, art));
      }
      c.kill(thief, "Hanged at the gate of " + sn(c, w.regions[owner.capital], owner) + ", with the stolen goods not on him.");
      setRel(p, owner, Math.min(p.relations[owner.id] || 0, -0.3));
      return mk(2, ["relic", "theft", "failure"], [c.actor(p), c.actor(owner), c.actor(thief), c.actor(art)], owner.capital,
        fn(thief) + " was taken in the act of lifting " + art.name + " from " + sn(c, w.regions[owner.capital], owner) + " and hanged within the hour. " + pn(owner) + " lodged a protest; " + pn(p) + " expressed regret that the man had acted alone.");
    }
  },
  {
    id: "relic-war", scope: "polity", weight: 4, cooldown: 50,
    test: function (c) {
      const w = c.world, p = c.polity;
      return p.military > 0.3 && hostileNeighbors(c).some(function (o) { return held(w, o).some(function (a) { return a.power > 0.4; }); });
    },
    run: function (c) {
      const w = c.world, p = c.polity;
      const foe = c.pick(hostileNeighbors(c).filter(function (o) { return held(w, o).some(function (a) { return a.power > 0.4; }); }));
      const art = c.pick(held(w, foe).filter(function (a) { return a.power > 0.4; }));
      const sp = p.military + relicMight(w, p) * 0.25 + c.range(0, 0.3);
      const sf = foe.military + relicMight(w, foe) * 0.25 + c.range(0, 0.3);
      w.stats.wars++;
      if (sp >= sf) {
        give(w, art, p, "won by arms from " + foe.name);
        stock(foe, "population", 0.92); p.prestige = clamp(p.prestige + 0.08, 0, 1);
        const bs = borderRegions(w, foe, p);
        let tail = "";
        if (bs.length && foe.regions.length > 1) { const r = c.pick(bs); c.transfer(r, p); F(w).conquests.push({ win: p.id, lose: foe.id, region: r.id, year: c.year }); tail = " " + cap(sn(c, r, p)) + " was ceded with it."; }
        return mk(4, ["war", "relic", "conquest"], [c.actor(p), c.actor(foe), c.actor(art)], foe.capital,
          "The army of " + pn(p) + " marched on " + sn(c, w.regions[foe.capital], foe) + " in " + yl(c.year) + " to take " + art.name + ", which they did after a battle that the " + foe.adjective + " scribes dated a week earlier than anyone else." + tail + provText(w, art));
      }
      stock(p, "population", 0.9); p.prestige = clamp(p.prestige - 0.06, 0, 1);
      setRel(p, foe, -0.7);
      return mk(3, ["war", "relic", "failure"], [c.actor(p), c.actor(foe), c.actor(art)], foe.capital,
        pn(p) + " marched on " + pn(foe) + " for the sake of " + art.name + " and was turned back at " + sn(c, w.regions[foe.capital], foe) + ", where the relic was carried before the line and did, by all accounts, its work.");
    }
  },
  {
    id: "relic-gifted", scope: "polity", weight: 3,
    test: function (c) { const w = c.world, p = c.polity; return held(w, p).length > 1 && c.neighbors().some(function (o) { return (p.relations[o.id] || 0) > 0.3; }); },
    run: function (c) {
      const w = c.world, p = c.polity;
      const o = c.pick(c.neighbors().filter(function (x) { return (p.relations[x.id] || 0) > 0.3; }));
      const art = c.pick(held(w, p));
      give(w, art, o, "given in friendship by " + p.name);
      setRel(p, o, 0.9);
      p.prestige = clamp(p.prestige + 0.03, 0, 1);
      return mk(3, ["relic", "gift", "diplomacy"], [c.actor(p), c.actor(o), c.actor(art)], o.capital,
        rulerTxt(w, p) + " presented " + art.name + " to " + rulerTxt(w, o) + " in " + yl(c.year) + ", as a pledge of friendship that neither house expected to survive the next succession." + provText(w, art));
    }
  },
  {
    id: "relic-boon", scope: "polity", weight: 4, cooldown: 70,
    test: function (c) { const w = c.world; return magic(w) > 0.3 && held(w, c.polity).some(function (a) { return a.power > 0.5; }); },
    run: function (c) {
      const w = c.world, p = c.polity;
      const art = c.pick(held(w, p).filter(function (a) { return a.power > 0.5; }));
      p.tech = clamp(p.tech + 0.02, 0, 1); stab(p, 0.05); p.prestige = clamp(p.prestige + 0.04, 0, 1);
      return mk(2, ["relic", "magic"], [c.actor(p), c.actor(art)], p.capital,
        art.name + " was carried before the armies of " + pn(p) + " in " + yl(c.year) + " and " + c.choice(["the standards were not fired upon", "the winter was observed to break a month early", "a plague went around the city and not through it", "the treasury was found to have grown by a tenth"]) +
        ", for reasons the court attributed to it and the physicians did not.");
    }
  },
  {
    id: "relic-fades", scope: "polity", weight: 5, minEra: "dusk",
    test: function (c) { return held(c.world, c.polity).some(function (a) { return a.power > 0.15; }); },
    run: function (c) {
      const w = c.world, p = c.polity;
      const art = c.pick(held(w, p).filter(function (a) { return a.power > 0.15; }));
      art.power = art.power * 0.4;
      return mk(2, ["relic", "magic-fading"], [c.actor(p), c.actor(art)], p.capital,
        art.name + " was brought before the court of " + pn(p) + " in " + yl(c.year) + " and failed to do what it had done in the time of the previous ruler. The priests declared this a test of faith, " +
        "and the smiths declared it a matter of the metal; the matter was left there.");
    }
  },
  {
    id: "relic-destroyed", scope: "world", weight: 4,
    test: function (c) { return artList(c.world).some(function (a) { return !a.destroyed && c.year - a.created > 40; }); },
    run: function (c) {
      const w = c.world;
      const cands = artList(w).filter(function (a) { return !a.destroyed && c.year - a.created > 40; });
      const open = openProphecies(c, "relic", 20);
      let art = null, pe = null;
      for (let i = 0; i < open.length && !art; i++) {
        const aid = tagVal(open[i], "art:");
        const f = cands.filter(function (x) { return x.id === aid; })[0];
        if (f) { art = f; pe = open[i]; }
      }
      if (!art) art = c.pick(cands);
      const holder = art.holder ? w.polities[art.holder] : null;
      const r = w.regions[holder ? holder.capital : art.location] || c.pick(w.regions.filter(function (x) { return !x.barren; }));
      art.destroyed = c.year;
      const how = c.choice(["thrown into the Barrowdown fires", "unmade by the pupil of its maker", "broken across a knee by a woman who had been told not to", "cast into the sea from a cliff", "ground to powder between two mill-stones"]);
      if (holder) { holder.prestige = clamp(holder.prestige - 0.1, 0, 1); stab(holder, -0.06); }
      if (art.power > 0.5) { blight(r, 0.2); drain(w, art.power * 0.015); }
      const tags = ["relic", "destroyed"];
      let cite = "";
      if (pe) {
        fulfilTags(pe).forEach(function (t) { tags.push(t); });
        cite = " " + citeProphecy(c, pe) + " The hand that broke it is recorded as glad, though the record does not say why.";
      }
      return mk(4, tags, [holder ? c.actor(holder) : null, c.actor(art), c.actor(r)], r.id,
        art.name + " was destroyed in " + yl(c.year) + ", " + how + ", at " + rn(c, r, holder) + "." + (art.power > 0.5 ? " The ground was dead there thereafter." : "") +
        provText(w, art) + cite);
    }
  }
];

/* ====================================================================== */
/* EVENTS VII -- memory: barrows, curses, grudges                         */
/* ====================================================================== */

const MEMORY = [
  {
    id: "barrow-raised", scope: "figure", weight: 3, cooldown: 40,
    test: function (c) {
      const f = c.figure, p = figPolity(c);
      return f && f.died == null && p && p.archetypeId !== "dragon-fief" && c.year - f.born > 42;
    },
    run: function (c) {
      const w = c.world, f = c.figure, p = figPolity(c);
      const r = w.regions[p.capital];
      const nr = c.pick(c.regionsOf(p));
      c.kill(f, c.choice(EPITAPHS));
      addF(nr, "barrow"); F(w).barrows.push({ region: nr.id, year: c.year });
      const actors = [c.actor(p), c.actor(f), c.actor(nr)];
      let goods = "";
      if (c.chance(0.4)) {
        const kind = c.choice(["sword", "crown", "ring", "helm", "spear"]);
        const art = c.newArtifact({ name: c.name("artifact", { polity: p, kind: kind }), kind: kind, region: nr, power: c.range(0.3, 0.8),
          legend: "Buried with " + f.name + " of " + p.name + " in " + yl(c.year) + "." });
        give(w, art, null, "buried with " + f.name);
        art.location = nr.id; art.buriedWith = f.id;
        actors.push(c.actor(art));
        goods = " The grave goods included " + art.name + ".";
      }
      return mk(2, ["barrow", "funeral"], actors, nr.id,
        fn(f) + " of " + pn(p) + " was laid in a barrow at " + rn(c, nr, p) + " in " + yl(c.year) + ", on a hill that could be seen from the capital at " + sn(c, r, p) + "." + goods +
        " The barrow was sealed with a stone bearing the badge of the house, a thing that a later age would find useful.");
    }
  },
  {
    id: "barrow-opened", scope: "polity", weight: 5,
    test: function (c) {
      const w = c.world, p = c.polity;
      return F(w).barrows.some(function (b) { const r = w.regions[b.region]; return r.owner === p.id && hasF(r, "barrow") && c.year - b.year > 60; });
    },
    run: function (c) {
      const w = c.world, p = c.polity;
      const bs = F(w).barrows.filter(function (b) { const r = w.regions[b.region]; return r.owner === p.id && hasF(r, "barrow") && c.year - b.year > 60; });
      const b0 = c.pick(bs);
      const bev = c.past(function (e) { return e.type === "barrow-raised" && e.regionId === b0.region && e.year === b0.year; }, 1)[0];
      if (!bev) return null;
      const r = w.regions[bev.regionId];
      const fa = bev.actors.filter(function (a) { return a.kind === "figure"; })[0];
      const aa = bev.actors.filter(function (a) { return a.kind === "artifact"; })[0];
      const fig = fa ? w.figures[fa.id] : null;
      const kin = fig && w.polities[fig.polityId] ? w.polities[fig.polityId] : null;
      delF(r, "barrow");
      const id = fig ? "identified by the badge on the sealing-stone and the grave-goods as that of " + fn(fig) + (kin ? " of " + pn(kin) : "") + ", who had died in " + yl(fig.died) : "never identified";
      const actors = [c.actor(p), c.actor(r)];
      if (fig) actors.push(c.actor(fig));
      const roll = c.int(0, 3);
      const yrs = c.year - bev.year;
      const art = aa ? w.artifacts[aa.id] : null;
      if (art && !art.wonder && !art.destroyed && !art.holder && roll !== 2) {
        give(w, art, p, "taken from the barrow of " + (fig ? fig.name : "an unknown king"));
        actors.push(c.actor(art)); p.prestige = clamp(p.prestige + 0.05, 0, 1);
        return mk(3, ["barrow", "memory", "relic"], actors, r.id,
          "The barrow at " + rn(c, r, p) + " was opened in " + yl(c.year) + ", " + yrs + " years after it was raised, by labourers of " + pn(p) + " digging for stone. The occupant was " + id + ". " +
          art.name + " was lifted from the dead hands, and the labourers were paid and sworn to silence by a priest who had not been present.");
      }
      if (roll === 2) {
        stock(p, "population", 0.93); addF(r, "haunted");
        return mk(3, ["barrow", "memory", "undead"], actors, r.id,
          "The barrow at " + rn(c, r, p) + " was opened in " + yl(c.year) + ". The occupant, " + id + ", was not found to be at rest. " +
          "The labourers were found afterward in a row, sitting up, and the district has since been avoided by the sensible.");
      }
      return mk(2, ["barrow", "memory"], actors, r.id,
        "The barrow at " + rn(c, r, p) + " was opened in " + yl(c.year) + ", " + yrs + " years after it was raised. The occupant was " + id + ". " +
        "There was nothing in the chamber but a heap of grave-clothes and a smell; the scholars recorded both, and the matter was laid to rest.");
    }
  },
  {
    id: "curse-laid", scope: "figure", weight: 2, cooldown: 80,
    test: function (c) {
      const p = figPolity(c);
      return c.figure && c.figure.died == null && p && c.year - c.figure.born > 44 && c.rivals(p).length > 0 && p.archetypeId !== "dragon-fief";
    },
    run: function (c) {
      const w = c.world, f = c.figure, p = figPolity(c);
      const t = c.pick(c.rivals(p));
      const q = c.choice(CURSES);
      F(w).curses.push({ tgt: t.id, year: c.year, done: false });
      c.kill(f, "Died cursing " + t.name + ", with a priest on one side and a notary on the other.");
      return mk(3, ["curse", "tgt:" + t.id], [c.actor(p), c.actor(f), c.actor(t)], p.capital,
        fn(f) + " of " + pn(p) + " died in " + yl(c.year) + " having first cursed " + pn(t) + " before witnesses, in these words: \"" + q + ".\" " +
        "The witnesses were thanked and went home in a hurry.");
    }
  },
  {
    id: "curse-comes-due", scope: "polity", weight: 6,
    test: function (c) {
      const p = c.polity;
      return F(c.world).curses.some(function (x) { return x.tgt === p.id && !x.done && c.year - x.year >= 70; });
    },
    run: function (c) {
      const w = c.world, p = c.polity;
      const rec = F(w).curses.filter(function (x) { return x.tgt === p.id && !x.done && c.year - x.year >= 70; })[0];
      if (!rec) return null;
      const ev = c.pastByTag("curse", 200).filter(function (e) { return e.tags.indexOf("tgt:" + p.id) >= 0 && e.year === rec.year; })[0];
      if (!ev) return null;
      rec.done = true;
      const fa = ev.actors.filter(function (a) { return a.kind === "figure"; })[0];
      const fig = fa ? w.figures[fa.id] : null;
      const old = rulerOf(w, p);
      let who = "";
      if (old) { c.kill(old, "Died in the manner his ancestors' enemy had predicted, which was held to be a coincidence."); who = " " + fn(old) + " was the third of that line to die in the manner described."; }
      const r = c.pick(c.regionsOf());
      blight(r, 0.2); stab(p, -0.2); stock(p, "population", 0.88);
      const gens = Math.round((c.year - ev.year) / 28);
      return mk(4, ["curse-due", "memory", "curse-of:" + ev.id], [c.actor(p), c.actor(r)].concat(fig ? [c.actor(fig)] : []), r.id,
        "The curse laid on " + pn(p) + " by " + (fig ? fn(fig) : "a dying ruler") + " in " + yl(ev.year) + " came due, " + (c.year - ev.year) + " years later, about " + gens + " generations after the words were spoken: \"" + (quoteOf(ev) || "the words are lost") + ".\" " +
        "Harvests failed at " + rn(c, r, p) + " and the line of the house faltered." + who + " The scribes, who had kept the original, wrote only that they had warned them.");
    }
  },
  {
    id: "old-grudge-avenged", scope: "polity", weight: 4, cooldown: 120,
    test: function (c) {
      const p = c.polity, w = c.world;
      return p.military > 0.3 && F(w).conquests.some(function (e) {
        return e.lose === p.id && c.year - e.year > 80 && w.polities[e.win] && !w.polities[e.win].ended;
      });
    },
    run: function (c) {
      const w = c.world, p = c.polity;
      const ev = c.pick(F(w).conquests.filter(function (e) {
        return e.lose === p.id && c.year - e.year > 80 && w.polities[e.win] && !w.polities[e.win].ended;
      }));
      const foe = w.polities[ev.win];
      const r = w.regions[ev.region];
      setRel(p, foe, -1); w.stats.wars++;
      p.traits.aggression = clamp(p.traits.aggression + 0.05, 0, 0.98);
      p.prestige = clamp(p.prestige + 0.03, 0, 1);
      return mk(3, ["war", "memory", "revenge"], [c.actor(p), c.actor(foe)].concat(r ? [c.actor(r)] : []), p.capital,
        pn(p) + " declared war on " + pn(foe) + " in " + yl(c.year) + " to avenge the loss of " + (r ? sn(c, r, foe) : "a province") + " in " + yl(ev.year) + ", " + (c.year - ev.year) + " years before. " +
        "The wrong had been recited at every coronation since, in the oldest form of the language, by a man whose office it was to remember it.");
    }
  },
  {
    id: "sundering-remembered", scope: "polity", weight: 3, minEra: "dusk", cooldown: 150,
    test: function (c) { return F(c.world).sundered && c.polity.traits.piety > 0.4; },
    run: function (c) {
      const w = c.world, p = c.polity;
      const ev = c.pastByType("the-sundering", 1)[0];
      const r = ev.regionId != null ? w.regions[ev.regionId] : null;
      piety(p, 0.03); p.prestige = clamp(p.prestige + 0.01, 0, 1);
      return mk(1, ["memory", "religion"], [c.actor(p)].concat(r ? [c.actor(r)] : []), p.capital,
        "The people of " + pn(p) + " kept the day of the Sundering in " + yl(c.year) + ", " + (c.year - ev.year) + " years after the heavens broke over " + (r && r.name ? r.name : "the east") + ". " +
        "Nine candles were put out one by one, and at the end of the ceremony nobody could quite remember who had been supposed to relight them.");
    }
  }
];

/* ====================================================================== */
/* EVENTS VIII -- new kinds of state arise                                */
/* ====================================================================== */

/* ------------------------------------------------------------ great works --
   The wonders of the world: raised by wealthy realms at their seat, in the manner of the age the
   realm has reached (core.js ages), and lost to dragons, gods, war and, as the magic drains away,
   to the failing of the spells that held them up. They are artifacts with `wonder: true`. */
const GREAT_WORKS = [
  /* the Age of Hearths */
  [["The Long Hall of {P}", "hall of turf and oak, long enough that the far hearth was a rumour at the near one"],
   ["The Moonwell of {P}", "well that showed the moon at noon, to those who paid"],
   ["The Barrow of the Hundred Kings at {P}", "mound raised for a hundred kings, more of whom were promised than had died"]],
  /* the Rune Age */
  [["The Runestone Gate of {P}", "gate cut with runes against the weather, the dead and, on bad days, the tax-gatherers"],
   ["The Brazen Giant of {P}", "colossus of bronze that was said to walk at midwinter"],
   ["The Singing Bridge of {P}", "bridge whose stones hummed whenever an oath was broken on it"]],
  /* the Age of Towers */
  [["The Starglass Spire of {P}", "spire of grown glass, from which the court astrologers watched the sky and, it was alleged, the neighbours"],
   ["The Hanging Gardens of the {A} Magi", "garden held in the air by a spell that had to be renewed every ninth day"],
   ["The Dragonbone Arch of {P}", "arch built from the ribs of a dragon whose kin were not consulted"]],
  /* the Age of Charters */
  [["The Cathedral of the Seven Lamps at {P}", "cathedral whose seven lamps had never been lit by hand"],
   ["The Great Library of {P}", "library in which, by charter, no book could be burned, and several were"],
   ["The Charterhouse of the {A} Guilds", "hall of the guilds, every stone of it paid for by a different one"]],
  /* the Clockwork Age */
  [["The Great Orrery of {P}", "orrery of brass that kept the hours of the heavens better than the heavens did"],
   ["The Iron Lighthouse of {P}", "lighthouse turned by clockwork, which went on turning after the magic failed"],
   ["The Engine-Temple of the {A} Makers", "temple to the makers, built because the gods had stopped answering"]],
];
function greatWorks(w) { return Object.keys(w.artifacts).map(function (k) { return w.artifacts[k]; }).filter(function (a) { return a.wonder && !a.destroyed; }); }

/* ------------------------------------------------------------ consolidation, seas, seats */
function minorOf(c, p) {
  const w = c.world, lim = Math.max(4, Math.round(p.regions.length / 3));
  return c.neighbors(p).filter(function (q) { return !q.ended && q.regions.length <= lim && q.regions.length < p.regions.length && q.military + relicMight(w, q) * 0.25 < (p.military + relicMight(w, p) * 0.25) * 0.8; });
}
function coast(w, r) { return r.neighbors.some(function (n) { const q = w.regions[n]; return q && q.barren && !q.lake; }); }
function overSea(c, p, wantOwner) {
  const w = c.world, all = c.regionsOf(p).filter(function (r) { return coast(w, r); });
  if (!all.length) return null;
  const ports = all.filter(function (r, i) { return i % Math.ceil(all.length / 6) === 0; });
  let best = null, bd = Infinity;
  for (const r of w.regions) {
    if (r.barren || !coast(w, r)) continue;
    if (wantOwner ? (r.owner == null || r.owner === p.id) : (r.owner != null || r.habitability < 0.25)) continue;
    if (wantOwner) { const q = w.polities[r.owner]; if (!q || q.ended || c.neighbors(p).indexOf(q) >= 0 || q.military >= p.military * 0.85) continue; }
    for (const port of ports) { const d = dist(r, port); if (d > 4 && d < 30 && d < bd) { bd = d; best = { region: r, port: port }; } }
  }
  return best;
}
const ACTION_EVENTS = [
  {
    id: "fealty-sworn", consolidate: true, scope: "polity", weight: 30, cooldown: 20,
    /* only while there are more realms than the world is heading for, and then very likely */
    test: function (c) { return c.polity.regions.length >= 4 && livingPolities(c.world).length > AEON.realmCap(c.world) && minorOf(c, c.polity).length > 0; },
    run: function (c) {
      const w = c.world, p = c.polity, q = c.pick(minorOf(c, p)), regs = c.regionsOf(q), seat = sn(c, w.regions[q.capital], q);
      c.endPolity(q, "Swore fealty to " + pn(p) + " in " + yl(c.year) + " and was folded into it.");
      regs.forEach(function (r) { c.transfer(r, p); });
      p.prestige = clamp(p.prestige + 0.04, 0, 1);
      return mk(4, ["annexation", "fall", "territory"], [c.actor(p), c.actor(q)], q.capital,
        "The lords of " + pn(q) + " came to " + sn(c, w.regions[p.capital], p) + " and knelt to " + rulerTxt(w, p) + ", " +
        c.choice(["their hands between the hands of the ruler, as the old oath requires", "having been shown the size of the host first", "with a dowry, a hostage and a song composed for the occasion"]) + ". " +
        "From that day " + seat + " flew the banners of " + pn(p) + ", and its own were folded into a chest no one opened again.");
    }
  },
  {
    id: "sea-crossing", scope: "polity", weight: 3, cooldown: 60,
    /* cheap test (has a coast); the crossing is planned when the fleet sails */
    test: function (c) { const w = c.world; return c.polity.regions.length >= 5 && c.polity.military > 0.35 && c.regionsOf().some(function (r) { return coast(w, r); }); },
    run: function (c) {
      const w = c.world, p = c.polity, t = overSea(c, p, true);
      if (!t) return null;
      const r = t.region, q = w.polities[r.owner], name = sn(c, r, q);
      setRel(p, q, -1);
      annex(c, p, q, r, "Its last shore was taken by a fleet out of " + pn(p) + ".");
      return mk(4, ["war", "invasion", "naval", "conquest"], [c.actor(p), c.actor(q), c.actor(r)], r.id,
        "Longships out of " + sn(c, t.port, p) + " crossed the grey water to " + name + " and put the host of " + pn(p) + " ashore at dawn. " +
        c.choice(["The beacons were lit too late to matter.", "The tide turned against the defenders, and so did their captain.", "The landing was sung of afterwards, chiefly by those who had not been in it."]) +
        " " + name + " passed to " + pn(p) + ".");
    }
  },
  {
    id: "far-shore-settled", scope: "polity", weight: 3, cooldown: 70,
    test: function (c) { const w = c.world; return c.polity.regions.length >= 3 && c.regionsOf().some(function (r) { return coast(w, r); }); },
    run: function (c) {
      const w = c.world, p = c.polity, t = overSea(c, p, false);
      if (!t) return null;
      const r = t.region;
      c.transfer(r, p);
      c.foundSettlement(r, 1);
      return mk(2, ["colonisation", "naval", "settlement"], [c.actor(p), c.actor(r)], r.id,
        "Settlers from " + sn(c, t.port, p) + " sailed to a shore no one had claimed and raised a stockade they named " + r.settlement.name + ". " +
        "The first harvest failed and the second did not, which is the usual order.");
    }
  },
  {
    id: "seat-moved", scope: "polity", weight: 1.5, cooldown: 200,
    test: function (c) { const p = c.polity, cur = c.world.regions[p.capital], t = cur && cur.settlement ? cur.settlement.tier : 0;
      return c.regionsOf(p).some(function (r) { return r.id !== p.capital && r.settlement && r.settlement.tier >= 3 && (r.settlement.tier > t || p.traits.stability < 0.35); }); },
    run: function (c) {
      const w = c.world, p = c.polity, cur = w.regions[p.capital], t = cur && cur.settlement ? cur.settlement.tier : 0;
      const cs = c.regionsOf(p).filter(function (r) { return r.id !== p.capital && r.settlement && r.settlement.tier >= 3 && (r.settlement.tier > t || p.traits.stability < 0.35); })
        .sort(function (a, b) { return b.settlement.tier - a.settlement.tier || a.id - b.id; });
      const r = cs[0], oldName = sn(c, cur, p), bigger = r.settlement.tier > t;
      p.capital = r.id; stab(p, bigger ? 0.02 : -0.03);
      return mk(3, ["capital", "internal"], [c.actor(p), c.actor(r)], r.id,
        bigger ? "The court of " + pn(p) + " left " + oldName + " for " + r.settlement.name + ", where the markets were larger and the omens better. " + oldName + " kept the old throne and the draughts."
               : "A faction of the court carried the regalia of " + pn(p) + " from " + oldName + " to " + r.settlement.name + " by night, and by morning the realm was governed from there. " + oldName + " called it theft and was ignored.");
    }
  },
];

const WONDER_EVENTS = [
  {
    id: "great-work-raised", scope: "polity", weight: 2.5, cooldown: 160,
    test: function (c) {
      const p = c.polity;
      return p.wealth > 0.45 && p.prestige > 0.12 && p.regions.length >= 3 && !!c.wonderSite(p);
    },
    run: function (c) {
      const w = c.world, p = c.polity, r = c.wonderSite(p), ruler = rulerOf(w, p);
      const tpl = c.pick(GREAT_WORKS[Math.max(0, Math.min(GREAT_WORKS.length - 1, p.age || 0))]);
      const name = tpl[0].replace("{P}", sn(c, r, p)).replace("{A}", p.adjective || pn(p));
      const place = sn(c, r, p), at = name.indexOf(place) >= 0 ? "" : " at " + place;
      const who = ruler ? fn(ruler) + " of " + pn(p) : "The rulers of " + pn(p);
      const art = c.newArtifact({ name: name, kind: "great work", region: r, creator: ruler, power: c.range(0.3, 0.8),
        legend: "A " + tpl[1] + ", raised" + (at || " there") + " by " + (ruler ? fn(ruler) : "the rulers of " + pn(p)) + "." });
      art.wonder = true;
      p.prestige = clamp(p.prestige + 0.06, 0, 1); p.wealth = clamp(p.wealth - 0.06, 0, 1); stab(p, -0.01);
      return mk(3, ["wonder", "building", "culture"], [c.actor(p), ruler ? c.actor(ruler) : null, c.actor(art)], r.id,
        who + " completed " + lc(name) + at + ", a " + tpl[1] + ". " +
        "It took " + c.int(12, 60) + " years and " + c.choice(["the labour of four provinces", "the treasury twice over", "two architects, one of whom survived it", "more giants than the realm admitted to employing"]) + "; " +
        c.choice(["the court poet called it eternal, which the masons took as a challenge.", "the neighbouring kingdoms sent congratulations and spies.", "the gods, consulted, declined to comment.", "the people were proud of it and paid for it for a generation."]));
    }
  },
  {
    id: "great-work-falls", scope: "world", weight: 1.6,
    test: function (c) { return greatWorks(c.world).some(function (a) { return c.year - a.created > 30; }); },
    run: function (c) {
      const w = c.world, a = c.pick(greatWorks(w).filter(function (x) { return c.year - x.created > 30; }));
      const r = w.regions[a.location], owner = r && r.owner && w.polities[r.owner];
      /* as the world's magic drains, more of them simply stop being held up */
      const cause = magic(w) < 0.4 && c.chance(0.5) ? "the failing of the enchantment that had held it up, which ran out like a candle"
        : c.choice(["a dragon that had a grievance and a long memory", "an earthquake the priests had predicted, a day too late", "the siege engines of a jealous neighbour",
                    "a fire that began in the kitchens", "frost, which works slowly and is never tired", "the god it was built for, who preferred a smaller house"]);
      a.destroyed = c.year;
      if (r) addF(r, "ruins");
      if (owner) owner.prestige = clamp(owner.prestige - 0.06, 0, 1);
      return mk(3, ["wonder", "destruction", "ruin-made"], [c.actor(a), owner ? c.actor(owner) : null], r ? r.id : null,
        a.name + " fell to " + cause + ", " + (c.year - a.created) + " years after it was raised. " +
        c.choice(["Its stones were carried off to build three villages and a pigsty.", "Pilgrims went on visiting the ruins, and the ruins went on charging them.",
                  "The court historians recorded it as a renovation.", "A smaller copy was planned, and argued about, and not built."]));
    }
  },
];

const ARISINGS = [
  {
    id: "archmage-seizes-power", scope: "figure", weight: 3, cooldown: 150, maxEra: "dusk",
    test: function (c) {
      const f = c.figure, p = figPolity(c), w = c.world;
      return f && f.died == null && p && f.traits.wisdom > 0.55 && f.traits.ambition > 0.5 && magic(w) > 0.3 &&
        ["mortal-kingdom", "free-cities", "theocracy", "hill-clans"].indexOf(p.archetypeId) >= 0 &&
        F(w).schools.some(function (s) { return s.polity === p.id; });
    },
    run: function (c) {
      const w = c.world, f = c.figure, p = figPolity(c);
      p.archetypeId = "wizard-tyranny"; p.archetypeName = "Wizard-Tyranny";
      f.title = "Archmage";
      p.tech = clamp(p.tech + 0.05, 0, 1); stab(p, -0.06); piety(p, -0.15);
      return mk(4, ["magic", "usurpation", "tyranny"], [c.actor(p), c.actor(f), c.actor(w.regions[p.capital])], p.capital,
        fn(f) + ", the senior master of the schools of " + pn(p) + ", dissolved the privy council in " + yl(c.year) + " and declared that spellcraft would henceforth require a licence, " +
        "which only the Archmage could grant. The crown was retained for ceremonial purposes. The realm is reckoned among the wizard-tyrannies from this year.");
    }
  },
  {
    id: "druids-withdraw", scope: "polity", weight: 1.5, cooldown: 250,
    test: function (c) { if (crowded(c.world)) return false;
      return c.polity.regions.length >= 3 && countArch(c.world, "druidic-circle") < 3 && !crowded(c.world) && c.polity.archetypeId !== "druidic-circle" &&
        c.regionsOf().some(function (r) { return r.id !== c.polity.capital && (r.biome === "forest" || r.biome === "taiga" || r.biome === "jungle"); });
    },
    run: function (c) {
      const w = c.world, p = c.polity;
      const r = c.pick(c.regionsOf().filter(function (x) { return x.id !== p.capital && (x.biome === "forest" || x.biome === "taiga" || x.biome === "jungle"); }));
      const nm = rn(c, r, p);
      c.transfer(r, null);
      const np = c.spawnPolity(r, "druidic-circle");
      addF(r, "grove");
      setRel(p, np, 0.2);
      return mk(3, ["founding", "secession", "religion"], [c.actor(p), c.actor(np), c.actor(r)], r.id,
        "The woodland folk of " + nm + " ceased to send tax or sons to " + pn(p) + " in " + yl(c.year) + ", saying that the trees had asked them not to. " +
        "A moot was held under the oldest oak, and " + pn(np) + " was declared. No army was sent, since no one could agree on whether the oaks had a case.");
    }
  },
  {
    id: "delving-clan-breaks-away", scope: "polity", weight: 1.5, cooldown: 250,
    test: function (c) { if (crowded(c.world)) return false;
      return c.polity.regions.length >= 3 && countArch(c.world, "dwarf-hold") < 3 && !crowded(c.world) && c.polity.archetypeId !== "dwarf-hold" &&
        c.regionsOf().some(function (r) { return r.id !== c.polity.capital && r.biome === "mountain"; });
    },
    run: function (c) {
      const w = c.world, p = c.polity;
      const r = c.pick(c.regionsOf().filter(function (x) { return x.id !== p.capital && x.biome === "mountain"; }));
      const nm = rn(c, r, p);
      c.transfer(r, null);
      const np = c.spawnPolity(r, "dwarf-hold");
      if (r.resources) r.resources.metal = Math.min(1, r.resources.metal + 0.2);
      setRel(p, np, 0.1);
      return mk(3, ["founding", "secession"], [c.actor(p), c.actor(np), c.actor(r)], r.id,
        "The miners of " + nm + " closed their gates against the tax-collectors of " + pn(p) + " in " + yl(c.year) + " and declared a hold under the mountain. " +
        "Trade continued, at a new rate, with the ledgers kept by a clan that had been keeping them in secret for some time. " + cap(pn(np)) + " was the name they gave it.");
    }
  }
];

/* ====================================================================== */
/* registration                                                           */
/* ====================================================================== */

/* the ordinary spine is throttled so that the miracles are not buried in it */
const THROTTLE = {
  "border-battle": 0.5, "war-declared": 0.5, "peace-treaty": 0.5, "famine": 0.5, "plague": 0.6, "raiders-from-the-wastes": 0.5,
  "usurper-seizes-crown": 0.6, "ruler-falls-in-battle": 0.6, "succession-crisis": 0.6, "city-founded": 0.5, "alliance-sworn": 0.5,
  "siege-and-sack": 0.6, "great-flood": 0.5, "standing-stones-raised": 0.6, "settlers-push-out": 0.7, "golden-reign": 0.7,
  "relic-lost": 0.4, "relic-found": 0.5, "relic-stolen": 0.5, "old-god-revived": 0.6, "ruins-resettled": 0.6, "barrow-raised": 0.6, "barrow-opened": 0.7, "undead-plague": 0.6,
  "rumour-of-miracle": 0.6, "old-grudge-avenged": 0.7
};
function throttled(def) {
  const p = THROTTLE[def.id];
  if (!p) return def;
  const inner = def.run;
  def.run = function (c) { if (!c.chance(p)) return null; return inner(c); };
  return def;
}

AEON.registerPack({
  id: "fantasy",
  name: "Age of Myth",
  icon: "🐉",
  blurb: "High fantasy in which the gods interfere, the magic is draining away, and the chronicle's scribes believe all of it.",
  scale: "planet",
  startYear: -2000,
  endYear: 1200,
  timeStep: 5,
  seedPolities: 14,
  eventsPerTick: 2,
  realmsAtStart: 40,
  realmsAtEnd: 10,

  yearLabel: yl,

  biomes: BIOMES,
  eras: ERAS,
  /* ages a realm advances through on its own (core.js advanceAge). The world's eras here are
     events (a sundering, a dusk), so realms get their own ladder, from hearth-magic to the
     clockwork that replaces magic as it drains away. `at` is learning, tech x years, set so
     the median realm arrives at -1300, -600, 100 and 800. */
  ages: [
    { id: "hearths",   name: "The Age of Hearths",  short: "Hearths",   at: 0 },
    { id: "runes",     name: "The Rune Age",        short: "Runes",     at: 100 },
    { id: "towers",    name: "The Age of Towers",   short: "Towers",    at: 340 },
    { id: "charters",  name: "The Age of Charters", short: "Charters",  at: 780 },
    { id: "clockwork", name: "The Clockwork Age",   short: "Clockwork", at: 1480 },
  ],
  archetypes: ARCHETYPES,
  names: NAMES,

  events: [].concat(SPINE, GODS, PROPHECY, MAGIC, MONSTERS, RELICS, MEMORY, WONDER_EVENTS, ACTION_EVENTS, ARISINGS).map(throttled),

  flavor: {
    epitaphs: EPITAPHS,
    omens: OMENS,
    prophecies: PORTENTS,
    epithets: EPITHETS,
    relics: RELIC_NAMES,
    relicAdjectives: RELIC_ADJ,
    relicLegends: RELIC_LEGENDS,
    curses: CURSES,
    miracles: MIRACLES,
    rumours: RUMOURS,
    spells: SPELLS,
    tributes: TRIBUTES,
    boons: BOONS,
    domains: DOMAINS,
    casusBelli: CASUS_BELLI,
    undead: UNDEAD_DEEDS
  }
});

})();
