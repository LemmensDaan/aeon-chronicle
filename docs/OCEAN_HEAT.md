# The currents' heat in the heat budget

Written 2026-11-26 (GEN_VERSION 10). Step 3 of making the climate physical (step 1: the heat
budget, [ENERGY_BALANCE.md](ENERGY_BALANCE.md); step 2: the winds, [WINDS.md](WINDS.md)).

## Before

The currents (OCEAN_CURRENTS.md) carried warm and cold water, and the result was added to the sea
temperature after the heat budget had run. Each row's mean was taken out first, so the currents
only decided where along a latitude the water was warm or cold. All poleward heat transport was
the air's. The heat budget never saw the currents' heat: not the air over a warm current, not the
sea ice it melts.

## Now

1. **A heat source per sea cell.** The water the currents bring is warmer or colder than its
   latitude's. That anomaly becomes a heat flux into the sea cell: 20 W/m² for each degree
   (`CUR_LAMBDA`). This is the heat that keeps such an anomaly against its loss to the air and to
   space. Summed over the whole sea it is nil, because currents move heat rather than make it.
   On Earth's map the currents then carry about 2 PW north at 25–35°N, close to the observed
   ocean transport of 1.5–2 PW.
2. **Spread across latitudes.** Along a row the heat stays where the current put it (the Gulf
   Stream, the Kuroshio). Across rows the ocean's eddies spread it, so each row's mean is smoothed
   over about 10° (`CUR_SPREAD`). Without this the heat forms bands, and the air's temperature
   jumped 8 °C across 40–44°S.
3. **The air carries less where the sea carries more** (Bjerknes compensation). The first, coarse
   run of the heat budget (the one that places the winds) gives the poleward transport of air and
   sea together. At each latitude the air's transport is cut by the share that the currents carry,
   up to 70%. The coarse run's diffusion moves more heat than Earth's air and sea really do, so the
   currents' share of it is taken 3 times (`CUR_SHARE`). On Earth's map the sea then carries about
   half at 20–30° and a few percent beyond 60°, near the observed split. Averaged over latitudes it
   is 31% on Earth's map and 26–33% on random worlds (`world.planet.oceanShare`).

The heat budget then works out the sea's temperature itself, currents included. The warm water
warms the air over it, keeps sea ice away and reaches the land downwind.

## How it scores

Earth test, 10 seeds:

| | GEN 9 | GEN 10 |
|---|---|---|
| Köppen group / 2 letters / exact | 73.3 / 51.1 / 43.4% | 72.7 / 50.3 / 43.0% |
| Temperature: bias / error | −0.4 / 3.1 °C | −0.3 / 3.1 °C |
| Seasonal range error | 4.9 °C | 4.9 °C |
| Mean land rain (observed 794 mm) | 694 mm | 740 mm |
| Land at 0–15°N (observed 25.7 °C) | 24.9 °C | 25.8 °C |
| Land at 60–75°N (observed −8.9 °C) | −8.0 °C | −8.7 °C |

The polar rows beyond the map, which used to settle near 7 °C in the north, are now 1.5–2.5 °C
in the north and −2.4 to −3.3 °C in the south.

The 100-world suite: Earth is inside on 34 of 35, as before. The worlds' land at 45–75° is about
1 °C colder than in GEN 9, and tundra and ice cover 12% of their land (Earth 6%, still inside the
range). Only the west-coast rain is outside.

## What was tried

- **One lower transport for the air everywhere** (1.0 to 1.6 instead of 1.8). A low value left the
  high latitudes too cold (too much tundra); a high one left the tropics too cold. The sea carries
  much of the heat in the subtropics and little near the poles, so the air's cut has to follow it.
- **Starting the currents from the heat budget's own sea temperatures** instead of the fitted
  curve. The Arctic coasts then counted as open sea (the test for frozen sea uses this first
  guess), and land at 60–75°N came out 3 °C too warm with too small a seasonal range.

## Known limits

- The currents still start from a latitude curve fitted to Earth (`T0`). For a planet with
  another tilt or star it should come from the heat budget, which needs the frozen-sea test to
  use the heat budget's winter sea ice first.
- Only wind-driven currents are modelled. There is no deep overturning circulation (the
  conveyor that carries Atlantic heat far north), so heat reaching high latitudes may be
  underestimated, and the year's tropical rain belt stays near the equator.
- `CUR_SHARE` is a scale fitted on Earth's map.
