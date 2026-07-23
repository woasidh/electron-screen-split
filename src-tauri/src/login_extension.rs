use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

pub const LOGIN_EXTENSION_SCRIPT: &str = include_str!("../scripts/login-extension.js");
pub const LOGIN_EXTENSION_INTERVAL: Duration = Duration::from_secs(60 * 60);
const CANCEL_POLL_INTERVAL: Duration = Duration::from_secs(1);

pub fn spawn(
    cancel: Arc<AtomicBool>,
    interval: Duration,
    mut on_tick: impl FnMut() + Send + 'static,
) -> std::io::Result<JoinHandle<()>> {
    if interval.is_zero() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "login extension interval must be positive",
        ));
    }

    thread::Builder::new()
        .name("login-extension".into())
        .spawn(move || {
            while wait(&cancel, interval) {
                on_tick();
            }
        })
}

fn wait(cancel: &AtomicBool, interval: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < interval {
        if cancel.load(Ordering::SeqCst) {
            return false;
        }
        let remaining = interval.saturating_sub(started.elapsed());
        thread::sleep(remaining.min(CANCEL_POLL_INTERVAL));
    }
    !cancel.load(Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    #[test]
    fn script_requires_exactly_one_candidate() {
        assert!(LOGIN_EXTENSION_SCRIPT.contains("candidates.length === 1"));
        assert!(LOGIN_EXTENSION_SCRIPT.contains("button.disabled"));
        assert!(LOGIN_EXTENSION_SCRIPT.contains("stamp--normal"));
    }

    #[test]
    fn waits_then_runs_until_cancelled() {
        let cancel = Arc::new(AtomicBool::new(false));
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_for_tick = calls.clone();
        let cancel_for_tick = cancel.clone();
        let handle = spawn(cancel, Duration::from_millis(5), move || {
            calls_for_tick.fetch_add(1, Ordering::SeqCst);
            cancel_for_tick.store(true, Ordering::SeqCst);
        })
        .unwrap();

        handle.join().unwrap();

        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn cancellation_prevents_the_first_tick() {
        let cancel = Arc::new(AtomicBool::new(true));
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_for_tick = calls.clone();
        let handle = spawn(cancel, Duration::from_millis(5), move || {
            calls_for_tick.fetch_add(1, Ordering::SeqCst);
        })
        .unwrap();

        handle.join().unwrap();

        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}
