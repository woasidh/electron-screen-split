pub mod app_state;
pub mod audio;
pub mod commands;
pub mod config_store;
pub mod layout;
pub mod login_extension;
pub mod model;
pub mod platform;
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
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let app = app.clone();
            let _ = std::thread::Builder::new()
                .name("single-instance-restore".into())
                .spawn(move || wall::restore_manager(&app));
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};
                    if event.state == ShortcutState::Pressed
                        && shortcut.matches(Modifiers::empty(), Code::Escape)
                    {
                        let app = app.clone();
                        let _ = std::thread::Builder::new()
                            .name("escape-restore".into())
                            .spawn(move || wall::restore_manager(&app));
                    }
                })
                .build(),
        )
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
        .build(tauri::generate_context!())
        .expect("Tauri application failed");
    app.run(|app, event| match event {
        tauri::RunEvent::Resumed => wall::schedule_relayout(app),
        tauri::RunEvent::ExitRequested { .. } => wall::shutdown(app),
        tauri::RunEvent::WindowEvent { label, event, .. }
            if should_exit_on_close(&label)
                && matches!(event, tauri::WindowEvent::CloseRequested { .. }) =>
        {
            wall::shutdown(app);
            app.exit(0);
        }
        tauri::RunEvent::WindowEvent { label, event, .. } if label == "wall" => match event {
            tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. } => {
                wall::schedule_relayout(app);
            }
            tauri::WindowEvent::Destroyed => wall::handle_wall_destroyed(app),
            _ => {}
        },
        _ => {}
    });
}

fn should_exit_on_close(label: &str) -> bool {
    label == "manager"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn closing_manager_exits_the_application() {
        assert!(should_exit_on_close("manager"));
        assert!(!should_exit_on_close("wall"));
    }
}
