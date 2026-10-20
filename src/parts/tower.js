// Central lattice tower. Each face points at one booster and carries its own
// carriage with a pair of catch arms ("chopsticks") that rides up and down.

import * as THREE from 'three';
import { boxAt, boxBetween, merge, regularPolygon, slabGeometry } from '../geometry.js';

const DEG = Math.PI / 180;
const BEAM = { h: 1.6, w: 1.0, rail: 0.25 };

export function buildTower(P, M, layout) {
  const { n, half, D, R } = layout;
  const W = P.towerWidth;
  const H = P.towerHeight;
  const Rt = W / 2 / Math.cos(half);
  const group = new THREE.Group();

  // ---------- lattice ----------
  const V = (k, y) => {
    const a = 2 * half * k; // vertices sit between booster directions
    return new THREE.Vector3(Rt * Math.cos(a), y, Rt * Math.sin(a));
  };
  const parts = [];
  for (let k = 0; k < n; k++) parts.push(boxBetween(V(k, 0), V(k, H), 0.9));
  const bays = Math.max(1, Math.round(H / 6));
  const bay = H / bays;
  for (let b = 0; b <= bays; b++) {
    for (let k = 0; k < n; k++) parts.push(boxBetween(V(k, b * bay), V(k + 1, b * bay), 0.45));
  }
  for (let b = 0; b < bays; b++) {
    const y0 = b * bay, y1 = y0 + bay;
    for (let k = 0; k < n; k++) {
      parts.push(boxBetween(V(k, y0), V(k + 1, y1), 0.26), boxBetween(V(k + 1, y0), V(k, y1), 0.26));
    }
  }
  const lattice = new THREE.Mesh(merge(parts), M.towerSteel);
  lattice.castShadow = lattice.receiveShadow = true;
  group.add(lattice);

  const top = new THREE.Mesh(slabGeometry(regularPolygon(n, Rt + 1.1, 0), [], 0.7), M.towerSteel);
  top.position.y = H;
  const footing = new THREE.Mesh(slabGeometry(regularPolygon(n, Rt + 2.4, 0), [], 1.4), M.concrete);
  footing.position.y = 1.4;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), M.beacon);
  beacon.position.set(0, H - 0.2, 0);
  for (const m of [top, footing]) { m.castShadow = m.receiveShadow = true; group.add(m); }
  group.add(beacon);

  // ---------- carriages and arms ----------
  const xh = W / 2 + 1.3;                          // hinge line, just outside the face
  const hw = xh * Math.tan(half - 2.6 * DEG);      // keeps neighbouring carriages apart
  const contactZ = R + 0.3 + BEAM.w / 2;           // arm centreline beside the booster
  const reach = Math.max(D - xh, 2);
  const alphaC = Math.atan2(contactZ - hw, reach);
  const armLen = (reach + R + 2.5) / Math.cos(alphaC);
  let alphaO = alphaC;
  for (let a = alphaC; a <= alphaC + 28 * DEG; a += 0.5 * DEG) {
    const tipX = xh + armLen * Math.cos(a), tipZ = hw + armLen * Math.sin(a);
    if (Math.atan2(tipZ, tipX) > half - 3 * DEG) break;
    alphaO = a;
  }

  const faceHalf = (W / 2) * Math.tan(half);
  const carriageGeo = merge([
    boxAt(1.2, 3.0, 2 * hw + 1.2, xh - 0.5, 0, 0),
    boxAt(1.1, 2.2, 0.8, W / 2 + 0.25, 0, Math.max(faceHalf - 0.7, 0.4)),
    boxAt(1.1, 2.2, 0.8, W / 2 + 0.25, 0, -Math.max(faceHalf - 0.7, 0.4)),
    ...[1, -1].map((s) => { const c = new THREE.CylinderGeometry(0.7, 0.7, 3.3, 12); c.translate(xh, 0, s * hw); return c; }),
  ]);
  const armParts = [
    boxAt(armLen, BEAM.h, BEAM.w, armLen / 2, 0, 0),
    boxAt(armLen * 0.55, BEAM.rail, 0.7, armLen * 0.62, BEAM.h / 2 + BEAM.rail / 2, 0),
    boxAt(0.7, BEAM.h * 0.85, BEAM.w + 0.3, armLen - 0.35, 0, 0),
  ];
  for (let x = 1.2; x < armLen - 1; x += 1.6) armParts.push(boxAt(0.16, BEAM.h + 0.04, BEAM.w + 0.1, x, 0, 0));
  const armGeo = merge(armParts);

  const carriages = [];
  const arms = [];
  for (let k = 0; k < n; k++) {
    const phi = half + 2 * half * k;
    const c = new THREE.Group();
    c.rotation.y = -phi;
    const frame = new THREE.Mesh(carriageGeo, M.armSteel);
    frame.castShadow = frame.receiveShadow = true;
    c.add(frame);
    const pair = [1, -1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(xh, 0, s * hw);
      const arm = new THREE.Mesh(armGeo, M.armSteel);
      arm.castShadow = arm.receiveShadow = true;
      pivot.add(arm);
      c.add(pivot);
      return pivot;
    });
    carriages.push(c);
    arms.push(pair);
    group.add(c);
  }

  const armTop = BEAM.h / 2 + BEAM.rail; // catch rail surface above the carriage origin

  function setCarriage(k, y, open) {
    carriages[k].position.y = y;
    const a = alphaC + (alphaO - alphaC) * open;
    arms[k][0].rotation.y = -a;
    arms[k][1].rotation.y = a;
  }

  return { group, setCarriage, armTop, circumradius: Rt, openingAtBooster: hw + reach * Math.tan(alphaO) };
}
