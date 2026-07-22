use crate::audio::MUTE_SCRIPT;
use crate::layout::Rect;
use tauri::{PhysicalPosition, PhysicalSize, Webview};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct RecoveryState {
    retry_claimed: bool,
}

impl RecoveryState {
    pub fn claim_retry(&mut self) -> bool {
        if self.retry_claimed {
            false
        } else {
            self.retry_claimed = true;
            true
        }
    }

    pub fn reset(&mut self) {
        self.retry_claimed = false;
    }
}

pub fn apply_platform_bounds(webview: &Webview, rect: Rect) -> Result<(), String> {
    webview
        .set_bounds(tauri::Rect {
            position: PhysicalPosition::new(rect.x, rect.y).into(),
            size: PhysicalSize::new(rect.width, rect.height).into(),
        })
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "linux")]
    webview
        .with_webview(move |platform| {
            use gtk::glib::Cast;
            use gtk::prelude::*;

            let widget = platform.inner();
            let scale = f64::from(widget.scale_factor().max(1));
            let x = (f64::from(rect.x) / scale).round() as i32;
            let y = (f64::from(rect.y) / scale).round() as i32;
            let width = (f64::from(rect.width) / scale).round() as i32;
            let height = (f64::from(rect.height) / scale).round() as i32;
            widget.set_size_request(width, height);
            if let Some(parent) = widget.parent() {
                if let Ok(fixed) = parent.downcast::<gtk::Fixed>() {
                    fixed.move_(&widget, x, y);
                }
            }
            widget.size_allocate(&gtk::Allocation::new(x, y, width, height));
        })
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn apply_platform_audio(webview: &Webview) -> Result<(), String> {
    webview.eval(MUTE_SCRIPT).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovery_stops_after_one_recreation() {
        let mut recovery = RecoveryState::default();

        assert!(recovery.claim_retry());
        assert!(!recovery.claim_retry());
        recovery.reset();
        assert!(recovery.claim_retry());
    }
}
