// SPDX-License-Identifier: MPL-2.0
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpLeft,
  ArrowUpRight,
  Clock,
  Crosshair,
  LocateFixed,
  Ruler,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ColorPresetRow } from "@/components/color-preset-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  computeMetersPerPixel,
  frameToTimeSecs,
  type AxisOrientation,
  type CalibrationState,
  type CalibrationToolMode,
} from "@/lib/calibration";
import type { VideoMetadata } from "@/lib/video";
import { clampFrameIndex, formatDecimal, type PixelCoords } from "@/lib/video-math";

interface CalibrationPanelProps {
  metadata: VideoMetadata | null;
  currentFrame: number;
  calibration: CalibrationState;
  toolMode: CalibrationToolMode;
  onCalibrationChange: (updater: (prev: CalibrationState) => CalibrationState) => void;
  onToolModeChange: (mode: CalibrationToolMode) => void;
}

const ORIENTATIONS: Array<{
  key: string;
  label: string;
  description: string;
  value: AxisOrientation;
  Icon: typeof ArrowUpRight;
}> = [
  {
    key: "rx-uy",
    label: "+x / +y",
    description: "X vers la droite, Y vers le haut",
    value: { x: 1, y: 1 },
    Icon: ArrowUpRight,
  },
  {
    key: "lx-uy",
    label: "-x / +y",
    description: "X vers la gauche, Y vers le haut",
    value: { x: -1, y: 1 },
    Icon: ArrowUpLeft,
  },
  {
    key: "rx-dy",
    label: "+x / -y",
    description: "X vers la droite, Y vers le bas",
    value: { x: 1, y: -1 },
    Icon: ArrowDownRight,
  },
  {
    key: "lx-dy",
    label: "-x / -y",
    description: "X vers la gauche, Y vers le bas",
    value: { x: -1, y: -1 },
    Icon: ArrowDownLeft,
  },
];

function formatPixelPoint(point: PixelCoords | null): string {
  if (!point) return "Non défini";
  return `(${point.x} ; ${point.y}) px`;
}

/** Onglet Étalonnage : échelle spatiale, origine/axes et origine des dates. */
export function CalibrationPanel({
  metadata,
  currentFrame,
  calibration,
  toolMode,
  onCalibrationChange,
  onToolModeChange,
}: CalibrationPanelProps) {
  const hasVideo = metadata !== null && metadata.totalFrames > 0;
  const totalFrames = metadata?.totalFrames ?? 0;

  const [distanceInput, setDistanceInput] = useState(String(calibration.realDistanceMeters));
  const [t0Input, setT0Input] = useState(String(calibration.t0FrameIndex + 1));
  const isDistanceFocusedRef = useRef(false);

  useEffect(() => {
    if (!isDistanceFocusedRef.current) {
      setDistanceInput(String(calibration.realDistanceMeters));
    }
  }, [calibration.realDistanceMeters]);

  useEffect(() => {
    setT0Input(hasVideo ? String(calibration.t0FrameIndex + 1) : "0");
  }, [calibration.t0FrameIndex, hasVideo]);

  const metersPerPixel = computeMetersPerPixel(calibration);
  const parsedDistance = Number.parseFloat(distanceInput.replace(",", "."));
  const distanceInvalid = !Number.isFinite(parsedDistance) || parsedDistance <= 0;

  const handleDistanceChange = (raw: string) => {
    setDistanceInput(raw);
    const value = Number.parseFloat(raw.replace(",", "."));
    if (Number.isFinite(value) && value > 0) {
      onCalibrationChange((prev) => ({ ...prev, realDistanceMeters: value }));
    }
  };

  const commitDistance = () => {
    const value = Number.parseFloat(distanceInput.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setDistanceInput(String(calibration.realDistanceMeters));
      return;
    }
    setDistanceInput(String(value));
    onCalibrationChange((prev) => ({ ...prev, realDistanceMeters: value }));
  };

  const commitT0Input = () => {
    if (!hasVideo) return;
    const parsed = Number.parseInt(t0Input, 10);
    if (Number.isNaN(parsed)) {
      setT0Input(String(calibration.t0FrameIndex + 1));
      return;
    }
    const clamped = clampFrameIndex(parsed - 1, totalFrames);
    setT0Input(String(clamped + 1));
    onCalibrationChange((prev) => ({ ...prev, t0FrameIndex: clamped }));
  };

  const currentTimeSecs = metadata
    ? frameToTimeSecs(currentFrame, calibration.t0FrameIndex, metadata.frameDurationSecs)
    : 0;

  return (
    <div className="space-y-3">
      {/* Carte 1 : Échelle spatiale */}
      <Card className="gap-3 py-4">
        <CardHeader className="px-4 pb-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Ruler className="size-4" />
            Échelle spatiale
          </CardTitle>
          <CardDescription>
            Placez deux points sur un objet de longueur connue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              variant={toolMode === "pick-scale-1" ? "default" : "outline"}
              disabled={!hasVideo}
              onClick={() =>
                onToolModeChange(toolMode === "pick-scale-1" ? "none" : "pick-scale-1")
              }
            >
              <Crosshair />
              {toolMode === "pick-scale-1" ? "Cliquer P1…" : "Placer P1"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={toolMode === "pick-scale-2" ? "default" : "outline"}
              disabled={!hasVideo}
              onClick={() =>
                onToolModeChange(toolMode === "pick-scale-2" ? "none" : "pick-scale-2")
              }
            >
              <Crosshair />
              {toolMode === "pick-scale-2" ? "Cliquer P2…" : "Placer P2"}
            </Button>
          </div>

          <div className="space-y-1 rounded-md bg-muted/50 px-2.5 py-2 font-mono text-xs tabular-nums">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Point P1</span>
              <span>{formatPixelPoint(calibration.point1)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Point P2</span>
              <span>{formatPixelPoint(calibration.point2)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="calibration-distance" className="text-xs">
              Distance réelle (m)
            </Label>
            <Input
              id="calibration-distance"
              type="text"
              inputMode="decimal"
              value={distanceInput}
              disabled={!hasVideo}
              aria-invalid={distanceInvalid}
              onFocus={() => {
                isDistanceFocusedRef.current = true;
              }}
              onChange={(event) => handleDistanceChange(event.target.value)}
              onBlur={() => {
                isDistanceFocusedRef.current = false;
                commitDistance();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  isDistanceFocusedRef.current = false;
                  commitDistance();
                  event.currentTarget.blur();
                }
              }}
              className="h-8 font-mono text-xs tabular-nums"
            />
            {distanceInvalid && (
              <p className="text-xs text-destructive">
                Entrez une distance strictement positive.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Facteur calculé</span>
            {metersPerPixel !== null ? (
              <div className="text-right font-mono text-xs tabular-nums">
                <div>1 px = {formatDecimal(metersPerPixel, 5)} m</div>
                <div className="text-[11px] text-muted-foreground">
                  {formatDecimal(1 / metersPerPixel, 1)} px/m
                </div>
              </div>
            ) : (
              <Badge variant="secondary">Non étalonné</Badge>
            )}
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <Label htmlFor="show-scale-switch" className="cursor-pointer text-xs">
              Afficher l&apos;échelle
            </Label>
            <Switch
              id="show-scale-switch"
              checked={calibration.showScale}
              disabled={!hasVideo}
              onCheckedChange={(checked) =>
                onCalibrationChange((prev) => ({ ...prev, showScale: checked }))
              }
            />
          </div>

          <ColorPresetRow
            label="Couleur du segment"
            selectedColor={calibration.scaleColor}
            disabled={!hasVideo}
            onSelect={(color) =>
              onCalibrationChange((prev) => ({ ...prev, scaleColor: color }))
            }
          />
        </CardContent>
      </Card>

      {/* Carte 2 : Origine et sens des axes */}
      <Card className="gap-3 py-4">
        <CardHeader className="px-4 pb-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <LocateFixed className="size-4" />
            Origine et sens des axes
          </CardTitle>
          <CardDescription>
            Définissez l&apos;origine O et l&apos;orientation du repère.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              variant={toolMode === "pick-origin" ? "default" : "outline"}
              disabled={!hasVideo}
              onClick={() =>
                onToolModeChange(toolMode === "pick-origin" ? "none" : "pick-origin")
              }
            >
              <Crosshair />
              {toolMode === "pick-origin" ? "Cliquer O…" : "Placer l'origine (O)"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              variant="outline"
              disabled={!hasVideo}
              onClick={() => {
                if (!metadata) return;
                onToolModeChange("none");
                onCalibrationChange((prev) => ({
                  ...prev,
                  origin: {
                    x: Math.floor(metadata.width / 2),
                    y: Math.floor(metadata.height / 2),
                  },
                }));
              }}
            >
              Placer au centre
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-2 font-mono text-xs tabular-nums">
            <span className="text-muted-foreground">Origine (Xo ; Yo)</span>
            <span>{formatPixelPoint(calibration.origin)}</span>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium">Orientation des axes</span>
            <div className="grid grid-cols-2 gap-1.5">
              {ORIENTATIONS.map(({ key, label, description, value, Icon }) => {
                const active =
                  calibration.orientation.x === value.x &&
                  calibration.orientation.y === value.y;
                return (
                  <Tooltip key={key}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        disabled={!hasVideo}
                        onClick={() =>
                          onCalibrationChange((prev) => ({ ...prev, orientation: value }))
                        }
                        className="justify-start font-mono text-xs"
                      >
                        <Icon />
                        {label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{description}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <Label htmlFor="show-axes-switch" className="cursor-pointer text-xs">
              Afficher les axes
            </Label>
            <Switch
              id="show-axes-switch"
              checked={calibration.showAxes}
              disabled={!hasVideo}
              onCheckedChange={(checked) =>
                onCalibrationChange((prev) => ({ ...prev, showAxes: checked }))
              }
            />
          </div>

          <ColorPresetRow
            label="Couleur des axes"
            selectedColor={calibration.axesColor}
            disabled={!hasVideo}
            onSelect={(color) =>
              onCalibrationChange((prev) => ({ ...prev, axesColor: color }))
            }
          />
        </CardContent>
      </Card>

      {/* Carte 3 : Origine des dates (t = 0) */}
      <Card className="gap-3 py-4">
        <CardHeader className="px-4 pb-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="size-4" />
            Origine des dates (t = 0)
          </CardTitle>
          <CardDescription>
            Choisissez l&apos;image correspondant à l&apos;instant initial.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4">
          <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-2 text-xs">
            <span className="text-muted-foreground">Référence actuelle</span>
            <span className="font-mono tabular-nums">
              {hasVideo ? `Image n° ${calibration.t0FrameIndex + 1}` : "--"}
            </span>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            disabled={!hasVideo}
            onClick={() =>
              onCalibrationChange((prev) => ({ ...prev, t0FrameIndex: currentFrame }))
            }
          >
            Définir l&apos;image courante (t = 0)
          </Button>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="t0-frame-input" className="text-xs">
              Image t = 0
            </Label>
            <div className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
              <Input
                id="t0-frame-input"
                type="number"
                min={hasVideo ? 1 : 0}
                max={totalFrames}
                value={t0Input}
                disabled={!hasVideo}
                onChange={(event) => setT0Input(event.target.value)}
                onBlur={commitT0Input}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitT0Input();
                    event.currentTarget.blur();
                  }
                }}
                className="h-7 w-16 px-2 text-right font-mono text-xs tabular-nums"
              />
              <span className="text-muted-foreground">/ {totalFrames}</span>
            </div>
          </div>

          {hasVideo && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Instant de l&apos;image courante</span>
              <span className="font-mono tabular-nums text-foreground">
                t = {formatDecimal(currentTimeSecs, 3)} s
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
