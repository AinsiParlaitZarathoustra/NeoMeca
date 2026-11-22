// SPDX-License-Identifier: MPL-2.0
import { useMemo } from "react";
import { computeMetersPerPixel, type CalibrationState } from "@/lib/calibration";
import {
  computeKinematicsSeries,
  type ComputedSampleRow,
  type PointShape,
  type TrackedPointStyle,
  type TrackingSample,
  type TrackingSettings,
} from "@/lib/tracking";
import { clampNumber, type PixelCoords } from "@/lib/video-math";

interface TrackingOverlayProps {
  videoWidth: number;
  videoHeight: number;
  displayScale: number;
  currentFrame: number;
  frameDurationSecs: number;
  calibration: CalibrationState;
  samples: TrackingSample[];
  styles: TrackedPointStyle[];
  settings: TrackingSettings;
}

const VELOCITY_COLOR = "#10b981";
const ACCELERATION_COLOR = "#f59e0b";

function PointShapeGlyph({
  center,
  shape,
  radius,
  color,
}: {
  center: PixelCoords;
  shape: PointShape;
  radius: number;
  color: string;
}) {
  const cx = center.x + 0.5;
  const cy = center.y + 0.5;

  if (shape === "cross") {
    return (
      <g>
        <line
          x1={cx - radius}
          y1={cy}
          x2={cx + radius}
          y2={cy}
          stroke="rgba(0,0,0,0.75)"
          strokeWidth={3.5}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={cx}
          y1={cy - radius}
          x2={cx}
          y2={cy + radius}
          stroke="rgba(0,0,0,0.75)"
          strokeWidth={3.5}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={cx - radius}
          y1={cy}
          x2={cx + radius}
          y2={cy}
          stroke={color}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={cx}
          y1={cy - radius}
          x2={cx}
          y2={cy + radius}
          stroke={color}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    );
  }

  if (shape === "square") {
    return (
      <g>
        <rect
          x={cx - radius}
          y={cy - radius}
          width={radius * 2}
          height={radius * 2}
          fill="none"
          stroke="rgba(0,0,0,0.75)"
          strokeWidth={3.5}
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x={cx - radius}
          y={cy - radius}
          width={radius * 2}
          height={radius * 2}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    );
  }

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="rgba(0,0,0,0.75)"
        strokeWidth={3.5}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

function VectorArrow({
  origin,
  dx,
  dy,
  color,
  label,
  unit,
  videoWidth,
  videoHeight,
}: {
  origin: PixelCoords;
  dx: number;
  dy: number;
  color: string;
  label: string;
  unit: number;
  videoWidth: number;
  videoHeight: number;
}) {
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 3 * unit) return null;

  const ox = origin.x + 0.5;
  const oy = origin.y + 0.5;
  const ex = ox + dx;
  const ey = oy + dy;
  const ux = dx / length;
  const uy = dy / length;
  const arrowLen = Math.min(10 * unit, length * 0.45);
  const arrowHalf = arrowLen * 0.45;
  const baseX = ex - ux * arrowLen;
  const baseY = ey - uy * arrowLen;
  const perpX = -uy * arrowHalf;
  const perpY = ux * arrowHalf;

  const labelX = clampNumber(ex + ux * 10 * unit, 10 * unit, videoWidth - 10 * unit);
  const labelY = clampNumber(ey + uy * 10 * unit, 10 * unit, videoHeight - 10 * unit);

  return (
    <g>
      <line
        x1={ox}
        y1={oy}
        x2={baseX}
        y2={baseY}
        stroke="rgba(0,0,0,0.7)"
        strokeWidth={3.5}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={ox}
        y1={oy}
        x2={baseX}
        y2={baseY}
        stroke={color}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      <polygon
        points={`${ex},${ey} ${baseX + perpX},${baseY + perpY} ${baseX - perpX},${baseY - perpY}`}
        fill={color}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth={0.75}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={labelX}
        y={labelY}
        fill={color}
        stroke="rgba(15, 23, 42, 0.9)"
        strokeWidth={3 * unit}
        paintOrder="stroke"
        fontSize={12 * unit}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>
    </g>
  );
}

/** Calque vectoriel des points suivis, trajectoires et vecteurs vitesse/accélération. */
export function TrackingOverlay({
  videoWidth,
  videoHeight,
  displayScale,
  currentFrame,
  frameDurationSecs,
  calibration,
  samples,
  styles,
  settings,
}: TrackingOverlayProps) {
  const metersPerPixel = computeMetersPerPixel(calibration);
  const needVectors =
    metersPerPixel !== null &&
    (settings.showVelocityVectors || settings.showAccelerationVectors);

  const groupedSamples = useMemo(() => {
    const map = new Map<number, TrackingSample[]>();
    for (const sample of samples) {
      const list = map.get(sample.pointId);
      if (list) {
        list.push(sample);
      } else {
        map.set(sample.pointId, [sample]);
      }
    }
    const ordered = Array.from(map.entries()).sort(([a], [b]) => a - b);
    for (const [, list] of ordered) {
      list.sort((a, b) => a.frameIndex - b.frameIndex);
    }
    return ordered;
  }, [samples]);

  // Mémoïse les séries cinématiques pour ne pas recalculer à chaque survol de la souris.
  const rowsByPointFrame = useMemo(() => {
    const result = new Map<number, Map<number, ComputedSampleRow>>();
    if (!needVectors) return result;
    for (const [pointId, list] of groupedSamples) {
      const series = computeKinematicsSeries(
        list,
        pointId,
        calibration,
        frameDurationSecs,
        settings.massKg,
        settings.gravityMps2,
      );
      const frameMap = new Map<number, ComputedSampleRow>();
      for (const row of series) {
        frameMap.set(row.frameIndex, row);
      }
      result.set(pointId, frameMap);
    }
    return result;
  }, [
    needVectors,
    groupedSamples,
    calibration,
    frameDurationSecs,
    settings.massKg,
    settings.gravityMps2,
  ]);

  if (groupedSamples.length === 0) return null;

  const unit = 1 / Math.max(0.05, displayScale);
  const showLabels = settings.pointsPerFrame > 1 || groupedSamples.length > 1;

  return (
    <svg
      viewBox={`0 0 ${videoWidth} ${videoHeight}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full overflow-hidden"
    >
      {groupedSamples.map(([pointId, pointSamples]) => {
        const style =
          styles.find((item) => item.id === pointId) ?? {
            id: pointId,
            name: `P${pointId}`,
            color: "#ef4444",
            shape: "cross" as const,
            size: 3,
          };

        const baseRadius = (2.5 + style.size * 1.5) * unit;
        const currentSample = pointSamples.find((item) => item.frameIndex === currentFrame);
        const currentRow = rowsByPointFrame.get(pointId)?.get(currentFrame);

        const polylinePoints = pointSamples
          .map((item) => `${item.pixel.x + 0.5},${item.pixel.y + 0.5}`)
          .join(" ");

        return (
          <g key={pointId}>
            {settings.showTrajectories && pointSamples.length > 1 && (
              <polyline
                points={polylinePoints}
                fill="none"
                stroke={style.color}
                strokeOpacity={0.55}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}

            {settings.showTrajectories &&
              pointSamples
                .filter((item) => item.frameIndex !== currentFrame)
                .map((item) => (
                  <circle
                    key={`${item.frameIndex}-${item.pointId}`}
                    cx={item.pixel.x + 0.5}
                    cy={item.pixel.y + 0.5}
                    r={Math.max(2 * unit, baseRadius * 0.45)}
                    fill={style.color}
                    fillOpacity={0.55}
                    stroke="rgba(0,0,0,0.5)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}

            {settings.showPoints && currentSample && (
              <>
                <PointShapeGlyph
                  center={currentSample.pixel}
                  shape={style.shape}
                  radius={baseRadius}
                  color={style.color}
                />
                {showLabels && (
                  <text
                    x={clampNumber(
                      currentSample.pixel.x + 0.5 + baseRadius + 8 * unit,
                      10 * unit,
                      videoWidth - 10 * unit,
                    )}
                    y={clampNumber(
                      currentSample.pixel.y + 0.5 - baseRadius - 6 * unit,
                      10 * unit,
                      videoHeight - 10 * unit,
                    )}
                    fill={style.color}
                    stroke="rgba(15, 23, 42, 0.9)"
                    strokeWidth={3 * unit}
                    paintOrder="stroke"
                    fontSize={11 * unit}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    fontWeight={700}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {style.name}
                  </text>
                )}
              </>
            )}

            {needVectors &&
              metersPerPixel !== null &&
              currentRow &&
              settings.showVelocityVectors &&
              currentRow.vx !== null &&
              currentRow.vy !== null && (
                <VectorArrow
                  origin={currentRow.pixel}
                  dx={
                    (currentRow.vx * settings.velocityVectorScale * calibration.orientation.x) /
                    metersPerPixel
                  }
                  dy={
                    (-currentRow.vy * settings.velocityVectorScale * calibration.orientation.y) /
                    metersPerPixel
                  }
                  color={VELOCITY_COLOR}
                  label={showLabels ? `v${pointId}` : "v"}
                  unit={unit}
                  videoWidth={videoWidth}
                  videoHeight={videoHeight}
                />
              )}

            {needVectors &&
              metersPerPixel !== null &&
              currentRow &&
              settings.showAccelerationVectors &&
              currentRow.ax !== null &&
              currentRow.ay !== null && (
                <VectorArrow
                  origin={currentRow.pixel}
                  dx={
                    (currentRow.ax *
                      settings.accelerationVectorScale *
                      calibration.orientation.x) /
                    metersPerPixel
                  }
                  dy={
                    (-currentRow.ay *
                      settings.accelerationVectorScale *
                      calibration.orientation.y) /
                    metersPerPixel
                  }
                  color={ACCELERATION_COLOR}
                  label={showLabels ? `a${pointId}` : "a"}
                  unit={unit}
                  videoWidth={videoWidth}
                  videoHeight={videoHeight}
                />
              )}
          </g>
        );
      })}
    </svg>
  );
}
