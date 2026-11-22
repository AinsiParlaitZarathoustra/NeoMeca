// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  computeMetersPerPixel,
  createDefaultCalibration,
  frameToTimeSecs,
  metersToPixels,
  pixelsToMeters,
  type AxisOrientation,
} from "./calibration.ts";

test("computeMetersPerPixel gère les cas valides et invalides", () => {
  const base = createDefaultCalibration();
  assert.equal(computeMetersPerPixel(base), null);

  assert.equal(
    computeMetersPerPixel({ ...base, point1: { x: 10, y: 20 } }),
    null,
  );

  assert.equal(
    computeMetersPerPixel({
      ...base,
      point1: { x: 10, y: 20 },
      point2: { x: 10, y: 20 },
      realDistanceMeters: 2,
    }),
    null,
  );

  assert.equal(
    computeMetersPerPixel({
      ...base,
      point1: { x: 0, y: 0 },
      point2: { x: 100, y: 0 },
      realDistanceMeters: 0,
    }),
    null,
  );

  assert.equal(
    computeMetersPerPixel({
      ...base,
      point1: { x: 0, y: 0 },
      point2: { x: 100, y: 0 },
      realDistanceMeters: -1,
    }),
    null,
  );

  // Triangle 3-4-5 -> 50 pixels pour 2,5 m => 0,05 m/px
  const valid = computeMetersPerPixel({
    ...base,
    point1: { x: 10, y: 10 },
    point2: { x: 40, y: 50 },
    realDistanceMeters: 2.5,
  });
  assert.ok(valid !== null && Math.abs(valid - 0.05) < 1e-12);
});

test("pixelsToMeters et metersToPixels respectent les 4 orientations d'axes", () => {
  const calibrationBase = {
    ...createDefaultCalibration(),
    point1: { x: 0, y: 0 },
    point2: { x: 100, y: 0 },
    realDistanceMeters: 1, // 0,01 m/px
    origin: { x: 200, y: 150 },
  };

  // Point test à +50 px à droite et 40 px au-dessus de l'origine en coordonnées écran
  const samplePixel = { x: 250, y: 110 };

  const cases: Array<{ orientation: AxisOrientation; expected: { x: number; y: number } }> = [
    { orientation: { x: 1, y: 1 }, expected: { x: 0.5, y: 0.4 } },
    { orientation: { x: -1, y: 1 }, expected: { x: -0.5, y: 0.4 } },
    { orientation: { x: 1, y: -1 }, expected: { x: 0.5, y: -0.4 } },
    { orientation: { x: -1, y: -1 }, expected: { x: -0.5, y: -0.4 } },
  ];

  for (const { orientation, expected } of cases) {
    const cal = { ...calibrationBase, orientation };
    const physical = pixelsToMeters(samplePixel, cal);
    assert.ok(physical !== null);
    assert.ok(Math.abs(physical.x - expected.x) < 1e-12);
    assert.ok(Math.abs(physical.y - expected.y) < 1e-12);

    const roundTrip = metersToPixels(physical, cal);
    assert.ok(roundTrip !== null);
    assert.ok(Math.abs(roundTrip.x - samplePixel.x) < 1e-9);
    assert.ok(Math.abs(roundTrip.y - samplePixel.y) < 1e-9);
  }

  // Origine exacte -> (0, 0) sans -0
  assert.deepEqual(
    pixelsToMeters({ x: 200, y: 150 }, { ...calibrationBase, orientation: { x: -1, y: -1 } }),
    { x: 0, y: 0 },
  );

  // Sans origine -> null
  assert.equal(pixelsToMeters(samplePixel, { ...calibrationBase, origin: null }), null);
  assert.equal(metersToPixels({ x: 1, y: 1 }, { ...calibrationBase, origin: null }), null);
});

test("frameToTimeSecs calcule le temps relatif avec t0 = 0 et t0 > 0", () => {
  const period = 0.04; // 25 img/s
  assert.equal(frameToTimeSecs(0, 0, period), 0);
  assert.ok(Math.abs(frameToTimeSecs(10, 0, period) - 0.4) < 1e-12);

  // Avec t0 = 5 : temps négatifs avant t0, nul en t0, positif après
  assert.ok(Math.abs(frameToTimeSecs(2, 5, period) - -0.12) < 1e-12);
  assert.equal(frameToTimeSecs(5, 5, period), 0);
  assert.ok(Math.abs(frameToTimeSecs(15, 5, period) - 0.4) < 1e-12);
});
