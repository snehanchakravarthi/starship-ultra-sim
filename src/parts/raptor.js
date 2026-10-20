// Low-poly Raptor engines. Origin at the heat-shield plane, nozzle hanging down -Y.

import * as THREE from 'three';
import { merge } from '../geometry.js';

/** Sea-level Raptor by default (~1.3 m exit, ~2.6 m below the shield). */
export function raptorGeometry({ exitR = 0.62, bellLen = 1.95, chamberR = 0.32, segs = 16 } = {}) {
  const throatY = -0.62;
  const pts = [
    new THREE.Vector2(chamberR * 0.6, 0.02),
    new THREE.Vector2(chamberR, -0.06),
    new THREE.Vector2(chamberR, -0.42),
    new THREE.Vector2(0.2, throatY),
  ];
  for (let i = 1; i <= 10; i++) {
    const s = i / 10;
    pts.push(new THREE.Vector2(0.2 + (exitR - 0.2) * Math.pow(s, 0.62), throatY - bellLen * s));
  }
  const parts = [new THREE.LatheGeometry(pts, segs)];
  for (const sx of [-1, 1]) { // turbopumps
    const c = new THREE.CylinderGeometry(0.13, 0.15, 0.55, 8);
    c.translate(sx * (chamberR + 0.11), -0.3, 0);
    parts.push(c);
  }
  const manifold = new THREE.TorusGeometry(chamberR + 0.04, 0.05, 6, 16);
  manifold.rotateX(Math.PI / 2);
  manifold.translate(0, -0.12, 0);
  parts.push(manifold);
  return merge(parts);
}

export function raptorExitY(bellLen = 1.95) {
  return -(0.62 + bellLen);
}

/** Super Heavy pattern: 3 centre, 10 inner ring, 20 outer ring, for a 4.5 m radius. */
export function boosterEngineLayout(radius) {
  const s = radius / 4.5;
  const out = [];
  const ring = (count, r, phase, group) => {
    for (let i = 0; i < count; i++) {
      const a = phase + (2 * Math.PI * i) / count;
      out.push({ x: r * s * Math.cos(a), z: r * s * Math.sin(a), a, group, order: i / count, index: out.length });
    }
  };
  ring(3, 0.78, Math.PI / 2, 'center');
  ring(10, 2.2, 0, 'inner');
  ring(20, 3.85, Math.PI / 20, 'outer');
  return out;
}
