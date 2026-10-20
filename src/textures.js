// Procedural canvas textures. Geometry carries UVs in metres divided by each
// patch size below, so every texture keeps repeat = 1 and can be shared.

import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function finish(c, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// One stainless sheet width (a third of a 9 m ring) by two 1.83 m rings.
export const STEEL_PATCH = { w: 9.42, h: 3.66 };

export function steelTextures() {
  const W = 1024, H = 400;
  const [c, g] = canvas(W, H);
  const [b, bg] = canvas(W, H);
  const rand = rng(7);
  g.fillStyle = '#c3c8cc';
  g.fillRect(0, 0, W, H);
  // each ring half and sheet gets its own slight tone
  for (const [x, y, w, h] of [[0, 0, W, H / 2], [0, H / 2, W / 2, H / 2], [W / 2, H / 2, W / 2, H / 2]]) {
    const l = 180 + rand() * 30;
    g.fillStyle = `rgba(${l},${l + 4},${l + 8},0.35)`;
    g.fillRect(x, y, w, h);
  }
  for (let i = 0; i < 1600; i++) {
    const y = rand() * H, x = rand() * W, len = 40 + rand() * 300;
    const l = 175 + rand() * 60;
    g.strokeStyle = `rgba(${l},${l + 3},${l + 6},${0.04 + rand() * 0.08})`;
    g.lineWidth = 1 + rand() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y + (rand() - 0.5) * 2);
    g.stroke();
  }
  bg.fillStyle = '#808080';
  bg.fillRect(0, 0, W, H);
  for (const [ctx, color] of [[g, 'rgba(70,76,82,0.6)'], [bg, '#2a2a2a']]) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, 3);            // ring welds
    ctx.fillRect(0, H / 2 - 1, W, 3);
    ctx.fillRect(0, 0, 3, H / 2);        // staggered sheet welds
    ctx.fillRect(W / 2, H / 2, 3, H / 2);
  }
  return { map: finish(c), bump: finish(b, { srgb: false }) };
}

// Hexagonal heat-shield tiles, about 0.36 m across flats.
const HEX = { s: 20, cols: 14, rows: 16, metres: 0.18 };
export const TILE_PATCH = {
  w: HEX.cols * Math.sqrt(3) * HEX.metres,
  h: HEX.rows * 1.5 * HEX.metres,
};

export function tileTexture() {
  const { s, cols, rows } = HEX;
  const w = Math.sqrt(3) * s;
  const W = Math.round(cols * w), H = rows * 1.5 * s;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#4a4b4e';
  g.fillRect(0, 0, W, H);
  const shade = (q, r) => {
    const h = Math.sin((((q % cols) + cols) % cols) * 127.1 + (((r % rows) + rows) % rows) * 311.7) * 43758.5453;
    return h - Math.floor(h);
  };
  for (let r = -1; r <= rows; r++) {
    for (let q = -1; q <= cols; q++) {
      const cx = q * w + (r & 1 ? w / 2 : 0);
      const cy = r * 1.5 * s;
      const v = shade(q, r);
      const l = v > 0.996 ? 120 + v * 30 : 16 + v * 16; // the odd replacement tile is lighter
      g.fillStyle = `rgb(${l},${l},${l + 2})`;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const px = cx + (s - 1.6) * Math.cos(a), py = cy + (s - 1.6) * Math.sin(a);
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.fill();
    }
  }
  return finish(c);
}

// Dark vented interstage band at the booster tops.
export function ventTexture() {
  const W = 1024, H = 96;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#34373b';
  g.fillRect(0, 0, W, H);
  const slots = 36;
  for (let i = 0; i < slots; i++) {
    const x = (i * W) / slots;
    g.fillStyle = '#0c0d0e';
    g.fillRect(x + 6, 16, W / slots - 12, H - 32);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(x + 6, 16, W / slots - 12, 2);
  }
  return finish(c);
}

// Neutral grain multiplied by a material colour (sand, concrete).
export function grainTexture(seed, { joints = 0 } = {}) {
  const W = 512;
  const [c, g] = canvas(W, W);
  const rand = rng(seed);
  g.fillStyle = '#e6e6e6';
  g.fillRect(0, 0, W, W);
  for (let i = 0; i < 9000; i++) {
    const l = 190 + rand() * 65;
    g.fillStyle = `rgba(${l},${l},${l},${0.25 + rand() * 0.35})`;
    const r = 0.6 + rand() * 2.6;
    g.beginPath();
    g.arc(rand() * W, rand() * W, r, 0, Math.PI * 2);
    g.fill();
  }
  if (joints) {
    g.fillStyle = 'rgba(90,90,90,0.55)';
    for (let i = 0; i < W; i += W / joints) {
      g.fillRect(i, 0, 2, W);
      g.fillRect(0, i, W, 2);
    }
  }
  return finish(c);
}

export function smokeSprite() {
  const W = 128;
  const [c, g] = canvas(W, W);
  const rand = rng(3);
  for (let i = 0; i < 14; i++) {
    const x = W / 2 + (rand() - 0.5) * 30, y = W / 2 + (rand() - 0.5) * 30, r = 26 + rand() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, W);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}
