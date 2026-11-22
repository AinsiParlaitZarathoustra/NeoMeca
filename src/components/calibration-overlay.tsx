// SPDX-License-Identifier: MPL-2.0
import type { CalibrationState, CalibrationToolMode } from "@/lib/calibration";
import { clampNumber, type PixelCoords } from "@/lib/video-math";

interface CalibrationOverlayProps {
  videoWidth: number;
  videoHeight: number;
  displayScale: number;
  calibration: CalibrationState;
  toolMode: CalibrationToolMode;
  hoverPixel: PixelCoords | null;
}

function LabelPill({
  x,
  y,
  text,
  color,
  unit,
  anchor = "middle",
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  unit: number;
  anchor?: "start" | "middle" | "end";
}) {
  const fontSize = 12 * unit;
  const padX = 5 * unit;
  const padY = 3 * unit;
  const approxWidth = text.length * 7.4 * unit + padX * 2;
  const height = fontSize + padY * 2;
  const rectX =
    anchor === "middle"
      ? x - approxWidth / 2
      : anchor === "end"
        ? x - approxWidth
        : x;

  return (
    <g>
      <rect
        x={rectX}
        y={y - height / 2}
        width={approxWidth}
        height={height}
        rx={4 * unit}
        fill="rgba(15, 23, 42, 0.82)"
        stroke={color}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={x}
        y={y}
        fill="#f8fafc"
        fontSize={fontSize}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={600}
        textAnchor={anchor}
        dominantBaseline="central"
      >
        {text}
      </text>
    </g>
  );
}

function PointMarker({
  point,
  color,
  label,
  unit,
  videoWidth,
  videoHeight,
}: {
  point: PixelCoords;
  color: string;
  label: string;
  unit: number;
  videoWidth: number;
  videoHeight: number;
}) {
  const cx = point.x + 0.5;
  const cy = point.y + 0.5;
  const r = 4.5 * unit;
  const tick = 8 * unit;
  const nearRight = cx > videoWidth - 42 * unit;
  const nearTop = cy < 24 * unit;
  const labelX = clampNumber(
    nearRight ? cx - 10 * unit : cx + 10 * unit,
    6 * unit,
    videoWidth - 6 * unit,
  );
  const labelY = clampNumber(
    nearTop ? cy + 14 * unit : cy - 12 * unit,
    12 * unit,
    videoHeight - 12 * unit,
  );

  return (
    <g>
      <line
        x1={cx - tick}
        y1={cy}
        x2={cx + tick}
        y2={cy}
        stroke="rgba(0,0,0,0.75)"
        strokeWidth={3.5}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={cx}
        y1={cy - tick}
        x2={cx}
        y2={cy + tick}
        stroke="rgba(0,0,0,0.75)"
        strokeWidth={3.5}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={cx - tick}
        y1={cy}
        x2={cx + tick}
        y2={cy}
        stroke={color}
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={cx}
        y1={cy - tick}
        x2={cx}
        y2={cy + tick}
        stroke={color}
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
      />
      <LabelPill
        x={labelX}
        y={labelY}
        text={label}
        color={color}
        unit={unit}
        anchor={nearRight ? "end" : "start"}
      />
    </g>
  );
}

/** Calque vectoriel affichant le segment d'échelle et le repère (O, x, y) sur la vidéo. */
export function CalibrationOverlay({
  videoWidth,
  videoHeight,
  displayScale,
  calibration,
  toolMode,
  hoverPixel,
}: CalibrationOverlayProps) {
  const unit = 1 / Math.max(0.05, displayScale);
  const { point1, point2, realDistanceMeters, origin, orientation, showScale, showAxes } =
    calibration;

  const previewTarget = toolMode === "pick-scale-2" && point1 && !point2 ? hoverPixel : null;
  const segmentEnd = point2 ?? previewTarget;

  const arrowLen = 11 * unit;
  const arrowHalf = 5 * unit;
  const margin = 6 * unit;

  const ox = origin ? origin.x + 0.5 : 0;
  const oy = origin ? origin.y + 0.5 : 0;

  const xTip = orientation.x === 1 ? videoWidth - margin : margin;
  const xArrowBase = xTip - orientation.x * arrowLen;
  const yTip = orientation.y === 1 ? margin : videoHeight - margin;
  const yArrowBase = yTip + orientation.y * arrowLen;

  const oLabelX = clampNumber(ox + orientation.x * 16 * unit, 16 * unit, videoWidth - 16 * unit);
  const oLabelY = clampNumber(oy + orientation.y * 16 * unit, 16 * unit, videoHeight - 16 * unit);

  const xLabelX = clampNumber(
    xTip - orientation.x * 18 * unit,
    18 * unit,
    videoWidth - 18 * unit,
  );
  const xLabelY = clampNumber(
    oy - orientation.y * 16 * unit,
    16 * unit,
    videoHeight - 16 * unit,
  );

  const yLabelX = clampNumber(
    ox + orientation.x * 16 * unit,
    18 * unit,
    videoWidth - 18 * unit,
  );
  const yLabelY = clampNumber(
    yTip + orientation.y * 18 * unit,
    16 * unit,
    videoHeight - 16 * unit,
  );

  const scaleLabel =
    Number.isFinite(realDistanceMeters) && realDistanceMeters > 0
      ? `${realDistanceMeters.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} m`
      : "? m";

  return (
    <svg
      viewBox={`0 0 ${videoWidth} ${videoHeight}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full overflow-hidden"
    >
      {/* Axes (Ox, Oy) */}
      {showAxes && origin && (
        <g>
          {/* Halo sombre pour la lisibilité */}
          <line
            x1={0}
            y1={oy}
            x2={videoWidth}
            y2={oy}
            stroke="rgba(0,0,0,0.55)"
            strokeWidth={3.5}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={ox}
            y1={0}
            x2={ox}
            y2={videoHeight}
            stroke="rgba(0,0,0,0.55)"
            strokeWidth={3.5}
            vectorEffect="non-scaling-stroke"
          />

          {/* Lignes principales */}
          <line
            x1={0}
            y1={oy}
            x2={videoWidth}
            y2={oy}
            stroke={calibration.axesColor}
            strokeWidth={1.75}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={ox}
            y1={0}
            x2={ox}
            y2={videoHeight}
            stroke={calibration.axesColor}
            strokeWidth={1.75}
            vectorEffect="non-scaling-stroke"
          />

          {/* Flèche +x */}
          <polygon
            points={`${xTip},${oy} ${xArrowBase},${oy - arrowHalf} ${xArrowBase},${oy + arrowHalf}`}
            fill={calibration.axesColor}
          />
          {/* Flèche +y */}
          <polygon
            points={`${ox},${yTip} ${ox - arrowHalf},${yArrowBase} ${ox + arrowHalf},${yArrowBase}`}
            fill={calibration.axesColor}
          />

          <circle
            cx={ox}
            cy={oy}
            r={4 * unit}
            fill={calibration.axesColor}
            stroke="#ffffff"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />

          <LabelPill x={oLabelX} y={oLabelY} text="O" color={calibration.axesColor} unit={unit} />
          <LabelPill x={xLabelX} y={xLabelY} text="x" color={calibration.axesColor} unit={unit} />
          <LabelPill x={yLabelX} y={yLabelY} text="y" color={calibration.axesColor} unit={unit} />
        </g>
      )}

      {/* Segment d'échelle P1 - P2 */}
      {showScale && (
        <g>
          {point1 && segmentEnd && (
            <>
              <line
                x1={point1.x + 0.5}
                y1={point1.y + 0.5}
                x2={segmentEnd.x + 0.5}
                y2={segmentEnd.y + 0.5}
                stroke="rgba(0,0,0,0.65)"
                strokeWidth={4}
                strokeDasharray={previewTarget ? "6 4" : undefined}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={point1.x + 0.5}
                y1={point1.y + 0.5}
                x2={segmentEnd.x + 0.5}
                y2={segmentEnd.y + 0.5}
                stroke={calibration.scaleColor}
                strokeWidth={2}
                strokeDasharray={previewTarget ? "6 4" : undefined}
                vectorEffect="non-scaling-stroke"
              />
              {point2 && (
                <LabelPill
                  x={clampNumber(
                    (point1.x + point2.x) / 2 + 0.5,
                    28 * unit,
                    videoWidth - 28 * unit,
                  )}
                  y={clampNumber(
                    (point1.y + point2.y) / 2 + 0.5 - 14 * unit,
                    14 * unit,
                    videoHeight - 14 * unit,
                  )}
                  text={scaleLabel}
                  color={calibration.scaleColor}
                  unit={unit}
                />
              )}
            </>
          )}
          {point1 && (
            <PointMarker
              point={point1}
              color={calibration.scaleColor}
              label="P1"
              unit={unit}
              videoWidth={videoWidth}
              videoHeight={videoHeight}
            />
          )}
          {point2 && (
            <PointMarker
              point={point2}
              color={calibration.scaleColor}
              label="P2"
              unit={unit}
              videoWidth={videoWidth}
              videoHeight={videoHeight}
            />
          )}
        </g>
      )}
    </svg>
  );
}
