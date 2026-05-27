mod commands;
mod status_words;
mod storage;
mod token;
mod tracker;

use std::sync::Arc;

use parking_lot::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

pub struct AppState {
    pub calc: Arc<Mutex<token::TokenCalculator>>,
    pub store: Arc<Mutex<storage::Storage>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let storage = storage::Storage::load_or_init().expect("storage init failed");
    let cap = storage.config.token_cap;
    let window_secs = storage.config.window_secs;
    let calc = token::TokenCalculator::new(cap, window_secs);

    let state = AppState {
        calc: Arc::new(Mutex::new(calc)),
        store: Arc::new(Mutex::new(storage)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .setup(|app| {
            // ── tray icon + menu ────────────────────────────────────
            let show_widget = MenuItem::with_id(app, "show_widget", "Show widget", true, None::<&str>)?;
            let show_dash = MenuItem::with_id(app, "show_dash", "Open dashboard", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_widget, &show_dash, &sep, &quit])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("human-token")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show_widget" => {
                        if let Some(w) = app.get_webview_window("widget") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "show_dash" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("widget") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // ── activity tracker ────────────────────────────────────
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            tracker::spawn(handle, state.calc.clone(), state.store.clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            // Dashboard's native X should hide, not quit — widget stays alive.
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_widget_snapshot,
            commands::get_today,
            commands::get_weekly,
            commands::open_main_window,
            commands::set_token_cap,
            commands::quit_app,
            commands::toggle_pause,
            commands::reset_session,
            commands::get_config,
            commands::set_accent_color,
            commands::set_close_to_tray,
            commands::close_widget,
            commands::show_widget,
            commands::force_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
