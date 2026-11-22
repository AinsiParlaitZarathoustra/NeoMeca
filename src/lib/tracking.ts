// SPDX-License-Identifier: MPL-2.0
import {
  frameToTimeSecs,
  pixelsToMeters,
  type CalibrationState,
  type CalibrationToolMode,
} from "./calibration.ts";
import { normalizeZero, type PixelCoords } from "./video-math.ts";

export type PointShape = "cross" | "square" | "circle";

export type WorkspaceToolMode = CalibrationToolMode | "track";

export interface TrackedPointStyle {
  id: number;
  name: string;
  color: string;
  shape: PointShape;
  size: number;
}

export interface TrackingSample {
  frameIndex: number;
  pointId: number;
  pixel: PixelCoords;
}

export interface TrackingSettings {
  pointsPerFrame: number;
  activePointId: number;
  autoAdvanceHorizontal: boolean;
  autoAdvanceVertical: boolean;
  showPoints: boolean;
  showTrajectories: boolean;
  showVelocityVectors: boolean;
  showAccelerationVectors: boolean;
  velocityVectorScale: number;
  accelerationVectorScale: number;
  massKg: number | null;
  gravityMps2: number;
}

export interface ComputedSampleRow {
  frameIndex: number;
  pointId: number;
  timeSecs: number;
  pixel: PixelCoords;
  x: number | null;
  y: number | null;
  vx: number | null;
  vy: number | null;
  speed: number | null;
  ax: number | null;
  ay: number | null;
  acceleration: number | null;
  kineticEnergy: number | null;
  potentialEnergy: number | null;
  mechanicalEnergy: number | null;
}

export interface TrackingHistory {
  past: TrackingSample[][];
  present: TrackingSample[];
  future: TrackingSample[][];
}

export const DEFAULT_POINT_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
] as const;

const DEFAULT_POINT_SHAPES: PointShape[] = ["cross", "circle", "square"];
const MAX_HISTORY_ENTRIES = 200;

export function createDefaultPointStyles(): TrackedPointStyle[] {
  return DEFAULT_POINT_COLORS.map((color, index) => ({
    id: index + 1,
    name: `P${index + 1}`,
    color,
    shape: DEFAULT_POINT_SHAPES[index % DEFAULT_POINT_SHAPES.length],
    size: 3,
  }));
}

export function createDefaultTrackingSettings(): TrackingSettings {
  return {
    pointsPerFrame: 1,
    activePointId: 1,
    autoAdvanceHorizontal: true,
    autoAdvanceVertical: true,
    showPoints: true,
    showTrajectories: true,
    showVelocityVectors: false,
    showAccelerationVectors: false,
    velocityVectorScale: 0.15,
    accelerationVectorScale: 0.05,
    massKg: null,
    gravityMps2: 9.81,
  };
}

export function createTrackingHistory(): TrackingHistory {
  return {
    past: [],
    present: [],
    future: [],
  };
}

export function commitTrackingSamples(
  history: TrackingHistory,
  next: TrackingSample[],
): TrackingHistory {
  const past = [...history.past, history.present];
  if (past.length > MAX_HISTORY_ENTRIES) {
    past.shift();
  }
  return {
    past,
    present: next,
    future: [],
  };
}

export function undoTrackingHistory(history: TrackingHistory): TrackingHistory {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoTrackingHistory(history: TrackingHistory): TrackingHistory {
  if (history.future.length === 0) return history;
  const [next, ...remainingFuture] = history.future;
  return {
    past: [...history.past, history.present],
    present: next,
    future: remainingFuture,
  };
}

/** Insère ou remplace un pointage pour `(frameIndex, pointId)` dans un ordre déterministe. */
export function upsertSample(
  samples: TrackingSample[],
  next: TrackingSample,
): TrackingSample[] {
  const filtered = samples.filter(
    (item) => !(item.frameIndex === next.frameIndex && item.pointId === next.pointId),
  );
  filtered.push(next);
  filtered.sort((a, b) => a.frameIndex - b.frameIndex || a.pointId - b.pointId);
  return filtered;
}

export function removeSamplesForPoint(
  samples: TrackingSample[],
  pointId: number,
): TrackingSample[] {
  return samples.filter((item) => item.pointId !== pointId);
}

export function removeSamplesForFrame(
  samples: TrackingSample[],
  frameIndex: number,
): TrackingSample[] {
  return samples.filter((item) => item.frameIndex !== frameIndex);
}

/** Détermine l'image et le point actifs après un clic de pointage. */
export function computeNextStepAfterPick(
  currentFrame: number,
  totalFrames: number,
  settings: TrackingSettings,
): { nextFrame: number; nextPointId: number } {
  if (settings.autoAdvanceHorizontal && settings.activePointId < settings.pointsPerFrame) {
    return {
      nextFrame: currentFrame,
      nextPointId: settings.activePointId + 1,
    };
  }
  if (settings.autoAdvanceVertical && currentFrame + 1 < totalFrames) {
    return {
      nextFrame: currentFrame + 1,
      nextPointId: settings.autoAdvanceHorizontal ? 1 : settings.activePointId,
    };
  }
  return {
    nextFrame: currentFrame,
    nextPointId: settings.activePointId,
  };
}

/** Calcule la série cinématique et énergétique d'un point donné. */
export function computeKinematicsSeries(
  samples: TrackingSample[],
  pointId: number,
  calibration: CalibrationState,
  frameDurationSecs: number,
  massKg: number | null,
  gravityMps2: number,
): ComputedSampleRow[] {
  const ordered = samples
    .filter((item) => item.pointId === pointId)
    .sort((a, b) => a.frameIndex - b.frameIndex);

  const rows: ComputedSampleRow[] = ordered.map((sample) => {
    const physical = pixelsToMeters(sample.pixel, calibration);
    return {
      frameIndex: sample.frameIndex,
      pointId: sample.pointId,
      timeSecs: frameToTimeSecs(
        sample.frameIndex,
        calibration.t0FrameIndex,
        frameDurationSecs,
      ),
      pixel: sample.pixel,
      x: physical ? physical.x : null,
      y: physical ? physical.y : null,
      vx: null,
      vy: null,
      speed: null,
      ax: null,
      ay: null,
      acceleration: null,
      kineticEnergy: null,
      potentialEnergy: null,
      mechanicalEnergy: null,
    };
  });

  // Vitesses par dérivée centrée sur [1 .. n - 2].
  for (let i = 1; i < rows.length - 1; i += 1) {
    const prev = rows[i - 1];
    const next = rows[i + 1];
    const dt = next.timeSecs - prev.timeSecs;
    if (
      prev.x !== null &&
      prev.y !== null &&
      next.x !== null &&
      next.y !== null &&
      dt > 0
    ) {
      const vx = normalizeZero((next.x - prev.x) / dt);
      const vy = normalizeZero((next.y - prev.y) / dt);
      rows[i].vx = vx;
      rows[i].vy = vy;
      rows[i].speed = Math.hypot(vx, vy);
    }
  }

  // Accélérations par dérivée centrée sur les vitesses disponibles.
  for (let i = 1; i < rows.length - 1; i += 1) {
    const prev = rows[i - 1];
    const next = rows[i + 1];
    const dt = next.timeSecs - prev.timeSecs;
    if (
      prev.vx !== null &&
      prev.vy !== null &&
      next.vx !== null &&
      next.vy !== null &&
      dt > 0
    ) {
      const ax = normalizeZero((next.vx - prev.vx) / dt);
      const ay = normalizeZero((next.vy - prev.vy) / dt);
      rows[i].ax = ax;
      rows[i].ay = ay;
      rows[i].acceleration = Math.hypot(ax, ay);
    }
  }

  // Énergies mécaniques si la masse est strictement positive.
  const hasMass = massKg !== null && Number.isFinite(massKg) && massKg > 0;
  const hasGravity = Number.isFinite(gravityMps2);
  if (hasMass) {
    for (const row of rows) {
      if (row.speed !== null) {
        row.kineticEnergy = normalizeZero(0.5 * massKg * row.speed * row.speed);
      }
      if (hasGravity && row.y !== null) {
        row.potentialEnergy = normalizeZero(massKg * gravityMps2 * row.y);
      }
      if (row.kineticEnergy !== null && row.potentialEnergy !== null) {
        row.mechanicalEnergy = normalizeZero(row.kineticEnergy + row.potentialEnergy);
      }
    }
  }

  return rows;
}
