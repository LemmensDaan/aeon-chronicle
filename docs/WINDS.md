# Winds from the heat budget

Written 2026-11-26 (GEN_VERSION 9). Step 2 of making the climate physical (step 1: the heat
budget, [ENERGY_BALANCE.md](ENERGY_BALANCE.md); step 3: the currents' heat fed back). The wind
belts used to sit at fixed latitudes and moved 6° with the seasons. Now each world's own heat
budget places them.

## How it works

The winds are needed before the currents and the full heat budget, so a first, cheap run of the
heat budget comes first: every third column, with the sea air's reach guessed from the distance to
the coast. It takes 30–130 ms. From its monthly temperatures:

- **The tropical rain belt (ITCZ)** lies where the air is warmest. In the model, the air's poleward
  heat transport is zero there, so the air rises and the trade winds of both sides meet (the
  "energy-flux equator", Bischoff & Schneider 2014). It follows the sun and swings further over
  the hemisphere with more land.
- **Over each longitude** the belt is pulled a further 0.3 of the way towards the latitude where
  that stretch of surface is warmest in the season (`WIND.LOCAL`). Summer continents draw the
  monsoon rains: Africa, South America and Australia in January, India and the Sahel in July. The
  belt stays within 25° of the equator.
- **The Hadley cell** reaches about 30° from the rain belt on Earth. Its width grows with the
  equator-to-pole contrast to the 1/4 power and shrinks with (rotation × radius)^1/2 (Held 2000).
  A faster-spinning or larger planet gets narrower belts. The westerlies and the storms lie
  between the Hadley cell's edge and twice that distance; beyond that are the polar easterlies.
- **The westerlies' strength** (since GEN_VERSION 11 scaled by `WIND.WEST` = 1.43 and measured
  against Earth's contrast `GRAD_E` = 21.1 °C, refitted once the sea could freeze) follows the
  surface temperature contrast between 30° and 60°
  (the thermal wind), divided by the rotation. For the season, the storms that bring their rain
  grow with the square of the contrast (eddy heat flux), between 0.5 and 1.6 times. A hemisphere
  with big winter continents gets strong winter storms and weak summer ones. An ocean hemisphere
  gets about the same all year, as the Southern Hemisphere does.

The wind and rain tables over latitude stay as before, but they are now read at the distance from
the world's own rain belt, scaled so that the Hadley edge is at 30 and the polar front at 60.

The pressure rule (summer heat lows, winter highs) and everything after the winds are unchanged.

## Earth's values

On Earth's map (tilt 23.44°):

| | January | July | Year |
|---|---|---|---|
| Rain belt, zonal | 3.7°S | 7.4°N | 1.1°N |
| Rain belt over Africa (20–30°E) | 5.7°S | 9.6°N | |
| Westerlies, north | × 1.54 | × 0.50 | 1 |
| Westerlies, south | × 1.05 | × 0.88 | 1 |
| Hadley cell | | | 30° |

The observed zonal rain belt goes from about 5°S to 10°N. In the year's mean it sits at about 5°N
because the ocean carries heat north across the equator, which the heat budget does not model.

Random worlds' rain belts range from 2.8°S to 9°S in January and from 2.4°N to 7.4°N in July,
depending on where their land is. Stored per world in `world.planet.itcz` and
`world.planet.hadleyDeg`.

## How it scores

Earth test, 10 seeds:

| | Fixed belts (GEN 8) | From the heat (GEN 9) |
|---|---|---|
| Köppen group / 2 letters / exact | 73.1 / 51.9 / 43.2% | 73.3 / 51.1 / 43.4% |
| Temperature error | 3.0 °C | 3.1 °C |
| Seasonal range error | 5.0 °C | 4.9 °C |
| Rain within a factor 2 | 58.3% | 57.6% |
| Summer share of rain, r | 0.48 | 0.48 |

The 100-world suite: Earth is inside the range on **34 of 35** variables (was 32). Dry-winter
climates (Cw + Dw) are back inside: the worlds now range from 0.6% to 8.4% (Earth 8.1%), because
the monsoon pull depends on each world's land. The land at 15–30° is just inside. Only the
west-coast rain is outside, which is a difference in geography.

A world takes about 0.1 s longer to generate.

## What was tried

- **The air's contrast for the westerlies.** The air layer of the heat budget is one value per
  row and is strongly mixed, so its winter and summer contrasts barely differ (north 14.4 vs
  10.2 °C, observed about 29 vs 14 °C). Köppen fell 2 points. The ground's contrast is closer and
  is what is observed, so it is used.
- **A stronger pull to the local heat** (0.5 to 1.0 of the gap) made the deserts' edges wet. The
  pressure rule already brings rain to summer heat lows, so a larger pull counted that twice.
  0.3 scored as well as the fixed belts.
- **A narrower tropical rain table** and **a weaker heat-low rain rule** did not help.

## Known limits

- The rain and wind tables were fitted on Earth. Only where the belts sit and how strong the
  westerlies blow come from the physics; the shape of each belt does not.
- Rotation and radius enter the scaling, but both are Earth's for now (`world.planet`). With a much
  faster spin a real planet gets more than three cells; here the belts only narrow.
- The ocean's heat transport across the equator is missing, so the year's rain belt sits near the
  equator rather than at 5°N.
