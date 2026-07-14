#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The desktop/mobile app is self-contained: local data uses native SQLite via
// tauri-plugin-sql (rusqlite), and PDF generation runs client-side (pdf-lib in the
// SvelteKit frontend). There is no bundled backend sidecar — server-backed modes talk
// to a remote Bun server over HTTP. The former PocketBase + Node sidecar wiring was
// removed when the app consolidated onto the single Bun + Hono server.

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
