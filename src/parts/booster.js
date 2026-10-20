// Detailed Super Heavy-class booster. Local frame: origin at the base centre,
// +Y up the axis, +X radially away from the tower, +Z tangential.

import * as THREE from 'three';
import { boxAt, merge, scaleUV } from '../geometry.js';
import { STEEL_PATCH } from '../textures.js';
import { plumeGeometry, plumeMaterial } from '../effects.js';
import { boosterEngineLayout, raptorExitY, raptorGeometry } from './raptor.js';

export const BOOSTER = {
  aftH: 3.2,     // soot-darkened engine bay band
  ventH: 2.4,    // vented interstage ring at the top
  finDrop: 4.4,  // grid-fin centreline below the top
  hCG: 26,       // empty-booster centre of mass above the base
};
// Three V3-style grid fins: outward and ±60°, so the tower side stays clear for the arms.
const FIN_ANGLES = [0, Math.PI / 3, -Math.PI / 3];
const EXIT_Y = raptorExitY();

/** Grid fin: diamond lattice in a frame, extending along +X from the hinge. */
export function gridFinGeometry({ span = 4.2, width = 3.4, depth = 0.85, cell = 0.5, t = 0.06 } = {}) {
  const x0 = 0.45, x1 = span;
  const z0 = -width / 2, z1 = width / 2;
  const f = 0.16;
  const parts = [
    boxAt(x1 - x0, depth, f, (x0 + x1) / 2, 0, z0),
    boxAt(x1 - x0, depth, f, (x0 + x1) / 2, 0, z1),
    boxAt(f, depth, width, x0, 0, 0),
    boxAt(f, depth, width, x1, 0, 0),
  ];
  for (const sgn of [1, -1]) {
    for (let c = -(x1 + width); c <= x1 + width; c += cell) {
      const lo = sgn > 0 ? c + z0 : c - z1;
      const hi = sgn > 0 ? c + z1 : c - z0;
      const xa = Math.max(x0, lo), xb = Math.min(x1, hi);
      if (xb - xa < 0.08) continue;
      const az = sgn * (xa - c), bz = sgn * (xb - c);
      const len = Math.hypot(xb - xa, bz - az);
      const g = new THREE.BoxGeometry(len, depth, t);
      g.rotateY(-Math.atan2(bz - az, xb - xa));
      g.translate((xa + xb) / 2, 0, (az + bz) / 2);
      parts.push(g);
    }
  }
  return merge(parts);
}

/** Geometry shared by every booster in one build. */
export function boosterKit(P) {
  const R = P.boosterDiameter / 2;
  const L = P.boosterLength;
  const { aftH, ventH } = BOOSTER;
  const bodyLen = L - aftH - ventH;
  const circ = 2 * Math.PI * R;

  const aft = new THREE.CylinderGeometry(R + 0.03, R + 0.03, aftH, 64, 1, true);
  aft.translate(0, aftH / 2, 0);
  scaleUV(aft, circ / STEEL_PATCH.w, aftH / STEEL_PATCH.h);

  const body = new THREE.CylinderGeometry(R, R, bodyLen, 64, 1, true);
  body.translate(0, aftH + bodyLen / 2, 0);
  scaleUV(body, circ / STEEL_PATCH.w, bodyLen / STEEL_PATCH.h);

  const vent = new THREE.CylinderGeometry(R + 0.06, R + 0.06, ventH, 64, 1, true);
  vent.translate(0, L - ventH / 2, 0);

  const dome = new THREE.SphereGeometry(R - 0.15, 48, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.32, 1);
  dome.translate(0, L - ventH + 0.15, 0);

  const shield = new THREE.CircleGeometry(R, 64);
  shield.rotateX(Math.PI / 2);
  shield.translate(0, 0.02, 0);

  // two raceways and a conduit on the tower-facing half
  const raceLen = L - aftH - ventH - 3;
  const raceways = merge([[0.75, 0.34, Math.PI * 0.82], [0.75, 0.34, -Math.PI * 0.82], [0.35, 0.22, Math.PI * 0.62]].map(([w, d, a]) => {
    const g = new THREE.BoxGeometry(d, raceLen, w);
    g.translate(R + d / 2 - 0.05, aftH + 1 + raceLen / 2, 0);
    g.rotateY(-a);
    return g;
  }));

  // catch pins on both tangential sides, with backing plates
  const pinH = Math.min(P.catchPinHeight, L - BOOSTER.finDrop - 3);
  const pins = merge([1, -1].flatMap((s) => {
    const pin = new THREE.CylinderGeometry(0.32, 0.32, 0.95, 12);
    pin.rotateX(Math.PI / 2);
    pin.translate(0, pinH, s * (R + 0.47));
    const plate = boxAt(1.5, 1.6, 0.18, 0, pinH, s * (R + 0.05));
    return [pin, plate];
  }));

  const finMount = merge([
    boxAt(0.9, 1.5, 1.3, 0.2, 0, 0),
    (() => { const c = new THREE.CylinderGeometry(0.16, 0.16, 0.6, 8); c.rotateZ(Math.PI / 2); c.translate(0.6, 0, 0); return c; })(),
  ]);

  const big = new THREE.CylinderGeometry(1, 1.9, 1, 32, 1, true);
  big.translate(0, -0.5, 0);

  return {
    R, L, pinH,
    finY: L - BOOSTER.finDrop,
    layout: boosterEngineLayout(R),
    geos: { aft, body, vent, dome, shield, raceways, pins, fin: gridFinGeometry(), finMount, engine: raptorGeometry(), plume: plumeGeometry(), big },
  };
}

export function makeBooster(kit, M) {
  const { geos, R, layout } = kit;
  const group = new THREE.Group();
  const add = (geo, mat, parent = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  add(geos.aft, M.steelAft);
  add(geos.body, M.steel);
  add(geos.vent, M.vent);
  add(geos.dome, M.steel);
  add(geos.shield, M.heatShield);
  add(geos.raceways, M.steel);
  add(geos.pins, M.fittings);

  const fins = FIN_ANGLES.map((a) => {
    const mount = new THREE.Group();
    mount.position.set(R * Math.cos(a), kit.finY, R * Math.sin(a));
    mount.rotation.y = -a;
    add(geos.finMount, M.fittings, mount);
    const hinge = new THREE.Group();
    add(geos.fin, M.fin, hinge);
    mount.add(hinge);
    group.add(mount);
    return hinge;
  });

  const engines = new THREE.InstancedMesh(geos.engine, M.engine, layout.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  layout.forEach((e, i) => {
    q.setFromAxisAngle(up, -e.a);
    engines.setMatrixAt(i, m4.compose(new THREE.Vector3(e.x, 0, e.z), q, new THREE.Vector3(1, 1, 1)));
  });
  engines.castShadow = true;
  group.add(engines);

  const plumeMat = plumeMaterial();
  const bigMat = plumeMaterial({ core: '#ffcf8f', outer: '#ff5c14', intensity: 0.5 });
  const plumes = new THREE.InstancedMesh(geos.plume, plumeMat, layout.length);
  plumes.frustumCulled = false;
  plumes.userData.ownsMaterial = true;
  group.add(plumes);
  const big = new THREE.Mesh(geos.big, bigMat);
  big.position.y = EXIT_Y + 0.3;
  big.frustumCulled = false;
  big.userData.ownsMaterial = true;
  group.add(big);

  const light = new THREE.PointLight(0xffa860, 0, 0, 2);
  light.position.y = -10;
  group.add(light);

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const ident = new THREE.Quaternion();

  return {
    group, engines, plumes, big, light, fins, layout,
    thrust: 0,
    /** levels: per-engine throttle 0..1; plume lengths in metres. */
    setThrottle(levels, { length = 18, bigLength = 40, width = 1 } = {}) {
      let sum = 0;
      for (let i = 0; i < layout.length; i++) {
        const s = levels[i];
        sum += s;
        if (s < 0.01) { plumes.setMatrixAt(i, zero); continue; }
        const e = layout[i];
        const r = 0.6 * (1 + 0.25 * s) * width;
        pos.set(e.x, EXIT_Y, e.z);
        scl.set(r, length * (0.5 + 0.5 * s), r);
        plumes.setMatrixAt(i, m4.compose(pos, ident, scl));
      }
      plumes.instanceMatrix.needsUpdate = true;
      const frac = sum / layout.length;
      this.thrust = frac;
      big.visible = frac > 0.02;
      if (big.visible) {
        const w = R * (0.35 + 0.6 * Math.sqrt(frac)) * width;
        big.scale.set(w, bigLength * Math.sqrt(frac), w);
        bigMat.uniforms.uIntensity.value = 0.18 + 0.4 * frac;
      }
      light.intensity = 4000 * Math.pow(frac, 0.7);
    },
    setFins(angles) {
      fins.forEach((h, i) => { h.rotation.x = angles[i] ?? 0; });
    },
  };
}
