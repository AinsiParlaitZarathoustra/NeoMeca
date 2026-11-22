// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  clampFrameIndex,
  computeVideoPixelCoords,
  formatFileSize,
} from "./video-math.ts";

test("clampFrameIndex borne l'indice dans [0, totalFrames - 1]", () => {
  assert.equal(clampFrameIndex(-5, 60), 0);
  assert.equal(clampFrameIndex(0, 60), 0);
  assert.equal(clampFrameIndex(12.9, 60), 12);
  assert.equal(clampFrameIndex(60, 60), 59);
  assert.equal(clampFrameIndex(5, 0), 0);
});

test("computeVideoPixelCoords convertit vers les pixels source quel que soit le zoom", () => {
  const rect = { left: 100, top: 50, width: 320, height: 180 };
  assert.deepEqual(computeVideoPixelCoords(100, 50, rect, 640, 360), { x: 0, y: 0 });
  assert.deepEqual(computeVideoPixelCoords(260, 140, rect, 640, 360), { x: 320, y: 180 });
  assert.deepEqual(computeVideoPixelCoords(419.9, 229.9, rect, 640, 360), { x: 639, y: 359 });
  assert.equal(computeVideoPixelCoords(99, 50, rect, 640, 360), null);
  assert.equal(computeVideoPixelCoords(420, 100, rect, 640, 360), null);
});

test("formatFileSize formate en octets, Ko et Mo", () => {
  assert.equal(formatFileSize(512), "512 o");
  assert.match(formatFileSize(2048), /^2,00 Ko$/);
  assert.match(formatFileSize(1_572_864), /^1,50 Mo$/);
});
