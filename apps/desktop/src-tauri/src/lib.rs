use serde::Serialize;
use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{WebviewUrl, WebviewWindowBuilder};

const DEVELOPMENT_URL: &str = "http://localhost:3000";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CodeEditorAvailability {
    id: &'static str,
    label: &'static str,
    available: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibleBook { title: String, path: String }

#[tauri::command]
fn discover_compatible_books() -> Vec<CompatibleBook> {
    let Some(home) = env::var_os("HOME").map(PathBuf::from) else { return Vec::new() };
    let mut found = Vec::new();
    for root in [home.join("Documents"), home.join("Downloads"), home.join("Desktop")].iter().filter(|path| path.is_dir()) {
        discover_books_in(root, 0, &mut found);
    }
    found.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    found.dedup_by(|a, b| a.path == b.path);
    found
}

fn discover_books_in(directory: &Path, depth: usize, found: &mut Vec<CompatibleBook>) {
    if depth > 5 || found.len() >= 250 { return; }
    let compatible = directory.join("assets").join("config.json").is_file()
        && (directory.join("pages").is_dir() || directory.join("content").is_dir() || directory.join("index.html").is_file());
    if compatible {
        found.push(CompatibleBook { title: directory.file_name().and_then(|name| name.to_str()).unwrap_or("Compatible book").to_string(), path: directory.to_string_lossy().into_owned() });
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if path.is_dir() && !name.starts_with('.') && !matches!(name.as_str(), "node_modules" | "Library" | "target" | "dist") { discover_books_in(&path, depth + 1, found); }
    }
}

struct CodeEditor {
    id: &'static str,
    label: &'static str,
    commands: &'static [&'static str],
    mac_application: Option<&'static str>,
}

const CODE_EDITORS: &[CodeEditor] = &[
    CodeEditor {
        id: "vscode",
        label: "Visual Studio Code",
        commands: &["code"],
        mac_application: Some("Visual Studio Code"),
    },
    CodeEditor {
        id: "cursor",
        label: "Cursor",
        commands: &["cursor"],
        mac_application: Some("Cursor"),
    },
    CodeEditor {
        id: "windsurf",
        label: "Windsurf",
        commands: &["windsurf"],
        mac_application: Some("Windsurf"),
    },
    CodeEditor {
        id: "zed",
        label: "Zed",
        commands: &["zed"],
        mac_application: Some("Zed"),
    },
    CodeEditor {
        id: "sublime",
        label: "Sublime Text",
        commands: &["subl", "sublime_text"],
        mac_application: Some("Sublime Text"),
    },
    CodeEditor {
        id: "webstorm",
        label: "WebStorm",
        commands: &["webstorm"],
        mac_application: Some("WebStorm"),
    },
];

#[tauri::command]
fn detect_code_editors() -> Vec<CodeEditorAvailability> {
    CODE_EDITORS
        .iter()
        .map(|editor| CodeEditorAvailability {
            id: editor.id,
            label: editor.label,
            available: editor_is_available(editor),
        })
        .collect()
}

#[tauri::command]
fn open_html_in_editor(editor_id: &str, html: &str, page_number: u32) -> Result<String, String> {
    let editor = CODE_EDITORS
        .iter()
        .find(|candidate| candidate.id == editor_id)
        .ok_or_else(|| "Unknown code editor.".to_string())?;
    if !editor_is_available(editor) {
        return Err(format!("{} is not installed.", editor.label));
    }
    let directory = env::temp_dir().join("litera-html-editor");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!("litera-page-{page_number}.html"));
    fs::write(&path, html).map_err(|error| error.to_string())?;
    launch_editor(editor, &path)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_external_html(path: &str) -> Result<String, String> {
    let requested = fs::canonicalize(path).map_err(|error| error.to_string())?;
    let allowed = fs::canonicalize(env::temp_dir().join("litera-html-editor"))
        .map_err(|error| error.to_string())?;
    if !requested.starts_with(allowed)
        || requested.extension().and_then(|value| value.to_str()) != Some("html")
    {
        return Err("Litera can only reload its own temporary HTML files.".to_string());
    }
    fs::read_to_string(requested).map_err(|error| error.to_string())
}

fn editor_is_available(editor: &CodeEditor) -> bool {
    editor
        .commands
        .iter()
        .any(|command| command_on_path(command))
        || mac_application_path(editor).is_some()
}

fn command_on_path(command: &str) -> bool {
    env::var_os("PATH").is_some_and(|paths| {
        env::split_paths(&paths).any(|directory| {
            directory.join(command).is_file()
                || (cfg!(windows) && directory.join(format!("{command}.exe")).is_file())
        })
    })
}

fn mac_application_path(editor: &CodeEditor) -> Option<PathBuf> {
    if !cfg!(target_os = "macos") {
        return None;
    }
    let application = editor.mac_application?;
    let system = PathBuf::from(format!("/Applications/{application}.app"));
    if system.exists() {
        return Some(system);
    }
    env::var_os("HOME")
        .map(PathBuf::from)
        .map(|home| home.join("Applications").join(format!("{application}.app")))
        .filter(|path| path.exists())
}

fn launch_editor(editor: &CodeEditor, path: &Path) -> Result<(), String> {
    if cfg!(target_os = "macos") {
        if let Some(application) = editor
            .mac_application
            .filter(|_| mac_application_path(editor).is_some())
        {
            Command::new("open")
                .args(["-a", application])
                .arg(path)
                .spawn()
                .map_err(|error| error.to_string())?;
            return Ok(());
        }
    }
    let command = editor
        .commands
        .iter()
        .find(|command| command_on_path(command))
        .ok_or_else(|| format!("{} could not be launched.", editor.label))?;
    Command::new(command)
        .arg(path)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![detect_code_editors, open_html_in_editor, read_external_html, discover_compatible_books])
        .plugin(tauri_plugin_http::init())
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
