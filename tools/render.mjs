#!/usr/bin/env node
// Renders the liftoff or catch animation frame by frame in headless Chromium,
// with directed camera shots and a telemetry overlay, then encodes an MP4.
//
//   node tools/render.mjs catch   --out media --fps 30 --size 1920x1080
//   node tools/render.mjs liftoff --out media
//   node tools/render.mjs stills  --out media
//
// Options:
//   --three <dir>   serve three.js from a local install instead of the CDN
//   --fonts <dir>   serve the UI fonts from a local folder of .woff2 files
//   --software      force SwiftShader (for machines without a GPU)
//   --frames a:b    render only frames a..b (for quick checks)
//   --pick a,b,c    render only these frames (stills from the timeline)
//   --scheme dark   dusk lighting instead of day
// Needs: playwright (npm i -D playwright), ffmpeg on PATH, python3 + numpy for audio.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args[0];
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1] ?? true;
};
const flag = (name) => args.includes(`--${name}`);
if (!['catch', 'liftoff', 'stills'].includes(mode)) {
  console.error('usage: node tools/render.mjs <catch|liftoff|stills> [--out media] [--fps 30] [--size 1920x1080]');
  process.exit(1);
}
const OUT = path.resolve(opt('out', 'media'));
const FPS = +opt('fps', 30);
const [W, H] = String(opt('size', '1920x1080')).split('x').map(Number);
const THREE_DIR = opt('three', null);
const FONTS_DIR = opt('fonts', null);
const SCHEME = opt('scheme', mode === 'liftoff' ? 'dark' : 'light');

// ---------------------------------------------------------------- static server

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = url.startsWith('/__fonts/') && FONTS_DIR
    ? path.join(FONTS_DIR, path.basename(url))
    : path.join(ROOT, url === '/' ? 'index.html' : url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---------------------------------------------------------------- browser

const browser = await chromium.launch({
  args: flag('software') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: SCHEME });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.route('**/*', (route) => {
  const u = route.request().url();
  const three = u.match(/cdn\.jsdelivr\.net\/npm\/three@[\d.]+\/(.*)$/);
  if (three && THREE_DIR) return route.fulfill({ path: path.join(THREE_DIR, three[1]), contentType: 'text/javascript' });
  if (u.includes('fonts.googleapis.com') && FONTS_DIR) {
    const css = fs.readdirSync(FONTS_DIR).filter((f) => f.endsWith('.woff2')).map((f) => {
      const [, family, weight] = f.match(/^(.*)-latin-(\d+)-normal\.woff2$/) ?? [];
      if (!family) return '';
      const name = family.split('-').map((w) => (w === 'ibm' ? 'IBM' : w[0].toUpperCase() + w.slice(1))).join(' ');
      return `@font-face{font-family:"${name}";font-weight:${weight};src:url(${BASE}/__fonts/${f}) format("woff2");}`;
    }).join('\n');
    return route.fulfill({ body: css, contentType: 'text/css' });
  }
  if (u.startsWith(BASE) || three) return route.continue();
  return route.fulfill({ status: 204, body: '' });
});
await page.goto(BASE);
await page.waitForFunction(() => window.ultra?.built);
await page.evaluate(() => document.fonts.ready);
const layout = await page.evaluate(() => {
  const L = window.ultra.built.layout;
  return {
    D: L.D, R: L.R, n: L.n, half: L.half, angles: L.angles, stackHeight: L.stackHeight, hCG: L.hCG,
    carriageCatchY: L.carriageCatchY, boosterBaseY: L.boosterBaseY, outerExtent: L.outerExtent,
    towerHeight: window.ultra.params.towerHeight,
  };
});

// ---------------------------------------------------------------- vector helpers

const add = (...v) => v.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
const mul = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
const lerp = (a, b, t) => a + (b - a) * t;
const lerpV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const ease = (t) => t * t * (3 - 2 * t);
const dir = (az) => [Math.cos(az), 0, Math.sin(az)];
const tan = (az) => [-Math.sin(az), 0, Math.cos(az)];
const UP = [0, 1, 0];

// ---------------------------------------------------------------- shot lists
// Each shot: [start, end, (t, u, info, director) => { pos, target, fov }], u = 0..1 within the shot.

const L = layout;
const h = L.stackHeight;
const phi0 = L.angles[0];

const LIFTOFF = {
  duration: 32,
  title: 'Liftoff',
  shots: [
    // cut before the steam cloud reaches the pad camera
    [0, 2.9, (t, u) => {
      const az = phi0 + L.half * 0.5; // between table legs, looking in at the engines
      return { pos: add(mul(dir(az), lerp(72, 58, ease(u))), [0, 5, 0]), target: [0, 16, 0], fov: 46 };
    }],
    [2.9, 12, (t, u, i) => {
      const az = phi0 + L.half * 0.5 + 0.9;
      const f = i.focus;
      return { pos: add(mul(dir(az), 320), [0, 3, 0]), target: [f[0] * 0.6, lerp(h * 0.45, f[1], 0.55), 0], fov: 36 };
    }],
    [12, 19, (t, u, i) => {
      const f = i.focus;
      return { pos: add(f, mul(dir(2.4), lerp(330, 300, u)), [0, -55, 0]), target: add(f, [0, -22, 0]), fov: 36 };
    }],
    [19, 32, (t, u, i) => {
      const f = i.focus;
      const cam = add(mul(dir(0.95), 1500), [0, 2, 0]);
      const d = dist(cam, f);
      return { pos: cam, target: f, fov: Math.max(6, (2 * Math.atan((h * 1.7) / (2 * d)) * 180) / Math.PI) };
    }],
  ],
};

const boosterCG = (i, k) => add(i.boosters[k], [0, L.hCG, 0]);
// Side-on to tower face k, so the booster slides across the frame into the arms.
const catchCloseup = (k, from, to) => (t, u) => {
  const a = L.angles[k];
  const y = L.carriageCatchY;
  const pos = add(mul(dir(a), L.D + 14), mul(tan(a), lerp(from, to, ease(u))), [0, y + 12, 0]);
  return { pos, target: add(mul(dir(a), L.D + 6), [0, y - 18, 0]), fov: 50 };
};

const CATCH = {
  duration: 54,
  title: 'Booster catch',
  shots: [
    [0, 10.5, (t, u, i, dirCam) => ({ ...dirCam, fov: 42 })],
    [10.5, 19.8, (t, u, i) => {
      const cg = boosterCG(i, 0);
      return { pos: add(cg, mul(tan(phi0), 85), mul(dir(phi0), 35), [0, -20, 0]), target: add(cg, [0, -12, 0]), fov: 42 };
    }],
    [19.8, 31.5, catchCloseup(0, 105, 92)],
    [31.5, 40, (t, u, i, dirCam) => ({ ...dirCam, fov: 42 })],
    [40, 46, catchCloseup(L.n - 1, -100, -90)],
    [46, 54, (t, u) => {
      const az = phi0 + Math.PI * 0.3 + u * 0.45;
      return { pos: add(mul(dir(az), 150), [0, 34, 0]), target: [0, 60, 0], fov: 40 };
    }],
  ],
};

// ---------------------------------------------------------------- overlay

const HUD_CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; color: #f4f6f8; font-family: "IBM Plex Sans", sans-serif;
  text-shadow: 0 1px 3px rgb(0 0 0 / 0.55); }
#hud::after { content: ""; position: absolute; inset: auto 0 0 0; height: 26%;
  background: linear-gradient(to top, rgb(5 8 12 / 0.55), transparent); }
#hud > * { position: absolute; z-index: 1; }
.hud-title { left: 4.2vh; top: 3.8vh; }
.hud-title b { display: block; font: 600 4.4vh/1 "Barlow Condensed", sans-serif; letter-spacing: 0.08em; }
.hud-title span { display: block; margin-top: 0.8vh; font: 600 2.1vh/1 "Barlow Condensed", sans-serif; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.85; }
.hud-clock { left: 4.2vh; bottom: 7.6vh; font: 500 5.6vh/1 "IBM Plex Mono", monospace; font-variant-numeric: tabular-nums; }
.hud-detail { left: 4.2vh; bottom: 4vh; font: 500 2.3vh/1 "IBM Plex Mono", monospace; letter-spacing: 0.04em; opacity: 0.9; }
.hud-status { right: 4.2vh; bottom: 7.6vh; font: 600 2.6vh/1 "Barlow Condensed", sans-serif; letter-spacing: 0.14em; text-transform: uppercase; text-align: right; }
.hud-chips { right: 4.2vh; bottom: 11.4vh; display: flex; gap: 0.8vh; }
.hud-chips span { font: 600 1.7vh/1 "Barlow Condensed", sans-serif; letter-spacing: 0.1em; padding: 0.7vh 1vh; border-radius: 0.5vh;
  background: rgb(255 255 255 / 0.14); border: 1px solid rgb(255 255 255 / 0.25); text-shadow: none; }
.hud-chips span.burn { background: rgb(255 132 50 / 0.85); border-color: transparent; color: #1c0d02; }
.hud-chips span.hover { background: rgb(255 196 90 / 0.85); border-color: transparent; color: #1c1302; }
.hud-chips span.home { background: rgb(92 196 138 / 0.85); border-color: transparent; color: #04170c; }
.hud-mark { right: 4.2vh; bottom: 4vh; font: 400 1.6vh/1 "IBM Plex Sans", sans-serif; opacity: 0.7; }
`;

const CHIP = { descent: ['FALL', ''], 'landing burn': ['BURN', 'burn'], 'hovering into the arms': ['HOVER', 'hover'], 'arms closing': ['CATCH', 'hover'], lowering: ['HOME', 'home'], caught: ['HOME', 'home'] };

async function installHud(title) {
  await page.addStyleTag({ content: HUD_CSS });
  await page.evaluate(({ title, n }) => {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <div class="hud-title"><b>STARSHIP ULTRA</b><span>${n}-booster concept · ${title}</span></div>
      <div class="hud-chips"></div>
      <div class="hud-clock"></div>
      <div class="hud-detail"></div>
      <div class="hud-status"></div>
      <div class="hud-mark">Concept animation · not affiliated with SpaceX</div>`;
    document.body.append(hud);
  }, { title, n: layout.n });
}

async function updateHud(i) {
  const chips = i.phases ? i.phases.map((p, k) => {
    const [txt, cls] = p ? CHIP[p] : ['INBOUND', ''];
    return `<span class="${cls}">B${k + 1} ${txt}</span>`;
  }).join('') : '';
  const status = i.phases ? i.label.split(' · ')[0] : i.label;
  const detail = i.phases ? (i.detail.endsWith('m') ? `LEAD BOOSTER ${i.detail}` : i.detail.toUpperCase()) : `ALT ${i.detail.replace(' · ', '   VEL ')}`;
  await page.evaluate(({ clock, detail, status, chips }) => {
    document.querySelector('.hud-clock').textContent = clock;
    document.querySelector('.hud-detail').textContent = detail;
    document.querySelector('.hud-status').textContent = status;
    document.querySelector('.hud-chips').innerHTML = chips;
  }, { clock: i.clock, detail, status, chips });
}

// ---------------------------------------------------------------- render a sequence

async function renderSequence(name, seq) {
  const frameDir = path.join(OUT, `${name}-frames`);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });
  await page.evaluate((m) => window.ultra.capture.begin(m), name);
  await installHud(seq.title);
  const total = Math.round(seq.duration * FPS);
  const pick = opt('pick', null) && new Set(String(opt('pick')).split(',').map(Number));
  const [f0, f1] = pick ? [Math.min(...pick), Math.max(...pick)] : String(opt('frames', `0:${total - 1}`)).split(':').map(Number);
  const log = [];
  const t0 = Date.now();
  for (let f = 0; f <= f1; f++) {
    if (f > 0) await page.evaluate((dt) => window.ultra.capture.step(dt), 1 / FPS);
    if (pick ? !pick.has(f) : f < f0) continue;
    const t = f / FPS;
    const info = await page.evaluate(() => window.ultra.capture.info());
    const director = await page.evaluate(() => window.ultra.capture.director());
    const [s0, s1, fn] = seq.shots.find(([a, b]) => t >= a && t < b) ?? seq.shots[seq.shots.length - 1];
    const cam = fn(t, Math.min((t - s0) / (s1 - s0), 1), info, director);
    await page.evaluate(({ pos, target, fov }) => window.ultra.capture.render(pos, target, fov), cam);
    await updateHud(info);
    await page.screenshot({ path: path.join(frameDir, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    // loudness: every firing booster, louder when the camera is close
    const loud = info.thrust.reduce((a, th, k) => a + th * (300 / (300 + dist(cam.pos, info.boosters[k]))), 0);
    log.push({ t, loud, thrust: info.thrust.reduce((a, b) => a + b, 0) });
    if (f % 30 === 0) {
      const rate = (f - f0 + 1) / ((Date.now() - t0) / 1000);
      console.log(`${name} frame ${f}/${f1} · ${rate.toFixed(2)} fps · eta ${Math.round((f1 - f) / rate)} s`);
    }
  }
  fs.writeFileSync(path.join(OUT, `${name}-audio.json`), JSON.stringify({ fps: FPS, frames: log }));
  return { frameDir, start: f0 };
}

function encode(name, frameDir, start) {
  const mp4 = path.join(OUT, `starship-ultra-${name}.mp4`);
  const wav = path.join(OUT, `${name}.wav`);
  let audio = [];
  try {
    execFileSync('python3', [path.join(ROOT, 'tools', 'rumble.py'), path.join(OUT, `${name}-audio.json`), wav], { stdio: 'inherit' });
    audio = ['-i', wav, '-c:a', 'aac', '-b:a', '160k', '-shortest'];
  } catch {
    console.warn('audio skipped (needs python3 + numpy)');
  }
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', String(FPS), '-start_number', String(start),
    '-i', path.join(frameDir, '%05d.jpg'), ...audio,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-movflags', '+faststart', mp4,
  ], { stdio: 'inherit' });
  console.log('wrote', mp4);
}

// ---------------------------------------------------------------- stills

async function stills() {
  fs.mkdirSync(OUT, { recursive: true });
  await page.evaluate(() => window.ultra.capture.begin(null));
  const shots = [
    ['hero', {}, [h * 0.95, h * 0.18, h * 1.3], [0, h * 0.5, 0], 34],
    ['scale', { showReference: true }, [-h * 0.15, h * 0.35, h * 2.05], [-(L.outerExtent + 42) / 2, h * 0.47, 0], 40],
    ['plan', { xray: true, showReference: false }, [0.01, h + 40, 0.01], [0, 0, 0], 30],
    ['engines', { showReference: false }, add(mul(dir(phi0 + L.half * 0.5), 46), [0, 6, 0]), [0, 19, 0], 50],
    ['interface', { showReference: false }, add(mul(dir(phi0 + 0.4), 34), [0, L.boosterBaseY + 52, 0]), [0, L.boosterBaseY + 70, 0], 54],
  ];
  for (const [name, params, pos, target, fov] of shots) {
    await page.evaluate((p) => window.ultra.setParams(p), { xray: false, showReference: false, ...params });
    await page.evaluate((on) => window.ultra.capture.ruler(on), name === 'scale');
    await page.evaluate(({ pos, target, fov }) => window.ultra.capture.render(pos, target, fov), { pos, target, fov });
    await page.screenshot({ path: path.join(OUT, `starship-ultra-${name}.png`) });
    console.log('wrote', name);
  }
}

// ---------------------------------------------------------------- main

fs.mkdirSync(OUT, { recursive: true });
if (mode === 'stills') await stills();
else {
  const seq = mode === 'catch' ? CATCH : LIFTOFF;
  const { frameDir, start } = await renderSequence(mode, seq);
  encode(mode, frameDir, start);
}
await browser.close();
server.close();
