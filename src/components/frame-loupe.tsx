// SPDX-License-Identifier: MPL-2.0
import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import type { PixelCoords } from "@/lib/video";

const LOUPE_SIZE = 144;
const LOUPE_ZOOM = 4;
const LOUPE_OFFSET = 20;

interface FrameLoupeProps {
  sourceImage: HTMLImageElement;
  frameVersion: number | null;
  cursor: PixelCoords & { viewportX: number; viewportY: number };
  viewportWidth: number;
  viewportHeight: number;
}

/** Loupe de précision (×4) avec réticule en croix centrée sur le pixel visé. */
export function FrameLoupe({
  sourceImage,
  frameVersion,
  cursor,
  viewportWidth,
  viewportHeight,
}: FrameLoupeProps) {
  const lensRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const lens = lensRef.current;
    if (!lens) return;
    const ctx = lens.getContext("2d");
    if (!ctx) return;

    const srcSize = LOUPE_SIZE / LOUPE_ZOOM;
    const half = srcSize / 2;
    const sx = cursor.x + 0.5 - half;
    const sy = cursor.y + 0.5 - half;

    ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);

    const imgW = sourceImage.naturalWidth || sourceImage.width;
    const imgH = sourceImage.naturalHeight || sourceImage.height;

    // Découpe sécurisée dans les bornes de l'image source pour éviter tout débordement.
    const srcLeft = Math.max(0, sx);
    const srcTop = Math.max(0, sy);
    const srcRight = Math.min(imgW, sx + srcSize);
    const srcBottom = Math.min(imgH, sy + srcSize);

    if (srcRight > srcLeft && srcBottom > srcTop) {
      const dx = (srcLeft - sx) * LOUPE_ZOOM;
      const dy = (srcTop - sy) * LOUPE_ZOOM;
      const dw = (srcRight - srcLeft) * LOUPE_ZOOM;
      const dh = (srcBottom - srcTop) * LOUPE_ZOOM;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        sourceImage,
        srcLeft,
        srcTop,
        srcRight - srcLeft,
        srcBottom - srcTop,
        dx,
        dy,
        dw,
        dh,
      );
    }

    // Réticule en croix à fort contraste centré sur le pixel visé.
    const center = LOUPE_SIZE / 2;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(center, 0);
    ctx.lineTo(center, LOUPE_SIZE);
    ctx.moveTo(0, center);
    ctx.lineTo(LOUPE_SIZE, center);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(center, 0);
    ctx.lineTo(center, LOUPE_SIZE);
    ctx.moveTo(0, center);
    ctx.lineTo(LOUPE_SIZE, center);
    ctx.stroke();

    // Encadrement exact du pixel central (4×4 px à l'écran).
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      center - LOUPE_ZOOM / 2 + 0.5,
      center - LOUPE_ZOOM / 2 + 0.5,
      LOUPE_ZOOM - 1,
      LOUPE_ZOOM - 1,
    );
  }, [sourceImage, frameVersion, cursor.x, cursor.y]);

  const cardWidth = LOUPE_SIZE;
  const cardHeight = LOUPE_SIZE + 26;
  const flipLeft = cursor.viewportX + LOUPE_OFFSET + cardWidth > viewportWidth - 8;
  const flipTop = cursor.viewportY + LOUPE_OFFSET + cardHeight > viewportHeight - 8;

  const left = flipLeft
    ? Math.max(8, cursor.viewportX - LOUPE_OFFSET - cardWidth)
    : cursor.viewportX + LOUPE_OFFSET;
  const top = flipTop
    ? Math.max(8, cursor.viewportY - LOUPE_OFFSET - cardHeight)
    : cursor.viewportY + LOUPE_OFFSET;

  return (
    <Card
      className="pointer-events-none absolute z-20 gap-0 overflow-hidden border-2 border-primary/80 p-0 shadow-xl"
      style={{ left, top, width: cardWidth }}
    >
      <canvas
        ref={lensRef}
        width={LOUPE_SIZE}
        height={LOUPE_SIZE}
        className="block size-[144px]"
      />
      <div className="flex h-[26px] items-center justify-between border-t bg-popover/95 px-2 font-mono text-[11px] tabular-nums text-popover-foreground">
        <span>×{LOUPE_ZOOM}</span>
        <span>
          pX {cursor.x} · pY {cursor.y}
        </span>
      </div>
    </Card>
  );
}
