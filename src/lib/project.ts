// SPDX-License-Identifier: MPL-2.0
import type { AxisDirection, CalibrationState } from "./calibration.ts";
import type {
  PointShape,
  TrackedPointStyle,
  TrackingSample,
  TrackingSettings,
} from "./tracking.ts";
import type { PixelCoords } from "./video-math.ts";

export const PROJECT_SCHEMA_VERSION = 1;

export interface NeoMecaProjectFile {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  videoPath: string;
  calibration: CalibrationState;
  trackingSettings: TrackingSettings;
  pointStyles: TrackedPointStyle[];
  samples: TrackingSample[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parsePixelCoords(value: unknown, fieldName: string): PixelCoords {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    throw new Error(`Coordonnées invalides dans "${fieldName}".`);
  }
  return { x: value.x, y: value.y };
}

function parseOptionalPixelCoords(value: unknown, fieldName: string): PixelCoords | null {
  if (value === null || value === undefined) return null;
  return parsePixelCoords(value, fieldName);
}

function parseAxisDirection(value: unknown, fieldName: string): AxisDirection {
  if (value === 1 || value === -1) return value;
  throw new Error(`Orientation invalide dans "${fieldName}".`);
}

function parsePointShape(value: unknown): PointShape {
  if (value === "cross" || value === "square" || value === "circle") return value;
  throw new Error("Forme de point invalide dans le projet.");
}

function parseCalibration(raw: unknown): CalibrationState {
  if (!isRecord(raw)) {
    throw new Error("Section d'étalonnage manquante ou invalide.");
  }
  if (!isRecord(raw.orientation)) {
    throw new Error("Orientation des axes invalide dans l'étalonnage.");
  }
  if (!isFiniteNumber(raw.realDistanceMeters) || raw.realDistanceMeters <= 0) {
    throw new Error("Distance d'échelle invalide dans l'étalonnage.");
  }
  if (!isFiniteNumber(raw.t0FrameIndex) || raw.t0FrameIndex < 0) {
    throw new Error("Indice d'image t0 invalide dans l'étalonnage.");
  }
  return {
    point1: parseOptionalPixelCoords(raw.point1, "calibration.point1"),
    point2: parseOptionalPixelCoords(raw.point2, "calibration.point2"),
    realDistanceMeters: raw.realDistanceMeters,
    origin: parseOptionalPixelCoords(raw.origin, "calibration.origin"),
    orientation: {
      x: parseAxisDirection(raw.orientation.x, "calibration.orientation.x"),
      y: parseAxisDirection(raw.orientation.y, "calibration.orientation.y"),
    },
    t0FrameIndex: Math.trunc(raw.t0FrameIndex),
    showScale: typeof raw.showScale === "boolean" ? raw.showScale : true,
    showAxes: typeof raw.showAxes === "boolean" ? raw.showAxes : true,
    scaleColor: typeof raw.scaleColor === "string" ? raw.scaleColor : "#22c55e",
    axesColor: typeof raw.axesColor === "string" ? raw.axesColor : "#3b82f6",
  };
}

function parseTrackingSettings(raw: unknown): TrackingSettings {
  if (!isRecord(raw)) {
    throw new Error("Paramètres de pointage manquants ou invalides.");
  }
  if (
    !isFiniteNumber(raw.pointsPerFrame) ||
    raw.pointsPerFrame < 1 ||
    raw.pointsPerFrame > 9
  ) {
    throw new Error("Nombre de points par image invalide.");
  }
  const pointsPerFrame = Math.trunc(raw.pointsPerFrame);
  const activePointId = isFiniteNumber(raw.activePointId)
    ? Math.min(pointsPerFrame, Math.max(1, Math.trunc(raw.activePointId)))
    : 1;

  return {
    pointsPerFrame,
    activePointId,
    autoAdvanceHorizontal:
      typeof raw.autoAdvanceHorizontal === "boolean" ? raw.autoAdvanceHorizontal : true,
    autoAdvanceVertical:
      typeof raw.autoAdvanceVertical === "boolean" ? raw.autoAdvanceVertical : true,
    showPoints: typeof raw.showPoints === "boolean" ? raw.showPoints : true,
    showTrajectories:
      typeof raw.showTrajectories === "boolean" ? raw.showTrajectories : true,
    showVelocityVectors:
      typeof raw.showVelocityVectors === "boolean" ? raw.showVelocityVectors : false,
    showAccelerationVectors:
      typeof raw.showAccelerationVectors === "boolean"
        ? raw.showAccelerationVectors
        : false,
    velocityVectorScale:
      isFiniteNumber(raw.velocityVectorScale) && raw.velocityVectorScale > 0
        ? raw.velocityVectorScale
        : 0.15,
    accelerationVectorScale:
      isFiniteNumber(raw.accelerationVectorScale) && raw.accelerationVectorScale > 0
        ? raw.accelerationVectorScale
        : 0.05,
    massKg:
      raw.massKg === null || raw.massKg === undefined
        ? null
        : isFiniteNumber(raw.massKg) && raw.massKg > 0
          ? raw.massKg
          : null,
    gravityMps2:
      isFiniteNumber(raw.gravityMps2) && raw.gravityMps2 >= 0 ? raw.gravityMps2 : 9.81,
  };
}

function parsePointStyles(raw: unknown): TrackedPointStyle[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Styles des points manquants ou invalides.");
  }
  return raw.map((item, idx) => {
    if (!isRecord(item) || !isFiniteNumber(item.id) || typeof item.color !== "string") {
      throw new Error(`Style de point invalide à l'index ${idx}.`);
    }
    return {
      id: Math.trunc(item.id),
      name: typeof item.name === "string" && item.name ? item.name : `P${Math.trunc(item.id)}`,
      color: item.color,
      shape: parsePointShape(item.shape),
      size: isFiniteNumber(item.size) ? Math.min(5, Math.max(1, Math.trunc(item.size))) : 3,
    };
  });
}

function parseSamples(raw: unknown): TrackingSample[] {
  if (!Array.isArray(raw)) {
    throw new Error("Liste des pointages invalide.");
  }
  return raw.map((item, idx) => {
    if (
      !isRecord(item) ||
      !isFiniteNumber(item.frameIndex) ||
      item.frameIndex < 0 ||
      !isFiniteNumber(item.pointId) ||
      item.pointId < 1 ||
      item.pointId > 9
    ) {
      throw new Error(`Mesure invalide à l'index ${idx}.`);
    }
    return {
      frameIndex: Math.trunc(item.frameIndex),
      pointId: Math.trunc(item.pointId),
      pixel: parsePixelCoords(item.pixel, `samples[${idx}].pixel`),
    };
  });
}

export function serializeProjectFile(
  project: Omit<NeoMecaProjectFile, "schemaVersion">,
): string {
  const payload: NeoMecaProjectFile = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    ...project,
  };
  return JSON.stringify(payload, null, 2);
}

/** Empreinte canonique des données utilisateur pour détecter les modifications non enregistrées. */
export function createProjectDirtySnapshot(params: {
  videoPath: string | null;
  calibration: CalibrationState;
  samples: TrackingSample[];
}): string | null {
  if (!params.videoPath) return null;
  return JSON.stringify({
    videoPath: params.videoPath,
    calibration: params.calibration,
    samples: params.samples,
  });
}

export function isProjectDirty(
  current: {
    videoPath: string | null;
    calibration: CalibrationState;
    samples: TrackingSample[];
  },
  savedSnapshot: string | null,
): boolean {
  if (!current.videoPath || savedSnapshot === null) return false;
  return createProjectDirtySnapshot(current) !== savedSnapshot;
}

/** Valide et désérialise un fichier `.neomeca.json`. */
export function parseProjectFile(rawJson: string): NeoMecaProjectFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(
      `Fichier projet JSON invalide : ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!isRecord(parsed)) {
    throw new Error("Le fichier projet doit contenir un objet JSON.");
  }

  if (parsed.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Version de projet non prise en charge : ${String(parsed.schemaVersion)}.`,
    );
  }

  if (typeof parsed.videoPath !== "string" || parsed.videoPath.trim() === "") {
    throw new Error("Chemin vidéo manquant dans le fichier projet.");
  }

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    videoPath: parsed.videoPath,
    calibration: parseCalibration(parsed.calibration),
    trackingSettings: parseTrackingSettings(parsed.trackingSettings),
    pointStyles: parsePointStyles(parsed.pointStyles),
    samples: parseSamples(parsed.samples),
  };
}
