use crate::config_store::{ConfigStore, LoadResult};
use crate::model::AppConfig;
use crate::wall::WallController;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

#[derive(Clone, Copy, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SlotState {
    Idle,
    Loading,
    Ready,
    Error,
    Disabled,
}

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SlotStatus {
    pub index: usize,
    pub state: SlotState,
    pub message: String,
}

#[derive(Clone, Debug, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OutputInfo {
    pub physical_width: u32,
    pub physical_height: u32,
    pub scale_factor: f64,
    pub is_target_resolution: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitialState {
    pub config: AppConfig,
    pub output: OutputInfo,
    pub statuses: Vec<SlotStatus>,
    pub shortcut: &'static str,
    pub warning: Option<String>,
    pub wall_running: bool,
}

pub struct AppState {
    pub config: Mutex<AppConfig>,
    pub store: ConfigStore,
    pub statuses: Mutex<Vec<SlotStatus>>,
    pub output: Mutex<OutputInfo>,
    pub warning: Mutex<Option<String>>,
    pub wall_running: AtomicBool,
    pub wall: Mutex<WallController>,
}

impl AppState {
    pub fn new(store: ConfigStore, loaded: LoadResult, output: OutputInfo) -> Self {
        let statuses = initial_statuses(&loaded.config);
        Self {
            config: Mutex::new(loaded.config),
            store,
            statuses: Mutex::new(statuses),
            output: Mutex::new(output),
            warning: Mutex::new(loaded.warning),
            wall_running: AtomicBool::new(false),
            wall: Mutex::new(WallController::default()),
        }
    }
}

pub fn initial_statuses(config: &AppConfig) -> Vec<SlotStatus> {
    config
        .slots
        .iter()
        .enumerate()
        .map(|(index, slot)| SlotStatus {
            index,
            state: if slot.enabled {
                SlotState::Idle
            } else {
                SlotState::Disabled
            },
            message: String::new(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statuses_follow_enabled_configuration() {
        let mut config = AppConfig::default();
        config.slots[1].enabled = false;

        let statuses = initial_statuses(&config);

        assert_eq!(statuses.len(), 4);
        assert_eq!(statuses[0].state, SlotState::Idle);
        assert_eq!(statuses[1].state, SlotState::Disabled);
    }
}
