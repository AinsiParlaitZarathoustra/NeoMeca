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

/// Construit la liste ordonnée des emplacements sidecar possibles pour `tool`.
///
/// Ordre de priorité :
/// 1. À côté de l'exécutable courant (`<exe_dir>/<tool>(.exe)`).
/// 2. Dans `<exe_dir>/bin/<tool>(.exe)` (paquets Windows, archive portable et dev).
/// 3. Sous Linux uniquement : dossiers ressources AppImage et `.deb` (`lib/NeoMeca/bin/`).
fn sidecar_candidates_for_exe(exe: &Path, tool: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let file_name = executable_name(tool);

    if let Some(exe_dir) = exe.parent() {
        candidates.push(exe_dir.join(&file_name));
        candidates.push(exe_dir.join("bin").join(&file_name));

        #[cfg(target_os = "linux")]
        {
            if let Some(app_dir) = std::env::var_os("APPDIR") {
                let app_root = PathBuf::from(app_dir);
                candidates.push(app_root.join("usr/lib/NeoMeca/bin").join(&file_name));
                candidates.push(app_root.join("usr/lib/neomeca2/bin").join(&file_name));
            }
            if let Some(prefix_dir) = exe_dir.parent() {
                candidates.push(prefix_dir.join("lib/NeoMeca/bin").join(&file_name));
                candidates.push(prefix_dir.join("lib/neomeca2/bin").join(&file_name));
            }
            candidates.push(PathBuf::from("/usr/lib/NeoMeca/bin").join(&file_name));
            candidates.push(PathBuf::from("/usr/lib/neomeca2/bin").join(&file_name));
        }
    }

    candidates
}

/// Renvoie le premier chemin sidecar existant dans la liste prioritaire.
fn resolve_sidecar_for_exe(exe: &Path, tool: &str) -> Option<PathBuf> {
    sidecar_candidates_for_exe(exe, tool)
        .into_iter()
        .find(|candidate| candidate.is_file())
}

/// Cherche l'outil embarqué à côté de l'exécutable courant ou dans ses dossiers ressources.
fn sidecar_path(tool: &str) -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    resolve_sidecar_for_exe(&exe, tool)
}

/// Résout le chemin de l'exécutable : sidecar embarqué prioritaire, sinon `PATH` système.
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

    #[test]
    fn sidecar_priority_prefers_sibling_then_bin_then_none() {
        let root = std::env::temp_dir().join(format!("neomeca2-sidecar-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let exe_dir = root.join("app");
        let bin_dir = exe_dir.join("bin");
        std::fs::create_dir_all(&bin_dir).unwrap();

        let fake_exe = exe_dir.join(executable_name("neomeca2"));
        std::fs::write(&fake_exe, b"").unwrap();

        // Aucun sidecar présent : repli attendu sur None (donc PATH système via resolve_tool).
        assert_eq!(resolve_sidecar_for_exe(&fake_exe, "ffmpeg"), None);

        // Uniquement dans bin/ : ce chemin doit être retenu.
        let bin_tool = bin_dir.join(executable_name("ffmpeg"));
        std::fs::write(&bin_tool, b"bin").unwrap();
        assert_eq!(resolve_sidecar_for_exe(&fake_exe, "ffmpeg"), Some(bin_tool));

        // Si un binaire est aussi présent directement à côté de l'exécutable, il est prioritaire.
        let sibling_tool = exe_dir.join(executable_name("ffmpeg"));
        std::fs::write(&sibling_tool, b"sibling").unwrap();
        assert_eq!(
            resolve_sidecar_for_exe(&fake_exe, "ffmpeg"),
            Some(sibling_tool)
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn sidecar_resolves_linux_bundle_resources_folder() {
        let root = std::env::temp_dir().join(format!(
            "neomeca2-linux-sidecar-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        let usr_bin = root.join("usr/bin");
        let lib_bin = root.join("usr/lib/NeoMeca/bin");
        std::fs::create_dir_all(&usr_bin).unwrap();
        std::fs::create_dir_all(&lib_bin).unwrap();

        let fake_exe = usr_bin.join("neomeca2");
        let lib_tool = lib_bin.join("ffprobe");
        std::fs::write(&fake_exe, b"").unwrap();
        std::fs::write(&lib_tool, b"probe").unwrap();

        assert_eq!(
            resolve_sidecar_for_exe(&fake_exe, "ffprobe"),
            Some(lib_tool)
        );

        let _ = std::fs::remove_dir_all(&root);
    }
}
