// SPDX-License-Identifier: MPL-2.0

export interface PixelCoords {
  x: number;
  y: number;
}

/** Normalise `-0` en `0` pour éviter des divergences de sérialisation ou de tests. */
export function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Formate une taille en octets, Ko, Mo ou Go selon l'usage français. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 o";
  if (bytes < 1024) return `${Math.round(bytes)} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ${units[unitIndex]}`;
}

export function formatDecimal(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function clampFrameIndex(index: number, totalFrames: number): number {
  if (totalFrames <= 0) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), totalFrames - 1);
}

/**
 * Convertit des coordonnées écran (clientX, clientY) en pixels de la vidéo
 * d'origine, indépendamment du zoom d'affichage ou du défilement.
 */
export function computeVideoPixelCoords(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  videoWidth: number,
  videoHeight: number,
): PixelCoords | null {
  if (rect.width <= 0 || rect.height <= 0 || videoWidth <= 0 || videoHeight <= 0) {
    return null;
  }
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  if (relX < 0 || relX >= 1 || relY < 0 || relY >= 1) {
    return null;
  }
  return {
    x: Math.min(videoWidth - 1, Math.max(0, Math.floor(relX * videoWidth))),
    y: Math.min(videoHeight - 1, Math.max(0, Math.floor(relY * videoHeight))),
  };
}
