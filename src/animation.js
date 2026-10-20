// Liftoff and booster-catch sequences. Every pose is a pure function of time,
// so the timeline can be scrubbed; only smoke is integrated frame to frame.

import * as THREE from 'three';
import { yaw } from './geometry.js';

const { smoothstep, lerp, degToRad, clamp } = THREE.MathUtils;
const G = 9.81;
const UP = new THREE.Vector3(0, 1, 0);

function hash(i) {
  const h = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
}

// ---------------------------------------------------------------- design pose

export function applyDesign(built, P) {
  const { vehicle, boosters, rings, upper, tower, layout } = built;
  vehicle.position.set(0, 0, 0);
  vehicle.rotation.set(0, 0, 0);
  rings.visible = true;
  upper.visible = true;
  upper.position.y = upper.userData.homeY + P.separation;
  const off = new Float32Array(boosters[0].layout.length);
  for (const b of boosters) {
    b.group.visible = true;
    b.group.position.copy(b.home.position);
    b.group.quaternion.copy(b.home.quaternion);
    b.setThrottle(off);
    b.setFins([0, 0, 0]);
  }
  for (let k = 0; k < layout.n; k++) tower.setCarriage(k, layout.carriageParkY, 1);
}

// ---------------------------------------------------------------- liftoff

export const LIFTOFF = { release: 3.2, duration: 45 };

function liftoffMotion(t) {
  const tau = Math.max(0, t - LIFTOFF.release);
  const y = 1.25 * tau * tau + 0.018 * tau ** 3;   // ~2.5 m/s² at release, rising as propellant burns
  const v = 2.5 * tau + 0.054 * tau * tau;
  const pitch = degToRad(9) * smoothstep(tau, 14, 40);
  return { tau, y, v, pitch, x: y * Math.sin(pitch) * 0.6 };
}

function ignitionTime(k, e) {
  const ring = e.group === 'center' ? 0.15 : e.group === 'inner' ? 0.65 : 1.15 + 0.9 * e.order;
  return ring + 0.12 * k + 0.2 * hash(k * 41 + e.index);
}

export function applyLiftoff(t, built, P, scratch) {
  const { vehicle, boosters, rings, upper, tower, layout } = built;
  const m = liftoffMotion(t);
  vehicle.position.set(m.x, m.y, 0);
  vehicle.rotation.set(0, 0, -m.pitch);
  rings.visible = upper.visible = true;
  upper.position.y = upper.userData.homeY;
  let lit = 0;
  boosters.forEach((b, k) => {
    b.group.visible = true;
    b.group.position.copy(b.home.position);
    b.group.quaternion.copy(b.home.quaternion);
    b.layout.forEach((e, i) => {
      const t0 = ignitionTime(k, e);
      const s = smoothstep(t, t0, t0 + 0.35) * (t < LIFTOFF.release ? 0.9 : 1);
      scratch[i] = s;
      if (s > 0.5) lit++;
    });
    const thin = 1 + m.y / 1500; // plumes lengthen and widen as ambient pressure drops
    b.setThrottle(scratch, { length: 20 * thin, bigLength: 55 * thin, width: 1 + m.y / 3000 });
    b.setFins([0, 0, 0]);
  });
  for (let k = 0; k < layout.n; k++) tower.setCarriage(k, layout.carriageParkY, 1);

  const total = layout.n * boosters[0].layout.length;
  const towerTop = P.towerHeight;
  let label;
  if (t < LIFTOFF.release) label = `Engine start · ${lit} of ${total} Raptors`;
  else if (m.y + layout.boosterBaseY - 3 < towerTop) label = 'Liftoff';
  else if (m.y < layout.stackHeight + 40) label = 'Tower cleared';
  else label = m.pitch > degToRad(1) ? 'Pitch-over' : 'Climbing';
  return {
    label,
    clock: `T${t < LIFTOFF.release ? '−' : '+'}${Math.abs(t - LIFTOFF.release).toFixed(1)} s`,
    detail: `${Math.round(m.y)} m · ${Math.round(m.v)} m/s`,
    focus: new THREE.Vector3(m.x, layout.stackHeight * 0.5 + m.y, 0),
    altitude: m.y,
  };
}

export function liftoffCamera(t, built, out) {
  const { layout } = built;
  const m = liftoffMotion(t);
  const h = layout.stackHeight;
  const centre = new THREE.Vector3(m.x, h * 0.5 + m.y, 0);
  const ground = new THREE.Vector3(h * 1.25, 8, h * 1.6);
  const chase = new THREE.Vector3(m.x + h * 1.5, m.y + h * 0.2, h * 1.9);
  const k = smoothstep(m.tau, 7, 20);
  out.position.copy(ground).lerp(chase, k);
  out.target.copy(centre);
  out.target.y = lerp(h * 0.45, centre.y, smoothstep(m.tau, 0, 4));
  return out;
}

export function liftoffEmit(dt, t, built, P, particles, colors) {
  const { boosters, layout } = built;
  const m = liftoffMotion(t);
  const ground = Math.exp(-m.y / 70);
  if (ground < 0.02) return;
  boosters.forEach((b, k) => {
    const rate = 85 * b.thrust * ground;
    let count = rate * dt;
    const ax = layout.axes[k].x, az = layout.axes[k].y;
    const er = new THREE.Vector2(ax, az).normalize();
    while (count > 0) {
      if (Math.random() > count) break;
      count -= 1;
      const a = Math.random() * Math.PI * 2;
      const sp = 14 + Math.random() * 34;
      const dx = Math.cos(a) * 0.6 + er.x * 0.8, dz = Math.sin(a) * 0.6 + er.y * 0.8;
      const l = Math.hypot(dx, dz);
      particles.spawn(ax + (Math.random() - 0.5) * 6, 3 + Math.random() * 6, az + (Math.random() - 0.5) * 6,
        (dx / l) * sp, 1 + Math.random() * 5, (dz / l) * sp,
        { size: 7 + Math.random() * 6, grow: 4 + Math.random() * 4, life: 7 + Math.random() * 7, alpha: 0.5, color: colors.steam, buoy: 1.8 });
    }
  });
}

// ---------------------------------------------------------------- booster catch

const PHASE = { fall: 6.5, burn: 9, hover: 9, close: 2.5, wait: 3, lower: 5 };
const STAGGER = 3.5;
const FIRST = 4;
const P0 = { dr: 262, y: 1100 };
const V0 = { r: -22, y: -95 };   // ~13° off vertical, falling toward the tower
const A0 = { r: 0, y: -2 };      // near terminal velocity

export function catchDuration(n) {
  const one = PHASE.fall + PHASE.burn + PHASE.hover + PHASE.close + PHASE.wait + PHASE.lower;
  return FIRST + STAGGER * (n - 1) + one + 3;
}

function hermite(p0, v0, p1, v1, T, s) {
  const s2 = s * s, s3 = s2 * s;
  const p = (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * T * v0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * T * v1;
  const v = ((6 * s2 - 6 * s) * p0 + (3 * s2 - 4 * s + 1) * T * v0 + (-6 * s2 + 6 * s) * p1 + (3 * s2 - 2 * s) * T * v1) / T;
  const a = ((12 * s - 6) * p0 + (6 * s - 4) * T * v0 + (-12 * s + 6) * p1 + (6 * s - 2) * T * v1) / (T * T);
  return { p, v, a };
}

function plan(layout) {
  const yC = layout.yCatch + layout.hCG; // centre-of-mass height when caught
  const p0 = { r: layout.D + P0.dr, y: P0.y };
  const T = PHASE.fall;
  const p1 = { r: p0.r + V0.r * T + 0.5 * A0.r * T * T, y: p0.y + V0.y * T + 0.5 * A0.y * T * T };
  const v1 = { r: V0.r + A0.r * T, y: V0.y + A0.y * T };
  const pH = { r: layout.D + 16, y: yC + 4 };   // hover point, just outside the open arms
  const vH = { r: -1.6, y: -0.5 };
  const pC = { r: layout.D, y: yC + 1.2 };      // pins just above the arm rails
  return { p0, p1, v1, pH, vH, pC, yC };
}

/** Booster k state at its local time tau: CG (r, y), tilt (top outward +), engines. */
function boosterState(tau, pl) {
  const fallTilt = Math.atan2(-pl.v1.r, -pl.v1.y);
  const t1 = PHASE.fall, t2 = t1 + PHASE.burn, t3 = t2 + PHASE.hover, t4 = t3 + PHASE.close;
  if (tau < 0) return null;
  if (tau < t1) {
    const r = pl.p0.r + V0.r * tau + 0.5 * A0.r * tau * tau;
    const y = pl.p0.y + V0.y * tau + 0.5 * A0.y * tau * tau;
    const vr = V0.r + A0.r * tau, vy = V0.y + A0.y * tau;
    return { r, y, tilt: Math.atan2(-vr, -vy), engines: 0, level: 0, phase: 'descent', fins: 1, weight: smoothstep(tau, 0, 2.5) };
  }
  if (tau < t2) {
    const s = (tau - t1) / PHASE.burn;
    const hr = hermite(pl.p1.r, pl.v1.r, pl.pH.r, pl.vH.r, PHASE.burn, s);
    const hy = hermite(pl.p1.y, pl.v1.y, pl.pH.y, pl.vH.y, PHASE.burn, s);
    const thrustTilt = Math.atan2(hr.a, hy.a + G);
    const tilt = lerp(fallTilt, thrustTilt, smoothstep(tau - t1, 0, 1.5));
    const accel = Math.hypot(hr.a, hy.a + G);
    const thirteen = s < 0.62;
    return {
      r: hr.p, y: hy.p, tilt,
      engines: thirteen ? 13 : 3,
      level: thirteen ? clamp(accel / (2.2 * G), 0.55, 1) : clamp(accel / (1.1 * G), 0.6, 1),
      phase: 'landing burn', fins: 1 - s * 0.6, weight: 1,
    };
  }
  if (tau < t3) {
    const s = (tau - t2) / PHASE.hover;
    const hr = hermite(pl.pH.r, pl.vH.r, pl.pC.r, 0, PHASE.hover, s);
    const hy = hermite(pl.pH.y, pl.vH.y, pl.pC.y, 0, PHASE.hover, s);
    const tilt = Math.atan2(hr.a, hy.a + G) + degToRad(0.4) * Math.sin(tau * 1.7);
    return { r: hr.p, y: hy.p, tilt, engines: 3, level: 0.8, phase: 'hovering into the arms', fins: 0.3, weight: 1 - 0.6 * s };
  }
  if (tau < t4) {
    const c = tau - t3;
    const y = pl.pC.y - 1.2 * smoothstep(c, 0.8, 2.4);
    return { r: pl.pC.r, y, tilt: 0, engines: 3, level: 0.75 * (1 - smoothstep(c, 1.5, 2.3)), phase: 'arms closing', fins: 0, close: smoothstep(c, 0, 2), weight: 0.4 * (1 - c / PHASE.close) };
  }
  const c = tau - t4;
  const drop = 3 * smoothstep(c, PHASE.wait, PHASE.wait + PHASE.lower);
  return { r: pl.pC.r, y: pl.yC - drop, tilt: 0, engines: 0, level: 0, phase: drop > 0.01 && drop < 2.99 ? 'lowering' : 'caught', fins: 0, close: 1, drop, weight: 0 };
}

const ENGINE_SETS = { 0: () => false, 3: (e) => e.group === 'center', 13: (e) => e.group !== 'outer' };

export function applyCatch(t, built, P, scratch) {
  const { vehicle, boosters, rings, upper, tower, layout } = built;
  vehicle.position.set(0, 0, 0);
  vehicle.rotation.set(0, 0, 0);
  rings.visible = false;   // tie rods are jettisoned at separation
  upper.visible = false;
  const pl = plan(layout);
  const rise = smoothstep(t, 0, 6);
  const q = new THREE.Quaternion();
  const tiltQ = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const states = [];

  boosters.forEach((b, k) => {
    const phi = layout.angles[k];
    const tau = t - (FIRST + STAGGER * k);
    const s = boosterState(tau, pl);
    states.push(s);
    let carriageY = lerp(layout.carriageParkY, layout.carriageCatchY, rise);
    let open = 1;
    if (!s) {
      b.group.visible = false;
      b.setThrottle(scratch.fill(0));
    } else {
      b.group.visible = true;
      // pose: rotate about the CG; tilt is about the booster's tangential axis
      tiltQ.setFromAxisAngle(axis.set(0, 0, 1), -s.tilt);
      q.copy(yaw(phi)).multiply(tiltQ);
      const cg = new THREE.Vector3(s.r * Math.cos(phi), s.y, s.r * Math.sin(phi));
      const axisDir = UP.clone().applyQuaternion(q);
      b.group.position.copy(cg).addScaledVector(axisDir, -layout.hCG);
      b.group.quaternion.copy(q);
      const on = ENGINE_SETS[s.engines];
      b.layout.forEach((e, i) => { scratch[i] = on(e) ? s.level : 0; });
      b.setThrottle(scratch, { length: s.engines === 13 ? 30 : 24, bigLength: 34, width: 1.25 });
      const w = s.fins * degToRad(7);
      b.setFins([w * Math.sin(t * 2.1 + k), w * Math.sin(t * 1.7 + k + 1), w * Math.sin(t * 1.9 + k + 2)]);
      if (s.close !== undefined) open = 1 - s.close;
      if (s.drop) carriageY -= s.drop;
    }
    tower.setCarriage(k, carriageY, open);
  });

  const caught = states.filter((s) => s && (s.phase === 'caught' || s.phase === 'lowering')).length;
  const active = states
    .map((s, k) => (s && s.phase !== 'caught' && s.phase !== 'lowering' ? `B${k + 1} ${s.phase}` : null))
    .filter(Boolean);
  const label = [`Caught ${caught} of ${layout.n}`, ...active.slice(0, 2)].join(' · ');
  const lead = states.find((s) => s && s.phase !== 'caught' && s.phase !== 'lowering');
  return {
    label,
    clock: `T+${t.toFixed(1)} s`,
    detail: lead ? `${Math.round(lead.y - layout.hCG)} m` : caught === layout.n ? 'all boosters home' : 'boosters inbound',
    focus: new THREE.Vector3(0, layout.stackHeight * 0.45, 0),
    states,
  };
}

// Frames the tower plus every booster still in flight. Weights ramp in and out
// with each booster's phase, so the shot stays continuous while scrubbing.
export function catchCamera(t, built, out, states) {
  const { layout } = built;
  const h = layout.stackHeight;
  const pts = [[new THREE.Vector3(0, h * 0.4, 0), 1.6]];
  states.forEach((s, k) => {
    if (!s || s.weight < 0.01) return;
    const phi = layout.angles[k];
    pts.push([new THREE.Vector3(s.r * Math.cos(phi), s.y, s.r * Math.sin(phi)), s.weight]);
  });
  const wsum = pts.reduce((a, [, w]) => a + w, 0);
  out.target.set(0, 0, 0);
  for (const [p, w] of pts) out.target.addScaledVector(p, w / wsum);
  const spread = Math.sqrt(pts.reduce((a, [p, w]) => a + w * p.distanceToSquared(out.target), 0) / wsum);
  const dist = clamp(spread * 3 + h * 0.6, h * 1.45, 2800);
  // look up at boosters high in the sky, level out as they come home
  const elev = lerp(-0.3, 0.12, smoothstep(out.target.y, h * 2.2, h * 0.6));
  const az = layout.angles[0] + Math.PI + 0.55 + t * 0.004; // first booster arrives from across the tower
  out.position.set(
    out.target.x + dist * Math.cos(elev) * Math.cos(az),
    Math.max(6, out.target.y + dist * Math.sin(elev)),
    out.target.z + dist * Math.cos(elev) * Math.sin(az),
  );
  return out;
}

export function catchEmit(dt, t, built, particles, colors, states) {
  const { boosters, layout } = built;
  boosters.forEach((b, k) => {
    const s = states[k];
    if (!s || !b.thrust) return;
    const floor = s.r < layout.outerExtent ? layout.boosterBaseY + 0.5 : 1; // table or open ground
    const ground = Math.exp(-(b.group.position.y - floor) / 40);
    let count = 480 * b.thrust * ground * dt;
    const phi = layout.angles[k];
    const cx = b.group.position.x, cz = b.group.position.z;
    while (count > 0) {
      if (Math.random() > count) break;
      count -= 1;
      const a = Math.random() * Math.PI * 2;
      const sp = 8 + Math.random() * 22;
      particles.spawn(cx + (Math.random() - 0.5) * 4, floor + Math.random() * 2, cz + (Math.random() - 0.5) * 4,
        Math.cos(a) * sp + Math.cos(phi) * 4, 1 + Math.random() * 3, Math.sin(a) * sp + Math.sin(phi) * 4,
        { size: 5 + Math.random() * 4, grow: 3 + Math.random() * 3, life: 4 + Math.random() * 4, alpha: 0.4, color: colors.dust, buoy: 1.2 });
    }
  });
}

/** Glow sources for smoke lighting: one per firing booster, under its engines. */
export function glowSources(built, color) {
  const out = [];
  const v = new THREE.Vector3();
  for (const b of built.boosters) {
    if (!b.group.visible || b.thrust < 0.01) continue;
    b.light.getWorldPosition(v);
    out.push({ x: v.x, y: v.y, z: v.z, intensity: 0.9 * Math.sqrt(b.thrust), radius: 40, color });
  }
  return out;
}
