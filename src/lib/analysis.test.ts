// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnalysisChartData,
  computeLinearRegression,
  computeSeriesStats,
  extractNumericPairs,
} from "./analysis.ts";
import { createDefaultCalibration } from "./calibration.ts";
import { computeKinematicsSeries, type TrackingSample } from "./tracking.ts";

function buildSampleSeries() {
  const calibration = {
    ...createDefaultCalibration(),
    point1: { x: 0, y: 0 },
    point2: { x: 100, y: 0 },
    realDistanceMeters: 1, // 0,01 m/px
    origin: { x: 0, y: 500 },
  };
  // Mouvement rectiligne uniforme : x(t) = 2t, y(t) = 0,5t + 1
  const samples: TrackingSample[] = [
    { frameIndex: 0, pointId: 1, pixel: { x: 0, y: 400 } }, // t = 0 s -> x = 0, y = 1
    { frameIndex: 1, pointId: 1, pixel: { x: 20, y: 395 } }, // t = 0,1 s -> x = 0,2, y = 1,05
    { frameIndex: 2, pointId: 1, pixel: { x: 40, y: 390 } }, // t = 0,2 s -> x = 0,4, y = 1,1
    { frameIndex: 3, pointId: 1, pixel: { x: 60, y: 385 } }, // t = 0,3 s -> x = 0,6, y = 1,15
  ];
  return computeKinematicsSeries(samples, 1, calibration, 0.1, 0.5, 9.81);
}

test("buildAnalysisChartData extrait les séries attendues et ignore les bornes null", () => {
  const rows = buildSampleSeries();

  const trajectory = buildAnalysisChartData(rows, "trajectory");
  assert.equal(trajectory.xLabel, "x (m)");
  assert.equal(trajectory.points.length, 4);
  assert.equal(trajectory.points[0].xValue, 0);
  assert.ok(Math.abs((trajectory.points[3].y ?? 0) - 1.15) < 1e-12);

  const velocities = buildAnalysisChartData(rows, "velocities");
  assert.equal(velocities.points.length, 2); // indices 1 et 2 seulement
  assert.ok(Math.abs((velocities.points[0].vx ?? 0) - 2) < 1e-12);
  assert.ok(Math.abs((velocities.points[0].vy ?? 0) - 0.5) < 1e-12);
});

test("computeSeriesStats et computeLinearRegression calculent pente, ordonnée et R²", () => {
  const rows = buildSampleSeries();
  const positions = buildAnalysisChartData(rows, "positions");
  const pairsY = extractNumericPairs(positions.points, "y");

  const stats = computeSeriesStats(pairsY);
  assert.ok(stats !== null);
  assert.equal(stats.count, 4);
  assert.ok(Math.abs(stats.minY - 1) < 1e-12);
  assert.ok(Math.abs(stats.maxY - 1.15) < 1e-12);

  const reg = computeLinearRegression(pairsY);
  assert.ok(reg !== null);
  assert.ok(Math.abs(reg.slope - 0.5) < 1e-12);
  assert.ok(Math.abs(reg.intercept - 1.0) < 1e-12);
  assert.ok(Math.abs(reg.r2 - 1.0) < 1e-12);

  // Cas dégénérés : moins de 2 points ou abscisses identiques -> null
  assert.equal(computeLinearRegression([{ x: 1, y: 2 }]), null);
  assert.equal(
    computeLinearRegression([
      { x: 2, y: 1 },
      { x: 2, y: 5 },
    ]),
    null,
  );
});
