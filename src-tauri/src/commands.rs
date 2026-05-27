//! Tauri commands exposed to the frontend.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::storage::{Config, DayLog};
use crate::token::Snapshot;
use crate::AppState;

#[tauri::command]
pub fn get_widget_snapshot(state: State<'_, AppState>) -> Snapshot {
    state.calc.lock().snapshot()
}

#[derive(Serialize)]
pub struct TodayPayload {
    pub day: DayLog,
    pub snapshot: Snapshot,
}

#[tauri::command]
pub fn get_today(state: State<'_, AppState>) -> TodayPayload {
    let store = state.store.lock();
    let day = store.today().cloned().unwrap_or_default();
    drop(store);
    TodayPayload {
        day,
        snapshot: state.calc.lock().snapshot(),
    }
}

#[tauri::command]
pub fn get_weekly(state: State<'_, AppState>) -> Vec<DayLog> {
    state.store.lock().last_n_days(7).to_vec()
}

#[tauri::command]
pub fn set_token_cap(state: State<'_, AppState>, cap: f64) -> Result<(), String> {
    if cap <= 0.0 {
        return Err("cap must be positive".into());
    }
    {
        let mut store = state.store.lock();
        store.config.token_cap = cap;
        store.save().map_err(|e| e.to_string())?;
    }
    state.calc.lock().set_cap(cap);
    Ok(())
}

#[tauri::command]
pub fn open_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn toggle_pause(state: State<'_, AppState>) -> bool {
    state.calc.lock().toggle_pause()
}

#[tauri::command]
pub fn reset_session(state: State<'_, AppState>) {
    state.calc.lock().reset_session_manual();
}

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Config {
    state.store.lock().config.clone()
}

#[tauri::command]
pub fn set_accent_color(
    app: AppHandle,
    state: State<'_, AppState>,
    color: String,
) -> Result<(), String> {
    {
        let mut store = state.store.lock();
        store.config.accent_color = color.clone();
        store.save().map_err(|e| e.to_string())?;
    }
    let _ = app.emit("config-changed", serde_json::json!({ "accent_color": color }));
    Ok(())
}

#[tauri::command]
pub fn set_close_to_tray(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    let mut store = state.store.lock();
    store.config.close_to_tray = enabled;
    store.save().map_err(|e| e.to_string())
}

/// Widget × button calls this — it either quits or hides depending on config.
#[tauri::command]
pub fn close_widget(app: AppHandle, state: State<'_, AppState>) {
    let close_to_tray = state.store.lock().config.close_to_tray;
    if close_to_tray {
        if let Some(w) = app.get_webview_window("widget") {
            let _ = w.hide();
        }
    } else {
        app.exit(0);
    }
}

#[tauri::command]
pub fn show_widget(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("widget") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Flush in-memory tokens to disk immediately. Called from the exit-confirm
/// dialog so the user can quit without losing the last <30s of activity.
#[tauri::command]
pub fn force_save(state: State<'_, AppState>) -> Result<(), String> {
    state.store.lock().save().map_err(|e| e.to_string())
}
