// SPDX-License-Identifier: MPL-2.0
//! Extraction exacte d'images via FFmpeg et gestion du cache temporaire.

use super::{resolve_tool, silent_command};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::Manager;

/// Nombre d'images décodées par lot pour limiter les lancements de `ffmpeg`.
const BATCH_SIZE: u32 = 16;

static SESSION_SEQ: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
struct CacheState {
    video_path: Option<String>,
    session_dir: Option<PathBuf>,
}

/// Cache disque des images extraites pour la vidéo en cours.
pub struct FrameCache {
    state: Mutex<CacheState>,
    extract_lock: Mutex<()>,
}

impl Default for FrameCache {
    fn default() -> Self {
        Self::new()
    }
}

impl FrameCache {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(CacheState::default()),
            extract_lock: Mutex::new(()),
        }
    }

    /// Supprime le dossier de cache de la vidéo précédente si le chemin change.
    pub fn reset_for_video(&self, path: &str) {
        let _extract_guard = self.extract_lock.lock().unwrap_or_else(|e| e.into_inner());
        let old_dir = {
            let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
            if guard.video_path.as_deref() == Some(path) {
                return;
            }
            guard.video_path = Some(path.to_string());
            guard.session_dir.take()
        };
        if let Some(dir) = old_dir {
            let _ = std::fs::remove_dir_all(dir);
        }
    }

    /// Nettoie le dossier de session courant (appelé à la fermeture de l'application).
    pub fn clear(&self) {
        let _extract_guard = self.extract_lock.lock().unwrap_or_else(|e| e.into_inner());
        let old_dir = {
            let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
            guard.video_path = None;
            guard.session_dir.take()
        };
        if let Some(dir) = old_dir {
            let _ = std::fs::remove_dir_all(dir);
        }
    }

    /// Renvoie le dossier de cache déjà prêt pour `video_path`, sans verrouiller `extract_lock`.
    fn existing_session_dir(&self, video_path: &str) -> Option<PathBuf> {
        let guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if guard.video_path.as_deref() == Some(video_path) {
            guard.session_dir.clone()
        } else {
            None
        }
    }

    /// Renvoie le dossier de cache dédié à `video_path`, en le créant au besoin.
    fn session_dir(&self, cache_root: &Path, video_path: &str) -> Result<PathBuf, String> {
        let old_dir = {
            let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
            if guard.video_path.as_deref() == Some(video_path)
                && let Some(dir) = &guard.session_dir
            {
                return Ok(dir.clone());
            }
            let old = guard.session_dir.take();
            guard.video_path = Some(video_path.to_string());
            old
        };

        if let Some(dir) = old_dir {
            let _ = std::fs::remove_dir_all(dir);
        }

        let session_id = SESSION_SEQ.fetch_add(1, Ordering::Relaxed);
        let new_dir = cache_root.join("frames").join(format!("session_{session_id}"));
        std::fs::create_dir_all(&new_dir)
            .map_err(|error| format!("Impossible de créer le dossier de cache : {error}"))?;

        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if guard.video_path.as_deref() == Some(video_path) {
            if let Some(dir) = &guard.session_dir {
                let _ = std::fs::remove_dir_all(&new_dir);
                return Ok(dir.clone());
            }
            guard.session_dir = Some(new_dir.clone());
            Ok(new_dir)
        } else {
            let _ = std::fs::remove_dir_all(&new_dir);
            Err("La vidéo active a changé pendant l'extraction.".to_string())
        }
    }
}

/// Supprime les anciens dossiers `frames/` laissés par une session précédente.
pub fn cleanup_stale_cache(app: &tauri::AppHandle) {
    if let Ok(cache_root) = app.path().app_cache_dir() {
        let frames_root = cache_root.join("frames");
        if frames_root.exists() {
            let _ = std::fs::remove_dir_all(frames_root);
        }
    }
}

fn frame_file_path(session_dir: &Path, frame_index: u32) -> PathBuf {
    session_dir.join(format!("frame_{frame_index}.jpg"))
}

fn is_cached(path: &Path) -> bool {
    path.metadata().is_ok_and(|meta| meta.is_file() && meta.len() > 0)
}

/// Calcule le début du lot et l'instant de recherche FFmpeg (léger décalage avant
/// l'image cible pour éviter de manquer l'image sur un arrondi flottant).
fn batch_window(frame_index: u32, fps: f64) -> (u32, Option<f64>) {
    let batch_start = (frame_index / BATCH_SIZE) * BATCH_SIZE;
    let seek_secs = if batch_start == 0 {
        None
    } else {
        Some(((f64::from(batch_start) - 0.25).max(0.0)) / fps)
    };
    (batch_start, seek_secs)
}

fn run_ffmpeg_extract(
    ffmpeg: &Path,
    video_path: &Path,
    seek_secs: Option<f64>,
    count: u32,
    start_number: u32,
    output_pattern: &Path,
) -> Result<(), String> {
    let mut command = silent_command(ffmpeg);
    command.args(["-y", "-v", "error"]);
    if let Some(secs) = seek_secs {
        command.arg("-ss").arg(format!("{secs:.6}"));
    }
    command
        .arg("-i")
        .arg(video_path)
        .args(["-frames:v", &count.to_string(), "-fps_mode", "passthrough", "-q:v", "2"])
        .args(["-start_number", &start_number.to_string()])
        .arg(output_pattern);

    let output = command.output().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            "ffmpeg est introuvable. Installez FFmpeg et ajoutez-le au PATH.".to_string()
        } else {
            format!("Impossible de lancer ffmpeg : {error}")
        }
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        return Err(if detail.is_empty() {
            "ffmpeg n'a pas pu extraire l'image demandée.".to_string()
        } else {
            format!("Échec de l'extraction vidéo : {detail}")
        });
    }
    Ok(())
}

/// Extrait l'image demandée (ou un lot contenant cette image) dans le cache.
fn extract_frame_sync(
    cache: &FrameCache,
    cache_root: &Path,
    video_path: &str,
    frame_index: u32,
    fps: f64,
) -> Result<String, String> {
    if !fps.is_finite() || fps <= 0.0 {
        return Err("Fréquence d'images invalide pour l'extraction.".to_string());
    }

    if let Some(dir) = cache.existing_session_dir(video_path) {
        let fast_target = frame_file_path(&dir, frame_index);
        if is_cached(&fast_target) {
            return Ok(fast_target.to_string_lossy().into_owned());
        }
    }

    let _extract_guard = cache.extract_lock.lock().unwrap_or_else(|e| e.into_inner());
    let session_dir = cache.session_dir(cache_root, video_path)?;
    let target_path = frame_file_path(&session_dir, frame_index);
    if is_cached(&target_path) {
        return Ok(target_path.to_string_lossy().into_owned());
    }

    let ffmpeg = resolve_tool("ffmpeg");
    let (batch_start, seek_secs) = batch_window(frame_index, fps);
    let temp_tag = SESSION_SEQ.fetch_add(1, Ordering::Relaxed);
    let temp_pattern = session_dir.join(format!("tmp_{temp_tag}_%d.jpg"));

    run_ffmpeg_extract(
        &ffmpeg,
        Path::new(video_path),
        seek_secs,
        BATCH_SIZE,
        batch_start,
        &temp_pattern,
    )?;

    let mut highest_extracted: Option<PathBuf> = None;
    for offset in 0..BATCH_SIZE {
        let idx = batch_start + offset;
        let temp_file = session_dir.join(format!("tmp_{temp_tag}_{idx}.jpg"));
        if !temp_file.is_file() {
            continue;
        }
        let dest_file = frame_file_path(&session_dir, idx);
        if is_cached(&dest_file) {
            let _ = std::fs::remove_file(&temp_file);
        } else if std::fs::rename(&temp_file, &dest_file).is_err() {
            let _ = std::fs::remove_file(&temp_file);
            continue;
        }
        if idx <= frame_index {
            highest_extracted = Some(dest_file);
        }
    }

    if is_cached(&target_path) {
        return Ok(target_path.to_string_lossy().into_owned());
    }

    // Si `total_frames` a été surestimé d'une image en fin de vidéo, on met en cache
    // la dernière image décodée de ce lot sous l'indice demandé plutôt qu'une erreur.
    if let Some(fallback) = highest_extracted
        && is_cached(&fallback)
    {
        if std::fs::copy(&fallback, &target_path).is_ok() && is_cached(&target_path) {
            return Ok(target_path.to_string_lossy().into_owned());
        }
        return Ok(fallback.to_string_lossy().into_owned());
    }

    Err(format!(
        "Impossible d'extraire l'image n° {} de la vidéo.",
        frame_index + 1
    ))
}

/// Commande Tauri : extrait une image de la vidéo et renvoie son chemin en cache.
#[tauri::command]
pub async fn extract_frame(
    app: tauri::AppHandle,
    path: String,
    frame_index: u32,
    fps: f64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cache_root = app
            .path()
            .app_cache_dir()
            .map_err(|error| format!("Dossier de cache introuvable : {error}"))?;
        let cache = app.state::<FrameCache>();
        extract_frame_sync(cache.inner(), &cache_root, &path, frame_index, fps)
    })
    .await
    .map_err(|error| format!("Échec de l'extraction d'image : {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batch_window_aligns_to_batch_size() {
        assert_eq!(batch_window(0, 30.0), (0, None));
        assert_eq!(batch_window(15, 30.0), (0, None));

        let (start, seek) = batch_window(20, 30.0);
        assert_eq!(start, 16);
        assert!((seek.unwrap() - (15.75 / 30.0)).abs() < 1e-9);
    }

    #[test]
    fn frame_cache_resets_and_clears_directories() {
        let temp_root = std::env::temp_dir().join(format!(
            "neomeca2_cache_test_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_root);

        let cache = FrameCache::new();
        let dir_a = cache.session_dir(&temp_root, "a.mp4").unwrap();
        assert!(dir_a.is_dir());

        let dir_b = cache.session_dir(&temp_root, "b.mp4").unwrap();
        assert!(!dir_a.exists());
        assert!(dir_b.is_dir());

        cache.clear();
        assert!(!dir_b.exists());

        let _ = std::fs::remove_dir_all(&temp_root);
    }
}
