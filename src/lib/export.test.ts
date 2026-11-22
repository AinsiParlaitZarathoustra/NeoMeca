// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  UTF8_BOM,
  formatRegressiRw3,
  formatTableExport,
  formatTsvForClipboard,
  withUtf8Bom,
} from "./export.ts";
import type { ComputedSampleRow } from "./tracking.ts";

const SAMPLE_ROWS: ComputedSampleRow[] = [
  {
    frameIndex: 0,
    pointId: 1,
    timeSecs: 0,
    pixel: { x: 10, y: 20 },
    x: 0.25,
    y: 1.5,
    vx: null,
    vy: null,
    speed: null,
    ax: null,
    ay: null,
    acceleration: null,
    kineticEnergy: null,
    potentialEnergy: 7.3575,
    mechanicalEnergy: null,
  },
  {
    frameIndex: 1,
    pointId: 1,
    timeSecs: 0.04,
    pixel: { x: 15, y: 25 },
    x: 0.35,
    y: 1.4,
    vx: 2.5,
    vy: -2.5,
    speed: 3.5,
    ax: null,
    ay: null,
    acceleration: null,
    kineticEnergy: 3.0625,
    potentialEnergy: 6.867,
    mechanicalEnergy: 9.9295,
  },
];

test("formatTableExport gère séparateurs et virgule décimale", () => {
  const semiComma = formatTableExport(SAMPLE_ROWS, {
    columnSeparator: "semicolon",
    decimalSeparator: "comma",
    includeEnergies: false,
  });
  const lines = semiComma.split("\r\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Image;t \(s\);x \(m\);/);
  assert.equal(lines[1], "1;0;0,25;1,5;;;;;;");
  assert.equal(lines[2], "2;0,04;0,35;1,4;2,5;-2,5;3,5;;;");

  // Virgule colonne + virgule décimale : guillemets sur les décimaux
  const commaComma = formatTableExport(SAMPLE_ROWS, {
    columnSeparator: "comma",
    decimalSeparator: "comma",
    includeEnergies: false,
  });
  assert.match(commaComma.split("\r\n")[1], /^1,0,"0,25","1,5",/);
});

test("formatTsvForClipboard produit du TSV tabulé avec virgule décimale", () => {
  const tsv = formatTsvForClipboard(SAMPLE_ROWS, true);
  const lines = tsv.split("\r\n");
  assert.match(lines[0], /\tEc \(J\)\tEp \(J\)\tEm \(J\)$/);
  assert.ok(lines[2].includes("\t3,0625\t6,867\t9,9295"));
});

test("formatRegressiRw3 génère symboles, unités et valeurs point décimal", () => {
  const rw3 = formatRegressiRw3(SAMPLE_ROWS, { includeEnergies: true });
  const lines = rw3.split("\r\n");
  assert.equal(lines[0], "t\tx\ty\tvx\tvy\tv\tax\tay\ta\tEc\tEp\tEm");
  assert.equal(lines[1], "s\tm\tm\tm/s\tm/s\tm/s\tm/s2\tm/s2\tm/s2\tJ\tJ\tJ");
  assert.equal(lines[2], "0\t0.25\t1.5\t\t\t\t\t\t\t\t7.3575\t");
  assert.equal(lines[3], "0.04\t0.35\t1.4\t2.5\t-2.5\t3.5\t\t\t\t3.0625\t6.867\t9.9295");
});

test("withUtf8Bom ajoute le BOM UTF-8 une seule fois", () => {
  assert.equal(withUtf8Bom("a;b"), `${UTF8_BOM}a;b`);
  assert.equal(withUtf8Bom(`${UTF8_BOM}a;b`), `${UTF8_BOM}a;b`);
});
