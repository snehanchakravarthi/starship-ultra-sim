// Every tunable dimension in one place. Units are metres unless noted.
// Booster defaults are Super Heavy-class: 9 m diameter, ~71 m long.

export const SCHEMA = [
  {
    id: 'boosters',
    label: 'Boosters',
    params: [
      { key: 'boosterCount', label: 'Count', value: 4, min: 3, max: 8, step: 1 },
      { key: 'clusterRadius', label: 'Axis distance from tower axis', value: 17, min: 6, max: 40, step: 0.5, unit: 'm' },
      { key: 'boosterDiameter', label: 'Diameter', value: 9, min: 5, max: 14, step: 0.1, unit: 'm' },
      { key: 'boosterLength', label: 'Length', value: 71, min: 30, max: 110, step: 0.5, unit: 'm' },
    ],
  },
  {
    id: 'rings',
    label: 'Tie rings',
    params: [
      { key: 'ringStyle', label: 'Style', value: 'straight', options: ['straight', 'arc'] },
      { key: 'rodDiameter', label: 'Rod diameter', value: 1.2, min: 0.2, max: 4, step: 0.1, unit: 'm' },
      { key: 'bottomRingHeight', label: 'Bottom ring above booster base', value: 6, min: 0, max: 40, step: 0.5, unit: 'm' },
      { key: 'topRingDrop', label: 'Top ring below upper stage', value: 6, min: 0, max: 40, step: 0.5, unit: 'm' },
    ],
  },
  {
    id: 'upper',
    label: 'Upper stage',
    params: [
      { key: 'upperHeight', label: 'Height', value: 80, min: 15, max: 160, step: 0.5, unit: 'm' },
      { key: 'skirtHeight', label: 'Straight skirt', value: 10, min: 0, max: 40, step: 0.5, unit: 'm' },
      { key: 'insetDepth', label: 'Booster inset depth', value: 6, min: 0, max: 30, step: 0.5, unit: 'm' },
      { key: 'cornerGap', label: 'Corner wall gap around booster', value: 0.6, min: 0, max: 4, step: 0.1, unit: 'm' },
      { key: 'shoulder', label: 'Shoulder fullness', value: 1.5, min: 1, max: 6, step: 0.05 },
      { key: 'tipBluntness', label: 'Tip bluntness', value: 1.1, min: 0.6, max: 3, step: 0.05 },
      { key: 'tipRounding', label: 'Corners round off toward tip', value: 0.7, min: 0, max: 1, step: 0.01 },
      { key: 'roundingCurve', label: 'Rounding onset (higher = later)', value: 2, min: 1, max: 8, step: 0.1 },
    ],
  },
  {
    id: 'pad',
    label: 'Tower and pad',
    params: [
      { key: 'towerWidth', label: 'Tower width, face to face', value: 10, min: 3, max: 24, step: 0.5, unit: 'm' },
      { key: 'towerHeight', label: 'Tower height', value: 78, min: 10, max: 180, step: 0.5, unit: 'm' },
      { key: 'mountHeight', label: 'Launch table height', value: 20, min: 4, max: 40, step: 0.5, unit: 'm' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    params: [
      { key: 'liftoff', label: 'Liftoff (vehicle rise)', value: 0, min: 0, max: 220, step: 1, unit: 'm' },
      { key: 'separation', label: 'Stage separation', value: 0, min: 0, max: 80, step: 0.5, unit: 'm' },
      { key: 'xray', label: 'See-through upper stage', value: false },
      { key: 'showTower', label: 'Tower', value: true },
      { key: 'showReference', label: 'Starship reference stack', value: true },
    ],
  },
];

export const PARAM_DEFS = Object.fromEntries(SCHEMA.flatMap((g) => g.params.map((p) => [p.key, p])));

export function defaults() {
  return Object.fromEntries(Object.values(PARAM_DEFS).map((p) => [p.key, p.value]));
}

/** Merge a loose object over the defaults, dropping unknown keys and clamping ranges. */
export function sanitize(input) {
  const out = defaults();
  if (!input || typeof input !== 'object') return out;
  for (const [key, def] of Object.entries(PARAM_DEFS)) {
    const v = input[key];
    if (v === undefined) continue;
    if (def.options) { if (def.options.includes(v)) out[key] = v; }
    else if (typeof def.value === 'boolean') out[key] = !!v;
    else if (Number.isFinite(+v)) out[key] = Math.min(def.max, Math.max(def.min, +v));
  }
  return out;
}
