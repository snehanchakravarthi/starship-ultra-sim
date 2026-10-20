# Starship Ultra

Parametric three.js sketch of a multi-booster Starship concept:

- **N Super Heavy-class boosters** (default 4, no upper stages of their own) in a ring around a
  **central launch tower**.
- Two **tie rings** of minimal rods, one near the booster bases and one just under the upper stage.
- One large **upper stage** with a rounded-polygon base (a rounded square for 4 boosters). Each
  booster top nests inside one of its rounded corners. Above a short straight skirt it tapers into
  a smooth, rounded pyramid.

This is geometry only, at the lowest resolution that still reads. There's no structure, mass or
propulsion model yet.

## Run

No build step. Serve the folder and open it in a browser:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

three.js r160 is loaded from jsDelivr through an import map in `index.html`.

## Layout

| File | Role |
| --- | --- |
| `src/params.js` | Every tunable dimension, its default and its range. Change defaults here. |
| `src/geometry.js` | Pure shape generators: rounded polygon, loft, upper-stage profile, volumes. |
| `src/vehicle.js` | Builds the vehicle, pad and reference stack from params and derives the readout. |
| `src/main.js` | Scene, lighting, camera presets, parameter panel. |

Units are metres and the world is Y-up. Booster *k* sits at angle π/N + 2πk/N, so for N = 4 the
boosters are on the diagonals and the base square has axis-aligned edges.

## Upper-stage shape model

At height *y* above its base, the cross-section is a rounded N-gon with flat-edge half-width
*a* and corner radius *r*:

- **Skirt** (`y ≤ skirt`): *a = a₀*, *r = r₀ = booster radius + corner gap*. The corner arcs are
  concentric with the booster axes, so the booster tops sit inside them.
- **Taper**, with *t* running from 0 to 1 above the skirt:
  - *a = a₀ · (1 − t^shoulder)^(1/tipBluntness)*. This is tangent to the skirt at *t = 0* and
    closes at the tip.
  - *r/a* grows from *r₀/a₀* toward 1 (a circle) along *t^roundingCurve*, scaled by
    `tipRounding`.

## Readout

- **Stack height**, **base width** across flats and across corners.
- **Upper-stage envelope volume**, as a multiple of today's Starship ship envelope.
- **Upper ÷ booster volume** compared with the same ratio for today's stack. This is a rough proxy
  for whether the boosters can lift the upper stage once both are filled with propellant.
- **Clearances**: booster to tower, tie rods to tower, tower top to upper-stage base (the vehicle
  has to rise past the tower), booster to booster, and booster inset vs straight skirt. A booster
  inset deeper than the skirt would poke through the tapered skin.

**Copy parameters** puts the current values on the clipboard as JSON. Paste that back into a
conversation, or into the defaults in `src/params.js`, to save a design point.

---

Concept study. Not affiliated with SpaceX.
