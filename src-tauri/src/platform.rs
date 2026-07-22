use crate::audio::MUTE_SCRIPT;
use crate::layout::Rect;
use tauri::Webview;

#[cfg(not(target_os = "linux"))]
use tauri::{PhysicalPosition, PhysicalSize};

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
    #[cfg(target_os = "linux")]
    return apply_bounds(rect, |_| Ok(()), |rect| apply_linux_bounds(webview, rect));

    #[cfg(not(target_os = "linux"))]
    apply_bounds(
        rect,
        |rect| {
            webview
                .set_bounds(tauri::Rect {
                    position: PhysicalPosition::new(rect.x, rect.y).into(),
                    size: PhysicalSize::new(rect.width, rect.height).into(),
                })
                .map_err(|error| error.to_string())
        },
        |_| Ok(()),
    )
}

fn apply_bounds(
    rect: Rect,
    _tauri_bounds: impl FnMut(Rect) -> Result<(), String>,
    _gtk_fixed_bounds: impl FnMut(Rect) -> Result<(), String>,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let mut gtk_fixed_bounds = _gtk_fixed_bounds;
        gtk_fixed_bounds(rect)
    }

    #[cfg(not(target_os = "linux"))]
    {
        let mut tauri_bounds = _tauri_bounds;
        tauri_bounds(rect)
    }
}

#[cfg(target_os = "linux")]
fn apply_linux_bounds(webview: &Webview, rect: Rect) -> Result<(), String> {
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

            let fixed = match widget.parent() {
                Some(parent) if parent.is::<gtk::Fixed>() => parent.downcast::<gtk::Fixed>().ok(),
                Some(parent) => parent.downcast::<gtk::Box>().ok().map(|container| {
                    let fixed = container
                        .children()
                        .into_iter()
                        .find(|child| child.widget_name() == "screen-wall-fixed")
                        .and_then(|child| child.downcast::<gtk::Fixed>().ok())
                        .unwrap_or_else(|| {
                            let fixed = gtk::Fixed::new();
                            fixed.set_widget_name("screen-wall-fixed");
                            fixed.set_hexpand(true);
                            fixed.set_vexpand(true);
                            container.pack_start(&fixed, true, true, 0);
                            fixed.show();
                            fixed
                        });
                    container.remove(&widget);
                    fixed.put(&widget, x, y);
                    fixed
                }),
                None => None,
            };

            if let Some(fixed) = fixed {
                widget.set_size_request(width, height);
                fixed.move_(&widget, x, y);
                widget.size_allocate(&gtk::Allocation::new(x, y, width, height));
                widget.show();
                fixed.queue_resize();
            }
        })
        .map_err(|error| error.to_string())
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

    #[test]
    fn bounds_use_the_platform_specific_backend_once() {
        let rect = Rect::new(1920, 1080, 1920, 1080);
        let mut tauri_calls = Vec::new();
        let mut gtk_calls = Vec::new();

        apply_bounds(
            rect,
            |applied| {
                tauri_calls.push(applied);
                Ok(())
            },
            |applied| {
                gtk_calls.push(applied);
                Ok(())
            },
        )
        .unwrap();

        #[cfg(target_os = "linux")]
        {
            assert!(tauri_calls.is_empty());
            assert_eq!(gtk_calls, vec![rect]);
        }
        #[cfg(not(target_os = "linux"))]
        {
            assert_eq!(tauri_calls, vec![rect]);
            assert!(gtk_calls.is_empty());
        }
    }
}
