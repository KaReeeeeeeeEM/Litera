use tauri::{WebviewUrl, WebviewWindowBuilder};

const DEVELOPMENT_URL: &str = "http://localhost:3000";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let workspace_origin = option_env!("LITERA_APP_URL").unwrap_or_else(|| {
                if cfg!(debug_assertions) {
                    DEVELOPMENT_URL
                } else {
                    panic!(
                    "LITERA_APP_URL must be set to the deployed HTTPS workspace when building a release",
                    )
                }
            });
            let device_url = format!("{}/device", workspace_origin.trim_end_matches('/'));
            let parsed_url = device_url.parse()?;

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed_url))
                .title("Litera")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 700.0)
                .resizable(true)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Litera desktop application");
}
