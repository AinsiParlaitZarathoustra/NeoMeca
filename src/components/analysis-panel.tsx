// SPDX-License-Identifier: MPL-2.0
import { Check, CircleAlert, ClipboardCopy, Download, LineChart as LineChartIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, ComposedChart, XAxis, YAxis } from "recharts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
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
import {
  buildAnalysisChartData,
  computeLinearRegression,
  computeSeriesStats,
  extractNumericPairs,
  type AnalysisPresetKey,
} from "@/lib/analysis";
import { computeMetersPerPixel, type CalibrationState } from "@/lib/calibration";
import { copyMeasurementsTsv } from "@/lib/export-actions";
import {
  computeKinematicsSeries,
  type TrackedPointStyle,
  type TrackingSample,
  type TrackingSettings,
} from "@/lib/tracking";
import type { VideoMetadata } from "@/lib/video";
import { formatDecimal } from "@/lib/video-math";

interface AnalysisPanelProps {
  metadata: VideoMetadata | null;
  calibration: CalibrationState;
  samples: TrackingSample[];
  styles: TrackedPointStyle[];
  settings: TrackingSettings;
  selectedPointId: number;
  onSelectedPointIdChange: (pointId: number) => void;
  onOpenExportDialog: () => void;
}

const PRESET_LABELS: Array<{ value: AnalysisPresetKey; label: string }> = [
  { value: "trajectory", label: "Trajectoire y(x)" },
  { value: "positions", label: "Positions x(t), y(t)" },
  { value: "velocities", label: "Vitesses vx(t), vy(t), v(t)" },
  { value: "accelerations", label: "Accélérations ax(t), ay(t), a(t)" },
  { value: "energies", label: "Énergies Ec(t), Ep(t), Em(t)" },
];

/** Onglet Analyse : graphiques cinématiques/énergétiques, régression linéaire et exports. */
export function AnalysisPanel({
  metadata,
  calibration,
  samples,
  styles,
  settings,
  selectedPointId,
  onSelectedPointIdChange,
  onOpenExportDialog,
}: AnalysisPanelProps) {
  const [preset, setPreset] = useState<AnalysisPresetKey>("positions");
  const [showRegression, setShowRegression] = useState(false);
  const [regressionSeriesKey, setRegressionSeriesKey] = useState<string>("y");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const hasMass = settings.massKg !== null && settings.massKg > 0;
  const hasCalibration =
    computeMetersPerPixel(calibration) !== null && calibration.origin !== null;

  useEffect(() => {
    if (preset === "energies" && !hasMass) {
      setPreset("positions");
    }
  }, [preset, hasMass]);

  const effectivePointId = Math.min(selectedPointId, settings.pointsPerFrame);
  const pointStyle =
    styles.find((item) => item.id === effectivePointId) ?? styles[0];

  const rows = useMemo(() => {
    if (!metadata) return [];
    return computeKinematicsSeries(
      samples,
      effectivePointId,
      calibration,
      metadata.frameDurationSecs,
      settings.massKg,
      settings.gravityMps2,
    );
  }, [
    metadata,
    samples,
    effectivePointId,
    calibration,
    settings.massKg,
    settings.gravityMps2,
  ]);

  const chartData = useMemo(
    () => buildAnalysisChartData(rows, preset),
    [rows, preset],
  );

  // Maintient une série cible valide pour les statistiques et la régression linéaire.
  useEffect(() => {
    if (
      chartData.series.length > 0 &&
      !chartData.series.some((s) => s.key === regressionSeriesKey)
    ) {
      setRegressionSeriesKey(chartData.series[0].key);
    }
  }, [chartData.series, regressionSeriesKey]);

  const activeSeriesMeta =
    chartData.series.find((s) => s.key === regressionSeriesKey) ??
    chartData.series[0];

  const activePairs = useMemo(
    () =>
      activeSeriesMeta
        ? extractNumericPairs(chartData.points, activeSeriesMeta.key)
        : [],
    [chartData.points, activeSeriesMeta],
  );

  const stats = useMemo(() => computeSeriesStats(activePairs), [activePairs]);
  const regression = useMemo(
    () => (showRegression ? computeLinearRegression(activePairs) : null),
    [showRegression, activePairs],
  );

  const chartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {};
    for (const s of chartData.series) {
      config[s.key] = { label: s.label, color: s.color };
    }
    if (regression) {
      config.regression = {
        label: "Régression linéaire",
        color: "var(--muted-foreground)",
      };
    }
    return config;
  }, [chartData.series, regression]);

  const mergedPoints = useMemo(() => {
    if (!regression) return chartData.points;
    return chartData.points.map((pt) => ({
      ...pt,
      regression: regression.slope * pt.xValue + regression.intercept,
    }));
  }, [chartData.points, regression]);

  const handleCopyTsv = async () => {
    if (rows.length === 0) return;
    setCopyError(null);
    try {
      await copyMeasurementsTsv(rows, hasMass);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : String(error));
    }
  };

  if (!metadata) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analyse</CardTitle>
          <CardDescription>
            Ouvrez une vidéo, effectuez l&apos;étalonnage puis pointez un objet pour tracer
            les courbes et exporter les mesures.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="gap-3 py-4">
        <CardHeader className="px-4 pb-0">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <LineChartIcon className="size-4" />
              Graphique d&apos;analyse
            </CardTitle>
            <Badge variant="secondary" className="font-mono text-xs tabular-nums">
              {rows.length} pt{rows.length > 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 px-4">
          <div className="grid grid-cols-1 gap-2">
            {settings.pointsPerFrame > 1 && (
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="analysis-point" className="text-xs">
                  Point étudié
                </Label>
                <Select
                  value={String(effectivePointId)}
                  onValueChange={(value) => {
                    const id = Number.parseInt(value, 10);
                    if (!Number.isNaN(id)) onSelectedPointIdChange(id);
                  }}
                >
                  <SelectTrigger id="analysis-point" size="sm" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {styles.slice(0, settings.pointsPerFrame).map((style) => (
                      <SelectItem key={style.id} value={String(style.id)}>
                        <span
                          className="inline-block size-2.5 rounded-full"
                          style={{ backgroundColor: style.color }}
                        />
                        {style.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="analysis-preset" className="text-xs">
                Courbes à tracer
              </Label>
              <Select
                value={preset}
                onValueChange={(value) => setPreset(value as AnalysisPresetKey)}
              >
                <SelectTrigger id="analysis-preset" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_LABELS.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      disabled={item.value === "energies" && !hasMass}
                    >
                      {item.label}
                      {item.value === "energies" && !hasMass ? " (masse requise)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!hasCalibration ? (
            <p className="rounded-md bg-muted/50 px-3 py-6 text-center text-xs text-muted-foreground">
              Complétez l&apos;étalonnage (échelle et origine) pour afficher les grandeurs
              physiques.
            </p>
          ) : chartData.points.length === 0 ? (
            <p className="rounded-md bg-muted/50 px-3 py-6 text-center text-xs text-muted-foreground">
              Pas assez de points enregistrés pour {pointStyle.name} sur cette courbe.
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-56 w-full">
              <ComposedChart
                data={mergedPoints}
                margin={{ top: 8, right: 8, left: 0, bottom: 14 }}
              >
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="xValue"
                  type="number"
                  domain={["auto", "auto"]}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => formatDecimal(value, 2)}
                  label={{
                    value: chartData.xLabel,
                    position: "insideBottom",
                    offset: -8,
                    fontSize: 11,
                    fill: "var(--muted-foreground)",
                  }}
                />
                <YAxis
                  width={52}
                  domain={["auto", "auto"]}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => formatDecimal(value, 2)}
                  label={{
                    value: chartData.yUnit,
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 11,
                    fill: "var(--muted-foreground)",
                  }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) => {
                        const first = payload?.[0]?.payload as { xValue?: number } | undefined;
                        if (typeof first?.xValue !== "number") return "";
                        return `${chartData.xLabel.split(" ")[0]} = ${formatDecimal(first.xValue, 3)} ${chartData.xUnit}`;
                      }}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                {chartData.series.map((s) => (
                  <Line
                    key={s.key}
                    type="linear"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                ))}
                {regression && (
                  <Line
                    type="linear"
                    dataKey="regression"
                    name="Régression linéaire"
                    stroke="var(--muted-foreground)"
                    strokeWidth={1.75}
                    strokeDasharray="5 4"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ChartContainer>
          )}

          {/* Résumé numérique et régression linéaire */}
          {stats && activeSeriesMeta && (
            <div className="space-y-2 rounded-md bg-muted/50 p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="analysis-regression" className="cursor-pointer text-xs">
                  Régression linéaire (y = ax + b)
                </Label>
                <Switch
                  id="analysis-regression"
                  checked={showRegression}
                  onCheckedChange={setShowRegression}
                />
              </div>

              {chartData.series.length > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Série analysée</span>
                  <Select
                    value={activeSeriesMeta.key}
                    onValueChange={setRegressionSeriesKey}
                  >
                    <SelectTrigger size="sm" className="h-7 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {chartData.series.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-1 font-mono text-[11px] tabular-nums">
                <div>
                  <span className="text-muted-foreground">N : </span>
                  {stats.count}
                </div>
                <div>
                  <span className="text-muted-foreground">Min : </span>
                  {formatDecimal(stats.minY, 3)}
                </div>
                <div>
                  <span className="text-muted-foreground">Max : </span>
                  {formatDecimal(stats.maxY, 3)}
                </div>
              </div>

              {showRegression && (
                <div className="border-t pt-1.5 font-mono text-[11px] tabular-nums">
                  {regression ? (
                    <div className="space-y-0.5">
                      <div>
                        y = {formatDecimal(regression.slope, 4)}·x{" "}
                        {regression.intercept >= 0 ? "+" : "-"}{" "}
                        {formatDecimal(Math.abs(regression.intercept), 4)}
                      </div>
                      <div className="text-muted-foreground">
                        R² = {formatDecimal(regression.r2, 5)}
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      Au moins 2 points distincts en abscisse sont requis.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={rows.length === 0}
              onClick={handleCopyTsv}
            >
              {copied ? <Check /> : <ClipboardCopy />}
              {copied ? "Copié !" : "Copier TSV"}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenExportDialog}
            >
              <Download />
              Exporter…
            </Button>
          </div>

          {copyError && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{copyError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
