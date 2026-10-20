import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SCHEMA, PARAM_DEFS, defaults, sanitize } from './params.js';
import { buildConfiguration } from './vehicle.js';

const STORAGE_KEY = 'starship-ultra.params.v1';
const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);

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

const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 6000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !reducedMotion;
controls.maxPolarAngle = Math.PI * 0.97;

const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.6);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(150, 260, 120);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -180, right: 180, top: 180, bottom: -180, near: 10, far: 800 });
sun.shadow.normalBias = 0.5;
scene.add(hemi, sun);

const materials = {
  steel: new THREE.MeshStandardMaterial({ color: 0xc6ccd1, metalness: 0.7, roughness: 0.33 }),
  ghost: new THREE.MeshStandardMaterial({
    color: 0xc6ccd1, metalness: 0.3, roughness: 0.4, transparent: true, opacity: 0.25,
    depthWrite: false, side: THREE.DoubleSide,
  }),
  rod: new THREE.MeshStandardMaterial({ color: 0x59616a, metalness: 0.6, roughness: 0.45 }),
  tower: new THREE.MeshStandardMaterial({ color: 0x3d4349, metalness: 0.3, roughness: 0.75 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x9e9b94, roughness: 0.95 }),
  refSteel: new THREE.MeshStandardMaterial({ color: 0xa9afb4, metalness: 0.6, roughness: 0.45 }),
};

const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

let grid = null;
let ruler = null;
let built = null;
let params = defaults();

// ---------- rendering on demand ----------
let needsRender = true;
const requestRender = () => { needsRender = true; };
controls.addEventListener('change', requestRender);
renderer.setAnimationLoop(() => {
  controls.update();
  if (!needsRender) return;
  needsRender = false;
  renderer.render(scene, camera);
});

// ---------- theme ----------
const token = (name) => getComputedStyle(root).getPropertyValue(name).trim();

function applyTheme() {
  const sky = new THREE.Color(token('--sky'));
  const soil = new THREE.Color(token('--ground'));
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 800, 2600);
  ground.material.color.copy(soil);
  hemi.color.copy(sky).lerp(new THREE.Color(0xffffff), 0.5);
  hemi.groundColor.copy(soil);
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  grid = new THREE.GridHelper(1000, 100, token('--grid'), token('--grid')); // 10 m cells
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  grid.position.y = 0.05;
  scene.add(grid);
  rebuildRuler();
  requestRender();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
document.fonts?.ready.then(applyTheme);

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
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
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
    ['Booster envelope', `${m.n} × ${nf0.format(m.boosterVolume)} m³`],
    ['Upper ÷ booster volume', `${nf2.format(m.volumeRatio)} · Starship ${nf2.format(m.refVolumeRatio)}`],
    ['Booster pitch, axis to axis', `${nf1.format(m.pitch)} m`],
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
    det.open = g.id !== 'rings' && g.id !== 'pad';
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

$('panel-toggle').addEventListener('click', () => {
  const body = $('panel-body');
  body.hidden = !body.hidden;
  $('panel-toggle').setAttribute('aria-expanded', String(!body.hidden));
  $('panel-toggle').textContent = body.hidden ? 'Show' : 'Hide';
  resize();
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
  const { stackHeight, outerExtent, usBaseY } = built.layout;
  const target = new THREE.Vector3(0, stackHeight / 2 + params.liftoff, 0);
  let height = stackHeight;
  let width = outerExtent * 2;
  let standoff = 0;
  if (name === 'plan') {
    target.y = 0;
    height = width = outerExtent * 2.4;
    standoff = stackHeight + params.liftoff; // stay above the tip
  } else if (name === 'under') {
    target.y = usBaseY + params.liftoff;
    height = width = outerExtent * 1.6;
  }
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fit = Math.max(height / (2 * t * visible.h), width / (2 * t * camera.aspect * visible.w));
  camera.position.copy(target).addScaledVector(new THREE.Vector3(...VIEWS[name]).normalize(), fit * 1.15 + standoff);
  controls.target.copy(target);
  controls.update();
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
  visible.w = (w - right) / (w + right);
  visible.h = (h - bottom) / (h + bottom);
  camera.updateProjectionMatrix();
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

const hot = window.claude?.hot;
hot?.snapshot?.(() => ({ params }));
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
