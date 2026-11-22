// SPDX-License-Identifier: MPL-2.0
import type { ComputedSampleRow } from "./tracking.ts";

export type ColumnSeparator = "tab" | "semicolon" | "comma" | "space";
export type DecimalSeparator = "dot" | "comma";

export const UTF8_BOM = "\uFEFF";

export function withUtf8Bom(content: string): string {
  return content.startsWith(UTF8_BOM) ? content : `${UTF8_BOM}${content}`;
}

export interface TabularExportOptions {
  columnSeparator: ColumnSeparator;
  decimalSeparator: DecimalSeparator;
  includeEnergies: boolean;
}

const SEPARATOR_CHARS: Record<ColumnSeparator, string> = {
  tab: "\t",
  semicolon: ";",
  comma: ",",
  space: " ",
};

function formatExportNumber(
  value: number | null,
  decimalSeparator: DecimalSeparator,
  quoteIfComma: boolean,
): string {
  if (value === null || !Number.isFinite(value)) return "";
  const raw = String(value);
  const text = decimalSeparator === "comma" ? raw.replace(".", ",") : raw;
  if (quoteIfComma && text.includes(",")) {
    return `"${text}"`;
  }
  return text;
}

function buildColumns(includeEnergies: boolean) {
  const base = [
    { header: "Image", symbol: "i", unit: "", read: (r: ComputedSampleRow) => r.frameIndex + 1 },
    { header: "t (s)", symbol: "t", unit: "s", read: (r: ComputedSampleRow) => r.timeSecs },
    { header: "x (m)", symbol: "x", unit: "m", read: (r: ComputedSampleRow) => r.x },
    { header: "y (m)", symbol: "y", unit: "m", read: (r: ComputedSampleRow) => r.y },
    { header: "vx (m/s)", symbol: "vx", unit: "m/s", read: (r: ComputedSampleRow) => r.vx },
    { header: "vy (m/s)", symbol: "vy", unit: "m/s", read: (r: ComputedSampleRow) => r.vy },
    { header: "v (m/s)", symbol: "v", unit: "m/s", read: (r: ComputedSampleRow) => r.speed },
    { header: "ax (m/s²)", symbol: "ax", unit: "m/s2", read: (r: ComputedSampleRow) => r.ax },
    { header: "ay (m/s²)", symbol: "ay", unit: "m/s2", read: (r: ComputedSampleRow) => r.ay },
    {
      header: "a (m/s²)",
      symbol: "a",
      unit: "m/s2",
      read: (r: ComputedSampleRow) => r.acceleration,
    },
  ];
  if (!includeEnergies) return base;
  return [
    ...base,
    {
      header: "Ec (J)",
      symbol: "Ec",
      unit: "J",
      read: (r: ComputedSampleRow) => r.kineticEnergy,
    },
    {
      header: "Ep (J)",
      symbol: "Ep",
      unit: "J",
      read: (r: ComputedSampleRow) => r.potentialEnergy,
    },
    {
      header: "Em (J)",
      symbol: "Em",
      unit: "J",
      read: (r: ComputedSampleRow) => r.mechanicalEnergy,
    },
  ];
}

/** Formate le tableau de mesures en CSV / Texte selon les séparateurs choisis. */
export function formatTableExport(
  rows: ComputedSampleRow[],
  options: TabularExportOptions,
): string {
  const sep = SEPARATOR_CHARS[options.columnSeparator];
  const quoteIfComma =
    options.columnSeparator === "comma" && options.decimalSeparator === "comma";
  const columns = buildColumns(options.includeEnergies);

  const lines: string[] = [columns.map((col) => col.header).join(sep)];
  for (const row of rows) {
    const cells = columns.map((col, idx) => {
      const val = col.read(row);
      if (idx === 0) return String(val ?? "");
      return formatExportNumber(val, options.decimalSeparator, quoteIfComma);
    });
    lines.push(cells.join(sep));
  }
  return lines.join("\r\n");
}

/** Formate le tableau en TSV avec virgule décimale pour le presse-papier. */
export function formatTsvForClipboard(
  rows: ComputedSampleRow[],
  includeEnergies: boolean,
): string {
  return formatTableExport(rows, {
    columnSeparator: "tab",
    decimalSeparator: "comma",
    includeEnergies,
  });
}

/**
 * Génère un fichier texte structuré compatible Regressi (.rw3) :
 * ligne 1 = symboles, ligne 2 = unités, lignes suivantes = valeurs tabulées (point décimal).
 */
export function formatRegressiRw3(
  rows: ComputedSampleRow[],
  options: { includeEnergies: boolean },
): string {
  // Exclut la colonne d'indice d'image et garde les grandeurs physiques avec leurs unités.
  const columns = buildColumns(options.includeEnergies).slice(1);
  const lines: string[] = [
    columns.map((col) => col.symbol).join("\t"),
    columns.map((col) => col.unit).join("\t"),
  ];

  for (const row of rows) {
    const cells = columns.map((col) => formatExportNumber(col.read(row), "dot", false));
    lines.push(cells.join("\t"));
  }
  return lines.join("\r\n");
}
