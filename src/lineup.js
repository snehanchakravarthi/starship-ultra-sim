// Side-by-side scale lineup: Saturn V, Starship V3 and Starship V4.
// Everything stands on one plinth whose top (y = BASE) is height zero.
//
// Sources
//   Starship V3 (SpaceX): 124 m stack, 52 m ship, ~72 m Super Heavy, 9 m diameter,
//     ship engines 3 Raptor + 3 Raptor Vacuum.
//   Starship V4 (Elon Musk on X, 16 Nov 2026): ship "~70m long, roughly a 40% length
//     increase", engine count raised to 9 with 3 more Raptor Vacuums.
//     The ~142 m stack is an ESTIMATE: the V4 ship on today's ~72 m booster.
//   Saturn V: 110.6 m tall, 10.1 m diameter.

import * as THREE from 'three';
import { scaleUV, tangentOgive } from './geometry.js';
import { STEEL_PATCH } from './textures.js';
import { boosterKit, makeBooster } from './parts/booster.js';

export const BASE = 4;   // plinth top; heights are measured from here

export const LINEUP = {
  saturn: { x: -46, height: 110.6, diameter: 10.1 },
  v3: { x: 0, booster: 72, ship: 52, engines: '6 engines · 3 + 3 RVac' },
  v4: { x: 46, booster: 72, ship: 70, engines: '9 engines · 3 + 6 RVac' },
  rulerX: -82,
};

const SHIP_R = 4.5;
const NOSE = 17;
const INK = '#0f171f';

/** Bounds of everything worth framing, in world units; the strip below 0 leaves room for the caption. */
export const LINEUP_BOUNDS = { minX: -100, maxX: 92, minY: -28, maxY: BASE + 142 + 22 };

export function buildLineup(M) {
  const group = new THREE.Group();
  group.name = 'lineup';

  const mats = {
    white: new THREE.MeshStandardMaterial({ color: 0xf3f2ee, roughness: 0.55, metalness: 0.05 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.6, metalness: 0.1 }),
    bell: new THREE.MeshStandardMaterial({ color: 0x3b3b3d, roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide }),
    tower: new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.6, metalness: 0.4 }),
    red: new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.5 }),
    ink: new THREE.MeshBasicMaterial({ color: INK, toneMapped: false }),
    accent: new THREE.MeshBasicMaterial({ color: 0xd9601c, toneMapped: false }),
  };
  const owned = Object.values(mats);

  // plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(150, BASE, 34), M.concrete);
  plinth.position.set(0, BASE / 2, 0);
  plinth.receiveShadow = plinth.castShadow = true;
  group.add(plinth);

  // vehicles
  const saturn = buildSaturnV(mats);
  saturn.position.set(LINEUP.saturn.x, BASE, 0);
  group.add(saturn);
  for (const key of ['v3', 'v4']) {
    const s = LINEUP[key];
    const stack = buildStarship(s.booster, s.ship, M);
    stack.position.set(s.x, BASE, 0);
    group.add(stack);
  }

  // human for scale, beside the V3 booster
  const human = buildHuman(mats.ink);
  human.position.set(LINEUP.v3.x - 8, BASE, 6);
  group.add(human);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // ---------- annotations ----------
  const notes = new THREE.Group();
  group.add(notes);
  const bar = (x0, y0, x1, y1, mat = mats.ink, t = 0.45) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, t, t), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 6);
    m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    notes.add(m);
    return m;
  };

  // height ruler
  const rx = LINEUP.rulerX;
  bar(rx, BASE, rx, BASE + 150);
  for (let h = 0; h <= 150; h += 10) {
    const w = h % 50 === 0 ? 3 : 1.5;
    bar(rx - w, BASE + h, rx, BASE + h);
    if (h % 50 === 0) notes.add(pill([{ text: `${h} m`, size: 4.2, font: 'mono' }], { x: rx - 4.5, y: BASE + h, anchor: 'right' }));
  }

  // headline labels above each vehicle
  const tops = {
    saturn: BASE + LINEUP.saturn.height,
    v3: BASE + LINEUP.v3.booster + LINEUP.v3.ship,
    v4: BASE + LINEUP.v4.booster + LINEUP.v4.ship,
  };
  notes.add(pill([
    { text: 'SATURN V', size: 6, font: 'display' },
    { text: '110.6 m', size: 4.6, font: 'mono' },
  ], { x: LINEUP.saturn.x, y: tops.saturn + 3 }));
  notes.add(pill([
    { text: 'STARSHIP V3', size: 6, font: 'display' },
    { text: '124 m', size: 4.6, font: 'mono' },
  ], { x: LINEUP.v3.x, y: tops.v3 + 3 }));
  notes.add(pill([
    { text: 'STARSHIP V4', size: 6, font: 'display', color: '#ffb36b' },
    { text: '~142 m (est.)', size: 4.6, font: 'mono' },
  ], { x: LINEUP.v4.x, y: tops.v4 + 3 }));

  // ship-only brackets
  for (const key of ['v3', 'v4']) {
    const s = LINEUP[key];
    const x = s.x + SHIP_R + 3.2;
    const y0 = BASE + s.booster, y1 = y0 + s.ship;
    const mat = key === 'v4' ? mats.accent : mats.ink;
    bar(x, y0, x, y1, mat);
    bar(x - 1.6, y0, x, y0, mat);
    bar(x - 1.6, y1, x, y1, mat);
    notes.add(pill([
      { text: key === 'v4' ? 'V4 ship ~70 m' : 'V3 ship 52 m', size: 4, font: 'mono', color: key === 'v4' ? '#ffb36b' : '#ffffff' },
      { text: s.engines, size: 3.2, font: 'body', color: '#c9d3dc' },
    ], { x: x + 1.8, y: (y0 + y1) / 2, anchor: 'left' }));
  }

  // V3 height carried across to V4: the +18 m
  const yV3 = tops.v3;
  const dash = 2.2;
  for (let x = LINEUP.v3.x + 1.5; x < LINEUP.v4.x - 6; x += dash * 2) bar(x, yV3, Math.min(x + dash, LINEUP.v4.x - 6), yV3, mats.ink, 0.35);
  notes.add(pill([{ text: '+18 m', size: 4, font: 'mono', color: '#ffb36b' }], { x: (LINEUP.v3.x + LINEUP.v4.x) / 2 + 2, y: yV3 - 4.2, anchor: 'center-mid' }));

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

// ---------------------------------------------------------------- vehicles

function buildStarship(boosterLength, shipLength, M) {
  const g = new THREE.Group();
  const kit = boosterKit({ boosterDiameter: 2 * SHIP_R, boosterLength, catchPinHeight: 60 });
  const b = makeBooster(kit, M);
  b.setThrottle(new Float32Array(kit.layout.length));
  b.setFins([0, 0, 0]);
  b.group.rotation.y = Math.PI / 2; // fins in profile
  g.add(b.group);
  const ship = buildShip(shipLength, M);
  ship.position.y = boosterLength;
  g.add(ship);
  return g;
}

/** Ship: steel barrel, ogive nose, heat shield on the far side, flaps in profile. */
function buildShip(L, M) {
  const g = new THREE.Group();
  const R = SHIP_R;
  const barrel = L - NOSE;
  const circ = 2 * Math.PI * R;
  const profile = [[R, 0], [R, barrel], ...tangentOgive(R, NOSE, 28).slice(1).map(([r, y]) => [r, y + barrel])]
    .map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y));

  const body = new THREE.LatheGeometry(profile, 64);
  scaleUV(body, circ / STEEL_PATCH.w, L / STEEL_PATCH.h);
  g.add(new THREE.Mesh(body, M.steel));

  // heat shield: the windward half faces away from a side-on camera, wrapping a little round the sides
  const shieldProfile = profile.map((v) => new THREE.Vector2(v.x + 0.06, v.y)).slice(0, -2);
  const shield = new THREE.LatheGeometry(shieldProfile, 48, Math.PI * 0.42, Math.PI * 1.16);
  g.add(new THREE.Mesh(shield, M.heatShield));

  // flaps on the ±X edges: small forward pair on the nose, big aft pair on the skirt
  const flap = (y, h, out, rootIn) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(out, h * 0.12); s.lineTo(out, h * 0.82); s.lineTo(0, h);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false });
    geo.translate(rootIn, 0, -0.25);
    for (const side of [1, -1]) {
      const m = new THREE.Mesh(geo, M.heatShield);
      m.position.y = y;
      m.rotation.y = side > 0 ? 0 : Math.PI;
      g.add(m);
    }
  };
  flap(1.5, Math.min(13, barrel * 0.33), 3.4, R - 0.3);
  const fy = barrel + 1;
  flap(fy, 7, 2.2, R * 0.72 - 0.3);
  return g;
}

function buildSaturnV(m) {
  const g = new THREE.Group();
  const R = 10.1 / 2, r3 = 3.3, rS = 1.95;
  const add = (geo, mat, y = 0) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.y = y; g.add(mesh); return mesh; };
  const cyl = (r0, r1, y0, y1, mat, seg = 48) => add(new THREE.CylinderGeometry(r1, r0, y1 - y0, seg), mat, (y0 + y1) / 2);
  // roll pattern: four alternating quarters
  const roll = (r, y0, y1, phase = 0) => {
    for (let k = 0; k < 4; k++) {
      const geo = new THREE.CylinderGeometry(r + 0.03, r + 0.03, y1 - y0, 12, 1, true, phase + (k * Math.PI) / 2, Math.PI / 2);
      add(geo, k % 2 ? m.white : m.black, (y0 + y1) / 2);
    }
  };

  // F-1 engines
  const bell = new THREE.CylinderGeometry(0.9, 1.75, 4.2, 28, 1, true);
  for (const [x, z] of [[0, 0], [3, 3], [-3, 3], [3, -3], [-3, -3]]) {
    const b = add(bell, m.bell, 2.1);
    b.position.x = x; b.position.z = z;
  }
  // S-IC
  cyl(R, R, 4.2, 42, m.white);
  roll(R, 4.2, 9.5, Math.PI / 4);
  cyl(R + 0.04, R + 0.04, 26, 28.2, m.black);
  roll(R, 33, 38.5, Math.PI / 4);
  // fins and engine fairings
  const fin = new THREE.Shape();
  fin.moveTo(0, 0); fin.lineTo(3.4, 0.3); fin.lineTo(1.4, 8.5); fin.lineTo(0, 10);
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.35, bevelEnabled: false });
  finGeo.translate(R - 0.3, 3.2, -0.175);
  const fairing = new THREE.CylinderGeometry(0.9, 1.6, 9, 20);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const f = add(finGeo, m.black);
    f.rotation.y = a;
    const fr = add(fairing, m.white, 8.2);
    fr.position.set(Math.cos(a) * (R - 0.4), 8.2, -Math.sin(a) * (R - 0.4));
  }
  // interstage + S-II
  cyl(R, R, 42, 66, m.white);
  cyl(R + 0.04, R + 0.04, 42, 43.2, m.black);
  // S-II / S-IVB adapter
  cyl(R, r3, 66, 69.5, m.white);
  // S-IVB with aft roll pattern
  cyl(r3, r3, 69.5, 86, m.white);
  roll(r3, 69.5, 74.5, 0);
  // instrument unit
  cyl(r3 + 0.03, r3 + 0.03, 86, 87, m.black);
  // spacecraft-LM adapter, service module, command module
  cyl(r3, rS, 87, 94.5, m.white);
  cyl(rS, rS, 94.5, 98.6, m.white);
  cyl(rS, 0.4, 98.6, 101.8, m.white);
  // launch escape system: truss, motor, tip
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 6), m.tower);
    leg.position.set(Math.cos(a) * 0.7, 103.4, Math.sin(a) * 0.7);
    leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    g.add(leg);
  }
  cyl(0.55, 0.55, 105.2, 108.8, m.white, 20);
  cyl(0.55, 0.15, 108.8, 110.3, m.white, 20);
  cyl(0.15, 0.02, 110.3, 110.6, m.red, 12);
  return g;
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

const FONTS = {
  display: '600 {s}px "Barlow Condensed", "Arial Narrow", sans-serif',
  mono: '500 {s}px "IBM Plex Mono", ui-monospace, monospace',
  body: '600 {s}px "IBM Plex Sans", system-ui, sans-serif',
};

/**
 * Rounded dark pill with stacked lines of text, drawn to a sprite.
 * Line sizes are in metres of cap-to-descender height; anchor picks the reference point.
 */
function pill(lines, { x, y, anchor = 'bottom' }) {
  const PX = 24; // canvas pixels per metre
  const pad = 1.4 * PX, gap = 0.6 * PX;
  const measure = document.createElement('canvas').getContext('2d');
  const rows = lines.map((l) => {
    const px = Math.round(l.size * PX);
    const font = FONTS[l.font].replace('{s}', px);
    measure.font = font;
    return { ...l, px, font, w: measure.measureText(l.text).width };
  });
  const W = Math.ceil(Math.max(...rows.map((r) => r.w)) + pad * 2);
  const H = Math.ceil(rows.reduce((a, r) => a + r.px, 0) + gap * (rows.length - 1) + pad * 1.4);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(14, 20, 27, 0.84)';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, Math.min(H / 2, 0.9 * PX));
  ctx.fill();
  let yy = pad * 0.7;
  ctx.textBaseline = 'top';
  ctx.textAlign = anchor === 'left' ? 'left' : anchor === 'right' ? 'right' : 'center';
  const tx = anchor === 'left' ? pad : anchor === 'right' ? W - pad : W / 2;
  for (const r of rows) {
    ctx.font = r.font;
    ctx.fillStyle = r.color ?? '#ffffff';
    ctx.fillText(r.text, tx, yy + r.px * 0.06);
    yy += r.px + gap;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
  s.renderOrder = 10;
  s.scale.set(W / PX, H / PX, 1);
  const centers = { bottom: [0.5, 0], left: [0, 0.5], right: [1, 0.5], 'center-mid': [0.5, 0.5] };
  s.center.set(...centers[anchor]);
  s.position.set(x, y, 8);
  return s;
}
