use tauri::{PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

const DEFAULT_URL: &str = "tauri://localhost";
const WINDOW_WIDTH: i32 = 160;
const WINDOW_HEIGHT: i32 = 300;
const WINDOW_MARGIN: i32 = 16;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![click_probe])
        .setup(|app| {
            let handle = app.handle().clone();
            let (default_x, default_y) = default_window_position(&handle);

            let window_url = if std::env::var("LIVE2D_PET_URL").is_ok() {
                WebviewUrl::App("index.html".into())
            } else {
                WebviewUrl::App("index.html".into())
            };

            let window = WebviewWindowBuilder::new(&handle, "live2d-pet", window_url)
                .title("Live2D Pet")
                .inner_size(WINDOW_WIDTH as f64, WINDOW_HEIGHT as f64)
                .position(default_x, default_y)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .shadow(false)
                .visible_on_all_workspaces(true)
                .build()?;

            window.on_window_event({
                let window = window.clone();
                move |event| {
                    if matches!(event, WindowEvent::Moved(_)) {
                        let _ = clamp_to_work_area(&window);
                    }
                }
            });

            let _ = clamp_to_work_area(&window);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Live2D pet");
}

#[tauri::command]
fn click_probe(x: f64, y: f64) {
    eprintln!("click_probe x={x} y={y}");
}

fn clamp_to_work_area(window: &WebviewWindow) -> tauri::Result<()> {
    let monitor = window.current_monitor()?.or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return Ok(());
    };

    let work_area = monitor.work_area();
    let position = window.outer_position()?;
    let size = window.outer_size()?;

    let min_x = work_area.position.x;
    let min_y = work_area.position.y;
    let max_x = min_x + i32::try_from(work_area.size.width).unwrap_or(i32::MAX) - i32::try_from(size.width).unwrap_or(0);
    let max_y = min_y + i32::try_from(work_area.size.height).unwrap_or(i32::MAX) - i32::try_from(size.height).unwrap_or(0);

    let next_x = position.x.clamp(min_x, max_x.max(min_x));
    let next_y = position.y.clamp(min_y, max_y.max(min_y));
    if next_x != position.x || next_y != position.y {
        window.set_position(PhysicalPosition::new(next_x, next_y))?;
    }

    Ok(())
}

fn default_window_position(app: &tauri::AppHandle) -> (f64, f64) {
    let window_width = WINDOW_WIDTH;
    let window_height = WINDOW_HEIGHT;

    let monitor = app
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| app.available_monitors().ok().and_then(|monitors| monitors.into_iter().next()));

    let Some(monitor) = monitor else {
        return (f64::from(WINDOW_MARGIN), f64::from(WINDOW_MARGIN));
    };

    let work_area = monitor.work_area();
    let min_x = work_area.position.x + WINDOW_MARGIN;
    let min_y = work_area.position.y + WINDOW_MARGIN;
    let max_x = work_area.position.x + i32::try_from(work_area.size.width).unwrap_or(i32::MAX) - window_width - WINDOW_MARGIN;
    let max_y = work_area.position.y + i32::try_from(work_area.size.height).unwrap_or(i32::MAX) - window_height - WINDOW_MARGIN;

    (f64::from(max_x.max(min_x)), f64::from(max_y.max(min_y)))
}
