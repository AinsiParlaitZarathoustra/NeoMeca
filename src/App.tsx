// SPDX-License-Identifier: MPL-2.0
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { ExportDialog } from "@/components/export-dialog";
import { HelpDialog } from "@/components/help-dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import { SidePanel } from "@/components/side-panel";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VideoWorkspace } from "@/components/video-workspace";
import { useTheme } from "@/hooks/use-theme";
import { createDefaultCalibration, type CalibrationState } from "@/lib/calibration";
import {
  activateExamModeSession,
  canOpenHelp,
  createInitialExamModeState,
  isBrowserReloadKey,
} from "@/lib/exam-mode";
import { ExamModeProvider } from "@/lib/exam-mode-context";
import {
  createProjectDirtySnapshot,
  isProjectDirty,
  parseProjectFile,
  serializeProjectFile,
} from "@/lib/project";
import {
  commitTrackingSamples,
  computeKinematicsSeries,
  computeNextStepAfterPick,
  createDefaultPointStyles,
  createDefaultTrackingSettings,
  createTrackingHistory,
  redoTrackingHistory,
  removeSamplesForFrame,
  removeSamplesForPoint,
  undoTrackingHistory,
  upsertSample,
  type TrackedPointStyle,
  type TrackingHistory,
  type TrackingSettings,
  type WorkspaceToolMode,
} from "@/lib/tracking";
import { openVideoInfo, type PixelCoords, type VideoMetadata } from "@/lib/video";
import { clampFrameIndex } from "@/lib/video-math";

const VIDEO_EXTENSIONS = ["mp4", "mov", "avi", "mkv", "webm"];

type PendingGuardAction =
  | { kind: "close-window" }
  | { kind: "open-video" }
  | { kind: "open-project" };

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  );
}

function isTextContextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.closest(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"]',
    ) !== null
  );
}

export default function App() {
  const { theme, setTheme, toggleTheme } = useTheme();
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [missingVideoPath, setMissingVideoPath] = useState<string | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [stopPlaybackToken, setStopPlaybackToken] = useState(0);
  const [videoLoadId, setVideoLoadId] = useState(0);
  const [currentFramePath, setCurrentFramePath] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<CalibrationState>(createDefaultCalibration);
  const [toolMode, setToolMode] = useState<WorkspaceToolMode>("none");
  const [trackingHistory, setTrackingHistory] =
    useState<TrackingHistory>(createTrackingHistory);
  const [pointStyles, setPointStyles] =
    useState<TrackedPointStyle[]>(createDefaultPointStyles);
  const [trackingSettings, setTrackingSettings] = useState<TrackingSettings>(
    createDefaultTrackingSettings,
  );
  const [analysisPointId, setAnalysisPointId] = useState(1);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [examSession, setExamSession] = useState(createInitialExamModeState);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingGuardAction | null>(null);
  const [isSavingGuard, setIsSavingGuard] = useState(false);

  const openSeqRef = useRef(0);
  const allowCloseRef = useRef(false);

  const activeVideoPath = metadata?.path ?? missingVideoPath;
  const isDirty = useMemo(
    () =>
      isProjectDirty(
        {
          videoPath: activeVideoPath,
          calibration,
          samples: trackingHistory.present,
        },
        savedSnapshot,
      ),
    [activeVideoPath, calibration, trackingHistory.present, savedSnapshot],
  );

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // Intercepte Alt+F4 / clic sur la croix de fermeture lorsque des données ne sont pas enregistrées.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    getCurrentWindow()
      .onCloseRequested((event) => {
        if (allowCloseRef.current || !isDirtyRef.current) {
          return;
        }
        event.preventDefault();
        setPendingAction({ kind: "close-window" });
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((error) => {
        console.error("Impossible d'attacher le garde de fermeture :", error);
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const performOpenVideo = useCallback(async () => {
    const seq = ++openSeqRef.current;
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Ouvrir une vidéo",
        filters: [{ name: "Vidéos (*.mp4, *.mov, *.avi, *.mkv, *.webm)", extensions: VIDEO_EXTENSIONS }],
      });
      if (typeof selected !== "string" || seq !== openSeqRef.current) return;

      setIsOpening(true);
      setOpenError(null);
      setProjectError(null);
      setMissingVideoPath(null);
      setCurrentFramePath(null);
      const info = await openVideoInfo(selected);
      if (seq !== openSeqRef.current) return;
      const defaultCal = createDefaultCalibration();
      setMetadata(info);
      setVideoLoadId((id) => id + 1);
      setCurrentFrame(0);
      setCalibration(defaultCal);
      setTrackingHistory(createTrackingHistory());
      setPointStyles(createDefaultPointStyles());
      setTrackingSettings(createDefaultTrackingSettings());
      setAnalysisPointId(1);
      setToolMode("none");
      setSavedSnapshot(
        createProjectDirtySnapshot({
          videoPath: info.path,
          calibration: defaultCal,
          samples: [],
        }),
      );
    } catch (error) {
      if (seq !== openSeqRef.current) return;
      setMetadata(null);
      setCurrentFramePath(null);
      setDisplayScale(1);
      setCurrentFrame(0);
      setCalibration(createDefaultCalibration());
      setTrackingHistory(createTrackingHistory());
      setPointStyles(createDefaultPointStyles());
      setTrackingSettings(createDefaultTrackingSettings());
      setAnalysisPointId(1);
      setToolMode("none");
      setMissingVideoPath(null);
      setSavedSnapshot(null);
      setOpenError(error instanceof Error ? error.message : String(error));
    } finally {
      if (seq === openSeqRef.current) {
        setIsOpening(false);
      }
    }
  }, []);

  /** Re-localise la vidéo manquante d'un projet tout en gardant étalonnage et pointages. */
  const relocateProjectVideo = useCallback(async () => {
    const seq = ++openSeqRef.current;
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Re-localiser la vidéo du projet",
        filters: [{ name: "Vidéos (*.mp4, *.mov, *.avi, *.mkv, *.webm)", extensions: VIDEO_EXTENSIONS }],
      });
      if (typeof selected !== "string" || seq !== openSeqRef.current) return;

      setIsOpening(true);
      setOpenError(null);
      setProjectError(null);
      setCurrentFramePath(null);
      const info = await openVideoInfo(selected);
      if (seq !== openSeqRef.current) return;
      setMetadata(info);
      setVideoLoadId((id) => id + 1);
      setCurrentFrame(0);
      setMissingVideoPath(null);
      setCalibration((prev) => ({
        ...prev,
        t0FrameIndex: clampFrameIndex(prev.t0FrameIndex, info.totalFrames),
      }));
      setTrackingHistory((history) => ({
        past: [],
        present: history.present.filter((sample) => sample.frameIndex < info.totalFrames),
        future: [],
      }));
    } catch (error) {
      if (seq !== openSeqRef.current) return;
      setOpenError(error instanceof Error ? error.message : String(error));
    } finally {
      if (seq === openSeqRef.current) {
        setIsOpening(false);
      }
    }
  }, []);

  const performOpenProject = useCallback(async () => {
    const seq = ++openSeqRef.current;
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Ouvrir un projet NeoMeca",
        filters: [{ name: "Projet NeoMeca (*.neomeca.json)", extensions: ["neomeca.json", "json"] }],
      });
      if (typeof selected !== "string" || seq !== openSeqRef.current) return;

      setIsOpening(true);
      setOpenError(null);
      setProjectError(null);
      setMissingVideoPath(null);

      const raw = await readTextFile(selected);
      if (seq !== openSeqRef.current) return;
      const project = parseProjectFile(raw);

      setCalibration(project.calibration);
      setTrackingSettings(project.trackingSettings);
      setPointStyles(project.pointStyles);
      setTrackingHistory({
        past: [],
        present: project.samples,
        future: [],
      });
      setAnalysisPointId(project.trackingSettings.activePointId);
      setToolMode("none");
      setCurrentFrame(0);
      setCurrentFramePath(null);

      try {
        const info = await openVideoInfo(project.videoPath);
        if (seq !== openSeqRef.current) return;
        const clampedCalibration = {
          ...project.calibration,
          t0FrameIndex: clampFrameIndex(project.calibration.t0FrameIndex, info.totalFrames),
        };
        const clampedSamples = project.samples.filter(
          (sample) => sample.frameIndex < info.totalFrames,
        );
        setMetadata(info);
        setVideoLoadId((id) => id + 1);
        setCalibration(clampedCalibration);
        setTrackingHistory({
          past: [],
          present: clampedSamples,
          future: [],
        });
        setSavedSnapshot(
          createProjectDirtySnapshot({
            videoPath: info.path,
            calibration: clampedCalibration,
            samples: clampedSamples,
          }),
        );
      } catch (videoErr) {
        if (seq !== openSeqRef.current) return;
        setMetadata(null);
        setCurrentFramePath(null);
        setMissingVideoPath(project.videoPath);
        setSavedSnapshot(
          createProjectDirtySnapshot({
            videoPath: project.videoPath,
            calibration: project.calibration,
            samples: project.samples,
          }),
        );
        setOpenError(videoErr instanceof Error ? videoErr.message : String(videoErr));
      }
    } catch (error) {
      if (seq !== openSeqRef.current) return;
      setProjectError(error instanceof Error ? error.message : String(error));
    } finally {
      if (seq === openSeqRef.current) {
        setIsOpening(false);
      }
    }
  }, []);

  const saveProject = useCallback(async (): Promise<boolean> => {
    const videoPath = metadata?.path ?? missingVideoPath;
    if (!videoPath) return false;
    setProjectError(null);
    try {
      const stem = metadata?.fileName.replace(/\.[^.]+$/, "") || "projet";
      const target = await save({
        title: "Enregistrer le projet NeoMeca",
        defaultPath: `${stem}.neomeca.json`,
        filters: [{ name: "Projet NeoMeca (*.neomeca.json)", extensions: ["neomeca.json", "json"] }],
      });
      if (!target) return false;

      const content = serializeProjectFile({
        videoPath,
        calibration,
        trackingSettings,
        pointStyles,
        samples: trackingHistory.present,
      });
      await writeTextFile(target, content);
      setSavedSnapshot(
        createProjectDirtySnapshot({
          videoPath,
          calibration,
          samples: trackingHistory.present,
        }),
      );
      return true;
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [
    metadata,
    missingVideoPath,
    calibration,
    trackingSettings,
    pointStyles,
    trackingHistory.present,
  ]);

  const requestOpenVideo = useCallback(() => {
    if (isDirty) {
      setPendingAction({ kind: "open-video" });
      return;
    }
    void performOpenVideo();
  }, [isDirty, performOpenVideo]);

  const requestOpenProject = useCallback(() => {
    if (isDirty) {
      setPendingAction({ kind: "open-project" });
      return;
    }
    void performOpenProject();
  }, [isDirty, performOpenProject]);

  const executePendingAction = useCallback(
    async (action: PendingGuardAction) => {
      if (action.kind === "close-window") {
        allowCloseRef.current = true;
        await getCurrentWindow().destroy();
      } else if (action.kind === "open-video") {
        await performOpenVideo();
      } else {
        await performOpenProject();
      }
    },
    [performOpenVideo, performOpenProject],
  );

  const handleDiscardAndProceed = useCallback(async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    await executePendingAction(action);
  }, [pendingAction, executePendingAction]);

  const handleSaveAndProceed = useCallback(async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setIsSavingGuard(true);
    try {
      const saved = await saveProject();
      if (!saved) return;
      setPendingAction(null);
      await executePendingAction(action);
    } finally {
      setIsSavingGuard(false);
    }
  }, [pendingAction, saveProject, executePendingAction]);

  const handlePickCalibrationPoint = useCallback(
    (coords: PixelCoords) => {
      if (toolMode === "pick-scale-1") {
        const shouldChainToP2 = calibration.point2 === null;
        setCalibration((prev) => ({ ...prev, point1: coords }));
        setToolMode(shouldChainToP2 ? "pick-scale-2" : "none");
      } else if (toolMode === "pick-scale-2") {
        setCalibration((prev) => ({ ...prev, point2: coords }));
        setToolMode("none");
      } else if (toolMode === "pick-origin") {
        setCalibration((prev) => ({ ...prev, origin: coords }));
        setToolMode("none");
      }
    },
    [toolMode, calibration.point2],
  );

  const handleTrackPoint = useCallback(
    (coords: PixelCoords) => {
      if (!metadata) return;
      const pointId = trackingSettings.activePointId;
      setTrackingHistory((history) =>
        commitTrackingSamples(
          history,
          upsertSample(history.present, {
            frameIndex: currentFrame,
            pointId,
            pixel: coords,
          }),
        ),
      );
      const { nextFrame, nextPointId } = computeNextStepAfterPick(
        currentFrame,
        metadata.totalFrames,
        trackingSettings,
      );
      setCurrentFrame(nextFrame);
      setTrackingSettings((prev) =>
        prev.activePointId === nextPointId ? prev : { ...prev, activePointId: nextPointId },
      );
    },
    [metadata, currentFrame, trackingSettings],
  );

  const handleUndo = useCallback(() => {
    setTrackingHistory((history) => undoTrackingHistory(history));
  }, []);

  const handleRedo = useCallback(() => {
    setTrackingHistory((history) => redoTrackingHistory(history));
  }, []);

  const handleClearPoint = useCallback((pointId: number) => {
    setTrackingHistory((history) => {
      const next = removeSamplesForPoint(history.present, pointId);
      return next.length === history.present.length
        ? history
        : commitTrackingSamples(history, next);
    });
  }, []);

  const handleClearFrame = useCallback((frameIndex: number) => {
    setTrackingHistory((history) => {
      const next = removeSamplesForFrame(history.present, frameIndex);
      return next.length === history.present.length
        ? history
        : commitTrackingSamples(history, next);
    });
  }, []);

  const handleClearAll = useCallback(() => {
    setTrackingHistory((history) =>
      history.present.length === 0 ? history : commitTrackingSamples(history, []),
    );
  }, []);

  const handlePointStyleChange = useCallback(
    (pointId: number, patch: Partial<TrackedPointStyle>) => {
      setPointStyles((prev) =>
        prev.map((style) => (style.id === pointId ? { ...style, ...patch } : style)),
      );
    },
    [],
  );

  const handleSelectFrameFromTable = useCallback((frameIndex: number) => {
    setStopPlaybackToken((token) => token + 1);
    setCurrentFrame(frameIndex);
  }, []);

  useEffect(() => {
    setAnalysisPointId((id) => Math.min(id, trackingSettings.pointsPerFrame));
  }, [trackingSettings.pointsPerFrame]);

  // Supprime le menu contextuel navigateur ("Actualiser" / "Reload") et les raccourcis F5 / Ctrl+R.
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (!isTextContextTarget(event.target)) {
        event.preventDefault();
      }
    };
    const onReloadKeyDown = (event: KeyboardEvent) => {
      if (isBrowserReloadKey(event)) {
        event.preventDefault();
      }
    };
    window.addEventListener("contextmenu", onContextMenu, true);
    window.addEventListener("keydown", onReloadKeyDown, true);
    return () => {
      window.removeEventListener("contextmenu", onContextMenu, true);
      window.removeEventListener("keydown", onReloadKeyDown, true);
    };
  }, []);

  // Raccourcis Undo / Redo globaux : Ctrl+Z et Ctrl+Y / Ctrl+Shift+Z.
  useEffect(() => {
    if (!metadata) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [metadata, handleUndo, handleRedo]);

  const effectiveExportPointId = Math.min(
    analysisPointId,
    trackingSettings.pointsPerFrame,
  );
  const exportPointName =
    pointStyles.find((s) => s.id === effectiveExportPointId)?.name ??
    `P${effectiveExportPointId}`;

  const exportRows = useMemo(() => {
    if (!metadata) return [];
    return computeKinematicsSeries(
      trackingHistory.present,
      effectiveExportPointId,
      calibration,
      metadata.frameDurationSecs,
      trackingSettings.massKg,
      trackingSettings.gravityMps2,
    );
  }, [
    metadata,
    trackingHistory.present,
    effectiveExportPointId,
    calibration,
    trackingSettings.massKg,
    trackingSettings.gravityMps2,
  ]);

  const isClosingGuard = pendingAction?.kind === "close-window";

  return (
    <ExamModeProvider value={examSession.examMode}>
      <TooltipProvider>
        <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
          <AppHeader
            theme={theme}
            examMode={examSession.examMode}
            isOpening={isOpening}
            canSaveProject={metadata !== null || missingVideoPath !== null}
            canExport={metadata !== null}
            onToggleTheme={toggleTheme}
            onOpenVideo={requestOpenVideo}
            onOpenProject={requestOpenProject}
            onSaveProject={() => {
              void saveProject();
            }}
            onOpenExport={() => setExportDialogOpen(true)}
            onOpenSettings={() => setSettingsDialogOpen(true)}
          />
        <div className="flex min-h-0 flex-1">
          <VideoWorkspace
            key={metadata ? `${metadata.path}#${videoLoadId}` : "empty"}
            metadata={metadata}
            isOpening={isOpening}
            openError={openError}
            currentFrame={currentFrame}
            calibration={calibration}
            samples={trackingHistory.present}
            pointStyles={pointStyles}
            trackingSettings={trackingSettings}
            toolMode={toolMode}
            stopPlaybackToken={stopPlaybackToken}
            missingVideoPath={missingVideoPath}
            projectError={projectError}
            onOpenVideo={requestOpenVideo}
            onRelocateVideo={relocateProjectVideo}
            onDismissProjectError={() => setProjectError(null)}
            onCurrentFrameChange={setCurrentFrame}
            onDisplayScaleChange={setDisplayScale}
            onFrameCachePathChange={setCurrentFramePath}
            onPickCalibrationPoint={handlePickCalibrationPoint}
            onTrackPoint={handleTrackPoint}
            onCancelTool={() => setToolMode("none")}
          />
          <SidePanel
            metadata={metadata}
            displayScale={displayScale}
            currentFrame={currentFrame}
            calibration={calibration}
            toolMode={toolMode}
            samples={trackingHistory.present}
            pointStyles={pointStyles}
            trackingSettings={trackingSettings}
            analysisPointId={analysisPointId}
            canUndo={trackingHistory.past.length > 0}
            canRedo={trackingHistory.future.length > 0}
            onCalibrationChange={setCalibration}
            onToolModeChange={setToolMode}
            onTrackingSettingsChange={setTrackingSettings}
            onPointStyleChange={handlePointStyleChange}
            onAnalysisPointIdChange={setAnalysisPointId}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClearPoint={handleClearPoint}
            onClearFrame={handleClearFrame}
            onClearAll={handleClearAll}
            onSelectFrame={handleSelectFrameFromTable}
            onOpenExportDialog={() => setExportDialogOpen(true)}
          />
        </div>
        <ExportDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          metadata={metadata}
          rows={exportRows}
          pointName={exportPointName}
          frameCachePath={currentFramePath}
          currentFrame={currentFrame}
          calibration={calibration}
          samples={trackingHistory.present}
          styles={pointStyles}
          settings={trackingSettings}
        />
        <SettingsDialog
          open={settingsDialogOpen}
          onOpenChange={setSettingsDialogOpen}
          theme={theme}
          onThemeChange={setTheme}
          examMode={examSession.examMode}
          onActivateExamMode={() => setExamSession(activateExamModeSession())}
          onOpenHelp={() => {
            setExamSession((prev) =>
              canOpenHelp(prev.examMode) ? { ...prev, helpOpen: true } : prev,
            );
          }}
        />
        <HelpDialog
          open={examSession.helpOpen && canOpenHelp(examSession.examMode)}
          onOpenChange={(nextOpen) => {
            setExamSession((prev) => ({
              ...prev,
              helpOpen: canOpenHelp(prev.examMode) ? nextOpen : false,
            }));
          }}
        />
        <AlertDialog
          open={pendingAction !== null}
          onOpenChange={(openState) => {
            if (!openState && !isSavingGuard) {
              setPendingAction(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Modifications non enregistrées</AlertDialogTitle>
              <AlertDialogDescription>
                {isClosingGuard
                  ? "Votre projet contient des mesures ou un étalonnage non enregistrés. Voulez-vous enregistrer avant de quitter NeoMeca ?"
                  : "Votre projet contient des mesures ou un étalonnage non enregistrés. Voulez-vous enregistrer avant de continuer ?"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {projectError && (
              <p className="text-sm font-medium text-destructive">{projectError}</p>
            )}
            <AlertDialogFooter className="sm:flex-wrap">
              <AlertDialogCancel disabled={isSavingGuard}>Annuler</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={isSavingGuard}
                onClick={() => {
                  void handleDiscardAndProceed();
                }}
              >
                {isClosingGuard
                  ? "Quitter sans enregistrer"
                  : "Continuer sans enregistrer"}
              </Button>
              <Button
                type="button"
                disabled={isSavingGuard}
                onClick={() => {
                  void handleSaveAndProceed();
                }}
              >
                {isClosingGuard
                  ? "Enregistrer le projet et quitter"
                  : "Enregistrer puis continuer"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      </TooltipProvider>
    </ExamModeProvider>
  );
}
