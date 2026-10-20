// Pure shape generators. Units are metres, world is Y-up.
// 2D outlines are arrays of [x, z] points in the ground plane, counter-clockwise
// (increasing angle from +X toward +Z).

import * as THREE from 'three';

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
 * Closed loft through same-length rings stacked at heights `ys`.
 * Flat bottom cap; the top closes to a single tip vertex at `tipY`.
 */
export function loftGeometry(rings, ys, tipY) {
  const n = rings[0].length;
  const pos = [];
  const idx = [];
  rings.forEach((ring, i) => ring.forEach(([x, z]) => pos.push(x, ys[i], z)));
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j;
      const b = i * n + ((j + 1) % n);
      const c = (i + 1) * n + ((j + 1) % n);
      const d = (i + 1) * n + j;
      idx.push(a, c, b, a, d, c);
    }
  }
  const last = (rings.length - 1) * n;
  const tip = pos.length / 3;
  pos.push(0, tipY, 0);
  for (let j = 0; j < n; j++) idx.push(last + j, tip, last + ((j + 1) % n));

  // bottom cap gets its own vertices so its normals stay flat
  const base = pos.length / 3;
  pos.push(0, ys[0], 0);
  rings[0].forEach(([x, z]) => pos.push(x, ys[0], z));
  for (let j = 0; j < n; j++) idx.push(base, base + 1 + j, base + 1 + ((j + 1) % n));

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Upper-stage cross-section at height y above its base.
 * Vertical skirt (where the booster tops sit), then a taper whose flat-edge
 * half-width follows a0 · (1 − t^shoulder)^(1/tipBluntness): tangent to the skirt at
 * t = 0, closed at t = 1. Corner radius as a fraction of half-width grows from its
 * base value toward a full circle (tipRounding = 1) along t^roundingCurve.
 */
export function upperStageSection(p, y) {
  const { apothem0: a0, corner0: r0, height: H, skirt } = p;
  if (y <= skirt) return { a: a0, r: r0 };
  const t = Math.min((y - skirt) / (H - skirt), 1);
  const f = Math.pow(Math.max(1 - Math.pow(t, p.shoulder), 0), 1 / p.tipBluntness);
  const k0 = r0 / a0;
  const kTop = k0 + p.tipRounding * (1 - k0);
  const k = k0 + (kTop - k0) * Math.pow(t, p.roundingCurve);
  return { a: a0 * f, r: k * a0 * f };
}

export function upperStageGeometry(p, { rings: ringCount = 72, arcSegs = 12, edgeSegs = 8 } = {}) {
  const ys = [0];
  if (p.skirt > 0.01) ys.push(p.skirt);
  for (let i = 1; i < ringCount; i++) {
    const t = 1 - Math.pow(1 - i / ringCount, 1.6); // denser toward the tip
    ys.push(p.skirt + t * (p.height - p.skirt));
  }
  const rings = ys.map((y) => {
    const { a, r } = upperStageSection(p, y);
    return roundedPolygon(p.n, a, r, { arcSegs, edgeSegs });
  });
  return loftGeometry(rings, ys, p.height);
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

/** Cylinder between two points (used for tie rods and pad legs). */
export function strut(from, to, radius, material, radialSegs = 8) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, radialSegs), material);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
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
