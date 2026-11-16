// Starship V4 beside well-known landmarks, all to scale.
// Everything stands on one plinth whose top (y = BASE) is height zero.
//
// Heights, verified 16 Nov 2026:
//   Taipei 101: 508 m architectural (taipei-101.com.tw / CTBUH). Roof 449.2 m.
//   Empire State Building: 443.2 m tip, 381 m roof (esbnyc.com official facts).
//   Eiffel Tower: 330 m incl. antennas (toureiffel.paris; 6 m DAB+ antenna, Mar 2022).
//   Statue of Unity: 182 m statue (PIB / Guinness) on a 58 m base → 240 m ground to head.
//   Great Pyramid of Giza: 138.5 m today, 146.6 m original (standard figures;
//     casing and pyramidion are gone). Base 230.33 m.
//   Statue of Liberty: 92.99 m ground to tip of torch; pedestal 46.94 m (NPS).
//   Elizabeth Tower (Big Ben): 96 m (parliament.uk facts).
//   Qutub Minar: 72.5 m (UNESCO / Delhi Tourism).
//   Starship V4: ~142 m stack (estimate) — 70 m ship on today's ~72 m booster,
//     from Elon Musk's 16 Nov 2026 post (ship "~70 m", 9 engines).

import * as THREE from 'three';
import { BASE, buildStarship, pill } from './lineup.js';

const V4 = { booster: 72, ship: 70 };

// Starship is at x = 0 so the default camera can stay centred on it.
// Giants sit on the flanks; the near-size landmarks cluster around the rocket.
// The pyramid's 230 m base is parked behind the front row so it doesn't shove
// the neighbours apart.
export const LANDMARKS = {
  taipei:   { x: -337, height: 508 },
  eiffel:   { x: -192, height: 330 },
  unity:    { x: -72,  height: 240, statue: 182, base: 58 },
  starship: { x: 0,    height: 142 },
  pyramid:  { x: -28,  z: -165, height: 138.5, original: 146.6, base: 230.33 },
  bigben:   { x: 110,  height: 96 },
  liberty:  { x: 172,  height: 92.99, pedestal: 46.94, statue: 46.05 },
  qutub:    { x: 232,  height: 72.5 },
  empire:   { x: 345,  height: 443.2, roof: 381 },
  rulerX: -430,
};

/** Bounds used to frame the shot. minY drops below the plinth so the caption has room. */
export const LANDMARKS_BOUNDS = { minX: -470, maxX: 390, minY: -40, maxY: BASE + 508 + 40 };

export function buildLandmarks(M) {
  const group = new THREE.Group();
  group.name = 'landmarks';

  const mats = makeMaterials();
  const owned = Object.values(mats);

  // Long plaza. The pyramid sits on a rearward apron of the same slab.
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(900, BASE, 360), M.concrete);
  plaza.position.set(-40, BASE / 2, -80);
  plaza.receiveShadow = plaza.castShadow = true;
  group.add(plaza);

  const addAt = (obj, x, z = 0) => {
    obj.position.set(x, BASE, z);
    group.add(obj);
  };

  addAt(buildTaipei101(mats), LANDMARKS.taipei.x);
  addAt(buildEiffel(mats), LANDMARKS.eiffel.x);
  addAt(buildUnity(mats), LANDMARKS.unity.x);
  addAt(buildPyramid(mats), LANDMARKS.pyramid.x, LANDMARKS.pyramid.z);
  addAt(buildBigBen(mats), LANDMARKS.bigben.x);
  addAt(buildLiberty(mats), LANDMARKS.liberty.x);
  addAt(buildQutub(mats), LANDMARKS.qutub.x);
  addAt(buildEmpireState(mats), LANDMARKS.empire.x);

  const stack = buildStarship(V4.booster, V4.ship, M);
  stack.position.set(LANDMARKS.starship.x, BASE, 0);
  group.add(stack);

  const human = buildHuman(mats.ink);
  human.position.set(LANDMARKS.starship.x - 9, BASE, 8);
  group.add(human);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const notes = annotate(mats);
  group.add(notes);
  notes.traverse((o) => { if (o.isMesh) o.castShadow = false; });

  group.userData.dispose = () => {
    group.traverse((o) => {
      o.geometry?.dispose();
      if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); }
    });
    owned.forEach((m) => m.dispose());
  };
  return group;
}

function makeMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    // Cool grey-blue glass, muted so the steel rocket still leads.
    taipeiGlass: std({ color: 0x8a97a3, metalness: 0.55, roughness: 0.28 }),
    taipeiTrim: std({ color: 0x6b7380, metalness: 0.4, roughness: 0.5 }),
    taipeiSpire: std({ color: 0x9aa3ad, metalness: 0.65, roughness: 0.3 }),
    // Indiana limestone, slightly warm.
    empire: std({ color: 0xb4aea4, metalness: 0.08, roughness: 0.72 }),
    empireDark: std({ color: 0x7a766f, metalness: 0.2, roughness: 0.55 }),
    empireSpire: std({ color: 0x8c8882, metalness: 0.55, roughness: 0.4 }),
    // "Eiffel brown" iron, desaturated.
    eiffel: std({ color: 0x6a6460, metalness: 0.55, roughness: 0.5 }),
    eiffelDark: std({ color: 0x4e4a47, metalness: 0.55, roughness: 0.48 }),
    // Bronze statue, stone podium.
    unityBronze: std({ color: 0x7a7368, metalness: 0.45, roughness: 0.5 }),
    unityStone: std({ color: 0x9a958c, metalness: 0.08, roughness: 0.8 }),
    // Weathered limestone.
    pyramid: std({ color: 0xc4b79a, metalness: 0.02, roughness: 0.9 }),
    pyramidCap: std({ color: 0xb8ab90, metalness: 0.02, roughness: 0.85 }),
    // Muted verdigris and pale stone.
    liberty: std({ color: 0x7d8f86, metalness: 0.25, roughness: 0.55 }),
    libertyStone: std({ color: 0xb7b1a6, metalness: 0.05, roughness: 0.8 }),
    libertyDark: std({ color: 0x8d887e, metalness: 0.08, roughness: 0.7 }),
    torch: new THREE.MeshStandardMaterial({ color: 0xe8c36a, emissive: 0xc48a2a, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.3 }),
    // Anston / Clipsham limestone, dark clock faces.
    ben: std({ color: 0xb8b09f, metalness: 0.05, roughness: 0.75 }),
    benDark: std({ color: 0x6a655c, metalness: 0.15, roughness: 0.55 }),
    benGold: std({ color: 0xc4a15a, metalness: 0.6, roughness: 0.4 }),
    clock: std({ color: 0xe6dfcc, metalness: 0.05, roughness: 0.55 }),
    // Delhi sandstone, slightly redder on the lower storeys.
    qutub: std({ color: 0xb08a6a, metalness: 0.04, roughness: 0.78 }),
    qutubPale: std({ color: 0xc4b49a, metalness: 0.04, roughness: 0.75 }),
    ink: new THREE.MeshBasicMaterial({ color: '#0f171f', toneMapped: false }),
    accent: new THREE.MeshBasicMaterial({ color: 0xd9601c, toneMapped: false }),
  };
}

// ---------------------------------------------------------------- Taipei 101

function buildTaipei101(m) {
  const g = new THREE.Group();
  // Podium ~70 m, eight flared 8-storey segments up to the roof (~449 m), spire to 508 m.
  const podiumH = 70;
  square(g, 52, 46, 0, 18, m.taipeiTrim);
  square(g, 46, 40, 18, podiumH, m.taipeiGlass);
  square(g, 36, 28, podiumH, 96, m.taipeiGlass);

  // Eight pagoda-like segments. Each flares outward toward a decorative belt.
  const segH = 42;
  const start = 96;
  for (let i = 0; i < 8; i++) {
    const y0 = start + i * segH;
    const y1 = y0 + segH - 3.2;
    const mid = 26 - i * 0.55;
    square(g, mid * 0.82, mid, y0, y1, m.taipeiGlass);
    // ruyi belt and corner nubs at the flare
    square(g, mid + 1.6, mid + 1.2, y1, y1 + 3.2, m.taipeiTrim);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nub = new THREE.Mesh(new THREE.BoxGeometry(4.2, 6.5, 4.2), m.taipeiTrim);
      nub.position.set(sx * (mid - 1), y1 + 0.4, sz * (mid - 1));
      g.add(nub);
    }
  }
  const roof = start + 8 * segH; // 432
  square(g, 20, 14, roof, 449.2, m.taipeiGlass);
  // stacked spire
  cyl(g, 5.5, 3.2, 449.2, 470, m.taipeiSpire, 8);
  cyl(g, 3.2, 1.6, 470, 490, m.taipeiSpire, 8);
  cyl(g, 1.6, 0.45, 490, 504, m.taipeiSpire, 8);
  cyl(g, 0.45, 0.08, 504, 508, m.taipeiSpire, 8);
  return g;
}

function square(g, half0, half1, y0, y1, mat) {
  const geo = new THREE.CylinderGeometry(half1 * Math.SQRT2, half0 * Math.SQRT2, y1 - y0, 4);
  geo.rotateY(Math.PI / 4);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = (y0 + y1) / 2;
  g.add(mesh);
  return mesh;
}

function cyl(g, r0, r1, y0, y1, mat, seg = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, seg), mat);
  mesh.position.y = (y0 + y1) / 2;
  g.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------- Empire State

function buildEmpireState(m) {
  const g = new THREE.Group();
  // Setback profile aimed at the well-known silhouette, tip at 443.2 m.
  const stages = [
    // half-width x, half-depth z, y0, y1, mat
    [58, 38, 0, 18, m.empire],
    [42, 30, 18, 60, m.empire],
    [32, 24, 60, 110, m.empire],
    [26, 20, 110, 200, m.empire],
    [22, 17, 200, 260, m.empire],
    [18, 15, 260, 320, m.empire],
    [14, 12, 320, 355, m.empire],
    [10, 9, 355, 381, m.empire],
  ];
  for (const [hx, hz, y0, y1, mat] of stages) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, y1 - y0, hz * 2), mat);
    mesh.position.y = (y0 + y1) / 2;
    g.add(mesh);
  }
  // Window strips on the +Z facade of each shaft stage.
  for (const [hx, hz, y0, y1] of stages) {
    if (y0 < 18) continue;
    const n = hx > 20 ? 6 : hx > 14 ? 5 : 4;
    const span = hx * 2 - 4;
    const slot = span / n;
    for (let i = 0; i < n; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(slot * 0.42, Math.max(y1 - y0 - 3, 4), 0.45), m.empireDark);
      strip.position.set(-hx + 2 + (i + 0.5) * slot, (y0 + y1) / 2, hz + 0.2);
      g.add(strip);
    }
  }

  // Crown ribs and the mooring-mast / antenna.
  for (const y of [60, 110, 200, 320, 355, 381]) {
    const w = y <= 60 ? 86 : y <= 110 ? 66 : y <= 200 ? 54 : y <= 320 ? 38 : y <= 355 ? 22 : 16;
    const d = y <= 60 ? 62 : y <= 110 ? 50 : y <= 200 ? 42 : y <= 320 ? 32 : y <= 355 ? 20 : 14;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d), m.empireDark);
    belt.position.y = y;
    g.add(belt);
  }
  cyl(g, 3.4, 2.4, 381, 410, m.empireSpire, 8);
  cyl(g, 2.4, 1.2, 410, 428, m.empireSpire, 8);
  cyl(g, 1.2, 0.35, 428, 440, m.empireSpire, 8);
  cyl(g, 0.35, 0.08, 440, 443.2, m.empireSpire, 6);
  return g;
}

// ---------------------------------------------------------------- Eiffel Tower

function buildEiffel(m) {
  const g = new THREE.Group();
  // Official platforms: 57 m, 115 m, 276 m; antenna to 330 m. Base 125 m square.
  const iron = m.eiffel;
  const dark = m.eiffelDark;

  const halfAt = (y) => {
    if (y <= 57) return lerp(62.5, 35, y / 57);
    if (y <= 115) return lerp(35, 19, (y - 57) / 58);
    if (y <= 276) return lerp(19, 7.5, (y - 115) / 161);
    return lerp(7.5, 1.1, (y - 276) / 54);
  };
  const legHalfAt = (y) => (y <= 57 ? lerp(10.5, 5.2, y / 57) : y <= 115 ? lerp(5.2, 3.2, (y - 57) / 58) : lerp(3.2, 1.6, (y - 115) / 161));

  const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  // Four lattice legs, 0 → 276 m, in stacked segments so they curve in.
  const ys = [];
  for (let y = 0; y <= 276; y += 8) ys.push(y);
  if (ys[ys.length - 1] !== 276) ys.push(276);

  for (const [sx, sz] of corners) {
    for (let i = 0; i < ys.length - 1; i++) {
      const y0 = ys[i], y1 = ys[i + 1];
      const c0 = halfAt(y0) - legHalfAt(y0), c1 = halfAt(y1) - legHalfAt(y1);
      // four chords of each leg
      const inset = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      const r0 = legHalfAt(y0), r1 = legHalfAt(y1);
      for (const [ix, iz] of inset) {
        strut(g,
          sx * (c0 + ix * r0 * 0.55), y0, sz * (c0 + iz * r0 * 0.55),
          sx * (c1 + ix * r1 * 0.55), y1, sz * (c1 + iz * r1 * 0.55),
          lerp(0.55, 0.28, y0 / 276), iron);
      }
      // X-bracing on the two outward faces of the leg
      const midY = (y0 + y1) / 2;
      const cM = halfAt(midY) - legHalfAt(midY);
      const rM = legHalfAt(midY);
      strut(g,
        sx * (c0 + r0 * 0.55), y0, sz * (c0 - r0 * 0.55),
        sx * (c1 - r1 * 0.55), y1, sz * (c1 + r1 * 0.55),
        0.22, dark);
      strut(g,
        sx * (c0 - r0 * 0.55), y0, sz * (c0 + r0 * 0.55),
        sx * (c1 + r1 * 0.55), y1, sz * (c1 - r1 * 0.55),
        0.22, dark);
    }
  }

  // Big arches under the first floor, between adjacent legs.
  const archPairs = [
    [[1, 1], [1, -1], 'x'],
    [[-1, 1], [-1, -1], 'x'],
    [[1, 1], [-1, 1], 'z'],
    [[1, -1], [-1, -1], 'z'],
  ];
  for (const [a, b, axis] of archPairs) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const p0 = archPoint(a, b, axis, t0, halfAt, legHalfAt);
      const p1 = archPoint(a, b, axis, t1, halfAt, legHalfAt);
      strut(g, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.7, iron);
    }
  }

  // Decks
  deck(g, 57, halfAt(57) + 4, 6, iron, dark);
  deck(g, 115, halfAt(115) + 3, 4.5, iron, dark);
  deck(g, 276, 8, 8, iron, dark);

  // Cross belts between legs at a few heights, so the mid and upper shaft read as a truss.
  for (const y of [80, 100, 140, 170, 200, 230, 255]) {
    const h = halfAt(y) - legHalfAt(y) * 0.2;
    for (const [a, b] of [[[h, h], [h, -h]], [[h, h], [-h, h]], [[-h, -h], [-h, h]], [[-h, -h], [h, -h]]]) {
      strut(g, a[0], y, a[1], b[0], y, b[1], 0.28, dark);
    }
  }

  // Lantern and antenna to 330 m.
  cyl(g, 3.2, 2.2, 276, 292, iron, 8);
  cyl(g, 1.6, 1.1, 292, 304, iron, 8);
  cyl(g, 0.7, 0.45, 304, 318, dark, 8);
  cyl(g, 0.45, 0.12, 318, 330, dark, 8);
  return g;
}

function archPoint(a, b, axis, t, halfAt, legHalfAt) {
  // Quadratic arch: rises from the ground-ish inner corners up to just under 57 m.
  const y = 6 + (57 - 10) * Math.sin(t * Math.PI); // peaks mid-span
  const ha = halfAt(Math.min(y, 56)) - legHalfAt(Math.min(y, 56));
  const hb = ha;
  const ax = a[0] * ha, az = a[1] * ha;
  const bx = b[0] * hb, bz = b[1] * hb;
  const x = lerp(ax, bx, t);
  const z = lerp(az, bz, t);
  return [x, y, z];
}

function deck(g, y, half, thick, mat, belt) {
  const plate = new THREE.Mesh(new THREE.BoxGeometry(half * 2, thick * 0.35, half * 2), mat);
  plate.position.y = y;
  g.add(plate);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 1.2, 1.1, half * 2 + 1.2), belt);
  rim.position.y = y + thick * 0.25;
  g.add(rim);
}

function strut(g, x0, y0, z0, x1, y1, z1, r, mat) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.05) return;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), mat);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
  g.add(mesh);
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ---------------------------------------------------------------- Statue of Unity

function buildUnity(m) {
  const g = new THREE.Group();
  const B = 58;
  // Stepped museum podium, 58 m.
  for (const [hx, hz, y0, y1] of [[24, 19, 0, 16], [19, 15, 16, 36], [14, 11, 36, B]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, y1 - y0, hz * 2), m.unityStone);
    mesh.position.y = (y0 + y1) / 2;
    g.add(mesh);
  }
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(18, 2.2, 13), m.unityStone);
  plinth.position.y = B + 1.1;
  g.add(plinth);

  // Figure built in real metres so the head is at 182 m above the podium (240 m AGL).
  const fig = new THREE.Group();
  fig.position.y = B + 2.2;
  const bronze = m.unityBronze;

  // Slightly advanced left foot, dhoti hem wider than the chest.
  const dhoti = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 8.2, 68, 16), bronze);
  dhoti.position.set(0, 34, 0.8);
  fig.add(dhoti);
  const footL = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 7.2), bronze);
  footL.position.set(-2.1, 1.3, 3.4);
  const footR = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 6.6), bronze);
  footR.position.set(2.1, 1.3, 0.4);
  fig.add(footL, footR);

  // Long coat, flared, a shallow vertical fold down the front.
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 9.0, 72, 16), bronze);
  coat.position.set(0, 100, 0.2);
  fig.add(coat);
  const fold = new THREE.Mesh(new THREE.BoxGeometry(1.8, 64, 0.7), bronze);
  fold.position.set(0, 98, 8.4);
  fig.add(fold);

  // Broad shoulders and arms hanging close to the body.
  const shoulders = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.2, 18, 12), bronze);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.set(0, 148, 0);
  fig.add(shoulders);
  for (const side of [-1, 1]) {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.5, 36, 10), bronze);
    upper.position.set(side * 9.0, 128, 1.6);
    upper.rotation.z = side * 0.06;
    upper.rotation.x = 0.1;
    fig.add(upper);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.95, 32, 10), bronze);
    lower.position.set(side * 9.6, 96, 3.0);
    lower.rotation.x = 0.08;
    fig.add(lower);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), bronze);
    hand.scale.set(0.85, 1.15, 1.3);
    hand.position.set(side * 9.7, 80, 4.0);
    fig.add(hand);
  }

  // Neck and a clearly readable head (~24 m, natural proportion of an 182 m figure).
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 8, 12), bronze);
  neck.position.y = 158;
  fig.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(7.4, 18, 14), bronze);
  head.scale.set(0.82, 1.12, 0.95);
  head.position.set(0, 170, 1.0);
  fig.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(7.5, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), bronze);
  hair.position.set(0, 172, 0.6);
  fig.add(hair);
  // Ears, for a less featureless silhouette
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 6), bronze);
    ear.scale.set(0.5, 1.1, 0.8);
    ear.position.set(side * 6.2, 170, 0.6);
    fig.add(ear);
  }

  g.add(fig);
  return g;
}

// ---------------------------------------------------------------- Great Pyramid

function buildPyramid(m) {
  const g = new THREE.Group();
  const H = 138.5;
  const half = 230.33 / 2;
  // Flattened cap: today's pyramid is missing its casing and pyramidion.
  const capHalf = 5.5;
  const geo = new THREE.CylinderGeometry(capHalf * Math.SQRT2, half * Math.SQRT2, H, 4);
  geo.rotateY(Math.PI / 4);
  const mesh = new THREE.Mesh(geo, m.pyramid);
  mesh.position.y = H / 2;
  g.add(mesh);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(capHalf * 2, 1.2, capHalf * 2), m.pyramidCap);
  cap.position.y = H + 0.4;
  g.add(cap);
  // Subtle course lines every ~10 m so it doesn't read as a smooth cone.
  for (let y = 12; y < H - 8; y += 14) {
    const t = y / H;
    const w = (half * (1 - t) + capHalf * t) * 2 + 0.4;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, w), m.pyramidCap);
    belt.position.y = y;
    g.add(belt);
  }
  return g;
}

// ---------------------------------------------------------------- Elizabeth Tower (Big Ben)

function buildBigBen(m) {
  const g = new THREE.Group();
  // 96 m. Clock faces are 7 m across. Ayrton Light on the lantern.
  const shaft = 14.4;
  square(g, 9.2, 8.4, 0, 8, m.ben);
  square(g, 7.2, 7.2, 8, 55, m.ben);
  // Corner pilasters
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(2.1, 47, 2.1), m.ben);
    p.position.set(sx * 6.4, 8 + 23.5, sz * 6.4);
    g.add(p);
  }
  // Clock stage
  square(g, 8.2, 8.2, 55, 75, m.ben);
  // Four clock faces
  for (let k = 0; k < 4; k++) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(3.5, 28), m.clock);
    const ang = (k * Math.PI) / 2;
    face.position.set(Math.sin(ang) * 8.25, 65.5, Math.cos(ang) * 8.25);
    face.rotation.y = ang;
    g.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.22, 6, 28), m.benGold);
    rim.position.copy(face.position);
    rim.rotation.y = ang;
    g.add(rim);
    // Hands at about ten-past-ten, a readable "clock" pose.
    const handMat = m.benDark;
    const hour = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.8, 0.12), handMat);
    hour.position.copy(face.position).add(new THREE.Vector3(Math.sin(ang) * 0.08, 0.6, Math.cos(ang) * 0.08));
    hour.rotation.z = 0.55;
    hour.rotation.y = ang;
    const minute = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.12), handMat);
    minute.position.copy(face.position).add(new THREE.Vector3(Math.sin(ang) * 0.08, 0.9, Math.cos(ang) * 0.08));
    minute.rotation.z = -0.7;
    minute.rotation.y = ang;
    g.add(hour, minute);
  }
  // Belfry, roof, lantern, spire to 96 m.
  square(g, 6.6, 6.6, 75, 84, m.benDark);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * Math.SQRT2, 7.4 * Math.SQRT2, 8, 4), m.ben);
  roof.rotateY(Math.PI / 4);
  roof.position.y = 88;
  g.add(roof);
  // Corner pinnacles
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const pin = new THREE.Mesh(new THREE.ConeGeometry(1.1, 7, 8), m.ben);
    pin.position.set(sx * 6.8, 78.5, sz * 6.8);
    g.add(pin);
  }
  cyl(g, 1.5, 1.5, 92, 94.2, m.benGold, 8);
  cyl(g, 0.35, 0.08, 94.2, 96, m.benGold, 6);
  return g;
}

// ---------------------------------------------------------------- Statue of Liberty

function buildLiberty(m) {
  const g = new THREE.Group();
  // Star fort + pedestal = 46.94 m; statue 46.05 m; torch tip 92.99 m.
  const star = starPrism(22, 6.5, 11, m.libertyDark);
  g.add(star);
  const ped = [
    [14, 12, 6.5, 14],
    [11, 10, 14, 24],
    [9, 8.5, 24, 38],
    [8, 7.5, 38, 46.94],
  ];
  for (const [hx, hz, y0, y1] of ped) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, y1 - y0, hz * 2), m.libertyStone);
    mesh.position.y = (y0 + y1) / 2;
    g.add(mesh);
  }
  // Pedestal cornice
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(18, 1.6, 17), m.libertyStone);
  cornice.position.y = 46.94;
  g.add(cornice);

  const fig = new THREE.Group();
  fig.position.y = 46.94;
  fig.rotation.y = 0.55; // 3/4 view, torch arm reads clearly

  // Robes
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 4.6, 20, 12), m.liberty);
  robe.position.y = 10;
  fig.add(robe);
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.1, 6, 12), m.liberty);
  waist.position.y = 22.4;
  fig.add(waist);

  // Head and seven-ray crown. Heel-to-head is 33.86 m.
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.5, 14, 12), m.liberty);
  head.scale.set(0.9, 1.1, 0.95);
  head.position.set(0, 31.4, 0.4);
  fig.add(head);
  for (let i = 0; i < 7; i++) {
    const a = -1.05 + (i * 2.1) / 6;
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.28, 4.6, 6), m.liberty);
    ray.position.set(Math.sin(a) * 2.2, 35.0, Math.cos(a) * 2.2);
    ray.lookAt(Math.sin(a) * 6, 39.5, Math.cos(a) * 6);
    fig.add(ray);
  }

  // Raised right arm and torch. Tip of the flame is at 46.05 m above the pedestal.
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 9.5, 8), m.liberty);
  upper.position.set(-3.6, 28.5, 0.6);
  upper.rotation.z = 0.85;
  upper.rotation.x = -0.15;
  fig.add(upper);
  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 8.2, 8), m.liberty);
  forearm.position.set(-6.6, 35.6, 0.3);
  forearm.rotation.z = 0.15;
  fig.add(forearm);
  const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.05, 1.6, 8), m.liberty);
  torch.position.set(-7.0, 40.2, 0.2);
  fig.add(torch);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.85, 4.2, 8), m.torch);
  flame.position.set(-7.0, 43.3, 0.2);
  fig.add(flame);

  // Left arm holding the tablet.
  const larm = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 8, 8), m.liberty);
  larm.position.set(3.8, 23.5, 2.2);
  larm.rotation.z = -1.05;
  larm.rotation.x = 0.4;
  fig.add(larm);
  const tablet = new THREE.Mesh(new THREE.BoxGeometry(4.1, 7.2, 0.55), m.liberty);
  tablet.position.set(5.4, 22.6, 3.2);
  tablet.rotation.y = -0.5;
  tablet.rotation.z = -0.15;
  fig.add(tablet);

  g.add(fig);
  return g;
}

function starPrism(radius, height, points, mat) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.55;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, height, 0);
  return new THREE.Mesh(geo, mat);
}

// ---------------------------------------------------------------- Qutub Minar

function buildQutub(m) {
  const g = new THREE.Group();
  // 72.5 m. Five tapering storeys, base ~14.3 m, top ~2.7 m, balconies between.
  const storeys = [
    { y0: 0,    y1: 29.2, r0: 7.15, r1: 5.15, flutes: 24, mat: m.qutub },
    { y0: 29.2, y1: 50.6, r0: 5.15, r1: 3.7,  flutes: 16, mat: m.qutub },
    { y0: 50.6, y1: 63.2, r0: 3.7,  r1: 2.7,  flutes: 16, mat: m.qutubPale },
    { y0: 63.2, y1: 68.6, r0: 2.7,  r1: 2.05, flutes: 0,  mat: m.qutubPale },
    { y0: 68.6, y1: 72.5, r0: 2.05, r1: 1.35, flutes: 0,  mat: m.qutubPale },
  ];
  for (const s of storeys) {
    g.add(flutedTaper(s.r0, s.r1, s.y0, s.y1, s.flutes, s.mat));
  }
  // Balconies / muqarnas rings at the storey breaks.
  for (const y of [29.2, 50.6, 63.2, 68.6]) {
    const r = storeys.find((s) => s.y1 === y)?.r1 ?? 2;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r + 1.3, r + 0.4, 1.6, 16), m.qutubPale);
    ring.position.y = y;
    g.add(ring);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(r + 1.45, r + 1.45, 0.35, 16), m.qutub);
    lip.position.y = y + 0.85;
    g.add(lip);
  }
  // Small chhatri / finial
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8), m.qutubPale);
  cap.position.y = 72.0;
  g.add(cap);
  return g;
}

function flutedTaper(r0, r1, y0, y1, flutes, mat) {
  const radial = Math.max(16, flutes * 4 || 16);
  const geo = new THREE.CylinderGeometry(r1, r0, y1 - y0, radial, 1);
  if (flutes) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 0.001) continue;
      const a = Math.atan2(z, x);
      const nr = r * (1 + 0.11 * Math.cos(a * flutes));
      pos.setX(i, (x / r) * nr);
      pos.setZ(i, (z / r) * nr);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = (y0 + y1) / 2;
  return mesh;
}

function buildHuman(mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.1, 4, 8), mat);
  body.position.y = 0.77;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mat);
  head.position.y = 1.66;
  g.add(body, head);
  return g;
}

// ---------------------------------------------------------------- labels

function annotate(mats) {
  const notes = new THREE.Group();
  const bar = (x0, y0, x1, y1, mat = mats.ink, t = 0.7) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, t, t), mat);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 10);
    mesh.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    notes.add(mesh);
  };

  const rx = LANDMARKS.rulerX;
  bar(rx, BASE, rx, BASE + 550);
  for (let h = 0; h <= 550; h += 10) {
    const w = h % 50 === 0 ? 6 : 2.5;
    bar(rx - w, BASE + h, rx, BASE + h);
    if (h % 50 === 0) {
      notes.add(pill(
        [{ text: `${h} m`, size: 9, font: 'mono' }],
        { x: rx - 8, y: BASE + h, z: 16, anchor: 'right' },
      ));
    }
  }

  const L = 14; // world-metre cap height; camera is much farther than the V3/V4 lineup
  const S = 11;
  const top = (h) => BASE + h;
  const labelZ = 22;

  const above = (key, lines, height, dx = 0, dy = 8) => {
    notes.add(pill(lines, { x: LANDMARKS[key].x + dx, y: top(height) + dy, z: labelZ }));
  };

  above('taipei', [
    { text: 'TAIPEI 101', size: L, font: 'display' },
    { text: '508 m', size: S, font: 'mono' },
  ], 508);

  above('eiffel', [
    { text: 'EIFFEL TOWER', size: L, font: 'display' },
    { text: '330 m', size: S, font: 'mono' },
  ], 330);

  above('unity', [
    { text: 'STATUE OF UNITY', size: L, font: 'display' },
    { text: '240 m  ·  182 m statue', size: S, font: 'mono' },
  ], 240);

  // Starship leads. The pyramid is almost the same height, so its label
  // sits on the left slope, clear of the rocket and of Unity's label.
  notes.add(pill([
    { text: 'STARSHIP V4', size: L, font: 'display', color: '#ffb36b' },
    { text: '~142 m (est.)', size: S, font: 'mono' },
  ], { x: LANDMARKS.starship.x, y: top(142) + 12, z: 28 }));

  notes.add(pill([
    { text: 'GREAT PYRAMID', size: L * 0.85, font: 'display' },
    { text: '138.5 m today · 146.6 m orig.', size: S * 0.72, font: 'mono' },
  ], { x: 42, y: top(138.5) + 6, z: labelZ, anchor: 'left' }));

  // Smaller landmarks are spaced so each label sits cleanly above its tower.
  notes.add(pill([
    { text: 'BIG BEN', size: L * 0.78, font: 'display' },
    { text: '96 m', size: S * 0.85, font: 'mono' },
  ], { x: LANDMARKS.bigben.x, y: top(96) + 8, z: labelZ }));

  notes.add(pill([
    { text: 'LIBERTY', size: L * 0.78, font: 'display' },
    { text: '93 m', size: S * 0.85, font: 'mono' },
  ], { x: LANDMARKS.liberty.x, y: top(93) + 8, z: labelZ }));

  notes.add(pill([
    { text: 'QUTUB MINAR', size: L * 0.78, font: 'display' },
    { text: '72.5 m', size: S * 0.85, font: 'mono' },
  ], { x: LANDMARKS.qutub.x, y: top(72.5) + 8, z: labelZ }));

  above('empire', [
    { text: 'EMPIRE STATE', size: L, font: 'display' },
    { text: '443 m (tip)', size: S, font: 'mono' },
    { text: '381 m roof', size: S * 0.75, font: 'body', color: '#c9d3dc' },
  ], 443.2);

  return notes;
}
