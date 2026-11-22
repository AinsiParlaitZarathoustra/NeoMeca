// SPDX-License-Identifier: MPL-2.0
import { computeMetersPerPixel, type CalibrationState } from "./calibration.ts";
import {
  computeKinematicsSeries,
  type PointShape,
  type TrackedPointStyle,
  type TrackingSample,
  type TrackingSettings,
} from "./tracking.ts";
import { clampNumber, type PixelCoords } from "./video-math.ts";

export interface RenderAnnotatedPngOptions {
  videoWidth: number;
  videoHeight: number;
  sourceImage: HTMLImageElement | null;
  includeVideoBackground: boolean;
  currentFrame: number;
  frameDurationSecs: number;
  calibration: CalibrationState;
  samples: TrackingSample[];
  styles: TrackedPointStyle[];
  settings: TrackingSettings;
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  borderColor: string,
) {
  ctx.save();
  ctx.font = "600 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  const metrics = ctx.measureText(text);
  const padX = 6;
  const height = 20;
  const width = Math.ceil(metrics.width) + padX * 2;
  const boxX = x - width / 2;
  const boxY = y - height / 2;

  ctx.fillStyle = "rgba(15, 23, 42, 0.84)";
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, width, height, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f8fafc";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  label?: string,
  bounds?: { width: number; height: number },
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 3) return;

  const ux = dx / len;
  const uy = dy / len;
  const arrowLen = Math.min(11, len * 0.45);
  const arrowHalf = arrowLen * 0.45;
  const baseX = x2 - ux * arrowLen;
  const baseY = y2 - uy * arrowLen;
  const perpX = -uy * arrowHalf;
  const perpY = ux * arrowHalf;

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(baseX, baseY);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(baseX, baseY);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(baseX + perpX, baseY + perpY);
  ctx.lineTo(baseX - perpX, baseY - perpY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (label && bounds) {
    const lx = clampNumber(x2 + ux * 11, 12, bounds.width - 12);
    const ly = clampNumber(y2 + uy * 11, 12, bounds.height - 12);
    ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
    ctx.lineWidth = 3;
    ctx.strokeText(label, lx, ly);
    ctx.fillStyle = color;
    ctx.fillText(label, lx, ly);
  }
  ctx.restore();
}

function drawPointGlyph(
  ctx: CanvasRenderingContext2D,
  center: PixelCoords,
  shape: PointShape,
  radius: number,
  color: string,
) {
  const cx = center.x + 0.5;
  const cy = center.y + 0.5;
  ctx.save();

  const strokeWithHalo = (drawPath: () => void) => {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
    ctx.lineWidth = 3.5;
    drawPath();
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    drawPath();
    ctx.stroke();
  };

  if (shape === "cross") {
    strokeWithHalo(() => {
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
    });
  } else if (shape === "square") {
    strokeWithHalo(() => {
      ctx.beginPath();
      ctx.rect(cx - radius, cy - radius, radius * 2, radius * 2);
    });
  } else {
    strokeWithHalo(() => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    });
  }
  ctx.restore();
}

function drawCalibrationToCanvas(
  ctx: CanvasRenderingContext2D,
  videoWidth: number,
  videoHeight: number,
  calibration: CalibrationState,
) {
  const { point1, point2, realDistanceMeters, origin, orientation, showScale, showAxes } =
    calibration;

  if (showAxes && origin) {
    const ox = origin.x + 0.5;
    const oy = origin.y + 0.5;
    const xTip = orientation.x === 1 ? videoWidth - 6 : 6;
    const yTip = orientation.y === 1 ? 6 : videoHeight - 6;

    ctx.save();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(videoWidth, oy);
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, videoHeight);
    ctx.stroke();

    ctx.strokeStyle = calibration.axesColor;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(videoWidth, oy);
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, videoHeight);
    ctx.stroke();
    ctx.restore();

    drawArrow(ctx, ox, oy, xTip, oy, calibration.axesColor);
    drawArrow(ctx, ox, oy, ox, yTip, calibration.axesColor);

    drawPill(
      ctx,
      clampNumber(ox + orientation.x * 16, 16, videoWidth - 16),
      clampNumber(oy + orientation.y * 16, 16, videoHeight - 16),
      "O",
      calibration.axesColor,
    );
    drawPill(
      ctx,
      clampNumber(xTip - orientation.x * 18, 18, videoWidth - 18),
      clampNumber(oy - orientation.y * 16, 16, videoHeight - 16),
      "x",
      calibration.axesColor,
    );
    drawPill(
      ctx,
      clampNumber(ox + orientation.x * 16, 18, videoWidth - 18),
      clampNumber(yTip + orientation.y * 18, 16, videoHeight - 16),
      "y",
      calibration.axesColor,
    );
  }

  if (showScale && point1 && point2) {
    const x1 = point1.x + 0.5;
    const y1 = point1.y + 0.5;
    const x2 = point2.x + 0.5;
    const y2 = point2.y + 0.5;

    ctx.save();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = calibration.scaleColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();

    drawPointGlyph(ctx, point1, "cross", 7, calibration.scaleColor);
    drawPointGlyph(ctx, point2, "cross", 7, calibration.scaleColor);
    const label = `${realDistanceMeters.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} m`;
    drawPill(
      ctx,
      clampNumber((x1 + x2) / 2, 28, videoWidth - 28),
      clampNumber((y1 + y2) / 2 - 14, 14, videoHeight - 14),
      label,
      calibration.scaleColor,
    );
  }
}

/** Compose l'image vidéo annotée sur un canvas hors écran et renvoie les octets PNG. */
export async function renderAnnotatedFramePng(
  options: RenderAnnotatedPngOptions,
): Promise<Uint8Array> {
  const {
    videoWidth,
    videoHeight,
    sourceImage,
    includeVideoBackground,
    currentFrame,
    frameDurationSecs,
    calibration,
    samples,
    styles,
    settings,
  } = options;

  const canvas = document.createElement("canvas");
  canvas.width = videoWidth;
  canvas.height = videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Contexte canvas 2D indisponible pour l'export PNG.");
  }

  if (includeVideoBackground) {
    if (!sourceImage) {
      throw new Error("L'image vidéo courante n'est pas encore chargée.");
    }
    ctx.drawImage(sourceImage, 0, 0, videoWidth, videoHeight);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, videoWidth, videoHeight);
  }

  drawCalibrationToCanvas(ctx, videoWidth, videoHeight, calibration);

  const metersPerPixel = computeMetersPerPixel(calibration);
  const needVectors =
    metersPerPixel !== null &&
    (settings.showVelocityVectors || settings.showAccelerationVectors);

  const grouped = new Map<number, TrackingSample[]>();
  for (const s of samples) {
    const list = grouped.get(s.pointId);
    if (list) list.push(s);
    else grouped.set(s.pointId, [s]);
  }
  const orderedIds = Array.from(grouped.keys()).sort((a, b) => a - b);
  const showLabels = settings.pointsPerFrame > 1 || orderedIds.length > 1;

  for (const pointId of orderedIds) {
    const list = grouped.get(pointId)!;
    list.sort((a, b) => a.frameIndex - b.frameIndex);
    const style = styles.find((item) => item.id === pointId) ?? {
      id: pointId,
      name: `P${pointId}`,
      color: "#ef4444",
      shape: "cross" as const,
      size: 3,
    };
    const radius = 2.5 + style.size * 1.5;

    if (settings.showTrajectories && list.length > 1) {
      ctx.save();
      ctx.strokeStyle = style.color;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      list.forEach((item, idx) => {
        const px = item.pixel.x + 0.5;
        const py = item.pixel.y + 0.5;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      for (const item of list) {
        if (item.frameIndex === currentFrame) continue;
        ctx.fillStyle = style.color;
        ctx.beginPath();
        ctx.arc(
          item.pixel.x + 0.5,
          item.pixel.y + 0.5,
          Math.max(2, radius * 0.45),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.restore();
    }

    const currentSample = list.find((item) => item.frameIndex === currentFrame);
    if (settings.showPoints && currentSample) {
      drawPointGlyph(ctx, currentSample.pixel, style.shape, radius, style.color);
      if (showLabels) {
        ctx.save();
        ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const lx = clampNumber(
          currentSample.pixel.x + 0.5 + radius + 8,
          10,
          videoWidth - 10,
        );
        const ly = clampNumber(
          currentSample.pixel.y + 0.5 - radius - 6,
          10,
          videoHeight - 10,
        );
        ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
        ctx.lineWidth = 3;
        ctx.strokeText(style.name, lx, ly);
        ctx.fillStyle = style.color;
        ctx.fillText(style.name, lx, ly);
        ctx.restore();
      }
    }

    if (needVectors && metersPerPixel !== null && currentSample) {
      const series = computeKinematicsSeries(
        list,
        pointId,
        calibration,
        frameDurationSecs,
        settings.massKg,
        settings.gravityMps2,
      );
      const row = series.find((r) => r.frameIndex === currentFrame);
      if (row) {
        if (settings.showVelocityVectors && row.vx !== null && row.vy !== null) {
          const dx =
            (row.vx * settings.velocityVectorScale * calibration.orientation.x) /
            metersPerPixel;
          const dy =
            (-row.vy * settings.velocityVectorScale * calibration.orientation.y) /
            metersPerPixel;
          drawArrow(
            ctx,
            row.pixel.x + 0.5,
            row.pixel.y + 0.5,
            row.pixel.x + 0.5 + dx,
            row.pixel.y + 0.5 + dy,
            "#10b981",
            showLabels ? `v${pointId}` : "v",
            { width: videoWidth, height: videoHeight },
          );
        }
        if (settings.showAccelerationVectors && row.ax !== null && row.ay !== null) {
          const dx =
            (row.ax * settings.accelerationVectorScale * calibration.orientation.x) /
            metersPerPixel;
          const dy =
            (-row.ay * settings.accelerationVectorScale * calibration.orientation.y) /
            metersPerPixel;
          drawArrow(
            ctx,
            row.pixel.x + 0.5,
            row.pixel.y + 0.5,
            row.pixel.x + 0.5 + dx,
            row.pixel.y + 0.5 + dy,
            "#f59e0b",
            showLabels ? `a${pointId}` : "a",
            { width: videoWidth, height: videoHeight },
          );
        }
      }
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("Échec de l'encodage de l'image PNG."));
    }, "image/png");
  });

  return new Uint8Array(await blob.arrayBuffer());
}
