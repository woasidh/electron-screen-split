pub mod app_state;
pub mod audio;
pub mod commands;
pub mod config_store;
pub mod layout;
pub mod model;
pub mod wall;

use app_state::{AppState, OutputInfo};
use config_store::ConfigStore;
use tauri::Manager;

fn create_app_state(app: &tauri::App) -> Result<AppState, Box<dyn std::error::Error>> {
    let config_dir = app.path().config_dir()?;
    let target = app.path().app_config_dir()?.join("config.json");
    let legacy_candidates = vec![
        config_dir.join("Screen Wall Control").join("config.json"),
        config_dir.join("screen-wall-control").join("config.json"),
    ];
    let store = ConfigStore::new(target, legacy_candidates);
    let loaded = store.load();
    let monitor = app
        .primary_monitor()?
        .ok_or("주 모니터를 찾지 못했습니다.")?;
    let size = monitor.size();
    let output = OutputInfo {
        physical_width: size.width,
        physical_height: size.height,
        scale_factor: monitor.scale_factor(),
        is_target_resolution: size.width == 3840 && size.height == 2160,
    };

    Ok(AppState::new(store, loaded, output))
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = create_app_state(app)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_initial_state,
            commands::save_config,
            commands::run_wall,
            commands::stop_wall
        ])
        .run(tauri::generate_context!())
        .expect("Tauri application failed");
}
