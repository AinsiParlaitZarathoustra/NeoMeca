// SPDX-License-Identifier: MPL-2.0
import {
  Circle,
  Crosshair,
  Plus,
  Redo2,
  Square,
  TableProperties,
  Trash2,
  Undo2,
  VectorSquare,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ColorPresetRow, POINT_COLOR_PRESETS } from "@/components/color-preset-row";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CalibrationState } from "@/lib/calibration";
import {
  computeKinematicsSeries,
  type PointShape,
  type TrackedPointStyle,
  type TrackingSample,
  type TrackingSettings,
  type WorkspaceToolMode,
} from "@/lib/tracking";
import type { VideoMetadata } from "@/lib/video";
import { formatDecimal } from "@/lib/video-math";

interface TrackingPanelProps {
  metadata: VideoMetadata | null;
  currentFrame: number;
  calibration: CalibrationState;
  samples: TrackingSample[];
  styles: TrackedPointStyle[];
  settings: TrackingSettings;
  toolMode: WorkspaceToolMode;
  canUndo: boolean;
  canRedo: boolean;
  onToolModeChange: (mode: WorkspaceToolMode) => void;
  onSettingsChange: (updater: (prev: TrackingSettings) => TrackingSettings) => void;
  onStyleChange: (pointId: number, patch: Partial<TrackedPointStyle>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearPoint: (pointId: number) => void;
  onClearFrame: (frameIndex: number) => void;
  onClearAll: () => void;
  onSelectFrame: (frameIndex: number) => void;
}

const SHAPE_OPTIONS: Array<{ value: PointShape; label: string; Icon: typeof Plus }> = [
  { value: "cross", label: "Croix", Icon: Plus },
  { value: "square", label: "Carré", Icon: Square },
  { value: "circle", label: "Cercle", Icon: Circle },
];

function formatOptMetric(value: number | null, decimals: number): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return formatDecimal(value, decimals);
}

/** Onglet Pointage : pointage multi-points, personnalisation, vecteurs et tableau de mesures. */
export function TrackingPanel({
  metadata,
  currentFrame,
  calibration,
  samples,
  styles,
  settings,
  toolMode,
  canUndo,
  canRedo,
  onToolModeChange,
  onSettingsChange,
  onStyleChange,
  onUndo,
  onRedo,
  onClearPoint,
  onClearFrame,
  onClearAll,
  onSelectFrame,
}: TrackingPanelProps) {
  const hasVideo = metadata !== null && metadata.totalFrames > 0;
  const isTrackingActive = toolMode === "track";

  const [massInput, setMassInput] = useState(
    settings.massKg !== null ? String(settings.massKg) : "",
  );
  const [gravityInput, setGravityInput] = useState(String(settings.gravityMps2));
  const [tablePointId, setTablePointId] = useState<number>(settings.activePointId);

  const isMassFocusedRef = useRef(false);
  const isGravityFocusedRef = useRef(false);

  useEffect(() => {
    if (!isMassFocusedRef.current) {
      setMassInput(settings.massKg !== null ? String(settings.massKg) : "");
    }
  }, [settings.massKg]);

  useEffect(() => {
    if (!isGravityFocusedRef.current) {
      setGravityInput(String(settings.gravityMps2));
    }
  }, [settings.gravityMps2]);

  useEffect(() => {
    setTablePointId((prev) =>
      prev > settings.pointsPerFrame ? settings.activePointId : prev,
    );
  }, [settings.pointsPerFrame, settings.activePointId]);

  useEffect(() => {
    setTablePointId(settings.activePointId);
  }, [settings.activePointId]);

  const effectiveTablePointId = Math.min(tablePointId, settings.pointsPerFrame);

  const activeStyle =
    styles.find((item) => item.id === settings.activePointId) ?? styles[0];

  const parsedMass = Number.parseFloat(massInput.trim().replace(",", "."));
  const massInvalid =
    massInput.trim() !== "" && (!Number.isFinite(parsedMass) || parsedMass <= 0);

  const parsedGravity = Number.parseFloat(gravityInput.trim().replace(",", "."));
  const gravityInvalid = !Number.isFinite(parsedGravity) || parsedGravity < 0;

  const handleMassChange = (raw: string) => {
    setMassInput(raw);
    const trimmed = raw.trim();
    if (trimmed === "") {
      onSettingsChange((prev) => ({ ...prev, massKg: null }));
      return;
    }
    const parsed = Number.parseFloat(trimmed.replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) {
      onSettingsChange((prev) => ({ ...prev, massKg: parsed }));
    }
  };

  const commitMass = () => {
    const trimmed = massInput.trim();
    if (trimmed === "") {
      onSettingsChange((prev) => ({ ...prev, massKg: null }));
      return;
    }
    const parsed = Number.parseFloat(trimmed.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMassInput(settings.massKg !== null ? String(settings.massKg) : "");
      return;
    }
    setMassInput(String(parsed));
    onSettingsChange((prev) => ({ ...prev, massKg: parsed }));
  };

  const handleGravityChange = (raw: string) => {
    setGravityInput(raw);
    const parsed = Number.parseFloat(raw.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 0) {
      onSettingsChange((prev) => ({ ...prev, gravityMps2: parsed }));
    }
  };

  const commitGravity = () => {
    const parsed = Number.parseFloat(gravityInput.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setGravityInput(String(settings.gravityMps2));
      return;
    }
    setGravityInput(String(parsed));
    onSettingsChange((prev) => ({ ...prev, gravityMps2: parsed }));
  };

  const showEnergyColumns = settings.massKg !== null && settings.massKg > 0;
  const rows = useMemo(() => {
    if (!metadata) return [];
    return computeKinematicsSeries(
      samples,
      effectiveTablePointId,
      calibration,
      metadata.frameDurationSecs,
      settings.massKg,
      settings.gravityMps2,
    );
  }, [
    metadata,
    samples,
    effectiveTablePointId,
    calibration,
    settings.massKg,
    settings.gravityMps2,
  ]);

  const hasSamplesForActivePoint = samples.some(
    (item) => item.pointId === settings.activePointId,
  );
  const hasSamplesForCurrentFrame = samples.some(
    (item) => item.frameIndex === currentFrame,
  );

  return (
    <div className="space-y-3">
      {/* Carte 1 : Contrôle du pointage */}
      <Card className="gap-3 py-4">
        <CardHeader className="px-4 pb-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Crosshair className="size-4" />
            Contrôle du pointage
          </CardTitle>
          <CardDescription>
            Pointez la position des objets image par image.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              variant={isTrackingActive ? "default" : "outline"}
              disabled={!hasVideo}
              onClick={() => onToolModeChange(isTrackingActive ? "none" : "track")}
            >
              <Crosshair />
              {isTrackingActive ? "Pointage actif" : "Activer le pointage"}
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  disabled={!hasVideo || !canUndo}
                  onClick={onUndo}
                  aria-label="Annuler le dernier pointage"
                >
                  <Undo2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Annuler (Ctrl+Z)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  disabled={!hasVideo || !canRedo}
                  onClick={onRedo}
                  aria-label="Rétablir le pointage"
                >
                  <Redo2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Rétablir (Ctrl+Y)</TooltipContent>
            </Tooltip>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="points-per-frame" className="text-xs">
                Points / image
              </Label>
              <Select
                value={String(settings.pointsPerFrame)}
                disabled={!hasVideo}
                onValueChange={(value) => {
                  const count = Number.parseInt(value, 10);
                  if (Number.isNaN(count)) return;
                  onSettingsChange((prev) => ({
                    ...prev,
                    pointsPerFrame: count,
                    activePointId: Math.min(prev.activePointId, count),
                  }));
                }}
              >
                <SelectTrigger id="points-per-frame" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} {n > 1 ? "points" : "point"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="active-point-select" className="text-xs">
                Point actif
              </Label>
              <Select
                value={String(settings.activePointId)}
                disabled={!hasVideo}
                onValueChange={(value) => {
                  const id = Number.parseInt(value, 10);
                  if (Number.isNaN(id)) return;
                  onSettingsChange((prev) => ({ ...prev, activePointId: id }));
                }}
              >
                <SelectTrigger id="active-point-select" size="sm" className="w-full">
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
          </div>

          <Separator />

          {/* Personnalisation du point actif */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Forme ({activeStyle.name})
              </span>
              <div className="flex items-center gap-1">
                {SHAPE_OPTIONS.map(({ value, label, Icon }) => (
                  <Tooltip key={value}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant={activeStyle.shape === value ? "default" : "outline"}
                        disabled={!hasVideo}
                        aria-label={`Forme : ${label}`}
                        onClick={() => onStyleChange(activeStyle.id, { shape: value })}
                      >
                        <Icon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Taille ({activeStyle.size})
              </span>
              <Slider
                aria-label="Taille du point"
                className="w-36"
                min={1}
                max={5}
                step={1}
                disabled={!hasVideo}
                value={[activeStyle.size]}
                onValueChange={([value]) => {
                  if (typeof value === "number") {
                    onStyleChange(activeStyle.id, { size: value });
                  }
                }}
              />
            </div>

            <ColorPresetRow
              label={`Couleur (${activeStyle.name})`}
              selectedColor={activeStyle.color}
              disabled={!hasVideo}
              presets={POINT_COLOR_PRESETS}
              onSelect={(color) => onStyleChange(activeStyle.id, { color })}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-advance-h" className="cursor-pointer text-xs">
                Avance auto horizontale (P1 → Pn)
              </Label>
              <Switch
                id="auto-advance-h"
                checked={settings.autoAdvanceHorizontal}
                disabled={!hasVideo}
                onCheckedChange={(checked) =>
                  onSettingsChange((prev) => ({ ...prev, autoAdvanceHorizontal: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="auto-advance-v" className="cursor-pointer text-xs">
                Avance auto verticale (image + 1)
              </Label>
              <Switch
                id="auto-advance-v"
                checked={settings.autoAdvanceVertical}
                disabled={!hasVideo}
                onCheckedChange={(checked) =>
                  onSettingsChange((prev) => ({ ...prev, autoAdvanceVertical: checked }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Carte 2 : Affichage, vecteurs et énergie */}
      <Card className="gap-3 py-4">
        <CardHeader className="px-4 pb-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <VectorSquare className="size-4" />
            Affichage, vecteurs et énergie
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 px-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="show-points-switch" className="cursor-pointer text-xs">
              Points
            </Label>
            <Switch
              id="show-points-switch"
              checked={settings.showPoints}
              disabled={!hasVideo}
              onCheckedChange={(checked) =>
                onSettingsChange((prev) => ({ ...prev, showPoints: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="show-traj-switch" className="cursor-pointer text-xs">
              Trajectoire
            </Label>
            <Switch
              id="show-traj-switch"
              checked={settings.showTrajectories}
              disabled={!hasVideo}
              onCheckedChange={(checked) =>
                onSettingsChange((prev) => ({ ...prev, showTrajectories: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="show-vel-switch" className="cursor-pointer text-xs">
              Vecteurs vitesse (v)
            </Label>
            <Switch
              id="show-vel-switch"
              checked={settings.showVelocityVectors}
              disabled={!hasVideo}
              onCheckedChange={(checked) =>
                onSettingsChange((prev) => ({ ...prev, showVelocityVectors: checked }))
              }
            />
          </div>

          {settings.showVelocityVectors && (
            <div className="flex items-center justify-between gap-3 pl-2">
              <span className="text-xs text-muted-foreground">
                Échelle v ({formatDecimal(settings.velocityVectorScale, 2)})
              </span>
              <Slider
                aria-label="Échelle des vecteurs vitesse"
                className="w-36"
                min={0.02}
                max={0.6}
                step={0.01}
                disabled={!hasVideo}
                value={[settings.velocityVectorScale]}
                onValueChange={([value]) => {
                  if (typeof value === "number") {
                    onSettingsChange((prev) => ({ ...prev, velocityVectorScale: value }));
                  }
                }}
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="show-acc-switch" className="cursor-pointer text-xs">
              Vecteurs accélération (a)
            </Label>
            <Switch
              id="show-acc-switch"
              checked={settings.showAccelerationVectors}
              disabled={!hasVideo}
              onCheckedChange={(checked) =>
                onSettingsChange((prev) => ({ ...prev, showAccelerationVectors: checked }))
              }
            />
          </div>

          {settings.showAccelerationVectors && (
            <div className="flex items-center justify-between gap-3 pl-2">
              <span className="text-xs text-muted-foreground">
                Échelle a ({formatDecimal(settings.accelerationVectorScale, 3)})
              </span>
              <Slider
                aria-label="Échelle des vecteurs accélération"
                className="w-36"
                min={0.005}
                max={0.25}
                step={0.005}
                disabled={!hasVideo}
                value={[settings.accelerationVectorScale]}
                onValueChange={([value]) => {
                  if (typeof value === "number") {
                    onSettingsChange((prev) => ({ ...prev, accelerationVectorScale: value }));
                  }
                }}
              />
            </div>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="tracking-mass" className="text-xs">
                Masse (kg)
              </Label>
              <Input
                id="tracking-mass"
                type="text"
                inputMode="decimal"
                placeholder="Optionnel"
                value={massInput}
                disabled={!hasVideo}
                aria-invalid={massInvalid}
                onFocus={() => {
                  isMassFocusedRef.current = true;
                }}
                onChange={(event) => handleMassChange(event.target.value)}
                onBlur={() => {
                  isMassFocusedRef.current = false;
                  commitMass();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    isMassFocusedRef.current = false;
                    commitMass();
                    event.currentTarget.blur();
                  }
                }}
                className="h-8 font-mono text-xs tabular-nums"
              />
              {massInvalid && (
                <p className="text-[11px] text-destructive">Masse &gt; 0 requise.</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="tracking-gravity" className="text-xs">
                g (m/s²)
              </Label>
              <Input
                id="tracking-gravity"
                type="text"
                inputMode="decimal"
                value={gravityInput}
                disabled={!hasVideo}
                aria-invalid={gravityInvalid}
                onFocus={() => {
                  isGravityFocusedRef.current = true;
                }}
                onChange={(event) => handleGravityChange(event.target.value)}
                onBlur={() => {
                  isGravityFocusedRef.current = false;
                  commitGravity();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    isGravityFocusedRef.current = false;
                    commitGravity();
                    event.currentTarget.blur();
                  }
                }}
                className="h-8 font-mono text-xs tabular-nums"
              />
              {gravityInvalid && (
                <p className="text-[11px] text-destructive">Valeur &ge; 0 requise.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Carte 3 : Effacement et Tableau des mesures */}
      <Card className="gap-3 py-4">
        <CardHeader className="px-4 pb-0">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TableProperties className="size-4" />
              Tableau des mesures
            </CardTitle>
            <Badge variant="secondary" className="font-mono text-xs tabular-nums">
              {samples.length} pt{samples.length > 1 ? "s" : ""}
            </Badge>
          </div>
          <CardDescription>
            Cliquez sur une ligne pour atteindre l&apos;image correspondante.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 px-4">
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={!hasVideo || !hasSamplesForActivePoint}
              onClick={() => onClearPoint(settings.activePointId)}
            >
              Effacer {activeStyle.name}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={!hasVideo || !hasSamplesForCurrentFrame}
              onClick={() => onClearFrame(currentFrame)}
            >
              Effacer l&apos;image
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  disabled={!hasVideo || samples.length === 0}
                >
                  <Trash2 />
                  Tout effacer
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Effacer tous les pointages ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action supprimera les {samples.length} mesure
                    {samples.length > 1 ? "s" : ""} enregistrée
                    {samples.length > 1 ? "s" : ""}. Vous pourrez toutefois l&apos;annuler avec
                    Ctrl+Z.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={onClearAll}>
                    Tout effacer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {settings.pointsPerFrame > 1 && (
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="table-point-select" className="text-xs text-muted-foreground">
                Point affiché
              </Label>
              <Select
                value={String(effectiveTablePointId)}
                onValueChange={(value) => {
                  const id = Number.parseInt(value, 10);
                  if (!Number.isNaN(id)) setTablePointId(id);
                }}
              >
                <SelectTrigger id="table-point-select" size="sm" className="w-28">
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

          {rows.length === 0 ? (
            <p className="rounded-md bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
              Aucune mesure enregistrée pour{" "}
              {styles.find((s) => s.id === effectiveTablePointId)?.name ?? "ce point"}.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8 px-1.5 text-[11px]">Img</TableHead>
                    <TableHead className="h-8 px-1.5 text-right text-[11px]">t (s)</TableHead>
                    <TableHead className="h-8 px-1.5 text-right text-[11px]">x (m)</TableHead>
                    <TableHead className="h-8 px-1.5 text-right text-[11px]">y (m)</TableHead>
                    <TableHead className="h-8 px-1.5 text-right text-[11px]">v (m/s)</TableHead>
                    <TableHead className="h-8 px-1.5 text-right text-[11px]">a (m/s²)</TableHead>
                    {showEnergyColumns && (
                      <>
                        <TableHead className="h-8 px-1.5 text-right text-[11px]">Ec (J)</TableHead>
                        <TableHead className="h-8 px-1.5 text-right text-[11px]">Ep (J)</TableHead>
                        <TableHead className="h-8 px-1.5 text-right text-[11px]">Em (J)</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isCurrent = row.frameIndex === currentFrame;
                    return (
                      <TableRow
                        key={`${row.frameIndex}-${row.pointId}`}
                        tabIndex={0}
                        data-state={isCurrent ? "selected" : undefined}
                        onClick={() => onSelectFrame(row.frameIndex)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelectFrame(row.frameIndex);
                          }
                        }}
                        className="cursor-pointer font-mono text-[11px] tabular-nums focus-visible:bg-muted focus-visible:outline-none"
                      >
                        <TableCell className="px-1.5 py-1">{row.frameIndex + 1}</TableCell>
                        <TableCell className="px-1.5 py-1 text-right">
                          {formatDecimal(row.timeSecs, 3)}
                        </TableCell>
                        <TableCell className="px-1.5 py-1 text-right">
                          {formatOptMetric(row.x, 3)}
                        </TableCell>
                        <TableCell className="px-1.5 py-1 text-right">
                          {formatOptMetric(row.y, 3)}
                        </TableCell>
                        <TableCell className="px-1.5 py-1 text-right">
                          {formatOptMetric(row.speed, 2)}
                        </TableCell>
                        <TableCell className="px-1.5 py-1 text-right">
                          {formatOptMetric(row.acceleration, 2)}
                        </TableCell>
                        {showEnergyColumns && (
                          <>
                            <TableCell className="px-1.5 py-1 text-right">
                              {formatOptMetric(row.kineticEnergy, 3)}
                            </TableCell>
                            <TableCell className="px-1.5 py-1 text-right">
                              {formatOptMetric(row.potentialEnergy, 3)}
                            </TableCell>
                            <TableCell className="px-1.5 py-1 text-right">
                              {formatOptMetric(row.mechanicalEnergy, 3)}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
