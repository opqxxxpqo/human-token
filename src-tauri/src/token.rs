//! Token consumption formula.
//!
//! Tuned slower than Claude Code's typical output rate so a session accumulates
//! over hours, not minutes. No burst multiplier — pure monotonic accumulation
//! so the widget never appears to "decrease".
//!   keystroke      = 1.0 token  (×0.85..1.15 jitter, organic feel)
//!   mouse click    = 2.0 tokens
//!   mouse move     = 1 token per 150 px (Euclidean)
//!   idle > 5 min   = pause counting (matches Claude Code's "session" semantics)

use serde::Serialize;

const KEY_TOK: f64 = 1.0;
const CLICK_TOK: f64 = 2.0;
const PX_PER_TOK: f64 = 150.0;
const BURST_MULT: f64 = 1.0; // disabled — keeps accumulation smooth
const BURST_RATE_THRESH: f64 = 8.0;
const IDLE_THRESH_SECS: f64 = 300.0;
const RATE_WINDOW_SECS: f64 = 3.0;

#[derive(Debug, Clone, Copy)]
pub enum ActivityEvent {
    KeyPress,
    MouseClick,
    MouseMove(f64),
}

#[derive(Debug, Clone, Serialize)]
pub struct Snapshot {
    pub session_tokens: f64,
    pub today_tokens: f64,
    pub rate_per_sec: f64,
    pub status_word: String,
    pub state: &'static str, // "active" | "idle" | "burst" | "cooldown" | "paused"
    pub cap: f64,
    pub window_secs: f64,
    pub idle_secs: f64,
    pub session_started_at: i64,
    pub keystrokes: u64,
    pub clicks: u64,
    pub mouse_px: f64,
    pub pct_used: f64,
    pub paused: bool,
}

pub struct TokenCalculator {
    session_tokens: f64,
    today_tokens: f64,
    keystrokes: u64,
    clicks: u64,
    mouse_px: f64,
    recent_tokens: f64, // for rate calc, decays each tick
    idle_secs: f64,
    session_started_at: i64,
    cap: f64,
    window_secs: f64,
    status_idx: u64,
    last_status_change: f64,
    elapsed_secs: f64,
    jitter_state: u32, // LCG state for organic per-event variance
    paused: bool,
}

impl TokenCalculator {
    pub fn new(cap: f64, window_secs: f64) -> Self {
        Self {
            session_tokens: 0.0,
            today_tokens: 0.0,
            keystrokes: 0,
            clicks: 0,
            mouse_px: 0.0,
            recent_tokens: 0.0,
            idle_secs: 0.0,
            session_started_at: chrono::Utc::now().timestamp(),
            cap,
            window_secs,
            status_idx: 0,
            last_status_change: 0.0,
            elapsed_secs: 0.0,
            jitter_state: 0x9E3779B9,
            paused: false,
        }
    }

    pub fn toggle_pause(&mut self) -> bool {
        self.paused = !self.paused;
        self.paused
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn reset_session_manual(&mut self) {
        self.reset_session();
    }

    fn next_jitter(&mut self) -> f64 {
        // Numerical Recipes LCG — fast, deterministic, good enough for visual jitter
        self.jitter_state = self
            .jitter_state
            .wrapping_mul(1664525)
            .wrapping_add(1013904223);
        let unit = self.jitter_state as f64 / u32::MAX as f64; // 0..1
        0.85 + unit * 0.3 // 0.85..1.15
    }

    pub fn set_cap(&mut self, cap: f64) {
        self.cap = cap;
    }

    pub fn ingest(&mut self, ev: ActivityEvent) {
        if self.paused {
            return;
        }
        // After idle threshold we start a new session
        if self.idle_secs > IDLE_THRESH_SECS {
            self.reset_session();
        }
        self.idle_secs = 0.0;

        let (raw, jittered) = match ev {
            ActivityEvent::KeyPress => {
                self.keystrokes += 1;
                (KEY_TOK, true)
            }
            ActivityEvent::MouseClick => {
                self.clicks += 1;
                (CLICK_TOK, true)
            }
            ActivityEvent::MouseMove(px) => {
                self.mouse_px += px;
                (px / PX_PER_TOK, false)
            }
        };

        let rate = self.recent_tokens / RATE_WINDOW_SECS;
        let multiplier = if rate > BURST_RATE_THRESH { BURST_MULT } else { 1.0 };
        let jitter = if jittered { self.next_jitter() } else { 1.0 };
        let tokens = raw * multiplier * jitter;

        self.session_tokens += tokens;
        self.today_tokens += tokens;
        self.recent_tokens += tokens;
    }

    /// Tick advances time by `dt` seconds (called by the aggregator at ~10Hz).
    pub fn tick(&mut self, dt: f64) {
        if self.paused {
            // While paused, rate decays so the t/s indicator drops to 0,
            // but session/idle clocks stand still.
            self.recent_tokens *= 1.0 - (dt / RATE_WINDOW_SECS).min(1.0);
            return;
        }
        self.elapsed_secs += dt;
        self.idle_secs += dt;

        // Decay recent_tokens with a 3s sliding window approximation.
        let decay = (dt / RATE_WINDOW_SECS).min(1.0);
        self.recent_tokens *= 1.0 - decay;
        if self.recent_tokens < 0.0001 {
            self.recent_tokens = 0.0;
        }

        // Rotate gerund word every ~1.5s while active.
        if self.idle_secs < 2.0 && self.elapsed_secs - self.last_status_change > 1.5 {
            self.status_idx = self.status_idx.wrapping_add(1);
            self.last_status_change = self.elapsed_secs;
        }
    }

    fn reset_session(&mut self) {
        self.session_tokens = 0.0;
        self.session_started_at = chrono::Utc::now().timestamp();
        self.recent_tokens = 0.0;
    }

    pub fn snapshot(&self) -> Snapshot {
        let rate = self.recent_tokens / RATE_WINDOW_SECS;
        let (state, word) = if self.paused {
            ("paused", "Paused".to_string())
        } else if self.session_tokens >= self.cap {
            ("cooldown", "RateLimited".to_string())
        } else if self.idle_secs > IDLE_THRESH_SECS {
            ("idle", status_words_idle(self.status_idx).to_string())
        } else if rate > BURST_RATE_THRESH {
            ("burst", status_words_active(self.status_idx).to_string())
        } else if self.idle_secs > 5.0 {
            ("idle", status_words_idle(self.status_idx).to_string())
        } else {
            ("active", status_words_active(self.status_idx).to_string())
        };

        Snapshot {
            session_tokens: self.session_tokens,
            today_tokens: self.today_tokens,
            rate_per_sec: rate,
            status_word: word,
            state,
            cap: self.cap,
            window_secs: self.window_secs,
            idle_secs: self.idle_secs,
            session_started_at: self.session_started_at,
            keystrokes: self.keystrokes,
            clicks: self.clicks,
            mouse_px: self.mouse_px,
            pct_used: (self.session_tokens / self.cap * 100.0).min(100.0),
            paused: self.paused,
        }
    }

    pub fn rollover_day(&mut self) {
        self.today_tokens = 0.0;
        self.keystrokes = 0;
        self.clicks = 0;
        self.mouse_px = 0.0;
    }

    pub fn today_tokens(&self) -> f64 {
        self.today_tokens
    }
}

fn status_words_active(idx: u64) -> &'static str {
    crate::status_words::active(idx)
}
fn status_words_idle(idx: u64) -> &'static str {
    crate::status_words::idle(idx)
}
