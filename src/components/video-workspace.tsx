// SPDX-License-Identifier: MPL-2.0
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Crosshair,
  FileVideo,
  LoaderCircle,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalibrationOverlay } from "@/components/calibration-overlay";
import { FrameLoupe } from "@/components/frame-loupe";
import { TrackingOverlay } from "@/components/tracking-overlay";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  computeMetersPerPixel,
  frameToTimeSecs,
  pixelsToMeters,
  type CalibrationState,
} from "@/lib/calibration";
import type {
  TrackedPointStyle,
  TrackingSample,
  TrackingSettings,
  WorkspaceToolMode,
} from "@/lib/tracking";
import {
  clampFrameIndex,
  computeVideoPixelCoords,
  extractFrame,
  formatDecimal,
  type PixelCoords,
  type VideoMetadata,
} from "@/lib/video";

interface VideoWorkspaceProps {
  metadata: VideoMetadata | null;
  isOpening: boolean;
  openError: string | null;
  currentFrame: number;
  calibration: CalibrationState;
  samples: TrackingSample[];
  pointStyles: TrackedPointStyle[];
  trackingSettings: TrackingSettings;
  toolMode: WorkspaceToolMode;
  stopPlaybackToken: number;
  missingVideoPath: string | null;
  projectError: string | null;
  onOpenVideo: () => void;
  onRelocateVideo: () => void;
  onDismissProjectError: () => void;
  onCurrentFrameChange: React.Dispatch<React.SetStateAction<number>>;
  onDisplayScaleChange: (scale: number) => void;
  onFrameCachePathChange: (path: string | null) => void;
  onPickCalibrationPoint: (coords: PixelCoords) => void;
  onTrackPoint: (coords: PixelCoords) => void;
  onCancelTool: () => void;
}

type ZoomMode = "fit" | "100" | "custom";
const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200, 300, 400] as const;
const MIN_ZOOM_PERCENT = 25;
const MAX_ZOOM_PERCENT = 400;

function getToolLabel(toolMode: WorkspaceToolMode, activePointName: string): string | null {
  if (toolMode === "pick-scale-1") return "Cliquez sur la vidéo pour placer le point P1";
  if (toolMode === "pick-scale-2") return "Cliquez sur la vidéo pour placer le point P2";
  if (toolMode === "pick-origin") return "Cliquez sur la vidéo pour placer l'origine O";
  if (toolMode === "track") return `Cliquez sur la vidéo pour pointer ${activePointName}`;
  return null;
}

interface HoverState extends PixelCoords {
  viewportX: number;
  viewportY: number;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de charger l'image extraite."));
    img.src = src;
  });
}

const INTERACTIVE_SELECTOR =
  'input, textarea, select, button, a[href], [role="slider"], [role="switch"], [role="combobox"], [role="tab"], [contenteditable="true"]';

function shouldIgnoreShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest(INTERACTIVE_SELECTOR) !== null;
}

/** Zone centrale : lecteur image par image sur canvas, étalonnage visuel, zoom et loupe. */
export function VideoWorkspace({
  metadata,
  isOpening,
  openError,
  currentFrame,
  calibration,
  samples,
  pointStyles,
  trackingSettings,
  toolMode,
  stopPlaybackToken,
  missingVideoPath,
  projectError,
  onOpenVideo,
  onRelocateVideo,
  onDismissProjectError,
  onCurrentFrameChange,
  onDisplayScaleChange,
  onFrameCachePathChange,
  onPickCalibrationPoint,
  onTrackPoint,
  onCancelTool,
}: VideoWorkspaceProps) {
  const [frameInput, setFrameInput] = useState(
    metadata && metadata.totalFrames > 0 ? String(currentFrame + 1) : "0",
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit");
  const [customZoomPercent, setCustomZoomPercent] = useState(100);
  const [loupeEnabled, setLoupeEnabled] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<HoverState | null>(null);
  const [isLoadingFrame, setIsLoadingFrame] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [renderedFrame, setRenderedFrame] = useState<number | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [renderedFramePath, setRenderedFramePath] = useState<string | null>(null);

  const mainRef = useRef<HTMLElement | null>(null);
  const viewportWrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameLoadedAtRef = useRef<number>(performance.now());

  // Limite à 1 extraction en vol + 1 dernier indice en attente lors du défilement rapide.
  const inFlightRef = useRef(false);
  const pendingFrameRef = useRef<number | null>(null);
  const activePathRef = useRef<string | null>(metadata?.path ?? null);

  const totalFrames = metadata?.totalFrames ?? 0;
  const hasVideo = metadata !== null && totalFrames > 0;
  const canvasReady = renderedFrame !== null && loadedImage !== null;

  useEffect(() => {
    activePathRef.current = metadata?.path ?? null;
  }, [metadata]);

  // Synchronise le champ texte avec l'image courante (numérotation 1..N pour l'utilisateur).
  useEffect(() => {
    setFrameInput(hasVideo ? String(currentFrame + 1) : "0");
  }, [currentFrame, hasVideo]);

  // Mesure le conteneur visible (hors scroll) pour le mode « Adapter à la fenêtre » et la loupe.
  useEffect(() => {
    const el = viewportWrapperRef.current;
    if (!el) return;
    const updateSize = () => {
      setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitScale = useMemo(() => {
    if (!metadata || viewportSize.width <= 0 || viewportSize.height <= 0) return 1;
    const availW = Math.max(64, viewportSize.width - 32);
    const availH = Math.max(64, viewportSize.height - 32);
    return Math.max(0.05, Math.min(availW / metadata.width, availH / metadata.height));
  }, [metadata, viewportSize.width, viewportSize.height]);

  const effectiveScale = useMemo(() => {
    if (!metadata) return 1;
    if (zoomMode === "fit") return fitScale;
    if (zoomMode === "100") return 1;
    return customZoomPercent / 100;
  }, [metadata, zoomMode, fitScale, customZoomPercent]);

  useEffect(() => {
    onDisplayScaleChange(effectiveScale);
  }, [effectiveScale, onDisplayScaleChange]);

  useEffect(() => {
    onFrameCachePathChange(renderedFramePath);
  }, [renderedFramePath, onFrameCachePathChange]);

  // Déclenche ou met en attente l'extraction vers le canvas sans empiler d'appels FFmpeg.
  const requestFrameDraw = useCallback(
    (frameToLoad: number) => {
      if (!metadata || totalFrames <= 0) return;

      if (inFlightRef.current) {
        pendingFrameRef.current = frameToLoad;
        return;
      }

      const targetPath = metadata.path;
      const targetFps = metadata.fps;
      const targetWidth = metadata.width;
      const targetHeight = metadata.height;

      inFlightRef.current = true;
      setIsLoadingFrame(true);
      setFrameError(null);

      extractFrame(targetPath, frameToLoad, targetFps)
        .then(async (cachedPath) => {
          if (activePathRef.current !== targetPath) return null;
          const image = await loadHtmlImage(convertFileSrc(cachedPath));
          return { image, cachedPath };
        })
        .then((loaded) => {
          if (!loaded || activePathRef.current !== targetPath) return;
          const pending = pendingFrameRef.current;
          // Si l'utilisateur a déjà glissé plus loin, on évite de dessiner une image obsolète.
          if (pending !== null && pending !== frameToLoad) return;

          const canvas = canvasRef.current;
          if (!canvas) return;
          if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
          }
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(loaded.image, 0, 0, targetWidth, targetHeight);
          frameLoadedAtRef.current = performance.now();
          setLoadedImage(loaded.image);
          setRenderedFramePath(loaded.cachedPath);
          setRenderedFrame(frameToLoad);
        })
        .catch((error) => {
          if (activePathRef.current !== targetPath) return;
          setIsPlaying(false);
          setFrameError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          inFlightRef.current = false;
          if (activePathRef.current !== targetPath) {
            pendingFrameRef.current = null;
            return;
          }
          const nextPending = pendingFrameRef.current;
          pendingFrameRef.current = null;
          if (nextPending !== null && nextPending !== frameToLoad) {
            requestFrameDraw(nextPending);
          } else {
            setIsLoadingFrame(false);
          }
        });
    },
    [metadata, totalFrames],
  );

  useEffect(() => {
    if (!metadata || totalFrames <= 0) return;
    requestFrameDraw(currentFrame);
  }, [metadata, totalFrames, currentFrame, requestFrameDraw]);

  // Boucle de lecture temporisée sur `fps`, arrêtée proprement en fin de vidéo.
  useEffect(() => {
    if (!isPlaying || !metadata || totalFrames <= 1) return;
    if (renderedFrame !== currentFrame) return;
    if (currentFrame >= totalFrames - 1) {
      setIsPlaying(false);
      return;
    }

    const framePeriodMs = Math.max(10, metadata.frameDurationSecs * 1000);
    const elapsed = performance.now() - frameLoadedAtRef.current;
    const delay = Math.max(0, framePeriodMs - elapsed);

    const timer = window.setTimeout(() => {
      onCurrentFrameChange((prev) => clampFrameIndex(prev + 1, totalFrames));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isPlaying, renderedFrame, currentFrame, metadata, totalFrames, onCurrentFrameChange]);

  const goToFrame = useCallback(
    (index: number) => {
      if (!hasVideo) return;
      setIsPlaying(false);
      onCurrentFrameChange(clampFrameIndex(index, totalFrames));
    },
    [hasVideo, totalFrames, onCurrentFrameChange],
  );

  const togglePlay = useCallback(() => {
    if (!hasVideo || totalFrames <= 1) return;
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (currentFrame >= totalFrames - 1) {
      onCurrentFrameChange(0);
    }
    setIsPlaying(true);
  }, [hasVideo, totalFrames, isPlaying, currentFrame, onCurrentFrameChange]);

  // Raccourcis clavier : Échap (annuler outil), Flèches (-1/+1), Espace (Lecture/Pause).
  useEffect(() => {
    if (!hasVideo) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape" && toolMode !== "none") {
        event.preventDefault();
        onCancelTool();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (shouldIgnoreShortcut(event.target)) return;

      if (event.code === "ArrowLeft") {
        event.preventDefault();
        goToFrame(currentFrame - 1);
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        goToFrame(currentFrame + 1);
      } else if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasVideo, toolMode, onCancelTool, currentFrame, goToFrame, togglePlay]);

  const commitFrameInput = useCallback(() => {
    if (!hasVideo) return;
    const parsed = Number.parseInt(frameInput, 10);
    if (Number.isNaN(parsed)) {
      setFrameInput(String(currentFrame + 1));
      return;
    }
    const clamped = clampFrameIndex(parsed - 1, totalFrames);
    setFrameInput(String(clamped + 1));
    goToFrame(clamped);
  }, [hasVideo, frameInput, currentFrame, totalFrames, goToFrame]);

  const applyZoomPercent = useCallback((percent: number) => {
    const clamped = Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, Math.round(percent)));
    setCustomZoomPercent(clamped);
    setZoomMode(clamped === 100 ? "100" : "custom");
  }, []);

  // Écouteur molette non passif sur le canvas pour zoomer sans défiler la zone vidéo.
  const effectiveScaleRef = useRef(effectiveScale);
  effectiveScaleRef.current = effectiveScale;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasVideo) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const basePercent = Math.round(effectiveScaleRef.current * 100);
      const delta = event.deltaY < 0 ? 15 : -15;
      applyZoomPercent(basePercent + delta);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [hasVideo, applyZoomPercent]);

  const zoomSelectValue = useMemo(() => {
    if (zoomMode === "fit") return "fit";
    if (zoomMode === "100") return "100";
    if ((ZOOM_PRESETS as readonly number[]).includes(customZoomPercent)) {
      return String(customZoomPercent);
    }
    return "custom";
  }, [zoomMode, customZoomPercent]);

  const handleZoomSelect = (value: string) => {
    if (value === "fit") {
      setZoomMode("fit");
    } else if (value === "custom") {
      setZoomMode("custom");
    } else {
      const percent = Number.parseInt(value, 10);
      if (!Number.isNaN(percent)) applyZoomPercent(percent);
    }
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!metadata || !canvasRef.current || !viewportWrapperRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const coords = computeVideoPixelCoords(
      event.clientX,
      event.clientY,
      canvasRect,
      metadata.width,
      metadata.height,
    );
    if (!coords) {
      setHover(null);
      return;
    }
    const wrapperRect = viewportWrapperRef.current.getBoundingClientRect();
    setHover({
      ...coords,
      viewportX: event.clientX - wrapperRect.left,
      viewportY: event.clientY - wrapperRect.top,
    });
  };

  const handleCanvasPointerDown = () => {
    // Redonne le focus au lecteur vidéo afin que Espace / Flèches fonctionnent tout de suite.
    mainRef.current?.focus({ preventScroll: true });
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (toolMode === "none" || !metadata || !canvasRef.current) return;
    if (toolMode === "track" && renderedFrame !== currentFrame) return;
    const coords = computeVideoPixelCoords(
      event.clientX,
      event.clientY,
      canvasRef.current.getBoundingClientRect(),
      metadata.width,
      metadata.height,
    );
    if (!coords) return;
    if (toolMode === "track") {
      setIsPlaying(false);
      onTrackPoint(coords);
    } else {
      onPickCalibrationPoint(coords);
    }
  };

  useEffect(() => {
    if (stopPlaybackToken > 0) {
      setIsPlaying(false);
    }
  }, [stopPlaybackToken]);

  const activePointStyle = pointStyles.find((s) => s.id === trackingSettings.activePointId);
  const toolBannerText = getToolLabel(
    toolMode,
    activePointStyle?.name ?? `P${trackingSettings.activePointId}`,
  );

  const displayWidth = metadata ? Math.max(1, Math.round(metadata.width * effectiveScale)) : 0;
  const displayHeight = metadata ? Math.max(1, Math.round(metadata.height * effectiveScale)) : 0;

  const isScaleCalibrated = computeMetersPerPixel(calibration) !== null;
  const isFullyCalibrated = isScaleCalibrated && calibration.origin !== null;
  const physicalHover = hover ? pixelsToMeters(hover, calibration) : null;
  const currentTimeSecs = metadata
    ? frameToTimeSecs(currentFrame, calibration.t0FrameIndex, metadata.frameDurationSecs)
    : 0;

  return (
    <main ref={mainRef} tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
      {/* Barre d'outils d'affichage et loupe */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b bg-background/80 px-3">
        <div className="flex items-center gap-2">
          <Select value={zoomSelectValue} onValueChange={handleZoomSelect} disabled={!hasVideo}>
            <SelectTrigger size="sm" className="w-[170px]" aria-label="Mode d'affichage">
              <SelectValue placeholder="Affichage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fit">Adapter à la fenêtre</SelectItem>
              {ZOOM_PRESETS.map((preset) => (
                <SelectItem key={preset} value={String(preset)}>
                  {preset} %
                </SelectItem>
              ))}
              {zoomSelectValue === "custom" && (
                <SelectItem value="custom">Zoom libre ({customZoomPercent} %)</SelectItem>
              )}
            </SelectContent>
          </Select>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={!hasVideo || Math.round(effectiveScale * 100) <= MIN_ZOOM_PERCENT}
                onClick={() => applyZoomPercent(Math.round(effectiveScale * 100) - 25)}
                aria-label="Zoom arrière"
              >
                <ZoomOut />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom arrière (-25 %)</TooltipContent>
          </Tooltip>

          <Badge variant="secondary" className="min-w-14 justify-center font-mono tabular-nums">
            {hasVideo ? `${Math.round(effectiveScale * 100)} %` : "-- %"}
          </Badge>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={!hasVideo || Math.round(effectiveScale * 100) >= MAX_ZOOM_PERCENT}
                onClick={() => applyZoomPercent(Math.round(effectiveScale * 100) + 25)}
                aria-label="Zoom avant"
              >
                <ZoomIn />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom avant (+25 %)</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-1 h-5!" />

          <div className="flex items-center gap-2">
            <Switch
              id="loupe-switch"
              checked={loupeEnabled}
              onCheckedChange={setLoupeEnabled}
              disabled={!hasVideo}
            />
            <Label htmlFor="loupe-switch" className="cursor-pointer gap-1.5 text-xs">
              <Search className="size-3.5" />
              Loupe (×4)
            </Label>
          </div>
        </div>

        {toolBannerText && (
          <div className="flex items-center gap-1.5">
            <Badge className="gap-1.5">
              <Crosshair className="size-3" />
              {toolBannerText}
            </Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={onCancelTool}
                  aria-label="Annuler la sélection"
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Annuler (Échap)</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Conteneur fixe pour les overlays (loupe, chargement, erreurs) autour de la zone scrollable */}
      <div ref={viewportWrapperRef} className="relative flex min-h-0 flex-1">
        <div
          onScroll={() => setHover(null)}
          className="flex min-h-0 flex-1 overflow-auto bg-muted/40"
        >
          {isOpening ? (
            <div className="m-auto flex flex-col items-center gap-3 p-6 text-muted-foreground">
              <LoaderCircle className="size-8 animate-spin" />
              <p className="text-sm">Analyse de la vidéo en cours…</p>
            </div>
          ) : missingVideoPath ? (
            <div className="m-auto w-full max-w-lg p-6">
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Vidéo du projet introuvable</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>
                    La vidéo associée au projet n&apos;a pas été trouvée à l&apos;emplacement
                    suivant :
                  </p>
                  <p className="font-mono text-xs break-all">{missingVideoPath}</p>
                  {openError && <p className="text-xs opacity-90">{openError}</p>}
                  <p>
                    L&apos;étalonnage et les pointages du projet ont été conservés.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={onRelocateVideo}>
                      Re-localiser la vidéo
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onOpenVideo}>
                      Ouvrir une autre vidéo
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          ) : openError ? (
            <div className="m-auto w-full max-w-lg p-6">
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Impossible d&apos;ouvrir la vidéo</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{openError}</p>
                  <Button variant="outline" size="sm" onClick={onOpenVideo}>
                    Choisir un autre fichier
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          ) : !hasVideo ? (
            <div className="m-auto w-full max-w-md p-6">
              <Card className="text-center">
                <CardHeader>
                  <FileVideo className="mx-auto size-10 text-muted-foreground" />
                  <CardTitle>Aucune vidéo ouverte</CardTitle>
                  <CardDescription>
                    Ouvrez une vidéo (MP4, MOV, AVI, MKV ou WebM) pour analyser ses
                    propriétés et naviguer image par image.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" onClick={onOpenVideo}>
                    Choisir un fichier
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="m-auto flex items-center justify-center p-4">
              <div
                style={{
                  width: `${displayWidth}px`,
                  height: `${displayHeight}px`,
                }}
                className="relative rounded-sm bg-black shadow-sm ring-1 ring-border select-none"
              >
                <canvas
                  ref={canvasRef}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerLeave={() => setHover(null)}
                  onClick={handleCanvasClick}
                  className={`block size-full rounded-sm ${toolMode !== "none" ? "cursor-crosshair" : ""}`}
                />
                {metadata && (
                  <>
                    <CalibrationOverlay
                      videoWidth={metadata.width}
                      videoHeight={metadata.height}
                      displayScale={effectiveScale}
                      calibration={calibration}
                      toolMode={toolMode === "track" ? "none" : toolMode}
                      hoverPixel={hover}
                    />
                    <TrackingOverlay
                      videoWidth={metadata.width}
                      videoHeight={metadata.height}
                      displayScale={effectiveScale}
                      currentFrame={currentFrame}
                      frameDurationSecs={metadata.frameDurationSecs}
                      calibration={calibration}
                      samples={samples}
                      styles={pointStyles}
                      settings={trackingSettings}
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {hasVideo && isLoadingFrame && !canvasReady && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Badge variant="secondary" className="gap-1.5 shadow-sm">
              <LoaderCircle className="size-3.5 animate-spin" />
              Extraction de l&apos;image…
            </Badge>
          </div>
        )}

        {hasVideo && frameError && (
          <div className="pointer-events-none absolute top-3 left-1/2 w-full max-w-md -translate-x-1/2 px-4">
            <Alert variant="destructive" className="pointer-events-auto shadow-md">
              <CircleAlert />
              <AlertTitle>Erreur d&apos;extraction</AlertTitle>
              <AlertDescription>{frameError}</AlertDescription>
            </Alert>
          </div>
        )}

        {projectError && (
          <div className="pointer-events-none absolute top-3 left-1/2 z-30 w-full max-w-md -translate-x-1/2 px-4">
            <Alert variant="destructive" className="pointer-events-auto shadow-md">
              <CircleAlert />
              <AlertTitle className="flex items-center justify-between gap-2">
                <span>Erreur de projet</span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={onDismissProjectError}
                  aria-label="Fermer l'alerte"
                >
                  <X />
                </Button>
              </AlertTitle>
              <AlertDescription>{projectError}</AlertDescription>
            </Alert>
          </div>
        )}

        {hasVideo && loupeEnabled && canvasReady && hover && (
          <FrameLoupe
            sourceImage={loadedImage}
            frameVersion={renderedFrame}
            cursor={hover}
            viewportWidth={viewportSize.width}
            viewportHeight={viewportSize.height}
          />
        )}
      </div>

      {/* Barre d'état : coordonnées pixels, coordonnées métriques et instant t */}
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-t bg-muted/30 px-3 font-mono text-xs tabular-nums">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs tabular-nums">
            {hover ? `pX : ${hover.x} px · pY : ${hover.y} px` : "pX : -- · pY : --"}
          </Badge>
          {isFullyCalibrated && (
            <Badge variant="secondary" className="font-mono text-xs tabular-nums">
              {physicalHover
                ? `X : ${formatDecimal(physicalHover.x, 3)} m · Y : ${formatDecimal(physicalHover.y, 3)} m`
                : "X : -- m · Y : -- m"}
            </Badge>
          )}
        </div>
        <Badge variant="outline" className="font-mono text-xs tabular-nums">
          {hasVideo ? `t = ${formatDecimal(currentTimeSecs, 3)} s` : "t = -- s"}
        </Badge>
      </div>

      {/* Barre inférieure de navigation image par image */}
      <div className="flex h-13 shrink-0 items-center gap-3 border-t px-4">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!hasVideo || currentFrame === 0}
                onClick={() => goToFrame(0)}
                aria-label="Première image"
              >
                <SkipBack />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Première image</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!hasVideo || currentFrame === 0}
                onClick={() => goToFrame(currentFrame - 1)}
                aria-label="Image précédente"
              >
                <ChevronLeft />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Image précédente (Flèche gauche)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={!hasVideo || totalFrames <= 1}
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause" : "Lecture"}
              >
                {isPlaying ? <Pause /> : <Play />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPlaying ? "Pause (Espace)" : "Lecture (Espace)"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!hasVideo || currentFrame >= totalFrames - 1}
                onClick={() => goToFrame(currentFrame + 1)}
                aria-label="Image suivante"
              >
                <ChevronRight />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Image suivante (Flèche droite)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!hasVideo || currentFrame >= totalFrames - 1}
                onClick={() => goToFrame(totalFrames - 1)}
                aria-label="Dernière image"
              >
                <SkipForward />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Dernière image</TooltipContent>
          </Tooltip>
        </div>

        <Slider
          aria-label="Position dans la vidéo"
          className="flex-1"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          step={1}
          value={[currentFrame]}
          disabled={!hasVideo || totalFrames <= 1}
          onValueChange={([value]) => {
            if (typeof value === "number") goToFrame(value);
          }}
        />

        <div className="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
          <span>Image</span>
          <Input
            type="number"
            min={hasVideo ? 1 : 0}
            max={totalFrames}
            value={frameInput}
            disabled={!hasVideo}
            onChange={(event) => setFrameInput(event.target.value)}
            onBlur={commitFrameInput}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitFrameInput();
                event.currentTarget.blur();
              }
            }}
            aria-label="Numéro d'image"
            className="h-7 w-16 px-2 text-right font-mono text-xs tabular-nums"
          />
          <span>/ {totalFrames}</span>
        </div>
      </div>
    </main>
  );
}
