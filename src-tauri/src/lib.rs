pub mod layout;
pub mod model;

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Tauri application failed");
}
