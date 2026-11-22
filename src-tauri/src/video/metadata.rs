// SPDX-License-Identifier: MPL-2.0
//! Lecture des métadonnées d'un fichier vidéo via FFprobe.

use super::{frames::FrameCache, resolve_tool, silent_command};
use serde::{Deserialize, Serialize};
use std::io::ErrorKind;
use std::path::Path;

/// Métadonnées techniques d'une vidéo ouverte dans NeoMeca.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub path: String,
    pub file_name: String,
    pub file_size_bytes: u64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub frame_duration_secs: f64,
    pub duration_secs: f64,
    pub total_frames: u32,
    pub codec_name: String,
    pub codec_long_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FfprobeOutput {
    #[serde(default)]
    streams: Vec<FfprobeStream>,
    format: Option<FfprobeFormat>,
}

#[derive(Debug, Deserialize)]
struct FfprobeStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    codec_long_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    avg_frame_rate: Option<String>,
    r_frame_rate: Option<String>,
    duration: Option<String>,
    nb_frames: Option<String>,
    #[serde(default)]
    side_data_list: Vec<FfprobeSideData>,
}

#[derive(Debug, Deserialize)]
struct FfprobeSideData {
    rotation: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct FfprobeFormat {
    duration: Option<String>,
}

/// Convertit une fraction FFprobe (`"30000/1001"`, `"30/1"`, `"25"`) en fréquence positive.
pub(crate) fn parse_fps_fraction(raw: &str) -> Option<f64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let value = if let Some((num_str, den_str)) = trimmed.split_once('/') {
        let num: f64 = num_str.trim().parse().ok()?;
        let den: f64 = den_str.trim().parse().ok()?;
        if !num.is_finite() || !den.is_finite() || den <= 0.0 {
            return None;
        }
        num / den
    } else {
        trimmed.parse::<f64>().ok()?
    };

    (value.is_finite() && value > 0.0).then_some(value)
}

fn parse_positive_f64(raw: Option<&str>) -> Option<f64> {
    let value: f64 = raw?.trim().parse().ok()?;
    (value.is_finite() && value > 0.0).then_some(value)
}

fn parse_positive_u32(raw: Option<&str>) -> Option<u32> {
    let value: u32 = raw?.trim().parse().ok()?;
    (value > 0).then_some(value)
}

/// Indique si les métadonnées de rotation inversent la largeur et la hauteur affichées.
fn is_quarter_turn(stream: &FfprobeStream) -> bool {
    stream.side_data_list.iter().any(|entry| {
        entry
            .rotation
            .is_some_and(|deg| deg.unsigned_abs() % 180 == 90)
    })
}

/// Analyse la sortie JSON de `ffprobe` pour produire `VideoMetadata`.
pub(crate) fn parse_ffprobe_json(
    json: &str,
    path: &Path,
    file_size_bytes: u64,
) -> Result<VideoMetadata, String> {
    let parsed: FfprobeOutput = serde_json::from_str(json)
        .map_err(|error| format!("Réponse FFprobe illisible : {error}"))?;

    let stream = parsed
        .streams
        .iter()
        .find(|stream| stream.codec_type.as_deref() == Some("video"))
        .ok_or_else(|| "Aucun flux vidéo trouvé dans ce fichier.".to_string())?;

    let raw_width = stream
        .width
        .filter(|&w| w > 0)
        .ok_or_else(|| "Largeur vidéo manquante ou invalide.".to_string())?;
    let raw_height = stream
        .height
        .filter(|&h| h > 0)
        .ok_or_else(|| "Hauteur vidéo manquante ou invalide.".to_string())?;
    let (width, height) = if is_quarter_turn(stream) {
        (raw_height, raw_width)
    } else {
        (raw_width, raw_height)
    };

    let fps = stream
        .avg_frame_rate
        .as_deref()
        .and_then(parse_fps_fraction)
        .or_else(|| stream.r_frame_rate.as_deref().and_then(parse_fps_fraction))
        .ok_or_else(|| "Fréquence d'images (FPS) introuvable ou invalide.".to_string())?;

    let frame_duration_secs = 1.0 / fps;

    let nb_frames = parse_positive_u32(stream.nb_frames.as_deref());
    let duration_secs = parse_positive_f64(stream.duration.as_deref())
        .or_else(|| {
            parsed
                .format
                .as_ref()
                .and_then(|format| parse_positive_f64(format.duration.as_deref()))
        })
        .or_else(|| nb_frames.map(|count| f64::from(count) / fps))
        .unwrap_or(0.0);

    let total_frames = nb_frames.unwrap_or_else(|| {
        if duration_secs > 0.0 {
            (duration_secs * fps).round().max(1.0) as u32
        } else {
            0
        }
    });
    if total_frames == 0 {
        return Err("Impossible de déterminer le nombre d'images de cette vidéo.".to_string());
    }

    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());

    let codec_name = stream
        .codec_name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("inconnu")
        .to_string();

    let codec_long_name = stream
        .codec_long_name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string);

    Ok(VideoMetadata {
        path: path.to_string_lossy().into_owned(),
        file_name,
        file_size_bytes,
        width,
        height,
        fps,
        frame_duration_secs,
        duration_secs,
        total_frames,
        codec_name,
        codec_long_name,
    })
}

fn probe_video_sync(path_str: &str) -> Result<VideoMetadata, String> {
    let path = Path::new(path_str);
    let file_meta = std::fs::metadata(path).map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            format!("Fichier vidéo introuvable : {path_str}")
        } else {
            format!("Impossible d'accéder au fichier vidéo : {error}")
        }
    })?;
    if !file_meta.is_file() {
        return Err(format!("Le chemin sélectionné n'est pas un fichier : {path_str}"));
    }

    let ffprobe = resolve_tool("ffprobe");
    let output = silent_command(&ffprobe)
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(path)
        .output()
        .map_err(|error| {
            if error.kind() == ErrorKind::NotFound {
                "ffprobe est introuvable. Installez FFmpeg et ajoutez-le au PATH.".to_string()
            } else {
                format!("Impossible de lancer ffprobe : {error}")
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        return Err(if detail.is_empty() {
            "ffprobe n'a pas pu analyser ce fichier vidéo.".to_string()
        } else {
            format!("ffprobe a échoué : {detail}")
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_ffprobe_json(&stdout, path, file_meta.len())
}

/// Commande Tauri : analyse un fichier vidéo et renvoie ses métadonnées.
#[tauri::command]
pub async fn open_video_info(
    path: String,
    cache: tauri::State<'_, FrameCache>,
) -> Result<VideoMetadata, String> {
    cache.reset_for_video(&path);
    let path_clone = path.clone();
    tauri::async_runtime::spawn_blocking(move || probe_video_sync(&path_clone))
        .await
        .map_err(|error| format!("Échec de la lecture des métadonnées : {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_fps_fraction_valid_values() {
        assert!((parse_fps_fraction("30/1").unwrap() - 30.0).abs() < 1e-9);
        assert!((parse_fps_fraction("30000/1001").unwrap() - 29.97002997).abs() < 1e-6);
        assert!((parse_fps_fraction(" 25 / 1 ").unwrap() - 25.0).abs() < 1e-9);
        assert!((parse_fps_fraction("60").unwrap() - 60.0).abs() < 1e-9);
    }

    #[test]
    fn parse_fps_fraction_rejects_invalid_values() {
        assert_eq!(parse_fps_fraction("0/0"), None);
        assert_eq!(parse_fps_fraction("30/0"), None);
        assert_eq!(parse_fps_fraction("0/1"), None);
        assert_eq!(parse_fps_fraction("-25/1"), None);
        assert_eq!(parse_fps_fraction(""), None);
        assert_eq!(parse_fps_fraction("abc"), None);
    }

    #[test]
    fn parse_ffprobe_json_extracts_full_metadata() {
        let json = r#"{
            "streams": [
                { "codec_type": "audio", "codec_name": "aac" },
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "codec_long_name": "H.264 / AVC",
                    "width": 1920,
                    "height": 1080,
                    "avg_frame_rate": "30000/1001",
                    "r_frame_rate": "30000/1001",
                    "duration": "10.010000",
                    "nb_frames": "300"
                }
            ],
            "format": { "duration": "10.010000" }
        }"#;

        let meta = parse_ffprobe_json(json, Path::new("/videos/chute.mp4"), 2_048_000).unwrap();
        assert_eq!(meta.file_name, "chute.mp4");
        assert_eq!(meta.file_size_bytes, 2_048_000);
        assert_eq!(meta.width, 1920);
        assert_eq!(meta.height, 1080);
        assert!((meta.fps - (30000.0 / 1001.0)).abs() < 1e-6);
        assert!((meta.frame_duration_secs - (1001.0 / 30000.0)).abs() < 1e-9);
        assert!((meta.duration_secs - 10.01).abs() < 1e-6);
        assert_eq!(meta.total_frames, 300);
        assert_eq!(meta.codec_name, "h264");
        assert_eq!(meta.codec_long_name.as_deref(), Some("H.264 / AVC"));
    }

    #[test]
    fn parse_ffprobe_json_falls_back_to_r_frame_rate_and_format_duration() {
        let json = r#"{
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "vp9",
                    "width": 1280,
                    "height": 720,
                    "avg_frame_rate": "0/0",
                    "r_frame_rate": "25/1"
                }
            ],
            "format": { "duration": "4.000000" }
        }"#;

        let meta = parse_ffprobe_json(json, Path::new("clip.webm"), 512_000).unwrap();
        assert!((meta.fps - 25.0).abs() < 1e-9);
        assert!((meta.duration_secs - 4.0).abs() < 1e-9);
        assert_eq!(meta.total_frames, 100);
        assert_eq!(meta.codec_long_name, None);
    }

    #[test]
    fn parse_ffprobe_json_swaps_dimensions_on_rotation() {
        let json = r#"{
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 1920,
                    "height": 1080,
                    "avg_frame_rate": "30/1",
                    "nb_frames": "60",
                    "side_data_list": [{ "rotation": -90 }]
                }
            ]
        }"#;

        let meta = parse_ffprobe_json(json, Path::new("portrait.mov"), 1024).unwrap();
        assert_eq!(meta.width, 1080);
        assert_eq!(meta.height, 1920);
        assert!((meta.duration_secs - 2.0).abs() < 1e-9);
    }

    #[test]
    fn parse_ffprobe_json_errors_without_video_stream() {
        let json = r#"{ "streams": [{ "codec_type": "audio", "codec_name": "mp3" }] }"#;
        let error = parse_ffprobe_json(json, Path::new("audio.mp3"), 100).unwrap_err();
        assert!(error.contains("Aucun flux vidéo"));
    }

    #[test]
    fn parse_ffprobe_json_errors_on_invalid_json() {
        let error = parse_ffprobe_json("{invalid", Path::new("bad.mp4"), 100).unwrap_err();
        assert!(error.contains("FFprobe"));
    }

    #[test]
    fn parse_ffprobe_json_errors_when_total_frames_is_zero() {
        let json = r#"{
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 640,
                    "height": 480,
                    "avg_frame_rate": "30/1"
                }
            ]
        }"#;
        let error = parse_ffprobe_json(json, Path::new("empty.mp4"), 100).unwrap_err();
        assert!(error.contains("nombre d'images"));
    }
}
