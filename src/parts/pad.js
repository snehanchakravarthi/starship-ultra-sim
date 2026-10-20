// Launch table with an exhaust hole and hold-down clamps per booster, legs,
// water-cooled steel plates on the ground and a concrete apron.

import * as THREE from 'three';
import { circle, regularPolygon, roundedPolygon, scaleUV, slabGeometry } from '../geometry.js';

export const TABLE = { margin: 3, thickness: 3 };

export function buildPad(P, M, layout) {
  const { n, half, D, R, axes, apothem0, corner0, towerCircumradius } = layout;
  const group = new THREE.Group();
  const shadow = (m) => { m.castShadow = m.receiveShadow = true; return m; };

  const outline = roundedPolygon(n, apothem0 + TABLE.margin, corner0 + TABLE.margin, { arcSegs: 10, edgeSegs: 2 });
  const holes = [];
  const pitch = 2 * D * Math.sin(half);
  const exhaustR = Math.max(R - 0.6, 0.5);
  const boosterHoles = pitch > 2 * exhaustR + 0.5;
  if (boosterHoles) axes.forEach((c) => holes.push(circle(c.x, c.y, exhaustR, 48)));
  const towerHoleR = towerCircumradius + 0.4;
  if (D - exhaustR > towerHoleR + 0.5) holes.push(regularPolygon(n, towerHoleR, 0));
  const table = shadow(new THREE.Mesh(slabGeometry(outline, holes, TABLE.thickness), M.concrete));
  table.position.y = P.mountHeight;
  group.add(table);

  if (boosterHoles) {
    const ringGeo = new THREE.RingGeometry(exhaustR, exhaustR + 1.1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const plateGeo = new THREE.CylinderGeometry(exhaustR + 1.4, exhaustR + 2, 1.2, 40);
    for (const c of axes) {
      const ring = new THREE.Mesh(ringGeo, M.deluge);
      ring.position.set(c.x, P.mountHeight + 0.03, c.y);
      ring.receiveShadow = true;
      group.add(ring);
      const plate = shadow(new THREE.Mesh(plateGeo, M.deluge));
      plate.position.set(c.x, 0.6, c.y);
      group.add(plate);
    }
    const clampsPer = 20;
    const clamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.9, 0.55), M.fittings, n * clampsPer);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    let i = 0;
    for (const c of axes) {
      for (let j = 0; j < clampsPer; j++) {
        const a = (2 * Math.PI * (j + 0.5)) / clampsPer;
        q.setFromAxisAngle(up, -a);
        m4.compose(new THREE.Vector3(c.x + (R + 0.45) * Math.cos(a), P.mountHeight + 0.45, c.y + (R + 0.45) * Math.sin(a)), q, new THREE.Vector3(1, 1, 1));
        clamps.setMatrixAt(i++, m4);
      }
    }
    clamps.castShadow = true;
    group.add(clamps);
  }

  const legH = P.mountHeight - TABLE.thickness;
  const legGeo = new THREE.BoxGeometry(2.2, legH, 2.2);
  for (let k = 0; k < n; k++) {
    const phi = half + 2 * half * k;
    for (const [a, r] of [[phi, D + R + 1.8], [phi + half, apothem0 + 0.6]]) {
      const leg = shadow(new THREE.Mesh(legGeo, M.concrete));
      leg.position.set(r * Math.cos(a), legH / 2, r * Math.sin(a));
      leg.rotation.y = -a;
      group.add(leg);
    }
  }

  const apronR = 120;
  const apronGeo = new THREE.CircleGeometry(apronR, 72);
  apronGeo.rotateX(-Math.PI / 2);
  scaleUV(apronGeo, (2 * apronR) / 40, (2 * apronR) / 40);
  const apron = new THREE.Mesh(apronGeo, M.apron);
  apron.position.y = 0.04;
  apron.receiveShadow = true;
  group.add(apron);

  return group;
}
