// SPDX-License-Identifier: MPL-2.0
import { invoke } from "@tauri-apps/api/core";

/** État renvoyé par la commande Rust `check_ffmpeg_status`. */
export interface FfmpegStatus {
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  ffmpegVersion: string | null;
  ffprobeVersion: string | null;
  source: "system_path" | "sidecar" | "missing";
}

export function checkFfmpegStatus(): Promise<FfmpegStatus> {
  return invoke<FfmpegStatus>("check_ffmpeg_status");
}
