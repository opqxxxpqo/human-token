//! Local-only JSON storage under the OS app-data dir.
//! Nothing leaves this machine. The dashboard surfaces this fact in the UI.

use std::fs;
use std::path::PathBuf;

use chrono::{DateTime, Local, NaiveDate, Timelike};
use serde::{Deserialize, Serialize};

const DIR_NAME: &str = "human-token";
const STATE_FILE: &str = "state.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub token_cap: f64,
    pub window_secs: f64,
    pub rest_reminder_pct: f64, // 0..100
    #[serde(default = "default_accent")]
    pub accent_color: String,
    #[serde(default = "default_close_to_tray")]
    pub close_to_tray: bool,
}

fn default_accent() -> String {
    "#4cff91".to_string()
}
fn default_close_to_tray() -> bool {
    true
}

impl Default for Config {
    fn default() -> Self {
        Self {
            token_cap: 200_000.0,
            window_secs: 5.0 * 3600.0,
            rest_reminder_pct: 80.0,
            accent_color: default_accent(),
            close_to_tray: default_close_to_tray(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DayLog {
    pub date: String,                // YYYY-MM-DD
    pub total_tokens: f64,
    pub keystrokes: u64,
    pub clicks: u64,
    pub mouse_px: f64,
    /// 96 buckets per day = 15-minute resolution. Each entry: tokens accrued in that bucket.
    pub buckets: Vec<f64>,
}

impl DayLog {
    pub fn empty_for(date: NaiveDate) -> Self {
        Self {
            date: date.format("%Y-%m-%d").to_string(),
            total_tokens: 0.0,
            keystrokes: 0,
            clicks: 0,
            mouse_px: 0.0,
            buckets: vec![0.0; 96],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct State {
    pub config: Config,
    pub days: Vec<DayLog>, // sorted oldest -> newest
}

pub struct Storage {
    path: PathBuf,
    pub config: Config,
    pub days: Vec<DayLog>,
}

impl Storage {
    pub fn load_or_init() -> std::io::Result<Self> {
        let dir = data_dir();
        fs::create_dir_all(&dir)?;
        let path = dir.join(STATE_FILE);

        let state: State = if path.exists() {
            let s = fs::read_to_string(&path)?;
            serde_json::from_str(&s).unwrap_or_default()
        } else {
            State::default()
        };

        let mut out = Self {
            path,
            config: state.config,
            days: state.days,
        };
        out.ensure_today();
        Ok(out)
    }

    pub fn save(&self) -> std::io::Result<()> {
        let state = State {
            config: self.config.clone(),
            days: self.days.clone(),
        };
        let s = serde_json::to_string_pretty(&state)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        fs::write(&self.path, s)
    }

    fn ensure_today(&mut self) {
        let today = Local::now().date_naive();
        let today_str = today.format("%Y-%m-%d").to_string();
        if self.days.last().map(|d| d.date.as_str()) != Some(today_str.as_str()) {
            self.days.push(DayLog::empty_for(today));
        }
        // Cap retention at 60 days.
        while self.days.len() > 60 {
            self.days.remove(0);
        }
    }

    /// Add tokens to today's current 15-minute bucket. Called by the aggregator.
    pub fn record(&mut self, now: DateTime<Local>, tokens: f64, keys: u64, clicks: u64, px: f64) {
        self.ensure_today();
        let bucket = ((now.hour() * 60 + now.minute()) / 15) as usize;
        let day = self.days.last_mut().unwrap();
        if bucket < day.buckets.len() {
            day.buckets[bucket] += tokens;
        }
        day.total_tokens += tokens;
        day.keystrokes += keys;
        day.clicks += clicks;
        day.mouse_px += px;
    }

    pub fn today(&self) -> Option<&DayLog> {
        self.days.last()
    }

    pub fn last_n_days(&self, n: usize) -> &[DayLog] {
        let start = self.days.len().saturating_sub(n);
        &self.days[start..]
    }
}

fn data_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(DIR_NAME)
}
