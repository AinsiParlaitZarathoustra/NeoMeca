// SPDX-License-Identifier: MPL-2.0
import { AnalysisPanel } from "@/components/analysis-panel";
import { CalibrationPanel } from "@/components/calibration-panel";
import { PropertiesPanel } from "@/components/properties-panel";
import { TrackingPanel } from "@/components/tracking-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CalibrationState } from "@/lib/calibration";
import type {
  TrackedPointStyle,
  TrackingSample,
  TrackingSettings,
  WorkspaceToolMode,
} from "@/lib/tracking";
import type { VideoMetadata } from "@/lib/video";

interface SidePanelProps {
  metadata: VideoMetadata | null;
  displayScale: number;
  currentFrame: number;
  calibration: CalibrationState;
  toolMode: WorkspaceToolMode;
  samples: TrackingSample[];
  pointStyles: TrackedPointStyle[];
  trackingSettings: TrackingSettings;
  analysisPointId: number;
  canUndo: boolean;
  canRedo: boolean;
  onCalibrationChange: (updater: (prev: CalibrationState) => CalibrationState) => void;
  onToolModeChange: (mode: WorkspaceToolMode) => void;
  onTrackingSettingsChange: (updater: (prev: TrackingSettings) => TrackingSettings) => void;
  onPointStyleChange: (pointId: number, patch: Partial<TrackedPointStyle>) => void;
  onAnalysisPointIdChange: (pointId: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearPoint: (pointId: number) => void;
  onClearFrame: (frameIndex: number) => void;
  onClearAll: () => void;
  onSelectFrame: (frameIndex: number) => void;
  onOpenExportDialog: () => void;
}

/** Panneau latéral droit à onglets. */
export function SidePanel({
  metadata,
  displayScale,
  currentFrame,
  calibration,
  toolMode,
  samples,
  pointStyles,
  trackingSettings,
  analysisPointId,
  canUndo,
  canRedo,
  onCalibrationChange,
  onToolModeChange,
  onTrackingSettingsChange,
  onPointStyleChange,
  onAnalysisPointIdChange,
  onUndo,
  onRedo,
  onClearPoint,
  onClearFrame,
  onClearAll,
  onSelectFrame,
  onOpenExportDialog,
}: SidePanelProps) {
  const handleTabChange = (nextTab: string) => {
    if (nextTab !== "tracking" && toolMode === "track") {
      onToolModeChange("none");
    } else if (nextTab !== "calibration" && toolMode !== "none" && toolMode !== "track") {
      onToolModeChange("none");
    }
  };

  return (
    <aside className="flex w-[390px] shrink-0 flex-col border-l p-3">
      <Tabs
        defaultValue="properties"
        onValueChange={handleTabChange}
        className="min-h-0 flex-1"
      >
        <TabsList className="w-full">
          <TabsTrigger value="properties">Propriétés</TabsTrigger>
          <TabsTrigger value="calibration">Étalonnage</TabsTrigger>
          <TabsTrigger value="tracking">Pointage</TabsTrigger>
          <TabsTrigger value="analysis">Analyse</TabsTrigger>
        </TabsList>

        <TabsContent value="properties" className="overflow-y-auto">
          <PropertiesPanel metadata={metadata} displayScale={displayScale} />
        </TabsContent>

        <TabsContent value="calibration" className="overflow-y-auto pr-0.5">
          <CalibrationPanel
            metadata={metadata}
            currentFrame={currentFrame}
            calibration={calibration}
            toolMode={toolMode === "track" ? "none" : toolMode}
            onCalibrationChange={onCalibrationChange}
            onToolModeChange={onToolModeChange}
          />
        </TabsContent>

        <TabsContent value="tracking" className="overflow-y-auto pr-0.5">
          <TrackingPanel
            metadata={metadata}
            currentFrame={currentFrame}
            calibration={calibration}
            samples={samples}
            styles={pointStyles}
            settings={trackingSettings}
            toolMode={toolMode}
            canUndo={canUndo}
            canRedo={canRedo}
            onToolModeChange={onToolModeChange}
            onSettingsChange={onTrackingSettingsChange}
            onStyleChange={onPointStyleChange}
            onUndo={onUndo}
            onRedo={onRedo}
            onClearPoint={onClearPoint}
            onClearFrame={onClearFrame}
            onClearAll={onClearAll}
            onSelectFrame={onSelectFrame}
          />
        </TabsContent>

        <TabsContent value="analysis" className="overflow-y-auto pr-0.5">
          <AnalysisPanel
            metadata={metadata}
            calibration={calibration}
            samples={samples}
            styles={pointStyles}
            settings={trackingSettings}
            selectedPointId={analysisPointId}
            onSelectedPointIdChange={onAnalysisPointIdChange}
            onOpenExportDialog={onOpenExportDialog}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
