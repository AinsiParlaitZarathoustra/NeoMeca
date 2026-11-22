// SPDX-License-Identifier: MPL-2.0
import type { ComputedSampleRow } from "./tracking.ts";
import { normalizeZero } from "./video-math.ts";

export type AnalysisPresetKey =
  | "trajectory"
  | "positions"
  | "velocities"
  | "accelerations"
  | "energies";

export interface AnalysisSeriesMeta {
  key: string;
  label: string;
  unit: string;
  color: string;
}

export interface AnalysisDataPoint {
  xValue: number;
  [seriesKey: string]: number | null;
}

export interface AnalysisChartResult {
  preset: AnalysisPresetKey;
  xLabel: string;
  xUnit: string;
  yUnit: string;
  series: AnalysisSeriesMeta[];
  points: AnalysisDataPoint[];
}

export interface SeriesStats {
  count: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  r2: number;
}

const PRESET_DEFINITIONS: Record<
  AnalysisPresetKey,
  {
    xLabel: string;
    xUnit: string;
    yUnit: string;
    series: AnalysisSeriesMeta[];
  }
> = {
  trajectory: {
    xLabel: "x (m)",
    xUnit: "m",
    yUnit: "m",
    series: [{ key: "y", label: "y (m)", unit: "m", color: "#3b82f6" }],
  },
  positions: {
    xLabel: "t (s)",
    xUnit: "s",
    yUnit: "m",
    series: [
      { key: "x", label: "x (m)", unit: "m", color: "#3b82f6" },
      { key: "y", label: "y (m)", unit: "m", color: "#ef4444" },
    ],
  },
  velocities: {
    xLabel: "t (s)",
    xUnit: "s",
    yUnit: "m/s",
    series: [
      { key: "vx", label: "vx (m/s)", unit: "m/s", color: "#3b82f6" },
      { key: "vy", label: "vy (m/s)", unit: "m/s", color: "#ef4444" },
      { key: "speed", label: "v (m/s)", unit: "m/s", color: "#10b981" },
    ],
  },
  accelerations: {
    xLabel: "t (s)",
    xUnit: "s",
    yUnit: "m/s²",
    series: [
      { key: "ax", label: "ax (m/s²)", unit: "m/s²", color: "#3b82f6" },
      { key: "ay", label: "ay (m/s²)", unit: "m/s²", color: "#ef4444" },
      { key: "acceleration", label: "a (m/s²)", unit: "m/s²", color: "#f59e0b" },
    ],
  },
  energies: {
    xLabel: "t (s)",
    xUnit: "s",
    yUnit: "J",
    series: [
      { key: "kineticEnergy", label: "Ec (J)", unit: "J", color: "#3b82f6" },
      { key: "potentialEnergy", label: "Ep (J)", unit: "J", color: "#10b981" },
      { key: "mechanicalEnergy", label: "Em (J)", unit: "J", color: "#a855f7" },
    ],
  },
};

function readNumericField(row: ComputedSampleRow, key: string): number | null {
  switch (key) {
    case "x":
      return row.x;
    case "y":
      return row.y;
    case "vx":
      return row.vx;
    case "vy":
      return row.vy;
    case "speed":
      return row.speed;
    case "ax":
      return row.ax;
    case "ay":
      return row.ay;
    case "acceleration":
      return row.acceleration;
    case "kineticEnergy":
      return row.kineticEnergy;
    case "potentialEnergy":
      return row.potentialEnergy;
    case "mechanicalEnergy":
      return row.mechanicalEnergy;
    default:
      return null;
  }
}

/** Construit les points exploitables par le graphique selon le préréglage choisi. */
export function buildAnalysisChartData(
  rows: ComputedSampleRow[],
  preset: AnalysisPresetKey,
): AnalysisChartResult {
  const def = PRESET_DEFINITIONS[preset];
  const points: AnalysisDataPoint[] = [];

  for (const row of rows) {
    const xValue = preset === "trajectory" ? row.x : row.timeSecs;
    if (xValue === null || !Number.isFinite(xValue)) continue;

    const point: AnalysisDataPoint = { xValue };
    let hasAnyValue = false;
    for (const s of def.series) {
      const val = readNumericField(row, s.key);
      const valid = val !== null && Number.isFinite(val) ? val : null;
      point[s.key] = valid;
      if (valid !== null) hasAnyValue = true;
    }

    if (hasAnyValue) {
      points.push(point);
    }
  }

  return {
    preset,
    xLabel: def.xLabel,
    xUnit: def.xUnit,
    yUnit: def.yUnit,
    series: def.series,
    points,
  };
}

/** Extrait les paires `(x, y)` valides d'une série donnée du graphique. */
export function extractNumericPairs(
  points: AnalysisDataPoint[],
  seriesKey: string,
): Array<{ x: number; y: number }> {
  const pairs: Array<{ x: number; y: number }> = [];
  for (const point of points) {
    const y = point[seriesKey];
    if (typeof y === "number" && Number.isFinite(y) && Number.isFinite(point.xValue)) {
      pairs.push({ x: point.xValue, y });
    }
  }
  return pairs;
}

export function computeSeriesStats(
  pairs: Array<{ x: number; y: number }>,
): SeriesStats | null {
  if (pairs.length === 0) return null;
  let minX = pairs[0].x;
  let maxX = pairs[0].x;
  let minY = pairs[0].y;
  let maxY = pairs[0].y;

  for (const pair of pairs) {
    if (pair.x < minX) minX = pair.x;
    if (pair.x > maxX) maxX = pair.x;
    if (pair.y < minY) minY = pair.y;
    if (pair.y > maxY) maxY = pair.y;
  }

  return {
    count: pairs.length,
    minX,
    maxX,
    minY,
    maxY,
  };
}

/** Calcule une régression linéaire simple `y = a * x + b` et `R^2`. */
export function computeLinearRegression(
  pairs: Array<{ x: number; y: number }>,
): LinearRegressionResult | null {
  if (pairs.length < 2) return null;

  let sumX = 0;
  let sumY = 0;
  for (const pair of pairs) {
    sumX += pair.x;
    sumY += pair.y;
  }
  const meanX = sumX / pairs.length;
  const meanY = sumY / pairs.length;

  let ssXX = 0;
  let ssXY = 0;
  let ssTot = 0;

  for (const pair of pairs) {
    const dx = pair.x - meanX;
    const dy = pair.y - meanY;
    ssXX += dx * dx;
    ssXY += dx * dy;
    ssTot += dy * dy;
  }

  if (ssXX <= 1e-15) return null;

  const slope = normalizeZero(ssXY / ssXX);
  const intercept = normalizeZero(meanY - slope * meanX);

  let ssRes = 0;
  for (const pair of pairs) {
    const residual = pair.y - (slope * pair.x + intercept);
    ssRes += residual * residual;
  }

  const r2 =
    ssTot <= 1e-15 ? 1 : Math.min(1, Math.max(0, 1 - ssRes / ssTot));

  return {
    slope,
    intercept,
    r2,
  };
}
