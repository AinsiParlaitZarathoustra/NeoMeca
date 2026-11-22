// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultCalibration, metersToPixels } from "./calibration.ts";
import {
  commitTrackingSamples,
  computeKinematicsSeries,
  computeNextStepAfterPick,
  createDefaultPointStyles,
  createDefaultTrackingSettings,
  createTrackingHistory,
  redoTrackingHistory,
  removeSamplesForFrame,
  removeSamplesForPoint,
  undoTrackingHistory,
  upsertSample,
  type TrackingSample,
} from "./tracking.ts";

test("createDefaultPointStyles fournit 9 styles distincts", () => {
  const styles = createDefaultPointStyles();
  assert.equal(styles.length, 9);
  const colors = new Set(styles.map((s) => s.color));
  assert.equal(colors.size, 9);
  assert.deepEqual(
    styles.map((s) => s.id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test("upsertSample remplace les doublons et maintient un ordre déterministe", () => {
  let samples: TrackingSample[] = [];
  samples = upsertSample(samples, { frameIndex: 2, pointId: 2, pixel: { x: 20, y: 20 } });
  samples = upsertSample(samples, { frameIndex: 1, pointId: 1, pixel: { x: 10, y: 10 } });
  samples = upsertSample(samples, { frameIndex: 2, pointId: 1, pixel: { x: 15, y: 15 } });
  samples = upsertSample(samples, { frameIndex: 1, pointId: 1, pixel: { x: 99, y: 88 } });

  assert.deepEqual(samples, [
    { frameIndex: 1, pointId: 1, pixel: { x: 99, y: 88 } },
    { frameIndex: 2, pointId: 1, pixel: { x: 15, y: 15 } },
    { frameIndex: 2, pointId: 2, pixel: { x: 20, y: 20 } },
  ]);
});

test("computeNextStepAfterPick gère les modes mono-point et multi-points", () => {
  const base = createDefaultTrackingSettings();

  // Mono-point, avance verticale active
  assert.deepEqual(computeNextStepAfterPick(0, 10, base), { nextFrame: 1, nextPointId: 1 });
  // En dernière image : reste sur place
  assert.deepEqual(computeNextStepAfterPick(9, 10, base), { nextFrame: 9, nextPointId: 1 });

  // Multi-points (3 points), avance horizontale et verticale actives
  const multi = { ...base, pointsPerFrame: 3, activePointId: 1 };
  assert.deepEqual(computeNextStepAfterPick(2, 10, multi), { nextFrame: 2, nextPointId: 2 });
  assert.deepEqual(
    computeNextStepAfterPick(2, 10, { ...multi, activePointId: 3 }),
    { nextFrame: 3, nextPointId: 1 },
  );

  // Avance horizontale désactivée, verticale active : garde le point actif et avance d'image
  assert.deepEqual(
    computeNextStepAfterPick(2, 10, {
      ...multi,
      activePointId: 2,
      autoAdvanceHorizontal: false,
      autoAdvanceVertical: true,
    }),
    { nextFrame: 3, nextPointId: 2 },
  );

  // Avance verticale désactivée : passe de P1 à P2 sur la même image, puis s'arrête sur P3
  assert.deepEqual(
    computeNextStepAfterPick(2, 10, {
      ...multi,
      activePointId: 1,
      autoAdvanceVertical: false,
    }),
    { nextFrame: 2, nextPointId: 2 },
  );
  assert.deepEqual(
    computeNextStepAfterPick(2, 10, {
      ...multi,
      activePointId: 3,
      autoAdvanceVertical: false,
    }),
    { nextFrame: 2, nextPointId: 3 },
  );
});

test("Undo / Redo gère l'historique des pointages", () => {
  let history = createTrackingHistory();
  const s1 = upsertSample(history.present, { frameIndex: 0, pointId: 1, pixel: { x: 1, y: 2 } });
  history = commitTrackingSamples(history, s1);
  const s2 = upsertSample(history.present, { frameIndex: 1, pointId: 1, pixel: { x: 3, y: 4 } });
  history = commitTrackingSamples(history, s2);

  assert.equal(history.present.length, 2);
  history = undoTrackingHistory(history);
  assert.equal(history.present.length, 1);
  history = redoTrackingHistory(history);
  assert.equal(history.present.length, 2);
});

test("computeKinematicsSeries vérifie un tir parabolique analytique et les bornes", () => {
  const g = 9.81;
  const massKg = 0.5;
  const dt = 0.05; // 20 img/s
  const vx0 = 4.0;
  const vy0 = 5.0;

  // Étalonnage exact : 1 px = 0,001 m (1000 px/m)
  const calibration = {
    ...createDefaultCalibration(),
    point1: { x: 0, y: 0 },
    point2: { x: 1000, y: 0 },
    realDistanceMeters: 1,
    origin: { x: 100, y: 2000 },
  };

  // Génération exacte x(t) = vx0 * t, y(t) = vy0 * t - 0.5 * g * t^2
  const samples: TrackingSample[] = [];
  for (let frameIndex = 0; frameIndex < 9; frameIndex += 1) {
    const t = frameIndex * dt;
    const x = vx0 * t;
    const y = vy0 * t - 0.5 * g * t * t;
    const pixel = metersToPixels({ x, y }, calibration);
    assert.ok(pixel !== null);
    samples.push({ frameIndex, pointId: 1, pixel });
  }

  const series = computeKinematicsSeries(samples, 1, calibration, dt, massKg, g);
  assert.equal(series.length, 9);

  // Valeurs nulles aux extrémités
  assert.equal(series[0].vx, null);
  assert.equal(series[0].ax, null);
  assert.equal(series[0].kineticEnergy, null);
  assert.equal(series[1].ax, null);
  assert.equal(series[7].ax, null);
  assert.equal(series[8].vx, null);
  assert.equal(series[8].ax, null);

  // Pour un polynôme quadratique, la dérivée centrée est exacte (aux arrondis flottants près)
  const expectedEm = 0.5 * massKg * (vx0 * vx0 + vy0 * vy0);
  for (let i = 2; i <= 6; i += 1) {
    const row = series[i];
    const t = i * dt;
    assert.ok(row.vx !== null && Math.abs(row.vx - vx0) < 1e-10);
    assert.ok(row.vy !== null && Math.abs(row.vy - (vy0 - g * t)) < 1e-10);
    assert.ok(row.ax !== null && Math.abs(row.ax) < 1e-10);
    assert.ok(row.ay !== null && Math.abs(row.ay + g) < 1e-9);
    assert.ok(row.acceleration !== null && Math.abs(row.acceleration - g) < 1e-9);
    assert.ok(row.mechanicalEnergy !== null && Math.abs(row.mechanicalEnergy - expectedEm) < 1e-9);
  }

  // Sans étalonnage : positions, vitesses, accélérations et énergies à null
  const uncalibrated = computeKinematicsSeries(
    samples,
    1,
    createDefaultCalibration(),
    dt,
    massKg,
    g,
  );
  assert.equal(uncalibrated[4].x, null);
  assert.equal(uncalibrated[4].vx, null);
  assert.equal(uncalibrated[4].ax, null);
  assert.equal(uncalibrated[4].kineticEnergy, null);
  assert.equal(uncalibrated[4].potentialEnergy, null);

  // Avec étalonnage valide mais sans masse (null ou <= 0) : énergies à null
  const noMass = computeKinematicsSeries(samples, 1, calibration, dt, null, g);
  assert.ok(noMass[4].vx !== null);
  assert.equal(noMass[4].kineticEnergy, null);
  assert.equal(noMass[4].potentialEnergy, null);
  assert.equal(noMass[4].mechanicalEnergy, null);

  const zeroMass = computeKinematicsSeries(samples, 1, calibration, dt, 0, g);
  assert.equal(zeroMass[4].kineticEnergy, null);
});

test("removeSamplesForPoint, removeSamplesForFrame et images non contiguës", () => {
  const samples: TrackingSample[] = [
    { frameIndex: 0, pointId: 1, pixel: { x: 100, y: 2000 } },
    { frameIndex: 0, pointId: 2, pixel: { x: 150, y: 2000 } },
    { frameIndex: 2, pointId: 1, pixel: { x: 300, y: 2000 } },
    { frameIndex: 5, pointId: 1, pixel: { x: 600, y: 2000 } },
  ];

  assert.equal(removeSamplesForPoint(samples, 1).length, 1);
  assert.equal(removeSamplesForFrame(samples, 0).length, 2);

  // Vitesse avec pas de temps irrégulier (frames 0, 2, 5 à 0,1 s/frame -> dt = 0,5 s)
  const calibration = {
    ...createDefaultCalibration(),
    point1: { x: 0, y: 0 },
    point2: { x: 100, y: 0 },
    realDistanceMeters: 1, // 0,01 m/px
    origin: { x: 100, y: 2000 },
  };
  const series = computeKinematicsSeries(samples, 1, calibration, 0.1, null, 9.81);
  assert.equal(series.length, 3);
  assert.equal(series[0].vx, null);
  // x[0] = 0 m, x[2] = 5 m, t[2] - t[0] = 0,5 s => vx = 10 m/s
  assert.ok(series[1].vx !== null && Math.abs(series[1].vx - 10) < 1e-12);
  assert.equal(series[2].vx, null);
});
