//! Global keyboard + mouse listener (rdev) feeding the token calculator.
//!
//! Two threads:
//!   1. listener thread — runs rdev::listen, blocks forever on the OS hook,
//!      forwards normalized events via mpsc.
//!   2. aggregator thread — drains the channel, ticks the calculator once per
//!      second, persists to storage, and emits an "activity-tick" event to
//!      both Tauri windows.

use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use chrono::Local;
use parking_lot::Mutex;
use rdev::{listen, EventType};
use tauri::{AppHandle, Emitter};

use crate::storage::Storage;
use crate::token::{ActivityEvent, TokenCalculator};

pub fn spawn(
    app: AppHandle,
    calc: Arc<Mutex<TokenCalculator>>,
    store: Arc<Mutex<Storage>>,
) {
    let (tx, rx) = mpsc::channel::<ActivityEvent>();

    // ---- listener thread ----
    thread::spawn(move || {
        let mut last_pos: Option<(f64, f64)> = None;
        let cb = move |event: rdev::Event| {
            let out = match event.event_type {
                EventType::KeyPress(_) => Some(ActivityEvent::KeyPress),
                EventType::ButtonPress(_) => Some(ActivityEvent::MouseClick),
                EventType::MouseMove { x, y } => {
                    let dist = match last_pos {
                        Some((lx, ly)) => ((x - lx).powi(2) + (y - ly).powi(2)).sqrt(),
                        None => 0.0,
                    };
                    last_pos = Some((x, y));
                    if dist > 1.0 { Some(ActivityEvent::MouseMove(dist)) } else { None }
                }
                _ => None,
            };
            if let Some(e) = out {
                let _ = tx.send(e);
            }
        };
        if let Err(e) = listen(cb) {
            eprintln!("[tracker] rdev listen error: {:?}", e);
        }
    });

    // ---- aggregator thread ----
    thread::spawn(move || {
        let mut last_tick = Instant::now();
        let mut last_persist = Instant::now();
        let mut bucket_keys: u64 = 0;
        let mut bucket_clicks: u64 = 0;
        let mut bucket_px: f64 = 0.0;
        let mut bucket_tokens_before: f64;

        loop {
            // Drain pending events for ~100ms, then tick. Higher tick rate
            // (10Hz) means the UI sees "activity stopped" within ~100ms instead
            // of up to a second.
            let deadline = Instant::now() + Duration::from_millis(100);
            while Instant::now() < deadline {
                match rx.recv_timeout(Duration::from_millis(20)) {
                    Ok(ev) => {
                        let (k, c, p) = match ev {
                            ActivityEvent::KeyPress => (1u64, 0u64, 0.0f64),
                            ActivityEvent::MouseClick => (0, 1, 0.0),
                            ActivityEvent::MouseMove(d) => (0, 0, d),
                        };
                        bucket_keys += k;
                        bucket_clicks += c;
                        bucket_px += p;
                        calc.lock().ingest(ev);
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }

            let now = Instant::now();
            let dt = now.duration_since(last_tick).as_secs_f64();
            last_tick = now;

            bucket_tokens_before = calc.lock().today_tokens();
            calc.lock().tick(dt);
            let after = calc.lock().today_tokens();
            let added = after - bucket_tokens_before;

            // Persist to storage if we made progress.
            if added > 0.0 || bucket_keys > 0 || bucket_clicks > 0 || bucket_px > 0.0 {
                store.lock().record(Local::now(), added, bucket_keys, bucket_clicks, bucket_px);
                bucket_keys = 0;
                bucket_clicks = 0;
                bucket_px = 0.0;
            }

            // Save to disk every ~30s to keep IO low.
            if now.duration_since(last_persist) > Duration::from_secs(30) {
                if let Err(e) = store.lock().save() {
                    eprintln!("[tracker] storage save error: {:?}", e);
                }
                last_persist = now;
            }

            // Emit snapshot to all windows.
            let snap = calc.lock().snapshot();
            let _ = app.emit("activity-tick", &snap);
        }
    });
}
