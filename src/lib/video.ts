// SPDX-License-Identifier: MPL-2.0
import { invoke } from "@tauri-apps/api/core";

export {
  clampFrameIndex,
  computeVideoPixelCoords,
  formatDecimal,
  formatFileSize,
  type PixelCoords,
} from "./video-math.ts";

/** Métadonnées techniques d'une vidéo ouverte, renvoyées par FFprobe. */
export interface VideoMetadata {
  path: string;
  fileName: string;
  fileSizeBytes: number;
  width: number;
  height: number;
  fps: number;
  frameDurationSecs: number;
  durationSecs: number;
  totalFrames: number;
  codecName: string;
  codecLongName: string | null;
}

export function openVideoInfo(path: string): Promise<VideoMetadata> {
  return invoke<VideoMetadata>("open_video_info", { path });
}

export function extractFrame(path: string, frameIndex: number, fps: number): Promise<string> {
  return invoke<string>("extract_frame", { path, frameIndex, fps });
}
