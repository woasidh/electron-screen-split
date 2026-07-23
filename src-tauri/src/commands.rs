use crate::app_state::{initial_statuses, AppState, InitialState};
use crate::model::AppConfig;
use std::sync::atomic::Ordering;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CommandKind {
    Read,
    Mutate,
    Run,
    Stop,
}

pub fn authorize(label: &str, command: CommandKind) -> bool {
    matches!(
        (label, command),
        (
            "manager",
            CommandKind::Read | CommandKind::Mutate | CommandKind::Run | CommandKind::Stop
        )
    )
}

fn ensure_authorized(webview: &tauri::Webview, command: CommandKind) -> Result<(), String> {
    authorize(webview.label(), command)
        .then_some(())
        .ok_or_else(|| "허용되지 않은 화면의 요청입니다.".to_owned())
}

#[tauri::command]
pub fn get_initial_state(
    webview: tauri::Webview,
    state: tauri::State<'_, AppState>,
) -> Result<InitialState, String> {
    ensure_authorized(&webview, CommandKind::Read)?;
    Ok(InitialState {
        config: state
            .config
            .lock()
            .map_err(|_| "설정 상태 잠금에 실패했습니다.".to_owned())?
            .clone(),
        output: state
            .output
            .lock()
            .map_err(|_| "출력 상태 잠금에 실패했습니다.".to_owned())?
            .clone(),
        statuses: state
            .statuses
            .lock()
            .map_err(|_| "화면 상태 잠금에 실패했습니다.".to_owned())?
            .clone(),
        shortcut: "ESC",
        warning: state
            .warning
            .lock()
            .map_err(|_| "경고 상태 잠금에 실패했습니다.".to_owned())?
            .clone(),
        wall_running: state.wall_running.load(Ordering::SeqCst),
    })
}

#[tauri::command]
pub fn save_config(
    webview: tauri::Webview,
    state: tauri::State<'_, AppState>,
    config: AppConfig,
) -> Result<AppConfig, String> {
    ensure_authorized(&webview, CommandKind::Mutate)?;
    let saved = state
        .store
        .save(&config)
        .map_err(|error| error.to_string())?;
    *state
        .config
        .lock()
        .map_err(|_| "설정 상태 잠금에 실패했습니다.".to_owned())? = saved.clone();
    *state
        .statuses
        .lock()
        .map_err(|_| "화면 상태 잠금에 실패했습니다.".to_owned())? = initial_statuses(&saved);
    Ok(saved)
}

#[tauri::command]
pub async fn run_wall(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    ensure_authorized(&webview, CommandKind::Run)?;
    let config = state
        .config
        .lock()
        .map_err(|_| "설정 상태 잠금에 실패했습니다.".to_owned())?
        .clone();
    let issues = config.issues();
    if !issues.is_empty() {
        return Err(issues.join("\n"));
    }
    state
        .wall
        .lock()
        .map_err(|_| "출력 제어 잠금에 실패했습니다.".to_owned())?
        .run(&app, &state, config)?;
    state.wall_running.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn stop_wall(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    ensure_authorized(&webview, CommandKind::Stop)?;
    state
        .wall
        .lock()
        .map_err(|_| "출력 제어 잠금에 실패했습니다.".to_owned())?
        .stop(&app)?;
    state.wall_running.store(false, Ordering::SeqCst);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_manager_label_is_authorized() {
        assert!(authorize("manager", CommandKind::Read));
        assert!(authorize("manager", CommandKind::Mutate));
        assert!(authorize("manager", CommandKind::Run));
        assert!(authorize("manager", CommandKind::Stop));
        assert!(!authorize("wall-overlay", CommandKind::Stop));
        assert!(!authorize("wall-slot-1", CommandKind::Mutate));
        assert!(!authorize("wall-slot-1", CommandKind::Stop));
    }
}
