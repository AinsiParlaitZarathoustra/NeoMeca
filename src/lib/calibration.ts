// SPDX-License-Identifier: MPL-2.0
import { normalizeZero, type PixelCoords } from "./video-math.ts";

/**
 * Sens d'un axe dans le repère physique :
 * - axe X : `1` vers la droite, `-1` vers la gauche ;
 * - axe Y : `1` vers le haut (sens physique usuel, opposé à l'axe Y écran), `-1` vers le bas.
 */
export type AxisDirection = 1 | -1;

export interface AxisOrientation {
  x: AxisDirection;
  y: AxisDirection;
}

export type CalibrationToolMode =
  | "none"
  | "pick-scale-1"
  | "pick-scale-2"
  | "pick-origin";

export interface PhysicalCoords {
  x: number;
  y: number;
}

export interface CalibrationState {
  point1: PixelCoords | null;
  point2: PixelCoords | null;
  realDistanceMeters: number;
  origin: PixelCoords | null;
  orientation: AxisOrientation;
  t0FrameIndex: number;
  showScale: boolean;
  showAxes: boolean;
  scaleColor: string;
  axesColor: string;
}

export const DEFAULT_SCALE_COLOR = "#22c55e";
export const DEFAULT_AXES_COLOR = "#3b82f6";

export function createDefaultCalibration(): CalibrationState {
  return {
    point1: null,
    point2: null,
    realDistanceMeters: 1,
    origin: null,
    orientation: { x: 1, y: 1 },
    t0FrameIndex: 0,
    showScale: true,
    showAxes: true,
    scaleColor: DEFAULT_SCALE_COLOR,
    axesColor: DEFAULT_AXES_COLOR,
  };
}

export function computePixelDistance(p1: PixelCoords, p2: PixelCoords): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Renvoie l'échelle spatiale en mètres par pixel, ou `null` si l'étalonnage
 * d'échelle est incomplet ou invalide (points confondus, distance <= 0).
 */
export function computeMetersPerPixel(calibration: CalibrationState): number | null {
  if (!calibration.point1 || !calibration.point2) return null;
  if (!Number.isFinite(calibration.realDistanceMeters) || calibration.realDistanceMeters <= 0) {
    return null;
  }
  const pixelDistance = computePixelDistance(calibration.point1, calibration.point2);
  if (!Number.isFinite(pixelDistance) || pixelDistance <= 0) return null;
  return calibration.realDistanceMeters / pixelDistance;
}

/** Convertit des coordonnées pixels (origine haut-gauche) en coordonnées métriques. */
export function pixelsToMeters(
  pixel: PixelCoords,
  calibration: CalibrationState,
): PhysicalCoords | null {
  if (!calibration.origin) return null;
  const metersPerPixel = computeMetersPerPixel(calibration);
  if (metersPerPixel === null) return null;

  return {
    x: normalizeZero((pixel.x - calibration.origin.x) * calibration.orientation.x * metersPerPixel),
    y: normalizeZero((calibration.origin.y - pixel.y) * calibration.orientation.y * metersPerPixel),
  };
}

/** Convertit des coordonnées métriques vers les pixels vidéo d'origine. */
export function metersToPixels(
  physical: PhysicalCoords,
  calibration: CalibrationState,
): PixelCoords | null {
  if (!calibration.origin) return null;
  const metersPerPixel = computeMetersPerPixel(calibration);
  if (metersPerPixel === null) return null;

  return {
    x: normalizeZero(
      calibration.origin.x + (physical.x / metersPerPixel) * calibration.orientation.x,
    ),
    y: normalizeZero(
      calibration.origin.y - (physical.y / metersPerPixel) * calibration.orientation.y,
    ),
  };
}

/** Calcule l'instant en secondes relatif à l'image de référence `t0FrameIndex`. */
export function frameToTimeSecs(
  frameIndex: number,
  t0FrameIndex: number,
  frameDurationSecs: number,
): number {
  if (!Number.isFinite(frameDurationSecs) || frameDurationSecs < 0) return 0;
  return normalizeZero((frameIndex - t0FrameIndex) * frameDurationSecs);
}
