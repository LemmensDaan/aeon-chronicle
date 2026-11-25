/* Aeon - Earth's real terrain and climate, on the planet's grid.

   Downloads public datasets, averages them onto the generator's 150 x 95 grid (75S-75N,
   column 0 starting at 180W, row 0 at 75N) and writes tools/earth/earth-150x95.json, which
   tools/earth-climate.js reads. Run it once; the JSON is committed, so the test runs offline.

     node tools/earth-fetch.js        download (cached in tools/out/earth-raw) and grid

   Sources:
     relief       ETOPO1 (NOAA NCEI) via NOAA's ERDDAP, sampled every 15'            15 MB
     land climate CRU CL 2.0 (New et al. 2002, Climatic Research Unit, UEA): station
                  normals 1961-1990 on a 10' land grid; monthly mean temperature (deg C),
                  precipitation (mm a month) and the grid's elevation (km)        11 + 29 + 3 MB gz
     sea surface  ERSST v5 1991-2020 normals (NOAA NCEI) via NOAA's ERDDAP; optional:
                  that server does not always have it, and the test runs without it */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const W = 150, H = 95, N = W * H;
const RAW = path.join(__dirname, "out", "earth-raw");
const OUT = path.join(__dirname, "earth", "earth-150x95.json");
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const CRU = "https://crudata.uea.ac.uk/cru/data/hrg/tmc/";
const SOURCES = {
  "etopo.csv": "https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.csv?altitude%5B(-75):15:(75)%5D%5B(-180):15:(180)%5D",
  "grid_10min_tmp.dat.gz": CRU + "grid_10min_tmp.dat.gz",
  "grid_10min_pre.dat.gz": CRU + "grid_10min_pre.dat.gz",
  "grid_10min_elv.dat.gz": CRU + "grid_10min_elv.dat.gz",
  "sst.csv": "https://upwell.pfeg.noaa.gov/erddap/griddap/noaa_psl_9729_fc0c_f4d0.csv?sst",
};

/* the file's text, from the cache or downloaded; null when every try failed. The ERDDAP
   servers sit behind a balancer and some of them do not always know every dataset. */
async function get(name, tries) {
  const file = path.join(RAW, name);
  if (!fs.existsSync(file) || fs.statSync(file).size < 1000) {
    process.stdout.write("downloading " + name + " ... ");
    let buf = null;
    for (let k = 0; k < tries && !buf; k++) {
      try {
        const res = await fetch(SOURCES[name]);
        if (res.ok) buf = Buffer.from(await res.arrayBuffer());
        else process.stdout.write("(" + res.status + ") ");
      } catch (e) { process.stdout.write("(" + e.message + ") "); }
      if (!buf && k + 1 < tries) await new Promise((r) => setTimeout(r, 4000));
    }
    if (!buf) { console.log("failed"); return null; }
    fs.writeFileSync(file, buf);
    console.log((buf.length / 1e6).toFixed(1) + " MB");
  }
  const buf = fs.readFileSync(file);
  return (name.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
}

const cellOf = (lat, lon) => {
  if (lat > 75 || lat < -75) return -1;
  const lo = ((lon + 180) % 360 + 360) % 360;
  const x = Math.min(W - 1, Math.floor(lo / (360 / W))), y = Math.min(H - 1, Math.floor((75 - lat) / (150 / H)));
  return y * W + x;
};
const r1 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);

/* a CRU file: "lat lon v1 .. vk" a line; the mean of the first `k` values over the points
   in each cell, and how many points there were */
function cruMeans(txt, k) {
  const S = new Float64Array(k * N), C = new Float64Array(N);
  for (const line of txt.split(/\r?\n/)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 2 + k) continue;
    const i = cellOf(+f[0], +f[1]);
    if (i < 0) continue;
    C[i]++;
    for (let m = 0; m < k; m++) S[m * N + i] += +f[2 + m];
  }
  return { S: S, C: C };
}

(async function main() {
  /* relief: a land cell's height is the mean of its land samples, a sea cell's depth the mean
     of its sea samples; a cell is land when half its samples are */
  const et = (await get("etopo.csv", 10)).split(/\r?\n/).slice(2);
  const lS = new Float64Array(N), lN = new Float64Array(N), sS = new Float64Array(N), sN = new Float64Array(N);
  for (const line of et) {
    if (!line) continue;
    const r = line.split(","), lat = +r[0], lon = +r[1], h = +r[2];
    if (lon >= 180) continue;
    const i = cellOf(lat, lon);
    if (i < 0) continue;
    if (h > 0) { lS[i] += h; lN[i]++; } else { sS[i] += h; sN[i]++; }
  }
  const hm = new Array(N), landFrac = new Array(N);
  for (let i = 0; i < N; i++) {
    const f = lN[i] / (lN[i] + sN[i]);
    landFrac[i] = Math.round(f * 100) / 100;
    hm[i] = Math.round(f >= 0.5 ? Math.max(1, lS[i] / lN[i]) : Math.min(-1, sS[i] / sN[i]));
  }

  /* land climate: CRU's 10' points averaged over each cell (land points only) */
  const tm = cruMeans(await get("grid_10min_tmp.dat.gz", 3), 12);
  const pr = cruMeans(await get("grid_10min_pre.dat.gz", 3), 12);
  const el = cruMeans(await get("grid_10min_elv.dat.gz", 3), 1);
  const tMon = [], pMon = [];
  for (let m = 0; m < 12; m++) {
    const t = new Array(N), p = new Array(N);
    for (let i = 0; i < N; i++) {
      t[i] = tm.C[i] ? r1(tm.S[m * N + i] / tm.C[i]) : null;
      p[i] = pr.C[i] ? r1(pr.S[m * N + i] / pr.C[i]) : null;
    }
    tMon.push(t); pMon.push(p);
  }
  const cruElev = new Array(N), cruN = new Array(N);
  for (let i = 0; i < N; i++) { cruElev[i] = el.C[i] ? Math.round(1000 * el.S[i] / el.C[i]) : null; cruN[i] = tm.C[i]; }

  /* sea surface temperature (optional): ERSST's 2 deg points inside a cell or, with none,
     the nearest within one cell */
  let sstAnn = null;
  const sstTxt = await get("sst.csv", 6);
  if (sstTxt) {
    const S = new Float64Array(N), C = new Float64Array(N);
    for (const line of sstTxt.split(/\r?\n/).slice(2)) {
      if (!line) continue;
      const r = line.split(","), v = +r[3];
      if (r[3] === "NaN" || Number.isNaN(v)) continue;
      const lon = +r[2] > 180 ? +r[2] - 360 : +r[2];
      const i = cellOf(+r[1], lon);
      if (i >= 0) { S[i] += v; C[i]++; }
    }
    sstAnn = new Array(N);
    for (let i = 0; i < N; i++) {
      if (C[i]) { sstAnn[i] = r1(S[i] / C[i]); continue; }
      const x = i % W, y = (i / W) | 0;
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy; if (yy < 0 || yy >= H) continue;
        const j = yy * W + ((x + dx + W) % W);
        if (C[j]) { s += S[j] / C[j]; c++; }
      }
      sstAnn[i] = c ? r1(s / c) : null;
    }
  }

  const doc = {
    about: "Earth on Aeon's 150 x 95 grid (75S-75N, column 0 from 180W, row 0 at 75N). Made by tools/earth-fetch.js.",
    sources: {
      hm: "ETOPO1 (NOAA NCEI), every 15', metres: land cells the mean of their land samples, sea cells of their sea samples",
      landFrac: "share of a cell's ETOPO samples above sea level",
      tMon: "CRU CL 2.0 (New et al. 2002), 1961-1990 monthly mean temperature, deg C, mean of the cell's 10' land points; null with none",
      pMon: "CRU CL 2.0, 1961-1990 monthly precipitation, mm a month, as tMon",
      cruElev: "CRU CL 2.0's elevation of the same points, metres (the height the temperatures are for)",
      cruN: "how many 10' CRU points the cell holds",
      sstAnn: "ERSST v5 1991-2020 annual mean sea surface temperature, deg C; null on land or when not downloaded",
    },
    W: W, H: H, hm: hm, landFrac: landFrac, tMon: tMon, pMon: pMon, cruElev: cruElev, cruN: cruN, sstAnn: sstAnn,
  };
  fs.writeFileSync(OUT, JSON.stringify(doc));
  let land = 0, withClim = 0;
  for (let i = 0; i < N; i++) { if (hm[i] > 0) land++; if (hm[i] > 0 && tm.C[i]) withClim++; }
  console.log("wrote " + path.relative(process.cwd(), OUT) + " (" + (fs.statSync(OUT).size / 1e3).toFixed(0) + " kB): land cells " + land + " of " + N + ", " + withClim + " with CRU data; SST " + (sstAnn ? "yes" : "no"));
})().catch((e) => { console.error(e); process.exit(1); });
