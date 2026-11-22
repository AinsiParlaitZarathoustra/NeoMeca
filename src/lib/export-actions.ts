// SPDX-License-Identifier: MPL-2.0
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { CalibrationState } from "./calibration.ts";
import { renderAnnotatedFramePng } from "./export-canvas.ts";
import {
  formatRegressiRw3,
  formatTableExport,
  formatTsvForClipboard,
  withUtf8Bom,
  type TabularExportOptions,
} from "./export.ts";
import type {
  ComputedSampleRow,
  TrackedPointStyle,
  TrackingSample,
  TrackingSettings,
} from "./tracking.ts";
import type { VideoMetadata } from "./video.ts";

export interface ExcelRowData {
  frameNumber: number;
  timeSecs: number;
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

export interface ExcelSheetData {
  pointName: string;
  includeEnergies: boolean;
  rows: ExcelRowData[];
}

function sanitizeFileSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, "_") || "neomeca";
}

function stemFromFileName(fileName: string): string {
  return sanitizeFileSegment(fileName.replace(/\.[^.]+$/, "") || "neomeca");
}

/** Charge une image locale en Blob URL pour éviter de souiller le canvas hors écran. */
async function loadLocalImageFromDisk(filePath: string): Promise<HTMLImageElement> {
  const bytes = await readFile(filePath);
  const blob = new Blob([bytes], { type: "image/jpeg" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Impossible de décoder l'image extraite."));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function buildExcelSheetFromRows(
  pointName: string,
  rows: ComputedSampleRow[],
  includeEnergies: boolean,
): ExcelSheetData {
  return {
    pointName,
    includeEnergies,
    rows: rows.map((row) => ({
      frameNumber: row.frameIndex + 1,
      timeSecs: row.timeSecs,
      x: row.x,
      y: row.y,
      vx: row.vx,
      vy: row.vy,
      speed: row.speed,
      ax: row.ax,
      ay: row.ay,
      acceleration: row.acceleration,
      kineticEnergy: row.kineticEnergy,
      potentialEnergy: row.potentialEnergy,
      mechanicalEnergy: row.mechanicalEnergy,
    })),
  };
}

export async function copyMeasurementsTsv(
  rows: ComputedSampleRow[],
  includeEnergies: boolean,
): Promise<void> {
  const tsv = formatTsvForClipboard(rows, includeEnergies);
  await writeText(tsv);
}

export async function exportMeasurementsTabular(
  rows: ComputedSampleRow[],
  fileName: string,
  pointName: string,
  options: TabularExportOptions,
): Promise<boolean> {
  const stem = stemFromFileName(fileName);
  const safePoint = sanitizeFileSegment(pointName);
  const path = await save({
    title: "Exporter les mesures (CSV / Texte)",
    defaultPath: `${stem}_${safePoint}.csv`,
    filters: [
      { name: "CSV (*.csv)", extensions: ["csv"] },
      { name: "Texte tabulé (*.txt)", extensions: ["txt"] },
    ],
  });
  if (!path) return false;
  const formatted = formatTableExport(rows, options);
  const content = path.toLowerCase().endsWith(".csv")
    ? withUtf8Bom(formatted)
    : formatted;
  await writeTextFile(path, content);
  return true;
}

export async function exportMeasurementsExcel(params: {
  sheets: ExcelSheetData[];
  fileName: string;
  defaultLabel: string;
}): Promise<boolean> {
  const stem = stemFromFileName(params.fileName);
  const safeLabel = sanitizeFileSegment(params.defaultLabel);
  const path = await save({
    title: "Exporter en Excel (.xlsx)",
    defaultPath: `${stem}_${safeLabel}.xlsx`,
    filters: [{ name: "Classeur Excel (*.xlsx)", extensions: ["xlsx"] }],
  });
  if (!path) return false;
  await invoke("export_excel_xlsx", { path, sheets: params.sheets });
  return true;
}

export async function exportMeasurementsRw3(
  rows: ComputedSampleRow[],
  fileName: string,
  pointName: string,
  includeEnergies: boolean,
): Promise<boolean> {
  const stem = stemFromFileName(fileName);
  const safePoint = sanitizeFileSegment(pointName);
  const path = await save({
    title: "Exporter pour Regressi (.rw3)",
    defaultPath: `${stem}_${safePoint}.rw3`,
    filters: [{ name: "Fichier Regressi (*.rw3)", extensions: ["rw3"] }],
  });
  if (!path) return false;
  await writeTextFile(path, formatRegressiRw3(rows, { includeEnergies }));
  return true;
}

export async function exportAnnotatedPng(params: {
  metadata: VideoMetadata;
  frameCachePath: string | null;
  includeVideoBackground: boolean;
  currentFrame: number;
  calibration: CalibrationState;
  samples: TrackingSample[];
  styles: TrackedPointStyle[];
  settings: TrackingSettings;
}): Promise<boolean> {
  const { metadata, frameCachePath, includeVideoBackground, currentFrame } = params;
  if (includeVideoBackground && !frameCachePath) {
    throw new Error("L'image vidéo courante n'est pas encore chargée.");
  }

  const stem = stemFromFileName(metadata.fileName);
  const path = await save({
    title: "Exporter l'image annotée (.png)",
    defaultPath: `${stem}_image_${currentFrame + 1}.png`,
    filters: [{ name: "Image PNG (*.png)", extensions: ["png"] }],
  });
  if (!path) return false;

  const sourceImage =
    includeVideoBackground && frameCachePath
      ? await loadLocalImageFromDisk(frameCachePath)
      : null;

  const bytes = await renderAnnotatedFramePng({
    videoWidth: metadata.width,
    videoHeight: metadata.height,
    sourceImage,
    includeVideoBackground,
    currentFrame,
    frameDurationSecs: metadata.frameDurationSecs,
    calibration: params.calibration,
    samples: params.samples,
    styles: params.styles,
    settings: params.settings,
  });
  await writeFile(path, bytes);
  return true;
}
