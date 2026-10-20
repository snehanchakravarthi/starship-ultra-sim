import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SCHEMA, PARAM_DEFS, defaults, sanitize } from './params.js';
import { buildConfiguration } from './vehicle.js';
import { grainTexture, smokeSprite, steelTextures, tileTexture, ventTexture } from './textures.js';
import { Particles, plumeTime } from './effects.js';
import {
  LIFTOFF, applyCatch, applyDesign, applyLiftoff, catchCamera, catchDuration, catchEmit,
  glowSources, liftoffCamera, liftoffEmit,
} from './animation.js';

const STORAGE_KEY = 'starship-ultra.params.v2';
const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const DESIGN_FOV = 36;
const ANIM_FOV = 42;

// ---------- renderer, scene, camera ----------
const viewportEl = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
viewportEl.append(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(DESIGN_FOV, 1, 0.5, 20000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !reducedMotion;
controls.maxPolarAngle = Math.PI * 0.97;

const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.6);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -180, right: 180, top: 180, bottom: -180, near: 10, far: 1200 });
sun.shadow.normalBias = 0.5;
scene.add(hemi, sun, sun.target);
const sunDir = new THREE.Vector3(0.55, 0.75, 0.38).normalize();

// Gradient sky with a sun glow; follows the camera so it never clips.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(9000, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDir: { value: sunDir },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uGround, uSun, uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = d.y > 0.0 ? mix(uHorizon, uTop, pow(d.y, 0.55)) : mix(uHorizon, uGround, pow(-d.y, 0.35));
        float s = max(dot(d, uSunDir), 0.0);
        c += uSun * (pow(s, 900.0) * 2.0 + pow(s, 10.0) * 0.28);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }),
);
sky.renderOrder = -1;
scene.add(sky);

// ---------- materials ----------
const tex = {
  steel: steelTextures(),
  tiles: tileTexture(),
  vent: ventTexture(),
  smoke: smokeSprite(),
  concrete: grainTexture(9),
  apron: grainTexture(13, { joints: 5 }),
  sand: grainTexture(5),
};
tex.concrete.repeat.set(1 / 16, 1 / 16);
tex.sand.repeat.set(160, 160);

const std = (o) => new THREE.MeshStandardMaterial(o);
const materials = {
  steel: std({ map: tex.steel.map, bumpMap: tex.steel.bump, bumpScale: 1.2, metalness: 0.78, roughness: 0.3 }),
  steelAft: std({ map: tex.steel.map, color: 0x86807a, metalness: 0.6, roughness: 0.55 }),
  vent: std({ map: tex.vent, metalness: 0.5, roughness: 0.6, side: THREE.DoubleSide }),
  heatShield: std({ color: 0x232426, metalness: 0.2, roughness: 0.85 }),
  tiles: std({ map: tex.tiles, metalness: 0.05, roughness: 0.78 }),
  engine: std({ color: 0x5c564f, metalness: 0.7, roughness: 0.42, side: THREE.DoubleSide }),
  fin: std({ color: 0x8f969c, metalness: 0.7, roughness: 0.4 }),
  fittings: std({ color: 0x6b7178, metalness: 0.6, roughness: 0.45 }),
  rod: std({ color: 0x59616a, metalness: 0.6, roughness: 0.45 }),
  towerSteel: std({ color: 0x3a4047, metalness: 0.5, roughness: 0.62 }),
  armSteel: std({ color: 0x4c545c, metalness: 0.55, roughness: 0.5 }),
  concrete: std({ map: tex.concrete, color: 0xa29e96, roughness: 0.95 }),
  apron: std({ map: tex.apron, color: 0x9b9892, roughness: 0.95 }),
  deluge: std({ color: 0x4a4f53, metalness: 0.6, roughness: 0.5 }),
  refSteel: std({ color: 0xa9afb4, metalness: 0.6, roughness: 0.45 }),
  ghost: std({
    color: 0xc6ccd1, metalness: 0.3, roughness: 0.4, transparent: true, opacity: 0.25,
    depthWrite: false, side: THREE.DoubleSide,
  }),
  beacon: new THREE.MeshBasicMaterial({ color: 0xff3b2f }),
};

const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), std({ map: tex.sand, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const particles = new Particles(1800, tex.smoke);
scene.add(particles.points);
const smoke = { steam: new THREE.Color(), dust: new THREE.Color(), glow: new THREE.Color(0xff8c40) };

let grid = null;
let ruler = null;
let built = null;
let params = defaults();
const scratch = new Float32Array(33);

// ---------- rendering on demand ----------
let needsRender = true;
const requestRender = () => { needsRender = true; };
controls.addEventListener('change', requestRender);

// ---------- theme ----------
const token = (name) => getComputedStyle(root).getPropertyValue(name).trim();

function applyTheme() {
  const dusk = token('--scene') === 'dusk';
  const top = new THREE.Color(token('--sky-top'));
  const horizon = new THREE.Color(token('--sky-horizon'));
  const soil = new THREE.Color(token('--ground'));
  const u = sky.material.uniforms;
  u.uTop.value.copy(top);
  u.uHorizon.value.copy(horizon);
  u.uGround.value.copy(horizon).lerp(soil, 0.5);
  u.uSun.value.set(dusk ? 0xff9a55 : 0xfff2dc);
  sunDir.set(...(dusk ? [0.78, 0.13, 0.6] : [0.55, 0.75, 0.38])).normalize();
  sun.color.set(dusk ? 0xffb07a : 0xffffff);
  sun.intensity = dusk ? 1.7 : 2.6;
  hemi.color.copy(top).lerp(new THREE.Color(0xffffff), dusk ? 0.2 : 0.5);
  hemi.groundColor.copy(soil);
  hemi.intensity = dusk ? 0.45 : 0.65;
  for (const m of Object.values(materials)) if (m.isMeshStandardMaterial) m.envMapIntensity = dusk ? 0.35 : 1;
  scene.fog = new THREE.Fog(horizon, 700, 7000);
  ground.material.color.copy(soil);
  smoke.steam.set(dusk ? 0x8e8a86 : 0xe4e2dc);
  smoke.dust.set(dusk ? 0x6c6357 : 0xb9aa90);
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  grid = new THREE.GridHelper(1000, 100, token('--grid'), token('--grid')); // 10 m cells
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.position.y = 0.06;
  scene.add(grid);
  rebuildRuler();
  placeSun();
  requestRender();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
document.fonts?.ready.then(applyTheme);

function placeSun(focus) {
  const f = focus ?? new THREE.Vector3(0, built ? built.layout.stackHeight * 0.4 : 60, 0);
  sun.target.position.copy(f);
  sun.position.copy(f).addScaledVector(sunDir, 600);
}

// ---------- height ruler and labels (sprites drawn from theme tokens) ----------
function label(text, align = 'left') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = '500 48px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = token('--fg');
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  ctx.fillText(text, align === 'center' ? 256 : 6, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
  s.scale.set(26, 4.9, 1);
  s.center.set(align === 'center' ? 0.5 : 0, align === 'center' ? 0 : 0.5);
  s.userData.ownsMaterial = true;
  return s;
}

function rebuildRuler() {
  if (!built) return;
  if (ruler) { scene.remove(ruler); disposeTree(ruler); }
  const { refX, refStackHeight, stackHeight } = built.layout;
  ruler = new THREE.Group();
  const x = refX + 16;
  const top = Math.ceil((Math.max(stackHeight, refStackHeight) + 10) / 50) * 50;
  const pts = [x, 0, 0, x, top, 0];
  for (let y = 10; y <= top; y += 10) {
    const w = y % 50 === 0 ? 2.5 : 1.2;
    pts.push(x - w, y, 0, x + w, y, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: token('--muted') }));
  lines.userData.ownsMaterial = true;
  ruler.add(lines);
  for (let y = 50; y <= top; y += 50) {
    const s = label(`${y} m`);
    s.position.set(x + 4, y, 0);
    ruler.add(s);
  }
  if (params.showReference) {
    const s = label(`Starship ${Math.round(refStackHeight - params.mountHeight)} m`, 'center');
    s.position.set(refX, refStackHeight + 3, 0);
    ruler.add(s);
  }
  ruler.visible = anim.mode === 'design';
  scene.add(ruler);
}

function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    if (o.userData.ownsMaterial) { o.material.map?.dispose(); o.material.dispose(); }
  });
}

// ---------- build ----------
function rebuild() {
  if (built) for (const k of ['pad', 'vehicle', 'reference']) { scene.remove(built[k]); disposeTree(built[k]); }
  built = buildConfiguration(params, materials);
  scene.add(built.pad, built.vehicle, built.reference);
  if (anim.mode === 'catch') anim.duration = catchDuration(params.boosterCount);
  applyPose();
  rebuildRuler();
  renderReadout(built.metrics);
  save();
  requestRender();
}

let rebuildQueued = false;
function scheduleRebuild() {
  if (rebuildQueued) return;
  rebuildQueued = true;
  requestAnimationFrame(() => { rebuildQueued = false; rebuild(); });
}

// ---------- readout ----------
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS_TEXT = { ok: 'Clear', warn: 'Tight', bad: 'Clash' };

function renderReadout(m) {
  const rows = [
    ['Stack height, pad to tip', `${nf1.format(m.stackHeight)} m`],
    ['Upper stage base', `${nf1.format(m.flatWidth)} m flat · ${nf1.format(m.cornerWidth)} m corners`],
    ['Upper stage envelope', `${nf0.format(m.usVolume)} m³ · ${nf1.format(m.shipMultiple)}× Starship ship`],
    ['Upper ÷ booster volume', `${nf2.format(m.volumeRatio)} · Starship ${nf2.format(m.refVolumeRatio)}`],
    ['Nose fineness, length ÷ equivalent diameter', `${nf2.format(m.fineness)}`],
    ['Nose wave-drag index (D/L)²', `${nf2.format(m.waveIndex)} · Starship ${nf2.format(m.refIndex)}`],
    ['Nose drag per booster vs Starship', `${nf1.format(m.dragPerBooster)}×`],
  ];
  $('metrics').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('checks').innerHTML = m.checks.map((c) => `
    <li class="check ${c.status}">
      <span class="check-label">${c.label}</span>
      <span class="check-value">${nf1.format(c.value)} m</span>
      <span class="pill">${STATUS_TEXT[c.status]}</span>
    </li>`).join('');
}

// ---------- parameter panel ----------
const syncers = {};

function decimals(step) {
  return step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
}

function formatParam(def, v) {
  return `${(+v).toFixed(decimals(def.step))}${def.unit ? ` ${def.unit}` : ''}`;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function field(def) {
  const id = `p-${def.key}`;
  const wrap = el('div', 'field');
  if (def.options) {
    wrap.classList.add('field-seg');
    const seg = el('div', 'seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', def.label);
    for (const opt of def.options) {
      const b = el('button', null, opt);
      b.type = 'button';
      b.id = `${id}-${opt}`;
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => set(def.key, opt));
      seg.append(b);
    }
    wrap.append(el('span', 'field-label', def.label), seg);
    syncers[def.key] = (v) => seg.querySelectorAll('button')
      .forEach((b) => b.setAttribute('aria-checked', String(b.textContent === v)));
  } else if (typeof def.value === 'boolean') {
    wrap.classList.add('field-toggle');
    const input = el('input');
    input.type = 'checkbox';
    input.id = id;
    input.addEventListener('change', () => set(def.key, input.checked));
    const lab = el('label', null, def.label);
    lab.htmlFor = id;
    wrap.append(input, lab);
    syncers[def.key] = (v) => { input.checked = v; };
  } else {
    const head = el('div', 'field-head');
    const lab = el('label', null, def.label);
    lab.htmlFor = id;
    const out = el('output', 'field-value');
    out.setAttribute('for', id);
    head.append(lab, out);
    const input = el('input');
    Object.assign(input, { type: 'range', id, min: def.min, max: def.max, step: def.step });
    input.addEventListener('input', () => set(def.key, +input.value));
    wrap.append(head, input);
    syncers[def.key] = (v) => { input.value = v; out.textContent = formatParam(def, v); };
  }
  return wrap;
}

function buildPanel() {
  const host = $('groups');
  for (const g of SCHEMA) {
    const det = el('details');
    det.open = g.id === 'upper' || g.id === 'view';
    det.append(el('summary', null, g.label));
    const list = el('div', 'fields');
    g.params.forEach((p) => list.append(field(p)));
    det.append(list);
    host.append(det);
  }
}

function set(key, value) {
  params[key] = value;
  syncers[key](value);
  scheduleRebuild();
}

function syncAll() {
  for (const key of Object.keys(PARAM_DEFS)) syncers[key](params[key]);
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)); } catch { /* storage unavailable */ }
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}

function flash(button, text) {
  const original = button.dataset.label ??= button.textContent;
  button.textContent = text;
  clearTimeout(button._t);
  button._t = setTimeout(() => { button.textContent = original; }, 1600);
}

$('copy').addEventListener('click', async () => {
  const text = JSON.stringify(params, null, 2);
  const exportEl = $('export');
  try {
    await navigator.clipboard.writeText(text);
    exportEl.hidden = true;
    flash($('copy'), 'Copied');
  } catch {
    exportEl.value = text;
    exportEl.hidden = false;
    exportEl.focus();
    exportEl.select();
    flash($('copy'), 'Select the text to copy');
  }
});

$('reset').addEventListener('click', () => {
  params = defaults();
  syncAll();
  rebuild();
  frame('iso');
});

function setPanelOpen(open) {
  const body = $('panel-body');
  body.hidden = !open;
  $('panel-toggle').setAttribute('aria-expanded', String(open));
  $('panel-toggle').textContent = open ? 'Hide' : 'Show';
  resize();
}
$('panel-toggle').addEventListener('click', () => setPanelOpen($('panel-body').hidden));

// ---------- animation ----------
const anim = { mode: 'design', t: 0, playing: false, speed: 1, autoCam: true, duration: 0, info: null, lastFocus: null };
const camOut = { position: new THREE.Vector3(), target: new THREE.Vector3() };

function applyPose() {
  if (!built) return;
  if (anim.mode === 'liftoff') anim.info = applyLiftoff(anim.t, built, params, scratch);
  else if (anim.mode === 'catch') anim.info = applyCatch(anim.t, built, params, scratch);
  else { applyDesign(built, params); anim.info = null; }
  const design = anim.mode === 'design';
  built.reference.visible = design && params.showReference;
  if (ruler) ruler.visible = design;
  placeSun(anim.info?.focus);
}

function startAnimation(mode) {
  anim.mode = mode;
  anim.t = 0;
  anim.playing = true;
  anim.duration = mode === 'liftoff' ? LIFTOFF.duration : catchDuration(params.boosterCount);
  anim.lastFocus = null;
  setAutoCam(true);
  particles.clear();
  camera.fov = ANIM_FOV;
  $('transport').hidden = false;
  if (matchMedia('(max-width: 720px)').matches) setPanelOpen(false);
  resize();
  applyPose();
  syncTransport();
}

function stopAnimation() {
  anim.mode = 'design';
  anim.playing = false;
  particles.clear();
  camera.fov = DESIGN_FOV;
  $('transport').hidden = true;
  resize();
  applyPose();
  frame('iso');
}

function setAutoCam(on) {
  anim.autoCam = on;
  $('autocam').checked = on;
}

function syncTransport() {
  $('play').textContent = anim.playing ? 'Pause' : 'Play';
  $('play').setAttribute('aria-label', anim.playing ? 'Pause' : 'Play');
  $('scrub').value = String(Math.round((anim.t / anim.duration) * 1000));
  if (anim.info) {
    $('clock').textContent = anim.info.clock;
    $('status').textContent = `${anim.info.label} · ${anim.info.detail}`;
  }
  document.querySelectorAll('#speed button').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.speed === anim.speed)));
}

$('anim-liftoff').addEventListener('click', () => startAnimation('liftoff'));
$('anim-catch').addEventListener('click', () => startAnimation('catch'));
$('exit').addEventListener('click', stopAnimation);
$('play').addEventListener('click', () => {
  if (!anim.playing && anim.t >= anim.duration) { anim.t = 0; particles.clear(); }
  anim.playing = !anim.playing;
  syncTransport();
});
$('scrub').addEventListener('input', () => {
  anim.t = (+$('scrub').value / 1000) * anim.duration;
  particles.clear();
  anim.lastFocus = null;
  applyPose();
  syncTransport();
});
document.querySelectorAll('#speed button').forEach((b) => b.addEventListener('click', () => {
  anim.speed = +b.dataset.speed;
  syncTransport();
}));
$('autocam').addEventListener('change', () => setAutoCam($('autocam').checked));
controls.addEventListener('start', () => { if (anim.mode !== 'design') setAutoCam(false); });
addEventListener('keydown', (e) => {
  if (anim.mode === 'design' || e.target.closest?.('input, textarea')) return;
  if (e.key === ' ') { e.preventDefault(); $('play').click(); }
  if (e.key === 'Escape') stopAnimation();
});

function updateCamera() {
  const info = anim.info;
  if (anim.autoCam) {
    if (anim.mode === 'liftoff') liftoffCamera(anim.t, built, camOut);
    else catchCamera(anim.t, built, camOut, anim.info.states);
    // pull back when the panel or a narrow screen leaves less of the frame visible
    const fit = Math.max(1 / visible.h, 1.2 / (camera.aspect * visible.w));
    camera.position.copy(camOut.target).addScaledVector(camOut.position.sub(camOut.target), fit);
    camera.position.y = Math.max(camera.position.y, 5); // never dip below the ground
    controls.target.copy(camOut.target);
  } else if (anim.mode === 'liftoff' && info) {
    // free camera: keep the user's framing but ride along with the vehicle
    if (anim.lastFocus) {
      const d = info.focus.clone().sub(anim.lastFocus);
      camera.position.add(d);
      controls.target.add(d);
    }
    anim.lastFocus = info.focus.clone();
  }
}

function emit(dt) {
  if (anim.mode === 'liftoff') liftoffEmit(dt, anim.t, built, params, particles, smoke);
  else if (anim.mode === 'catch') catchEmit(dt, anim.t, built, particles, smoke, anim.info.states);
}

function advance(step) {
  anim.t = Math.min(anim.t + step, anim.duration);
  if (anim.t >= anim.duration) anim.playing = false;
  applyPose();
  emit(step);
  particles.update(step, glowSources(built, smoke.glow));
}

let lastNow = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;
  if (anim.mode !== 'design' && built) {
    if (anim.playing) {
      advance(dt * anim.speed);
      syncTransport();
    }
    plumeTime.value = now / 1000;
    updateCamera();
    needsRender = true;
  }
  controls.update();
  if (!needsRender) return;
  needsRender = false;
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
});

// ---------- camera framing ----------
const VIEWS = {
  iso: [1, 0.3, 1.2],
  side: [0, 0.03, 1],
  plan: [0, 1, 0.0001],
  under: [0.6, -0.45, 0.75],
};

// Fraction of the projection the panel leaves visible, set by resize().
const visible = { w: 1, h: 1 };

function frame(name) {
  if (anim.mode !== 'design') setAutoCam(false);
  const { stackHeight, outerExtent, usBaseY } = built.layout;
  const target = new THREE.Vector3(0, stackHeight / 2, 0);
  if (anim.info?.focus) target.copy(anim.info.focus);
  let height = stackHeight;
  let width = outerExtent * 2;
  let standoff = 0;
  if (name === 'plan') {
    target.set(target.x, 0, target.z);
    height = width = outerExtent * 2.4;
    standoff = stackHeight + (anim.info?.altitude ?? 0);
  } else if (name === 'under') {
    target.y = usBaseY + (anim.info?.altitude ?? 0);
    height = width = outerExtent * 1.6;
  }
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fit = Math.max(height / (2 * t * visible.h), width / (2 * t * camera.aspect * visible.w));
  camera.position.copy(target).addScaledVector(new THREE.Vector3(...VIEWS[name]).normalize(), fit * 1.15 + standoff);
  controls.target.copy(target);
  controls.update();
  anim.lastFocus = anim.info?.focus?.clone() ?? null;
  requestRender();
}

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => frame(b.dataset.view)));

// Keep the projection centre in the part of the screen the panel does not cover.
function resize() {
  const w = viewportEl.clientWidth;
  const h = viewportEl.clientHeight;
  renderer.setSize(w, h);
  const panel = $('panel').getBoundingClientRect();
  const view = viewportEl.getBoundingClientRect();
  const dockedRight = panel.left > view.left + w * 0.5;
  const right = dockedRight ? Math.max(0, view.right - panel.left) : 0;
  const bottom = dockedRight ? 0 : Math.max(0, view.bottom - panel.top);
  camera.aspect = (w + right) / (h + bottom);
  camera.setViewOffset(w + right, h + bottom, right, bottom, w, h);
  camera.updateProjectionMatrix();
  visible.w = Math.max((w - right) / (w + right), 0.2);
  visible.h = Math.max((h - bottom) / (h + bottom), 0.2);
  particles.material.uniforms.uScale.value =
    ((h + bottom) * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  requestRender();
}
new ResizeObserver(resize).observe(viewportEl);
new ResizeObserver(resize).observe($('panel'));

// ---------- start ----------
function start(data) {
  params = sanitize(data?.params ?? loadSaved());
  buildPanel();
  syncAll();
  rebuild();
  applyTheme();
  resize();
  frame('iso');
}

// Handle for poking at the scene from the browser console.
window.ultra = {
  scene, camera, controls, anim, frame,
  get built() { return built; },
  get params() { return params; },
  /** Run the open animation forward without rendering, e.g. ultra.skip(8). */
  skip(seconds, step = 1 / 30) {
    for (let s = 0; s < seconds; s += step) advance(step);
    syncTransport();
  },
};

const hot = window.claude?.hot;
hot?.snapshot?.(() => ({ params }));
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
