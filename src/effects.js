// Engine plumes (additive cones) and a CPU smoke/steam particle system.

import * as THREE from 'three';

// Shared clock so every plume flickers in step.
export const plumeTime = { value: 0 };

export function plumeMaterial({ core = '#ffe4b8', outer = '#ff7024', intensity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: plumeTime,
      uIntensity: { value: intensity },
      uCore: { value: new THREE.Color(core) },
      uOuter: { value: new THREE.Color(outer) },
    },
    vertexShader: /* glsl */ `
      varying float vT;
      varying float vFacing;
      void main() {
        vT = -position.y;
        vec4 local = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          local = instanceMatrix * local;
          n = mat3(instanceMatrix) * n;
        #endif
        vec4 mv = modelViewMatrix * local;
        vFacing = abs(dot(normalize(normalMatrix * n), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uCore;
      uniform vec3 uOuter;
      varying float vT;
      varying float vFacing;
      void main() {
        float fade = pow(clamp(1.0 - vT, 0.0, 1.0), 1.4);
        float shock = 0.78 + 0.22 * sin(vT * 42.0 - uTime * 26.0);
        float body = smoothstep(0.04, 0.85, vFacing);
        vec3 col = mix(uOuter, uCore, body * (1.0 - vT * 0.85));
        gl_FragColor = vec4(col, clamp(fade * body * shock * uIntensity, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** Unit plume: radius 1 at the nozzle (y = 0), flaring to 2.4 at y = -1. */
export function plumeGeometry(radialSegs = 18) {
  const g = new THREE.CylinderGeometry(1, 2.4, 1, radialSegs, 1, true);
  g.translate(0, -0.5, 0);
  return g;
}

/** Ring-buffer particle system drawn as soft round point sprites. */
export class Particles {
  constructor(max, sprite) {
    this.max = max;
    this.next = 0;
    this.alive = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.buoy = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr(this.pos, 3));
    geo.setAttribute('aColor', attr(this.col, 3));
    geo.setAttribute('aSize', attr(this.size, 1));
    geo.setAttribute('aAlpha', attr(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: sprite }, uScale: { value: 800 } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        uniform float uScale;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(-mv.z, 1.0);
          vAlpha = aAlpha;
          vColor = aColor;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  spawn(x, y, z, vx, vy, vz, { size = 8, grow = 5, life = 8, alpha = 0.5, color, buoy = 1.5 }) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.base.set([color.r, color.g, color.b], i * 3);
    this.age[i] = 0;
    this.life[i] = life;
    this.size0[i] = size;
    this.grow[i] = grow;
    this.alpha0[i] = alpha;
    this.buoy[i] = buoy;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
    this.alive = 0;
  }

  /** Advance by dt seconds; glow sources tint nearby particles (plume light on smoke). */
  update(dt, glow = []) {
    let alive = 0;
    const drag = Math.exp(-0.7 * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      const age = (this.age[i] += dt);
      if (age >= this.life[i]) { this.life[i] = 0; this.alpha[i] = 0; continue; }
      alive++;
      const o = i * 3;
      this.vel[o] *= drag;
      this.vel[o + 2] *= drag;
      this.vel[o + 1] = this.vel[o + 1] * drag + this.buoy[i] * dt;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] = Math.max(this.pos[o + 1] + this.vel[o + 1] * dt, 0.5);
      this.pos[o + 2] += this.vel[o + 2] * dt;
      const u = age / this.life[i];
      this.size[i] = this.size0[i] + this.grow[i] * age;
      this.alpha[i] = this.alpha0[i] * Math.min(1, age / 0.4) * Math.pow(1 - u, 1.3);
      let r = this.base[o], g = this.base[o + 1], b = this.base[o + 2];
      for (const s of glow) {
        const dx = this.pos[o] - s.x, dy = this.pos[o + 1] - s.y, dz = this.pos[o + 2] - s.z;
        const k = s.intensity / (1 + (dx * dx + dy * dy + dz * dz) / (s.radius * s.radius));
        r += s.color.r * k; g += s.color.g * k; b += s.color.b * k;
      }
      this.col[o] = Math.min(r, 1.6); this.col[o + 1] = Math.min(g, 1.6); this.col[o + 2] = Math.min(b, 1.6);
    }
    this.alive = alive;
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
  }
}
