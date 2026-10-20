// Pure shape generators. Units are metres, world is Y-up.
// 2D outlines are arrays of [x, z] points in the ground plane, counter-clockwise
// (increasing angle from +X toward +Z).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Outline of the convex hull of `n` circles of radius `r` whose centres sit on a
 * regular n-gon: a "rounded polygon". For n = 4 this is a rounded square.
 * `apothem` is centre → flat-edge distance. Corner k is centred at angle
 * phase + 2πk/n, so with the default phase the n = 4 square has axis-aligned edges.
 */
export function roundedPolygon(n, apothem, r, { phase = Math.PI / n, arcSegs = 12, edgeSegs = 8 } = {}) {
  r = THREE.MathUtils.clamp(r, 0, apothem);
  const half = Math.PI / n;
  const centreDist = (apothem - r) / Math.cos(half);
  const pts = [];
  for (let k = 0; k < n; k++) {
    const phi = phase + 2 * half * k;
    const cx = centreDist * Math.cos(phi);
    const cz = centreDist * Math.sin(phi);
    for (let i = 0; i < arcSegs; i++) {
      const t = phi - half + (2 * half * i) / arcSegs;
      pts.push([cx + r * Math.cos(t), cz + r * Math.sin(t)]);
    }
    // straight edge to the next corner; its outward normal points at phi + half
    const nphi = phi + 2 * half;
    const en = phi + half;
    const sx = cx + r * Math.cos(en), sz = cz + r * Math.sin(en);
    const ex = centreDist * Math.cos(nphi) + r * Math.cos(en);
    const ez = centreDist * Math.sin(nphi) + r * Math.sin(en);
    for (let i = 0; i < edgeSegs; i++) {
      const t = i / edgeSegs;
      pts.push([sx + (ex - sx) * t, sz + (ez - sz) * t]);
    }
  }
  return pts;
}

/** Area of the rounded polygon above: n-gon + edge strips + one full circle. */
export function roundedPolygonArea(n, apothem, r) {
  r = THREE.MathUtils.clamp(r, 0, apothem);
  const d = (apothem - r) / Math.cos(Math.PI / n);
  const polygon = 0.5 * n * d * d * Math.sin((2 * Math.PI) / n);
  const perimeter = 2 * n * d * Math.sin(Math.PI / n);
  return polygon + perimeter * r + Math.PI * r * r;
}

/**
 * Loft through same-length rings stacked at heights `ys`.
 * `wrap` closes each ring back to its first point; pass false when the rings
 * already repeat their first point (a UV seam), and the seam normals are welded.
 * `uv(i, j)` returns texture coordinates for ring i, point j.
 */
export function loftGeometry(rings, ys, { tipY = null, capBottom = false, wrap = true, uv = null } = {}) {
  const n = rings[0].length;
  const segs = wrap ? n : n - 1;
  const pos = [];
  const uvs = [];
  const idx = [];
  rings.forEach((ring, i) => ring.forEach(([x, z], j) => {
    pos.push(x, ys[i], z);
    uvs.push(...(uv ? uv(i, j) : [j / n, ys[i]]));
  }));
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * n + j;
      const b = i * n + ((j + 1) % n);
      const c = (i + 1) * n + ((j + 1) % n);
      const d = (i + 1) * n + j;
      idx.push(a, c, b, a, d, c);
    }
  }
  if (tipY != null) {
    const last = (rings.length - 1) * n;
    const tip = pos.length / 3;
    pos.push(0, tipY, 0);
    uvs.push(uvs[last * 2], tipY);
    for (let j = 0; j < segs; j++) idx.push(last + j, tip, last + ((j + 1) % n));
  }
  if (capBottom) {
    const base = pos.length / 3;
    pos.push(0, ys[0], 0);
    uvs.push(0, 0);
    rings[0].forEach(([x, z]) => { pos.push(x, ys[0], z); uvs.push(x, z); });
    for (let j = 0; j < segs; j++) idx.push(base, base + 1 + j, base + 1 + ((j + 1) % n));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (!wrap) {
    const nrm = g.attributes.normal;
    const v = new THREE.Vector3();
    for (let i = 0; i < rings.length; i++) {
      const a = i * n, b = i * n + n - 1;
      v.set(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
      nrm.setXYZ(a, v.x, v.y, v.z);
      nrm.setXYZ(b, v.x, v.y, v.z);
    }
  }
  return g;
}

/**
 * Haack-series nose radius as a fraction of base radius, t = 0 at the base and
 * 1 at the tip. C = 0 is the von Kármán ogive (minimum wave drag for a given
 * length and base area); C = 1/3 is the fuller LV-Haack. Tangent to the base.
 */
export function haack(t, C) {
  const theta = Math.acos(THREE.MathUtils.clamp(2 * t - 1, -1, 1));
  return Math.sqrt(Math.max(theta - Math.sin(2 * theta) / 2 + C * Math.sin(theta) ** 3, 0) / Math.PI);
}

/**
 * Upper-stage cross-section at height y above its base: a straight skirt where
 * the booster tops sit, then a Haack nose. Corner radius as a fraction of
 * half-width grows from its base value toward a circle along t^roundingCurve.
 */
export function upperStageSection(p, y) {
  const { apothem0: a0, corner0: r0, height: H, skirt } = p;
  if (y <= skirt) return { a: a0, r: r0 };
  const t = Math.min((y - skirt) / (H - skirt), 1);
  const f = haack(t, p.haackC);
  const k0 = r0 / a0;
  const kTop = k0 + p.tipRounding * (1 - k0);
  const k = k0 + (kTop - k0) * Math.pow(t, p.roundingCurve);
  return { a: a0 * f, r: k * a0 * f };
}

export function upperStageVolume(p, steps = 600) {
  let v = 0;
  let prev = areaAt(p, 0);
  for (let i = 1; i <= steps; i++) {
    const y = (p.height * i) / steps;
    const cur = areaAt(p, y);
    v += 0.5 * (prev + cur) * (p.height / steps);
    prev = cur;
  }
  return v;
}

function areaAt(p, y) {
  const { a, r } = upperStageSection(p, y);
  return roundedPolygonArea(p.n, a, r);
}

/** Radius profile [r, y] of a tangent ogive nose of base radius R and length L. */
export function tangentOgive(R, L, steps = 24) {
  const rho = (R * R + L * L) / (2 * R);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = (L * i) / steps; // distance from the base of the nose
    pts.push([Math.sqrt(rho * rho - x * x) + R - rho, x]);
  }
  return pts;
}

/** Volume of a solid of revolution from an [r, y] profile with increasing y. */
export function latheVolume(profile) {
  let v = 0;
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1];
    const [r1, y1] = profile[i];
    v += (Math.PI * (y1 - y0) * (r0 * r0 + r0 * r1 + r1 * r1)) / 3;
  }
  return v;
}

/** Cylinder mesh between two points (tie rods, pad legs). */
export function strut(from, to, radius, material, radialSegs = 8) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, radialSegs), material);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

/** Box geometry spanning a → b with a w × d cross-section (lattice members). */
export function boxBetween(a, b, w, d = w) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(w, dir.length(), d);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

export function boxAt(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** Merge indexed geometries and free the inputs. */
export function merge(parts) {
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

export function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

/** Horizontal slab from a 2D outline (with optional holes), top face at y = 0. */
export function slabGeometry(outline, holes, thickness) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(Math.PI / 2); // shape (x, y) → world (x, z); extrusion runs downward
  return g;
}

export function circle(cx, cz, r, segs = 40) {
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const t = (2 * Math.PI * i) / segs;
    pts.push([cx + r * Math.cos(t), cz + r * Math.sin(t)]);
  }
  return pts;
}

export function regularPolygon(n, circumradius, phase = 0) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const t = phase + (2 * Math.PI * k) / n;
    pts.push([circumradius * Math.cos(t), circumradius * Math.sin(t)]);
  }
  return pts;
}

/** Orientation that turns local +X toward world angle phi (around +Y). */
export function yaw(phi) {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -phi);
}
