use crate::app_state::{initial_statuses, SlotState, SlotStatus};
use crate::audio::MUTE_SCRIPT;
use crate::layout::{calculate_output_zoom, calculate_quadrants, Rect};
use crate::login_extension::{
    spawn as spawn_login_extension, LOGIN_EXTENSION_INTERVAL, LOGIN_EXTENSION_SCRIPT,
};
use crate::model::AppConfig;
use crate::platform::{apply_platform_audio, apply_platform_bounds, RecoveryState};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, Webview, WebviewUrl, Window};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut};
use url::Url;

#[derive(Clone, Debug)]
pub struct WallModel {
    pub config: AppConfig,
    pub statuses: Vec<SlotStatus>,
}

pub struct WallController {
    window: Option<Window>,
    webviews: Vec<Option<Webview>>,
    login_extension_cancel: Option<Arc<AtomicBool>>,
    shortcut_registered: bool,
    recovery: RecoveryState,
    model: WallModel,
}

impl Default for WallController {
    fn default() -> Self {
        Self {
            window: None,
            webviews: (0..4).map(|_| None).collect(),
            login_extension_cancel: None,
            shortcut_registered: false,
            recovery: RecoveryState::default(),
            model: WallModel::new(AppConfig::default()),
        }
    }
}

impl WallController {
    pub fn run(
        &mut self,
        app: &tauri::AppHandle,
        state: &crate::app_state::AppState,
        config: AppConfig,
    ) -> Result<(), String> {
        self.recovery.reset();
        self.run_once(app, state, config)
    }

    fn run_once(
        &mut self,
        app: &tauri::AppHandle,
        state: &crate::app_state::AppState,
        config: AppConfig,
    ) -> Result<(), String> {
        let monitor = app
            .primary_monitor()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "주 모니터를 찾지 못했습니다.".to_owned())?;
        let monitor_size = *monitor.size();
        let monitor_position = *monitor.position();
        let quadrants = calculate_quadrants(monitor_size.width, monitor_size.height)
            .map_err(|error| error.to_string())?;

        self.model.apply_config(config.clone());
        *state
            .config
            .lock()
            .map_err(|_| "설정 상태 잠금에 실패했습니다.".to_owned())? = config.clone();
        *state
            .statuses
            .lock()
            .map_err(|_| "화면 상태 잠금에 실패했습니다.".to_owned())? = initial_statuses(&config);
        *state
            .output
            .lock()
            .map_err(|_| "출력 상태 잠금에 실패했습니다.".to_owned())? =
            crate::app_state::OutputInfo {
                physical_width: monitor_size.width,
                physical_height: monitor_size.height,
                scale_factor: monitor.scale_factor(),
                is_target_resolution: monitor_size.width == 3840 && monitor_size.height == 2160,
            };

        if self.window.is_none() {
            let window = tauri::window::WindowBuilder::new(app, "wall")
                .decorations(false)
                .resizable(false)
                .skip_taskbar(true)
                .always_on_top(true)
                .background_color(tauri::window::Color(0, 0, 0, 255))
                .visible(false)
                .focused(false)
                .build()
                .map_err(|error| error.to_string())?;
            self.window = Some(window);
        }

        let window = self
            .window
            .as_ref()
            .cloned()
            .ok_or_else(|| "출력 창 생성에 실패했습니다.".to_owned())?;
        window
            .set_position(PhysicalPosition::new(
                monitor_position.x,
                monitor_position.y,
            ))
            .map_err(|error| error.to_string())?;
        window
            .set_size(monitor_size)
            .map_err(|error| error.to_string())?;

        let mut placement_failed = false;
        for (index, rect) in quadrants.iter().copied().enumerate() {
            if !self.apply_slot(app, &window, &config, index, rect, monitor.scale_factor()) {
                placement_failed = true;
            }
        }
        if placement_failed && self.recovery.claim_retry() {
            self.destroy();
            return self.run_once(app, state, config);
        }
        let shortcut = escape_shortcut();
        self.shortcut_registered = if app.global_shortcut().is_registered(shortcut) {
            true
        } else {
            app.global_shortcut().register(shortcut).is_ok()
        };

        #[cfg(target_os = "macos")]
        window
            .set_simple_fullscreen(true)
            .map_err(|error| error.to_string())?;
        #[cfg(not(target_os = "macos"))]
        window
            .set_fullscreen(true)
            .map_err(|error| error.to_string())?;

        window.show().map_err(|error| error.to_string())?;
        window
            .set_always_on_top(true)
            .map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        self.start_login_extension(&config);
        if let Some(manager) = app.get_webview_window("manager") {
            manager.hide().map_err(|error| error.to_string())?;
        }
        let output = state
            .output
            .lock()
            .map_err(|_| "출력 상태 잠금에 실패했습니다.".to_owned())?
            .clone();
        let _ = app.emit_to("manager", "output-changed", output);
        Ok(())
    }

    pub fn stop(&mut self, app: &tauri::AppHandle) -> Result<(), String> {
        let mut fullscreen_error = None;
        self.cancel_login_extension();
        if self.shortcut_registered {
            let _ = app.global_shortcut().unregister(escape_shortcut());
            self.shortcut_registered = false;
        }
        if let Some(window) = &self.window {
            let _ = window.set_cursor_visible(true);
            #[cfg(target_os = "macos")]
            let fullscreen_result = window.set_simple_fullscreen(false);
            #[cfg(not(target_os = "macos"))]
            let fullscreen_result = window.set_fullscreen(false);
            window.hide().map_err(|error| error.to_string())?;
            if let Err(error) = fullscreen_result {
                fullscreen_error = Some(error.to_string());
            }
        }
        if let Some(manager) = app.get_webview_window("manager") {
            manager.show().map_err(|error| error.to_string())?;
            manager.set_focus().map_err(|error| error.to_string())?;
        }
        fullscreen_error.map_or(Ok(()), Err)
    }

    pub fn destroy(&mut self) {
        self.cancel_login_extension();
        for webview in self.webviews.iter().flatten() {
            let _ = webview.close();
        }
        self.webviews = (0..4).map(|_| None).collect();
        if let Some(window) = self.window.take() {
            let _ = window.close();
        }
    }

    pub fn shutdown(&mut self, app: &tauri::AppHandle) {
        if self.shortcut_registered {
            let _ = app.global_shortcut().unregister(escape_shortcut());
            self.shortcut_registered = false;
        }
        self.destroy();
    }

    fn forget_destroyed_window(&mut self) {
        self.cancel_login_extension();
        self.window = None;
        self.webviews = (0..4).map(|_| None).collect();
    }

    fn start_login_extension(&mut self, config: &AppConfig) {
        if self.login_extension_cancel.is_some() {
            return;
        }

        let targets = config
            .slots
            .iter()
            .zip(self.webviews.iter())
            .filter_map(|(slot, webview)| {
                should_extend_login(slot).then(|| webview.clone()).flatten()
            })
            .collect::<Vec<_>>();
        if targets.is_empty() {
            return;
        }

        let cancel = Arc::new(AtomicBool::new(false));
        let worker_cancel = cancel.clone();
        if spawn_login_extension(worker_cancel, LOGIN_EXTENSION_INTERVAL, move || {
            for webview in &targets {
                let _ = webview.eval(LOGIN_EXTENSION_SCRIPT);
            }
        })
        .is_ok()
        {
            self.login_extension_cancel = Some(cancel);
        }
    }

    fn cancel_login_extension(&mut self) {
        if let Some(cancel) = self.login_extension_cancel.take() {
            cancel.store(true, Ordering::SeqCst);
        }
    }

    fn apply_slot(
        &mut self,
        app: &tauri::AppHandle,
        window: &Window,
        config: &AppConfig,
        index: usize,
        rect: Rect,
        scale_factor: f64,
    ) -> bool {
        let slot = &config.slots[index];
        self.model.mark_loading(index);
        update_status(
            app,
            index,
            if slot.enabled {
                SlotState::Loading
            } else {
                SlotState::Disabled
            },
            "",
        );
        let url = slot_runtime_url(slot);
        let result: Result<(), String> = if let Some(webview) = self.webviews[index].as_ref() {
            apply_platform_bounds(webview, rect)
                .and_then(|_| {
                    webview
                        .navigate(url.clone())
                        .map_err(|error| error.to_string())
                })
                .and_then(|_| {
                    webview
                        .set_zoom(calculate_output_zoom(slot.zoom, scale_factor))
                        .map_err(|error| error.to_string())
                })
                .and_then(|_| apply_platform_audio(webview))
        } else {
            self.create_slot(app, window, index, rect, url)
                .map_err(|error| error.to_string())
                .and_then(|webview| {
                    apply_platform_bounds(&webview, rect)?;
                    webview
                        .set_zoom(calculate_output_zoom(slot.zoom, scale_factor))
                        .map_err(|error| error.to_string())?;
                    apply_platform_audio(&webview)?;
                    self.webviews[index] = Some(webview);
                    Ok(())
                })
        };

        if let Err(error) = result {
            self.model.mark_error(index, error.clone());
            update_status(app, index, SlotState::Error, error);
            false
        } else {
            true
        }
    }

    fn create_slot(
        &self,
        app: &tauri::AppHandle,
        window: &Window,
        index: usize,
        rect: Rect,
        url: Url,
    ) -> tauri::Result<Webview> {
        let callback_app = app.clone();
        let mut builder = WebviewBuilder::new(
            format!("wall-slot-{}", index + 1),
            WebviewUrl::External(url),
        )
        .initialization_script(MUTE_SCRIPT)
        .on_navigation(|url| matches!(url.scheme(), "http" | "https" | "tauri" | "about"))
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_download(|_, _| false)
        .on_page_load(move |_, payload| {
            let state = callback_app.state::<crate::app_state::AppState>();
            let enabled = state
                .config
                .lock()
                .ok()
                .and_then(|config| config.slots.get(index).map(|slot| slot.enabled))
                .unwrap_or(false);
            let next = if !enabled {
                SlotState::Disabled
            } else if payload.event() == PageLoadEvent::Started {
                SlotState::Loading
            } else {
                SlotState::Ready
            };
            update_status(&callback_app, index, next, "");
        });

        #[cfg(target_os = "macos")]
        {
            let mut identifier = [0_u8; 16];
            identifier[..11].copy_from_slice(b"screen-wall");
            identifier[15] = index as u8 + 1;
            builder = builder.data_store_identifier(identifier);
        }
        #[cfg(any(target_os = "windows", target_os = "linux"))]
        {
            let data_dir = app
                .path()
                .app_local_data_dir()?
                .join("webviews")
                .join(format!("wall-slot-{}", index + 1));
            std::fs::create_dir_all(&data_dir)?;
            builder = builder.data_directory(data_dir);
        }

        window.add_child(
            builder,
            PhysicalPosition::new(rect.x, rect.y),
            PhysicalSize::new(rect.width, rect.height),
        )
    }
}

impl Drop for WallController {
    fn drop(&mut self) {
        self.destroy();
    }
}

fn slot_runtime_url(slot: &crate::model::SlotConfig) -> Url {
    if slot.enabled {
        Url::parse(&slot.url).unwrap_or_else(|_| Url::parse("about:blank").unwrap())
    } else {
        Url::parse("about:blank").unwrap()
    }
}

fn should_extend_login(slot: &crate::model::SlotConfig) -> bool {
    slot.enabled && slot.login_extension
}

fn escape_shortcut() -> Shortcut {
    Shortcut::new(None, Code::Escape)
}

pub fn restore_manager(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<crate::app_state::AppState>() {
        if let Ok(mut wall) = state.wall.lock() {
            let _ = wall.stop(app);
        }
        state.wall_running.store(false, Ordering::SeqCst);
    }
    if let Some(manager) = app.get_webview_window("manager") {
        let _ = manager.show();
        let _ = manager.set_focus();
    }
}

pub fn schedule_relayout(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<crate::app_state::AppState>() else {
        return;
    };
    if !state.wall_running.load(Ordering::SeqCst)
        || state.relayout_pending.swap(true, Ordering::SeqCst)
    {
        return;
    }

    let app = app.clone();
    let _ = std::thread::Builder::new()
        .name("wall-relayout".into())
        .spawn(move || {
            std::thread::sleep(Duration::from_millis(75));
            let state = app.state::<crate::app_state::AppState>();
            if state.wall_running.load(Ordering::SeqCst) {
                let config = state.config.lock().ok().map(|config| config.clone());
                if let Some(config) = config {
                    if let Ok(mut wall) = state.wall.lock() {
                        if let Err(error) = wall.run(&app, &state, config) {
                            for index in 0..4 {
                                update_status(&app, index, SlotState::Error, error.clone());
                            }
                        }
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(250));
            state.relayout_pending.store(false, Ordering::SeqCst);
        });
}

pub fn handle_wall_destroyed(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<crate::app_state::AppState>() {
        if let Ok(mut wall) = state.wall.try_lock() {
            wall.forget_destroyed_window();
        }
    }
    schedule_relayout(app);
}

pub fn shutdown(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<crate::app_state::AppState>() {
        state.wall_running.store(false, Ordering::SeqCst);
        if let Ok(mut wall) = state.wall.lock() {
            wall.shutdown(app);
        }
    }
}

fn update_status(
    app: &tauri::AppHandle,
    index: usize,
    state_value: SlotState,
    message: impl Into<String>,
) {
    let state = app.state::<crate::app_state::AppState>();
    let status = SlotStatus {
        index,
        state: state_value,
        message: message.into(),
    };
    if let Ok(mut statuses) = state.statuses.lock() {
        if let Some(current) = statuses.get_mut(index) {
            *current = status.clone();
        }
    }
    let _ = app.emit_to("manager", "slot-status-changed", status);
}

impl WallModel {
    pub fn new(config: AppConfig) -> Self {
        let config = config.normalized();
        let statuses = initial_statuses(&config);
        Self { config, statuses }
    }

    pub fn apply_config(&mut self, config: AppConfig) {
        self.config = config.normalized();
        self.statuses = initial_statuses(&self.config);
    }

    pub fn mark_loading(&mut self, index: usize) {
        self.update(index, SlotState::Loading, "");
    }

    pub fn mark_ready(&mut self, index: usize) {
        self.update(index, SlotState::Ready, "");
    }

    pub fn mark_error(&mut self, index: usize, message: impl Into<String>) {
        self.update(index, SlotState::Error, message);
    }

    fn update(&mut self, index: usize, state: SlotState, message: impl Into<String>) {
        if let Some(status) = self.statuses.get_mut(index) {
            status.state = state;
            status.message = message.into();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn running_state_keeps_failed_slots_independent() {
        let mut model = WallModel::new(AppConfig::default());
        model.mark_loading(0);
        model.mark_ready(1);
        model.mark_error(0, "network");

        assert_eq!(model.statuses[0].state, SlotState::Error);
        assert_eq!(model.statuses[1].state, SlotState::Ready);
    }

    #[test]
    fn login_extension_requires_enabled_opted_in_slot() {
        let mut slot = AppConfig::default().slots.remove(0);

        assert!(!should_extend_login(&slot));
        slot.login_extension = true;
        assert!(should_extend_login(&slot));
        slot.enabled = false;
        assert!(!should_extend_login(&slot));
    }
}
