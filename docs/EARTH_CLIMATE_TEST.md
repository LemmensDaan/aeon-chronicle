# The climate model on the real Earth

Written 2026-11-25. A test of the climate part of `js/planetgen.js` (temperature, seasons, rain,
Köppen) on Earth's real relief, scored against observed climate. Nothing in the climate was
changed; this is the measurement only.

## How it works

- `node tools/earth-fetch.js` downloads Earth's relief and observed climate and averages them
  onto the generator's 150 × 95 grid (75°S–75°N). It writes `tools/earth/earth-150x95.json`
  (committed, so the test runs offline). Raw downloads are cached in `tools/out/earth-raw`.
- `node tools/earth-climate.js` hands that relief to the generator in place of its own terrain
  (`AEON.planetgen.terrainIn`, a few lines in planetgen.js that normal worlds never touch). It
  runs the climate exactly as for a generated world, for 5 seeds (the seed only moves the weather
  noise), and compares every land cell with the observations. It takes about 3 s. Output goes to
  `tools/out/earth/` (summary.txt, metrics.json, maps).

Because the terrain is Earth's own, whatever comes out wrong is the climate model's fault, not the
terrain's.

**Data.**
- Relief: ETOPO1 (NOAA), sampled every 15′.
- Observed climate: CRU CL 2.0 (New et al. 2002), the 1961–1990 station normals on a 10′ land
  grid. It gives monthly temperature and rain; 3,871 land cells hold enough points to compare.
- Sea surface temperature (ERSST) is wired in but was not downloaded: NOAA's ERDDAP server kept
  dropping that dataset. Run the fetch again later to add it.

**Köppen.**
- The observed Köppen class uses the standard rules on 12 months (Peel et al. 2007, with Köppen's
  −3 °C between C and D, as the model uses).
- The model classifies from a shortcut: the annual mean, the seasonal range and the summer share
  of rain. So the observed climate is also put through that same shortcut. Comparing the two
  separates the classifier's error from the climate's.

**Yardstick.** Each cell also gets the observed mean climate of its own latitude row: latitude
alone, with no continents, coasts or mountains. A model that knows geography should beat this.
The yardstick has an unfair edge, because it was fitted to Earth itself. For example, it "knows"
the Sahara's row is dry. Still, a physical model should at least match it.

## Results

Area-weighted over land. The median of 5 seeds; the spread between seeds is small (shown in
summary.txt).

| | Model | Yardstick (latitude only) |
|---|---|---|
| Annual mean temperature: bias / RMSE | −3.0 / 4.9 °C | 0 / 4.2 °C |
| Seasonal range (warmest − coldest month): bias / RMSE | −1.4 / 5.1 °C | 0 / 5.6 °C |
| Annual rain: correlation (log) | 0.49 | 0.53 |
| Annual rain: land within a factor of 2 | 53% (22% too wet, 25% too dry) | 67% |
| Summer share of rain: correlation | 0.45 | 0.44 |
| Köppen: same group / first two letters / exact | 61 / 34 / 26% | 66 / 40 / 34% |
| Köppen via the shortcut, on observed data | 97 / 89 / 87% | |

**In short:**
- Temperature and the seasonal range are good in pattern (r 0.96 and 0.93), but too cold.
- Rain and Köppen do not beat latitude alone. The model's geography does not yet add skill to
  rain.
- The classifier is not the problem: on observed data it gets 87% of land exactly right. The
  error comes from the climate.

Köppen groups, % of land, observed → model: A 22 → 21, B 30 → 30, C 16 → 18, **D 26 → 15,
E 6 → 18**. The totals look right for A, B and C, but they are often in the wrong places (see the
group map).

![Temperature](worldgen/earth-temperature.png)
![Rain](worldgen/earth-rain.png)
![Summer share of rain](worldgen/earth-summer-rain.png)
![Seasonal range](worldgen/earth-range.png)
![Köppen](worldgen/earth-koppen.png)

*Each sheet: observed, model, difference. On the Köppen sheet, dark green is exact, light green
the same group, red a different group. Grey land has no CRU data.*

## What is wrong, in order of how much it costs

1. **The subtropical deserts get rain.** The Sahara and Arabia get 4× or more of their
   observed rain (Cairo 242 mm, observed 42), and their rain falls in summer. The western US and
   Australia's interior are also too wet. On Earth the descending air of the Hadley cell keeps
   these dry all year. The model's monsoon shift seems to pull the tropical rain belt over the
   whole of North Africa in July. It also feeds the interior from recycled rain.
2. **Mid-latitude interiors are far too dry.** North America east of the Rockies, Europe east
   of the Baltic, and China get under half their observed rain (Chicago 142 mm, observed 859;
   Moscow 320, observed 652; Beijing 153, observed 529). The westerlies dry out on the way
   inland, and nothing brings moisture from the south. On Earth that moisture comes from the
   Gulf of Mexico, the summer monsoon of East Asia, and the cyclones of the storm tracks. As a
   result, Dfa/Dfb climates become steppe or desert.
3. **The monsoons of South Asia are weak.** Mumbai gets 742 mm against 2,137, and Kolkata 394
   against 1,602. The summer share is right, but the amount is not: the land–sea pressure
   drive is too weak. East Africa is the opposite: Nairobi gets 5,697 mm against 722.
4. **Everything is too cold, worst at 15–45° N** (−5 to −6 °C: Cairo, Madrid, Beijing, Perth,
   Mumbai). The cell heights agree with CRU's to ±30 m, so this is not a height mismatch. Likely
   causes:
   - The sea-level curve `T0` is fitted to Earth's zonal means, which mix land and sea. In the
     subtropics land is warmer than the zonal mean.
   - The continentality term (−0.06 × (1 − marine) × sin(lat)) cools interiors in the annual
     mean, but on Earth interiors differ mostly in range, not in mean.
   This shifts D to E: much of the observed D ends up in the model's E (9% of land: Siberia and
   Canada read as tundra).
5. **The dry-summer belt runs straight across the continents.** The model puts a
   Mediterranean-like summer drought at 35–45° from Spain to Mongolia and across the US
   Midwest. On Earth that pattern belongs to west coasts only (California, the Mediterranean,
   Chile, the Cape, south-west Australia). East coasts and interiors get most of their rain in
   summer.
6. **The range in Siberia is too small** (Yakutsk 39 °C against 60). The interior
   winter is not cold enough, because no cold high forms over a big continent.

What is already right: the temperature pattern, the range by latitude, wet tropics and
the Amazon, the Mediterranean of Europe in winter, west-coast oceanic climates (London Cfb),
and the share of each Köppen group overall.

## How to use it

- Run `node tools/earth-climate.js` before and after any climate change. A fix is real when it
  improves this score and the generated worlds' numbers (`tools/worldgen-report.js`) together.
- Targets to aim for: temperature bias within ±1 °C and RMSE under 3.5 °C; rain within a factor
  of 2 on 70%+ of land; Köppen group agreement above 75%. That is clearly better than latitude
  alone.
- Careful: tuning only to Earth can overfit. The constants should stay physical, so other
  worlds keep behaving.
