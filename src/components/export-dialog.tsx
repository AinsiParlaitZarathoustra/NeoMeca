// SPDX-License-Identifier: MPL-2.0
import {
  Check,
  CircleAlert,
  ClipboardCopy,
  Download,
  FileSpreadsheet,
  Image,
  Sheet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { CalibrationState } from "@/lib/calibration";
import {
  buildExcelSheetFromRows,
  copyMeasurementsTsv,
  exportAnnotatedPng,
  exportMeasurementsExcel,
  exportMeasurementsRw3,
  exportMeasurementsTabular,
} from "@/lib/export-actions";
import type { ColumnSeparator, DecimalSeparator } from "@/lib/export";
import {
  computeKinematicsSeries,
  type ComputedSampleRow,
  type TrackedPointStyle,
  type TrackingSample,
  type TrackingSettings,
} from "@/lib/tracking";
import type { VideoMetadata } from "@/lib/video";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metadata: VideoMetadata | null;
  rows: ComputedSampleRow[];
  pointName: string;
  frameCachePath: string | null;
  currentFrame: number;
  calibration: CalibrationState;
  samples: TrackingSample[];
  styles: TrackedPointStyle[];
  settings: TrackingSettings;
}

/** Fenêtre d'exportation des mesures (Excel, CSV, Regressi, presse-papier) et PNG. */
export function ExportDialog({
  open,
  onOpenChange,
  metadata,
  rows,
  pointName,
  frameCachePath,
  currentFrame,
  calibration,
  samples,
  styles,
  settings,
}: ExportDialogProps) {
  const [columnSeparator, setColumnSeparator] = useState<ColumnSeparator>("semicolon");
  const [decimalSeparator, setDecimalSeparator] = useState<DecimalSeparator>("comma");
  const [exportAllPointsExcel, setExportAllPointsExcel] = useState(true);
  const [includeVideoBackground, setIncludeVideoBackground] = useState(true);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setFeedback(null);
      setError(null);
      setCopied(false);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const includeEnergies = settings.massKg !== null && settings.massKg > 0;
  const hasRows = rows.length > 0;
  const pngDisabled = !metadata || busy || (includeVideoBackground && !frameCachePath);

  const trackedPointIds = useMemo(
    () =>
      Array.from(new Set(samples.map((sample) => sample.pointId))).sort(
        (a, b) => a - b,
      ),
    [samples],
  );
  const hasMultipleTrackedPoints = trackedPointIds.length > 1;
  const excelDisabled =
    !metadata ||
    busy ||
    (hasMultipleTrackedPoints && exportAllPointsExcel
      ? trackedPointIds.length === 0
      : !hasRows);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exporter les mesures et l&apos;image</DialogTitle>
          <DialogDescription>
            {hasMultipleTrackedPoints && exportAllPointsExcel
              ? `Exportez les données de ${pointName} (ou les ${trackedPointIds.length} points en Excel) et l'image annotée.`
              : `Exportez les données du point ${pointName} ou l'image courante annotée.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Export natif Excel (.xlsx) */}
          <div className="space-y-2.5">
            {hasMultipleTrackedPoints && (
              <div className="flex items-center justify-between">
                <Label htmlFor="export-excel-all" className="cursor-pointer text-xs">
                  Tous les points suivis ({trackedPointIds.length} onglets)
                </Label>
                <Switch
                  id="export-excel-all"
                  checked={exportAllPointsExcel}
                  onCheckedChange={setExportAllPointsExcel}
                />
              </div>
            )}

            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={excelDisabled}
              onClick={() =>
                runAction(async () => {
                  if (!metadata) return;
                  const useAll = hasMultipleTrackedPoints && exportAllPointsExcel;
                  const sheets = useAll
                    ? trackedPointIds.map((pointId) => {
                        const name =
                          styles.find((item) => item.id === pointId)?.name ??
                          `P${pointId}`;
                        const pointRows = computeKinematicsSeries(
                          samples,
                          pointId,
                          calibration,
                          metadata.frameDurationSecs,
                          settings.massKg,
                          settings.gravityMps2,
                        );
                        return buildExcelSheetFromRows(name, pointRows, includeEnergies);
                      })
                    : [buildExcelSheetFromRows(pointName, rows, includeEnergies)];

                  const saved = await exportMeasurementsExcel({
                    sheets,
                    fileName: metadata.fileName,
                    defaultLabel: useAll ? "mesures" : pointName,
                  });
                  if (saved) setFeedback("Classeur Excel enregistré.");
                })
              }
            >
              <Sheet />
              Exporter en Excel
            </Button>
          </div>

          <Separator />

          {/* Options CSV / Texte */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="export-col-sep" className="text-xs">
                  Séparateur de colonnes
                </Label>
                <Select
                  value={columnSeparator}
                  onValueChange={(value) => setColumnSeparator(value as ColumnSeparator)}
                >
                  <SelectTrigger id="export-col-sep" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tab">Tabulation</SelectItem>
                    <SelectItem value="semicolon">Point-virgule (;)</SelectItem>
                    <SelectItem value="comma">Virgule (,)</SelectItem>
                    <SelectItem value="space">Espace</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="export-dec-sep" className="text-xs">
                  Séparateur décimal
                </Label>
                <Select
                  value={decimalSeparator}
                  onValueChange={(value) => setDecimalSeparator(value as DecimalSeparator)}
                >
                  <SelectTrigger id="export-dec-sep" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comma">Virgule (,)</SelectItem>
                    <SelectItem value="dot">Point (.)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!metadata || !hasRows || busy}
                onClick={() =>
                  runAction(async () => {
                    if (!metadata) return;
                    const saved = await exportMeasurementsTabular(
                      rows,
                      metadata.fileName,
                      pointName,
                      { columnSeparator, decimalSeparator, includeEnergies },
                    );
                    if (saved) setFeedback("Fichier CSV / Texte enregistré.");
                  })
                }
              >
                <FileSpreadsheet />
                CSV / Texte
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!metadata || !hasRows || busy}
                onClick={() =>
                  runAction(async () => {
                    if (!metadata) return;
                    const saved = await exportMeasurementsRw3(
                      rows,
                      metadata.fileName,
                      pointName,
                      includeEnergies,
                    );
                    if (saved) setFeedback("Fichier Regressi enregistré.");
                  })
                }
              >
                <Download />
                Regressi
              </Button>
            </div>

            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full"
              disabled={!hasRows || busy}
              onClick={() =>
                runAction(async () => {
                  await copyMeasurementsTsv(rows, includeEnergies);
                  setCopied(true);
                  setFeedback("Tableau copié dans le presse-papier.");
                  if (copyTimerRef.current !== null) {
                    window.clearTimeout(copyTimerRef.current);
                  }
                  copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
                })
              }
            >
              {copied ? <Check /> : <ClipboardCopy />}
              {copied ? "Copié !" : "Copier le tableau"}
            </Button>
          </div>

          <Separator />

          {/* Export image annotée (.png) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="export-png-bg" className="cursor-pointer text-xs">
                Inclure l&apos;image vidéo de fond
              </Label>
              <Switch
                id="export-png-bg"
                checked={includeVideoBackground}
                onCheckedChange={setIncludeVideoBackground}
              />
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              disabled={pngDisabled}
              onClick={() =>
                runAction(async () => {
                  if (!metadata) return;
                  const saved = await exportAnnotatedPng({
                    metadata,
                    frameCachePath,
                    includeVideoBackground,
                    currentFrame,
                    calibration,
                    samples,
                    styles,
                    settings,
                  });
                  if (saved) setFeedback("Image annotée enregistrée.");
                })
              }
            >
              <Image />
              Exporter l&apos;image annotée
            </Button>
          </div>

          {feedback && (
            <p className="text-center text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {feedback}
            </p>
          )}

          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
