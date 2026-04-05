#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

struct SidecarState {
    pocketbase: Mutex<Option<CommandChild>>,
    node_sidecar: Mutex<Option<CommandChild>>,
}

fn wait_for_pocketbase(url: &str, timeout_secs: u64) -> bool {
    let client = reqwest::blocking::Client::new();
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    while start.elapsed() < timeout {
        if let Ok(resp) = client.get(format!("{}/api/health", url)).send() {
            if resp.status().is_success() {
                return true;
            }
        }
        thread::sleep(Duration::from_millis(200));
    }
    false
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState {
            pocketbase: Mutex::new(None),
            node_sidecar: Mutex::new(None),
        })
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");

            // Ensure data directory exists
            std::fs::create_dir_all(&app_data_dir).ok();

            let pb_data_dir = app_data_dir.join("pb_data");
            std::fs::create_dir_all(&pb_data_dir).ok();

            let pdf_dir = app_data_dir.join("pdfs");
            std::fs::create_dir_all(&pdf_dir).ok();

            // Spawn PocketBase sidecar
            let pb_data_str = pb_data_dir.to_string_lossy().to_string();
            let (mut pb_rx, pb_child) = app
                .shell()
                .sidecar("sidecars/pocketbase")
                .expect("failed to find pocketbase sidecar")
                .args([
                    "serve",
                    "--http=127.0.0.1:8090",
                    &format!("--dir={}", pb_data_str),
                ])
                .spawn()
                .expect("failed to spawn pocketbase");

            // Log PocketBase output
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = pb_rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("[pocketbase] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[pocketbase] {}", String::from_utf8_lossy(&line));
                        }
                        _ => {}
                    }
                }
            });

            // Store PocketBase handle
            let state = app.state::<SidecarState>();
            *state.pocketbase.lock().unwrap() = Some(pb_child);

            // Wait for PocketBase to be ready
            let pb_url = "http://127.0.0.1:8090";
            if !wait_for_pocketbase(pb_url, 15) {
                eprintln!("PocketBase failed to start within 15 seconds");
                return Err("PocketBase startup timeout".into());
            }
            println!("PocketBase is ready at {}", pb_url);

            // Spawn Node sidecar for PDF/email/SMS
            let pdf_dir_str = pdf_dir.to_string_lossy().to_string();
            let (mut node_rx, node_child) = app
                .shell()
                .sidecar("sidecars/node-sidecar")
                .expect("failed to find node-sidecar")
                .env("PORT", "3002")
                .env("PB_URL", "http://127.0.0.1:8090")
                .env("PDF_DIR", &pdf_dir_str)
                .env("FRONTEND_URL", "tauri://localhost")
                .spawn()
                .expect("failed to spawn node sidecar");

            // Log Node sidecar output
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = node_rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("[sidecar] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[sidecar] {}", String::from_utf8_lossy(&line));
                        }
                        _ => {}
                    }
                }
            });

            *state.node_sidecar.lock().unwrap() = Some(node_child);
            println!("Node sidecar started on port 3002");

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri app");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            println!("Shutting down sidecars...");
            let state = app_handle.state::<SidecarState>();

            if let Some(child) = state.node_sidecar.lock().unwrap().take() {
                let _ = child.kill();
            }
            if let Some(child) = state.pocketbase.lock().unwrap().take() {
                let _ = child.kill();
            }
            println!("Sidecars stopped");
        }
    });
}
