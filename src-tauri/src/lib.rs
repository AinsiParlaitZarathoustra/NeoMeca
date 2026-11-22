// SPDX-License-Identifier: MPL-2.0

mod export;
mod video;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(video::FrameCache::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            video::frames::cleanup_stale_cache(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            video::check_ffmpeg_status,
            video::metadata::open_video_info,
            video::frames::extract_frame,
            export::export_excel_xlsx,
        ])
        .build(tauri::generate_context!())
        .expect("erreur lors de l'initialisation de l'application NeoMeca");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            app_handle.state::<video::FrameCache>().clear();
        }
    });
}
