# The planet's heat budget

Written 2026-11-26 (GEN_VERSION 7). `energyBalance()` in `js/planetgen.js` works out each cell's
annual mean temperature and seasonal range from sunlight, instead of from tables fitted to
Earth. It is step 1 of making the climate physical (step 2: winds from the heat; step 3: the
currents' heat fed back).

## What it computes

A seasonal energy-balance model in the line of North & Coakley (1979), with the air as a second
layer. It is run for 4 years of 36 steps, and the last year is kept as 12 monthly means.

- **Sunlight:** the daily mean for each latitude and day of the year, from the axial tilt
  (sunlight at 1,361 W/m², no orbital eccentricity).
- **Reflection (albedo):** 0.24 + 0.24 sin²(latitude) for open ground and sea. Low sun and
  more cloud reflect more towards the poles. Snow on land reflects up to 0.55, sea ice up to
  0.6. Both fade in over a few degrees below freezing.
- **Heat lost to space:** A + B·T, with A = 203 W/m² and B = 2.09 W/m²/K (T in °C).
- **Heat storage:** the sea's mixed layer (50 m, slow) or the land's surface (fast).
- **The air:** one layer per latitude row. It carries heat towards the poles as diffusion in
  sin(latitude), with D = 1.8 W/m²/K. Rows of polar sea are added beyond 75°, where the map
  stops.
- **Ground and air:** each cell trades heat with the air over it. Where the ground is warmer
  than the air, the air churns and mixes, and the exchange is 15 W/m²/K (convection). Where the
  ground is colder, a stable inversion forms and the exchange is 3 W/m²/K (the Siberian
  winter). This one rule gives continents both hot summers and cold winters.
- **Sea air:** land is also tied to the sea air upwind of it, in proportion to `marine`, the
  share of sea air that reaches it. The pull is 10 W/m²/K, and the water's anomaly from the
  current counts as well (a cold current's at half).

Afterwards, as before:
- the lapse rate (4.9 °C per km),
- the currents' warmth or cold on the sea,
- weather noise,
- dry ground running hot.

## The planet's settings

- **Tilt:** drawn per world from 21.9° to 24.9°, from its own stream of draws (`:orbit`), so
  nothing else about the world changes. It is stored as `world.planet.tilt`.
- **Day length and size:** Earth's for now (`world.planet.dayHours`, `radiusKm`). They don't
  enter the heat budget yet. Rotation sets the width of the Hadley cell, which belongs to step 2.
- **Tests:** a test can set `AEON.planetgen.tiltIn`. The Earth tests use 23.44°.

On Earth's own map, the tilt now acts as it should:

| Tilt | 45–75°: mean / range | 20–45° | 0–20° |
|---|---|---|---|
| 10° | −8.4 / 16.5 °C | 17.1 / 8.0 °C | 26.1 / 1.9 °C |
| 23.44° | −6.7 / 37.3 °C | 14.6 / 19.1 °C | 24.2 / 4.5 °C |
| 35° | −4.7 / 47.0 °C | 12.0 / 28.4 °C | 21.5 / 8.1 °C |

## How it scores

Earth test, 10 seeds:

| | Tables (GEN 6) | Heat budget (GEN 7) | Latitude only |
|---|---|---|---|
| Temperature: bias / error | +0.4 / 3.0 °C | −0.4 / 3.0 °C | 0 / 4.2 °C |
| Seasonal range: error / r | 4.8 °C / 0.939 | 5.0 °C / 0.936 | 5.6 °C / 0.913 |
| Köppen group / 2 letters / exact | 70 / 49 / 41% | **73 / 52 / 43%** | 66 / 40 / 34% |

The 100-world suite: Earth is inside the range on 32 of 35 variables (34 before).
- **The worlds' land runs about 1 °C colder than Earth's.** At sea level their land is
  slightly warmer than Earth's, so the difference comes from the terrain: the generated worlds
  have more high land (12.7% above 2,000 m, Earth 7%). The land at 15–30° is now just outside
  the range (worlds 20.1 °C, Earth 23.0 °C).
- **Too little dry-winter climate:** Cw + Dw cover 3.6% of land, against Earth's 8%. The model
  on Earth's map gives 4.8%. The model already had this shortfall.
- **West-coast rain:** a difference in geography, as before.

A world takes about 0.2–0.35 s longer to generate.

## Known limits

- **The polar rows beyond 75° settle near 0 °C** (the Arctic is about −18 °C). Their sea never
  cools enough to freeze, so the bright sea ice that would cool it further never forms. Giving
  sea ice a small heat capacity, or weakening the transport near the poles, did not change it,
  and both made the map slightly worse. These rows are not on the map; they act only as a heat
  sink. The map's own 60–75°N band is right (−6.7 °C for 45–75°N on land, observed about −8.9 °C
  at 60–75°N).
- **The heat lost to space is a straight line** in temperature. It knows nothing of clouds or
  water vapour beyond Earth's average.
- **Sunlight, tilt and the length of the year are Earth's.** The planet's distance, its star and
  its rotation come with the roadmap's planet settings.
