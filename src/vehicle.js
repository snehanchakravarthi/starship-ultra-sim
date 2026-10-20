// Assembles the multi-booster configuration from parameters and derives the
// numbers that matter at this stage: sizes, envelope volumes and clearances.

import * as THREE from 'three';
import {
  circle, latheVolume, regularPolygon, roundedPolygon, slabGeometry, strut, tangentOgive,
  upperStageGeometry, upperStageVolume,
} from './geometry.js';

// Today's single-stack Starship (V2-class), used for scale and for ratios.
export const REFERENCE = { diameter: 9, boosterLength: 71, shipBarrel: 39, shipNose: 13 };

const TABLE_MARGIN = 3;   // launch table overhang beyond the upper-stage footprint
const TABLE_THICKNESS = 3;
const TIGHT = 3;          // clearances under this many metres are flagged as tight

export function buildConfiguration(P, M) {
  const n = P.boosterCount;
  const half = Math.PI / n;
  const rb = P.boosterDiameter / 2;
  const d = P.clusterRadius;
  const axes = Array.from({ length: n }, (_, k) => {
    const phi = half + 2 * half * k; // n = 4 → boosters on the diagonals
    return new THREE.Vector2(d * Math.cos(phi), d * Math.sin(phi));
  });

  // Upper-stage corners are concentric with the booster axes, so each booster
  // top nests inside one rounded corner.
  const corner0 = rb + P.cornerGap;
  const apothem0 = d * Math.cos(half) + corner0;
  const us = {
    n, apothem0, corner0,
    height: P.upperHeight,
    skirt: Math.min(P.skirtHeight, P.upperHeight - 1),
    shoulder: P.shoulder,
    tipBluntness: P.tipBluntness,
    tipRounding: P.tipRounding,
    roundingCurve: P.roundingCurve,
  };

  const boosterBaseY = P.mountHeight;
  const boosterTopY = boosterBaseY + P.boosterLength;
  const usBaseY = boosterTopY - P.insetDepth;
  const stackHeight = usBaseY + P.upperHeight;

  // ---------- vehicle (moves with the liftoff slider) ----------
  const vehicle = new THREE.Group();
  vehicle.position.y = P.liftoff;

  const boosterGeo = new THREE.CylinderGeometry(rb, rb, P.boosterLength, 48);
  for (const c of axes) {
    const m = new THREE.Mesh(boosterGeo, M.steel);
    m.position.set(c.x, boosterBaseY + P.boosterLength / 2, c.y);
    shadows(m);
    vehicle.add(m);
  }

  const rodR = P.rodDiameter / 2;
  const ringYs = [boosterBaseY + P.bottomRingHeight, usBaseY - P.topRingDrop]
    .map((y) => THREE.MathUtils.clamp(y, boosterBaseY + rodR, usBaseY - rodR));
  for (const y of ringYs) {
    if (P.ringStyle === 'arc') {
      const torus = new THREE.Mesh(new THREE.TorusGeometry(d, rodR, 8, 160), M.rod);
      torus.rotation.x = Math.PI / 2;
      torus.position.y = y;
      vehicle.add(shadows(torus));
      continue;
    }
    for (let k = 0; k < n; k++) {
      const a = axes[k];
      const b = axes[(k + 1) % n];
      const u = new THREE.Vector2().subVectors(b, a);
      if (u.length() <= 2 * rb) continue; // boosters touch or overlap: nothing to bridge
      u.normalize();
      const from = new THREE.Vector3(a.x + u.x * rb, y, a.y + u.y * rb);
      const to = new THREE.Vector3(b.x - u.x * rb, y, b.y - u.y * rb);
      vehicle.add(shadows(strut(from, to, rodR, M.rod)));
    }
  }

  const upper = new THREE.Mesh(upperStageGeometry(us), P.xray ? M.ghost : M.steel);
  upper.position.y = usBaseY + P.separation;
  if (!P.xray) shadows(upper);
  vehicle.add(upper);

  // ---------- pad (static) ----------
  const pad = new THREE.Group();
  const towerCircumradius = P.towerWidth / 2 / Math.cos(half);
  // tower faces point at the boosters (room for a catch arm per booster)
  const towerOutline = regularPolygon(n, towerCircumradius, 2 * half);
  const tower = new THREE.Mesh(slabGeometry(towerOutline, [], P.towerHeight), M.tower);
  tower.position.y = P.towerHeight;
  tower.visible = P.showTower;
  pad.add(shadows(tower));

  const tableOutline = roundedPolygon(n, apothem0 + TABLE_MARGIN, corner0 + TABLE_MARGIN, { arcSegs: 10, edgeSegs: 2 });
  const holes = [];
  const pitch = 2 * d * Math.sin(half);
  const exhaustR = Math.max(rb - 0.6, 0.5);
  if (pitch > 2 * exhaustR + 0.5) axes.forEach((c) => holes.push(circle(c.x, c.y, exhaustR)));
  const towerHoleR = towerCircumradius + 0.4;
  if (d - exhaustR > towerHoleR + 0.5) holes.push(regularPolygon(n, towerHoleR, 2 * half));
  const table = new THREE.Mesh(slabGeometry(tableOutline, holes, TABLE_THICKNESS), M.concrete);
  table.position.y = P.mountHeight;
  pad.add(shadows(table));

  const legH = P.mountHeight - TABLE_THICKNESS;
  for (let k = 0; k < n; k++) {
    const phi = half + 2 * half * k;
    for (const [ang, r] of [[phi, d + rb + 1.6], [phi + half, apothem0 + 0.5]]) {
      const x = r * Math.cos(ang), z = r * Math.sin(ang);
      pad.add(shadows(strut(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, legH, z), 1.1, M.concrete)));
    }
  }

  // ---------- reference single stack ----------
  const reference = new THREE.Group();
  const outerExtent = d + corner0 + TABLE_MARGIN;
  const refX = -(outerExtent + 42);
  reference.position.set(refX, 0, 0);
  reference.visible = P.showReference;
  const R = REFERENCE.diameter / 2;
  const refBooster = new THREE.Mesh(new THREE.CylinderGeometry(R, R, REFERENCE.boosterLength, 40), M.refSteel);
  refBooster.position.y = P.mountHeight + REFERENCE.boosterLength / 2;
  reference.add(shadows(refBooster));
  const shipProfile = [[R, 0], ...tangentOgive(R, REFERENCE.shipNose).map(([r, y]) => [r, y + REFERENCE.shipBarrel])];
  const ship = new THREE.Mesh(new THREE.LatheGeometry(shipProfile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)), 40), M.refSteel);
  ship.position.y = P.mountHeight + REFERENCE.boosterLength;
  reference.add(shadows(ship));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 1.2, 1.2, 8, 48), M.concrete);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = P.mountHeight - 1.2;
  reference.add(shadows(ring));
  for (let k = 0; k < 6; k++) {
    const t = (k / 6) * Math.PI * 2;
    const x = (R + 2.4) * Math.cos(t), z = (R + 2.4) * Math.sin(t);
    reference.add(shadows(strut(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, P.mountHeight - 1.2, z), 0.8, M.concrete)));
  }
  const refStackHeight = P.mountHeight + REFERENCE.boosterLength + REFERENCE.shipBarrel + REFERENCE.shipNose;

  // ---------- numbers ----------
  const usVolume = upperStageVolume(us);
  const boosterVolume = Math.PI * rb * rb * P.boosterLength;
  const refShipVolume = latheVolume(shipProfile);
  const refBoosterVolume = Math.PI * R * R * REFERENCE.boosterLength;

  const rodToTower = P.ringStyle === 'arc'
    ? d - rodR - towerCircumradius
    : d * Math.cos(half) - rodR - towerCircumradius; // tower vertices point at rod midpoints
  const checks = [
    status('Booster to tower', d - rb - P.towerWidth / 2),
    status('Tie rods to tower', rodToTower),
    status('Tower top below upper stage', usBaseY - P.towerHeight),
    status('Booster to booster', pitch - 2 * rb),
    status('Booster tops inside straight skirt', us.skirt - P.insetDepth, 0),
  ];

  return {
    vehicle, pad, reference, tower,
    layout: { refX, refStackHeight, outerExtent, stackHeight, usBaseY },
    metrics: {
      n,
      stackHeight,
      flatWidth: 2 * apothem0,
      cornerWidth: 2 * (d + corner0),
      upperHeight: P.upperHeight,
      usVolume,
      boosterVolume,
      shipMultiple: usVolume / refShipVolume,
      volumeRatio: usVolume / (n * boosterVolume),
      refVolumeRatio: refShipVolume / refBoosterVolume,
      pitch,
      checks,
    },
  };
}

function status(label, value, tight = TIGHT) {
  return { label, value, status: value < 0 ? 'bad' : value < tight ? 'warn' : 'ok' };
}

function shadows(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
