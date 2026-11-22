// SPDX-License-Identifier: MPL-2.0
//! Outils vidéo (détection FFmpeg/FFprobe, métadonnées et extraction d'images).

pub mod frames;
pub mod metadata;

pub use frames::FrameCache;

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

/// État de disponibilité de FFmpeg et FFprobe, transmis au frontend.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegStatus {
    pub ffmpeg_available: bool,
    pub ffprobe_available: bool,
    pub ffmpeg_version: Option<String>,
    pub ffprobe_version: Option<String>,
    /// "sidecar" | "system_path" | "missing"
    pub source: String,
}

/// Nom de l'exécutable selon la plateforme.
fn executable_name(tool: &str) -> String {
    if cfg!(windows) {
        format!("{tool}.exe")
    } else {
        tool.to_string()
    }
}

/// Cherche l'outil dans un dossier `bin/` placé à côté de l'exécutable courant.
fn sidecar_path(tool: &str) -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let candidate = exe.parent()?.join("bin").join(executable_name(tool));
    candidate.is_file().then_some(candidate)
}

/// Résout le chemin de l'exécutable : dossier `bin/` prioritaire, sinon `PATH`.
pub(crate) fn resolve_tool(tool: &str) -> PathBuf {
    sidecar_path(tool).unwrap_or_else(|| PathBuf::from(tool))
}

/// Construit une commande sans fenêtre console sous Windows.
pub(crate) fn silent_command(program: &Path) -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// Extrait la première ligne non vide de la sortie de `-version`.
fn first_line(output: &str) -> Option<String> {
    output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

/// Exécute `<outil> -version` et renvoie la première ligne en cas de succès.
fn probe_version(program: &Path) -> Option<String> {
    let output = silent_command(program).arg("-version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    first_line(&String::from_utf8_lossy(&output.stdout))
}

/// Résultat de la recherche d'un outil : version détectée et origine.
fn locate(tool: &str) -> (Option<String>, Option<&'static str>) {
    if let Some(path) = sidecar_path(tool)
        && let Some(version) = probe_version(&path)
    {
        return (Some(version), Some("sidecar"));
    }
    match probe_version(Path::new(tool)) {
        Some(version) => (Some(version), Some("system_path")),
        None => (None, None),
    }
}

fn detect() -> FfmpegStatus {
    let (ffmpeg_version, ffmpeg_source) = locate("ffmpeg");
    let (ffprobe_version, ffprobe_source) = locate("ffprobe");
    let source = ffmpeg_source.or(ffprobe_source).unwrap_or("missing");
    FfmpegStatus {
        ffmpeg_available: ffmpeg_version.is_some(),
        ffprobe_available: ffprobe_version.is_some(),
        ffmpeg_version,
        ffprobe_version,
        source: source.to_string(),
    }
}

/// Commande Tauri : indique si FFmpeg et FFprobe sont disponibles.
#[tauri::command]
pub async fn check_ffmpeg_status() -> Result<FfmpegStatus, String> {
    tauri::async_runtime::spawn_blocking(detect)
        .await
        .map_err(|error| format!("Échec de la détection de FFmpeg : {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_line_skips_blank_lines() {
        let output = "\n  ffmpeg version 8.1 Copyright\nbuilt with gcc\n";
        assert_eq!(
            first_line(output).as_deref(),
            Some("ffmpeg version 8.1 Copyright")
        );
    }

    #[test]
    fn first_line_of_empty_output_is_none() {
        assert_eq!(first_line(" \n\n"), None);
    }

    #[test]
    fn executable_name_matches_platform() {
        let name = executable_name("ffprobe");
        if cfg!(windows) {
            assert_eq!(name, "ffprobe.exe");
        } else {
            assert_eq!(name, "ffprobe");
        }
    }

    #[test]
    fn missing_tool_is_not_detected() {
        assert_eq!(locate("neomeca2-outil-inexistant"), (None, None));
    }
}
