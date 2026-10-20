// Assembles the multi-booster configuration from parameters and derives the
// numbers that matter at this stage: sizes, volumes, nose drag and clearances.

import * as THREE from 'three';
import {
  latheVolume, roundedPolygonArea, strut, tangentOgive, upperStageVolume, yaw,
} from './geometry.js';
import { BOOSTER, boosterKit, makeBooster } from './parts/booster.js';
import { buildUpperStage } from './parts/upperStage.js';
import { buildTower } from './parts/tower.js';
import { buildPad, TABLE } from './parts/pad.js';

// Today's single-stack Starship (V2-class), used for scale and for ratios.
export const REFERENCE = { diameter: 9, boosterLength: 71, shipBarrel: 39, shipNose: 13 };

const TIGHT = 3;          // clearances under this many metres are flagged as tight
const CATCH_LIFT = 3;     // boosters are caught this far above the table, then lowered

export function buildConfiguration(P, M) {
  const n = P.boosterCount;
  const half = Math.PI / n;
  const R = P.boosterDiameter / 2;
  const D = P.clusterRadius;
  const angles = Array.from({ length: n }, (_, k) => half + 2 * half * k); // n = 4 → diagonals
  const axes = angles.map((phi) => new THREE.Vector2(D * Math.cos(phi), D * Math.sin(phi)));

  // Upper-stage corners are concentric with the booster axes, so each booster
  // top nests inside one rounded corner.
  const corner0 = R + P.cornerGap;
  const apothem0 = D * Math.cos(half) + corner0;
  const us = {
    n, apothem0, corner0,
    height: P.upperHeight,
    skirt: Math.min(P.skirtHeight, P.upperHeight - 1),
    haackC: P.haackC,
    tipRounding: P.tipRounding,
    roundingCurve: P.roundingCurve,
  };

  const boosterBaseY = P.mountHeight;
  const boosterTopY = boosterBaseY + P.boosterLength;
  const usBaseY = boosterTopY - P.insetDepth;
  const stackHeight = usBaseY + P.upperHeight;
  const towerCircumradius = P.towerWidth / 2 / Math.cos(half);
  const layout = {
    n, half, D, R, angles, axes, apothem0, corner0, towerCircumradius,
    boosterBaseY, usBaseY, stackHeight,
    outerExtent: D + corner0 + TABLE.margin,
  };

  // ---------- vehicle ----------
  const vehicle = new THREE.Group();
  const kit = boosterKit(P);
  const boosters = angles.map((phi, k) => {
    const b = makeBooster(kit, M);
    b.home = { position: new THREE.Vector3(axes[k].x, boosterBaseY, axes[k].y), quaternion: yaw(phi) };
    b.group.position.copy(b.home.position);
    b.group.quaternion.copy(b.home.quaternion);
    vehicle.add(b.group);
    return b;
  });

  const rings = new THREE.Group();
  const rodR = P.rodDiameter / 2;
  const ringYs = [boosterBaseY + P.bottomRingHeight, usBaseY - P.topRingDrop]
    .map((y) => THREE.MathUtils.clamp(y, boosterBaseY + rodR, usBaseY - rodR));
  for (const y of ringYs) {
    if (P.ringStyle === 'arc') {
      const torus = new THREE.Mesh(new THREE.TorusGeometry(D, rodR, 10, 200), M.rod);
      torus.rotation.x = Math.PI / 2;
      torus.position.y = y;
      torus.castShadow = true;
      rings.add(torus);
      continue;
    }
    for (let k = 0; k < n; k++) {
      const a = axes[k];
      const b = axes[(k + 1) % n];
      const u = new THREE.Vector2().subVectors(b, a);
      if (u.length() <= 2 * R) continue; // boosters touch or overlap: nothing to bridge
      u.normalize();
      const rod = strut(new THREE.Vector3(a.x + u.x * R, y, a.y + u.y * R), new THREE.Vector3(b.x - u.x * R, y, b.y - u.y * R), rodR, M.rod, 12);
      rod.castShadow = true;
      rings.add(rod);
    }
  }
  vehicle.add(rings);

  const upperBuilt = buildUpperStage(us, P, M, layout);
  const upper = upperBuilt.group;
  upper.userData.homeY = usBaseY;
  vehicle.add(upper);

  // ---------- pad and tower ----------
  const pad = buildPad(P, M, layout);
  const tower = buildTower(P, M, layout);
  tower.group.visible = P.showTower;
  pad.add(tower.group);

  const yCatch = boosterBaseY + CATCH_LIFT;
  layout.yCatch = yCatch;
  layout.catchLift = CATCH_LIFT;
  layout.hCG = BOOSTER.hCG;
  layout.carriageCatchY = yCatch + kit.pinH - 0.32 - tower.armTop;
  layout.carriageParkY = boosterBaseY + 3.5;

  // ---------- reference single stack ----------
  const reference = new THREE.Group();
  const refX = -(layout.outerExtent + 42);
  reference.position.set(refX, 0, 0);
  const RR = REFERENCE.diameter / 2;
  const refBooster = new THREE.Mesh(new THREE.CylinderGeometry(RR, RR, REFERENCE.boosterLength, 40), M.refSteel);
  refBooster.position.y = P.mountHeight + REFERENCE.boosterLength / 2;
  reference.add(refBooster);
  const shipProfile = [[RR, 0], ...tangentOgive(RR, REFERENCE.shipNose).map(([r, y]) => [r, y + REFERENCE.shipBarrel])];
  const ship = new THREE.Mesh(new THREE.LatheGeometry(shipProfile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)), 40), M.refSteel);
  ship.position.y = P.mountHeight + REFERENCE.boosterLength;
  reference.add(ship);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RR + 1.2, 1.2, 8, 48), M.concrete);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = P.mountHeight - 1.2;
  reference.add(ring);
  for (let k = 0; k < 6; k++) {
    const t = (k / 6) * Math.PI * 2;
    const x = (RR + 2.4) * Math.cos(t), z = (RR + 2.4) * Math.sin(t);
    reference.add(strut(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, P.mountHeight - 1.2, z), 0.8, M.concrete));
  }
  reference.traverse((o) => { o.castShadow = o.receiveShadow = true; });
  const refStackHeight = P.mountHeight + REFERENCE.boosterLength + REFERENCE.shipBarrel + REFERENCE.shipNose;
  Object.assign(layout, { refX, refStackHeight });

  // ---------- numbers ----------
  const usVolume = upperStageVolume(us);
  const boosterVolume = Math.PI * R * R * P.boosterLength;
  const refShipVolume = latheVolume(shipProfile);
  const refBoosterVolume = Math.PI * RR * RR * REFERENCE.boosterLength;

  // Slender-body wave drag of a von Kármán nose: CD ≈ (D/L)² on base area.
  const baseArea = roundedPolygonArea(n, apothem0, corner0);
  const dEq = Math.sqrt((4 * baseArea) / Math.PI);
  const fineness = (us.height - us.skirt) / dEq;
  const waveIndex = 1 / (fineness * fineness);
  const refArea = Math.PI * RR * RR;
  const refIndex = (REFERENCE.diameter / REFERENCE.shipNose) ** 2;
  const dragPerBooster = (waveIndex * baseArea) / n / (refIndex * refArea);

  const rodToTower = P.ringStyle === 'arc'
    ? D - rodR - towerCircumradius
    : D * Math.cos(half) - rodR - towerCircumradius; // tower vertices point at rod midpoints
  const checks = [
    status('Booster to tower', D - R - P.towerWidth / 2),
    status('Tie rods to tower', rodToTower),
    status('Tower top to upper-stage engines', usBaseY - upperBuilt.engineDropOverTower - P.towerHeight),
    status('Booster to booster', 2 * D * Math.sin(half) - 2 * R),
    status('Catch arms under tower top', P.towerHeight - (layout.carriageCatchY + 1.6)),
    status('Parked arms under bottom ring', ringYs[0] - rodR - (layout.carriageParkY + 1.6)),
    status('Booster tops inside skirt', us.skirt - P.insetDepth, 0),
  ];

  return {
    vehicle, pad, reference, tower, boosters, rings, upper, layout,
    metrics: {
      n,
      stackHeight,
      flatWidth: 2 * apothem0,
      cornerWidth: 2 * (D + corner0),
      usVolume,
      shipMultiple: usVolume / refShipVolume,
      volumeRatio: usVolume / (n * boosterVolume),
      refVolumeRatio: refShipVolume / refBoosterVolume,
      fineness,
      waveIndex,
      refIndex,
      dragPerBooster,
      checks,
    },
  };
}

function status(label, value, tight = TIGHT) {
  return { label, value, status: value < 0 ? 'bad' : value < tight ? 'warn' : 'ok' };
}
