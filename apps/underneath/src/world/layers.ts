// The sky column, as data. Pure: no three.js, so it is unit tested.

export const COLUMN = {
  top: 2600,
  islands: 2400,
  cloudSea: [2290, 2350] as const,
  fallStart: 2380,
  storm: [1500, 1900] as const,
  night: [950, 1300] as const,
  fog: [200, 750] as const,
  /** Where the arms cradle the visitor. */
  cradle: 34,
  /** Altimeter metres per world unit. */
  metres: 5,
};

export type LayerName = 'heights' | 'storm' | 'night' | 'fog' | 'underneath';
export const LAYERS: LayerName[] = ['heights', 'storm', 'night', 'fog', 'underneath'];

export interface LayerLook {
  zenith: string;
  horizon: string;
  ground: string;
  fog: string;
  fogDensity: number;
  exposure: number;
  saturation: number;
  stars: number;
  sunIntensity: number;
}

export const LOOKS: Record<LayerName, LayerLook> = {
  heights: { zenith: '#4f7cb2', horizon: '#f2b866', ground: '#f4ebdd', fog: '#f1d2a4', fogDensity: 0.0011, exposure: 1.02, saturation: 1.1, stars: 0, sunIntensity: 5 },
  storm: { zenith: '#20264a', horizon: '#414a84', ground: '#1b1f3a', fog: '#353e74', fogDensity: 0.0042, exposure: 1.18, saturation: 0.8, stars: 0, sunIntensity: 0 },
  night: { zenith: '#05071a', horizon: '#0f1636', ground: '#0a0d1f', fog: '#0c112b', fogDensity: 0.0006, exposure: 1.1, saturation: 0.95, stars: 1, sunIntensity: 0 },
  fog: { zenith: '#bdbab6', horizon: '#c9c6c2', ground: '#c9c6c2', fog: '#c9c6c2', fogDensity: 0.03, exposure: 0.95, saturation: 0.55, stars: 0, sunIntensity: 0 },
  underneath: { zenith: '#10142e', horizon: '#3e2c4a', ground: '#2a1c2e', fog: '#241c36', fogDensity: 0.0014, exposure: 1.05, saturation: 1.1, stars: 0.7, sunIntensity: 0 },
};

/** Grades per layer for the LUT (baked when the dominant layer changes). */
export const GRADES_BY_LAYER: Record<LayerName, { shadows: string; highlights: string; tintStrength: number; contrast: number; saturation: number; gamma?: number }> = {
  heights: { shadows: '#3a3560', highlights: '#ffe2a8', tintStrength: 0.38, contrast: 1.1, saturation: 1.12, gamma: 0.98 },
  storm: { shadows: '#141a3c', highlights: '#c9d4ff', tintStrength: 0.45, contrast: 1.16, saturation: 0.7 },
  night: { shadows: '#0a1240', highlights: '#b9c8ff', tintStrength: 0.5, contrast: 1.08, saturation: 0.95 },
  fog: { shadows: '#6f6c72', highlights: '#f0ece6', tintStrength: 0.3, contrast: 0.82, saturation: 0.6, gamma: 0.95 },
  underneath: { shadows: '#3a2a4a', highlights: '#ffd79a', tintStrength: 0.48, contrast: 1.05, saturation: 1.16, gamma: 0.92 },
};

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Blend weights of the five layers at altitude `y` (they sum to 1). */
export function layerAt(y: number): Record<LayerName, number> {
  // Each boundary blends over a band; going down: heights → storm → night → fog → underneath.
  const s1 = 1 - smooth(1850, 2050, y); // into the storm
  const s2 = 1 - smooth(1250, 1450, y); // into the night
  const s3 = 1 - smooth(720, 900, y); // into the fog
  const s4 = 1 - smooth(110, 230, y); // into underneath
  const w = {
    heights: 1 - s1,
    storm: s1 * (1 - s2),
    night: s2 * (1 - s3),
    fog: s3 * (1 - s4),
    underneath: s4,
  };
  return w;
}

export function dominantLayer(y: number): LayerName {
  const w = layerAt(y);
  return LAYERS.reduce((a, b) => (w[b] > w[a] ? b : a));
}

/** Altimeter text in metres, never below zero. */
export function altitudeMetres(y: number): number {
  return Math.max(0, Math.round((y * COLUMN.metres) / 10) * 10);
}
