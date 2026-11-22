// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultCalibration } from "./calibration.ts";
import {
  PROJECT_SCHEMA_VERSION,
  createProjectDirtySnapshot,
  isProjectDirty,
  parseProjectFile,
  serializeProjectFile,
} from "./project.ts";
import {
  createDefaultPointStyles,
  createDefaultTrackingSettings,
} from "./tracking.ts";

test("serializeProjectFile et parseProjectFile réalisent un aller-retour fidèle", () => {
  const calibration = {
    ...createDefaultCalibration(),
    point1: { x: 10, y: 20 },
    point2: { x: 210, y: 20 },
    realDistanceMeters: 0.5,
    origin: { x: 100, y: 300 },
    t0FrameIndex: 3,
  };
  const trackingSettings = {
    ...createDefaultTrackingSettings(),
    pointsPerFrame: 2,
    massKg: 0.25,
  };
  const pointStyles = createDefaultPointStyles();
  const samples = [
    { frameIndex: 0, pointId: 1, pixel: { x: 110, y: 290 } },
    { frameIndex: 1, pointId: 2, pixel: { x: 120, y: 280 } },
  ];

  const json = serializeProjectFile({
    videoPath: "C:\\videos\\chute.mp4",
    calibration,
    trackingSettings,
    pointStyles,
    samples,
  });

  const parsed = parseProjectFile(json);
  assert.equal(parsed.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(parsed.videoPath, "C:\\videos\\chute.mp4");
  assert.deepEqual(parsed.calibration, calibration);
  assert.deepEqual(parsed.trackingSettings, trackingSettings);
  assert.deepEqual(parsed.pointStyles, pointStyles);
  assert.deepEqual(parsed.samples, samples);
});

test("parseProjectFile rejette un JSON invalide, une version inconnue ou des champs invalides", () => {
  assert.throws(() => parseProjectFile("{bad json"), /JSON invalide/);

  assert.throws(
    () =>
      parseProjectFile(
        JSON.stringify({
          schemaVersion: 99,
          videoPath: "a.mp4",
        }),
      ),
    /Version de projet non prise en charge/,
  );

  assert.throws(
    () =>
      parseProjectFile(
        JSON.stringify({
          schemaVersion: 1,
          videoPath: "",
        }),
      ),
    /Chemin vidéo manquant/,
  );

  assert.throws(
    () =>
      parseProjectFile(
        JSON.stringify({
          schemaVersion: 1,
          videoPath: "a.mp4",
          calibration: {
            realDistanceMeters: -2,
            t0FrameIndex: 0,
            orientation: { x: 1, y: 1 },
          },
        }),
      ),
    /Distance d'échelle invalide/,
  );
});

test("createProjectDirtySnapshot et isProjectDirty détectent les modifications non enregistrées", () => {
  const baseCal = createDefaultCalibration();
  const snapshot = createProjectDirtySnapshot({
    videoPath: "chute.mp4",
    calibration: baseCal,
    samples: [],
  });
  assert.ok(snapshot !== null);

  // État initial propre -> false
  assert.equal(
    isProjectDirty({ videoPath: "chute.mp4", calibration: baseCal, samples: [] }, snapshot),
    false,
  );

  // Ajout d'un point -> true
  const withSample = [{ frameIndex: 0, pointId: 1, pixel: { x: 10, y: 20 } }];
  assert.equal(
    isProjectDirty(
      { videoPath: "chute.mp4", calibration: baseCal, samples: withSample },
      snapshot,
    ),
    true,
  );

  // Retour à zéro (Ctrl+Z ou suppression) -> false
  assert.equal(
    isProjectDirty({ videoPath: "chute.mp4", calibration: baseCal, samples: [] }, snapshot),
    false,
  );

  // Modification de l'étalonnage -> true
  assert.equal(
    isProjectDirty(
      {
        videoPath: "chute.mp4",
        calibration: { ...baseCal, point1: { x: 5, y: 5 } },
        samples: [],
      },
      snapshot,
    ),
    true,
  );

  // Nouvelle sauvegarde -> false
  const savedAfterEdit = createProjectDirtySnapshot({
    videoPath: "chute.mp4",
    calibration: { ...baseCal, point1: { x: 5, y: 5 } },
    samples: withSample,
  });
  assert.equal(
    isProjectDirty(
      {
        videoPath: "chute.mp4",
        calibration: { ...baseCal, point1: { x: 5, y: 5 } },
        samples: withSample,
      },
      savedAfterEdit,
    ),
    false,
  );

  // Sans vidéo ouverte -> false
  assert.equal(
    isProjectDirty({ videoPath: null, calibration: baseCal, samples: [] }, snapshot),
    false,
  );
});
