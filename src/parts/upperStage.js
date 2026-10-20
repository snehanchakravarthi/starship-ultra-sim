// Detailed upper stage: steel loft with weld seams, windward heat-shield tiles,
// forward and aft flaps, and its own engines (sea-level centre, vacuum ring).

import * as THREE from 'three';
import { loftGeometry, roundedPolygon, upperStageSection } from '../geometry.js';
import { STEEL_PATCH, TILE_PATCH } from '../textures.js';
import { raptorExitY, raptorGeometry } from './raptor.js';

const DEG = Math.PI / 180;
const TILE_HALF_ARC = 100 * DEG; // tiles cover the windward side
const WINDWARD_HINT = -70 * DEG;  // a face normal near here becomes the windward centreline
const RVAC = { exitR: 1.15, bellLen: 3.4 };

function polarDist(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function sampleHeights(us, rings = 110) {
  const ys = [0];
  if (us.skirt > 0.01) {
    ys.push(us.skirt * 0.5, us.skirt);
  }
  for (let i = 1; i < rings; i++) {
    const t = 1 - Math.pow(1 - i / rings, 1.5);
    ys.push(us.skirt + t * (us.height - us.skirt));
  }
  return ys;
}

function flapGeometry(root, span, thick) {
  const s = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(span, root * 0.2),
    new THREE.Vector2(span * 0.94, root * 0.86),
    new THREE.Vector2(0, root),
  ]);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1 });
  g.translate(0, 0, -thick / 2);
  return g;
}

export function buildUpperStage(us, P, M, layout) {
  const group = new THREE.Group();
  const half = Math.PI / us.n;
  const faces = Array.from({ length: us.n }, (_, k) => 2 * half * k);
  const windward = faces.reduce((best, f) => (polarDist(f, WINDWARD_HINT) < polarDist(best, WINDWARD_HINT) ? f : best));
  const ys = sampleHeights(us);
  const raw = ys.map((y) => {
    const { a, r } = upperStageSection(us, y);
    return roundedPolygon(us.n, a, r, { arcSegs: 18, edgeSegs: 12 });
  });

  // Put the UV seam on the leeward side, then repeat the first point.
  let start = 0;
  raw[0].forEach(([x, z], j) => {
    const best = raw[0][start];
    if (polarDist(Math.atan2(z, x), windward + Math.PI) < polarDist(Math.atan2(best[1], best[0]), windward + Math.PI)) start = j;
  });
  const rings = raw.map((r) => {
    const rr = [...r.slice(start), ...r.slice(0, start)];
    rr.push(rr[0]);
    return rr;
  });
  const arc = rings.map((ring) => {
    let s = 0;
    return ring.map((p, j) => (j ? (s += Math.hypot(p[0] - ring[j - 1][0], p[1] - ring[j - 1][1])) : 0));
  });

  const body = new THREE.Mesh(
    loftGeometry(rings, ys, { tipY: us.height, wrap: false, uv: (i, j) => [arc[i][j] / STEEL_PATCH.w, ys[i] / STEEL_PATCH.h] }),
    P.xray ? M.ghost : M.steel,
  );
  body.castShadow = !P.xray;
  body.receiveShadow = true;
  group.add(body);

  // Base plate between and around the booster tops.
  const base = new THREE.Mesh(loftGeometry([raw[0]], [0], { capBottom: true }), M.heatShield);
  base.visible = !P.xray;
  group.add(base);

  const engines = upperStageEngines(us, layout, M);
  group.add(engines.group);

  if (!P.xray) {
    // Tiles: a contiguous index range around the windward line, lifted 8 cm off the steel.
    const idx = rings[0].map((p, j) => j).filter((j) => j < rings[0].length - 1 && polarDist(Math.atan2(rings[0][j][1], rings[0][j][0]), windward) <= TILE_HALF_ARC);
    const j0 = idx[0], j1 = idx[idx.length - 1];
    const topI = ys.findIndex((y) => y > us.height - 1.2);
    const tYs = ys.slice(0, topI > 0 ? topI : ys.length);
    const tRings = tYs.map((_, i) => rings[i].slice(j0, j1 + 1).map(([x, z]) => {
      const l = Math.hypot(x, z) || 1;
      return [x * (1 + 0.08 / l), z * (1 + 0.08 / l)];
    }));
    const tiles = new THREE.Mesh(
      loftGeometry(tRings, tYs, { wrap: false, uv: (i, j) => [(arc[i][j0 + j] - arc[i][j0]) / TILE_PATCH.w, tYs[i] / TILE_PATCH.h] }),
      M.tiles,
    );
    tiles.receiveShadow = true;
    group.add(tiles);

    group.add(buildFlaps(us, M, half, windward));
  }

  return { group, engineDropOverTower: engines.dropOverTower };
}

function cornerApex(us, y, half) {
  const { a, r } = upperStageSection(us, y);
  return (a - r) / Math.cos(half) + r;
}

function buildFlaps(us, M, half, windward) {
  const g = new THREE.Group();
  const corners = Array.from({ length: us.n }, (_, k) => half + 2 * half * k);
  const pick = (target) => corners.reduce((best, c) => (polarDist(c, target) < polarDist(best, target) ? c : best));
  const sides = [...new Set([pick(windward + 105 * DEG), pick(windward - 105 * DEG)])];
  const L = us.height - us.skirt;
  const flapSets = [
    // aft flaps on the skirt and lower nose
    { y0: 1.5, y1: Math.min(us.skirt + 0.25 * L, us.height * 0.45), span: 0.3 * us.apothem0, thick: 0.55 },
    // forward flaps higher up the nose
    { y0: us.skirt + 0.5 * L, y1: us.skirt + 0.72 * L, span: 0.2 * us.apothem0, thick: 0.4 },
  ];
  for (const phi of sides) {
    for (const f of flapSets) {
      const r0 = cornerApex(us, f.y0, half), r1 = cornerApex(us, f.y1, half);
      const dr = r1 - r0, dy = f.y1 - f.y0;
      const root = Math.hypot(dr, dy);
      const holder = new THREE.Group();
      holder.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -phi);
      const flap = new THREE.Group();
      flap.position.set(r0 - 0.15, f.y0, 0);
      flap.rotation.z = Math.asin(THREE.MathUtils.clamp(-dr / root, -1, 1));
      const plate = new THREE.Mesh(flapGeometry(root, f.span, f.thick), M.steel);
      const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.7, root * 0.9, f.thick + 0.5), M.fittings);
      hinge.position.set(0.1, root / 2, 0);
      for (const m of [plate, hinge]) { m.castShadow = m.receiveShadow = true; flap.add(m); }
      holder.add(flap);
      g.add(holder);
    }
  }
  return g;
}

function upperStageEngines(us, layout, M) {
  const group = new THREE.Group();
  const { n, R, D, towerCircumradius } = layout;
  const half = Math.PI / n;
  const rsl = raptorGeometry();
  const rvac = raptorGeometry({ exitR: RVAC.exitR, bellLen: RVAC.bellLen, chamberR: 0.36, segs: 20 });
  const place = (geo, r, a, exitR, drop) => ({ geo, r, a, exitR, drop });
  const list = [0, 1, 2].map((i) => place(rsl, 1.35, Math.PI / 2 + (2 * Math.PI * i) / 3, 0.62, -raptorExitY()));
  // vacuum engines sit in the gaps between booster tops, if they fit
  const rv = D * Math.cos(half) - 0.6;
  const gap = Math.sqrt(rv * rv + D * D - 2 * rv * D * Math.cos(half));
  if (gap > R + RVAC.exitR + 0.3 && rv > 1.35 + 0.62 + RVAC.exitR) {
    for (let k = 0; k < n; k++) list.push(place(rvac, rv, 2 * half * k, RVAC.exitR, -raptorExitY(RVAC.bellLen)));
  }
  let dropOverTower = 0;
  for (const e of list) {
    const m = new THREE.Mesh(e.geo, M.engine);
    m.position.set(e.r * Math.cos(e.a), 0, e.r * Math.sin(e.a));
    m.rotation.y = -e.a;
    m.castShadow = true;
    group.add(m);
    if (e.r - e.exitR < towerCircumradius + 0.5) dropOverTower = Math.max(dropOverTower, e.drop);
  }
  return { group, dropOverTower };
}
