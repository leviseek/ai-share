use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use serde::Deserialize;
use std::{
    env,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{
    Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::POINT;
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, DestroyMenu, GetCursorPos, TrackPopupMenu, MF_POPUP,
    MF_SEPARATOR, MF_STRING, TPM_RETURNCMD, TPM_RIGHTBUTTON,
};

const WINDOW_WIDTH: i32 = 320;
const WINDOW_HEIGHT: i32 = 420;
const WINDOW_MARGIN: i32 = 16;
const MENU_MOTION_BASE: u32 = 1000;
const MENU_FLOOR_BASE: u32 = 2000;
const MENU_PARTICLE_BASE: u32 = 3000;
const MENU_OPACITY_BASE: u32 = 4000;
const MENU_SIZE_BASE: u32 = 5000;

const FLOOR_OPTIONS: [(&str, &str); 9] = [
    ("warm-wood", "暖木地板"),
    ("light-wood", "浅木地板"),
    ("tatami", "榻榻米"),
    ("marble", "大理石"),
    ("night-floor", "星夜地板"),
    ("grass", "草地"),
    ("tile", "蓝白瓷砖"),
    ("pastel", "糖果云朵"),
    ("cloud", "云朵地板"),
];
const PARTICLE_OPTIONS: [(&str, &str); 6] = [
    ("none", "关闭"),
    ("sakura", "樱花"),
    ("fireworks", "烟火"),
    ("snow", "雪花"),
    ("stars", "星光"),
    ("bubbles", "泡泡"),
];
const OPACITY_OPTIONS: [u32; 6] = [35, 50, 65, 80, 95, 100];
const SIZE_OPTIONS: [(&str, &str); 3] = [("small", "小"), ("medium", "中"), ("large", "大")];

#[derive(Clone, Copy, Debug, Default, Deserialize)]
struct HitRegion {
    left: f64,
    top: f64,
    right: f64,
    bottom: f64,
}

impl HitRegion {
    fn contains(self, x: f64, y: f64) -> bool {
        x >= self.left && x <= self.right && y >= self.top && y <= self.bottom
    }
}

#[derive(Default)]
struct HitRegions(Arc<Mutex<HitRegionState>>);

#[derive(Clone, Default)]
struct HitRegionState {
    regions: Vec<HitRegion>,
    scale_factor: f64,
}

#[cfg(target_os = "windows")]
fn set_window_cursor_passthrough(window: &WebviewWindow, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}

#[cfg(not(target_os = "windows"))]
fn set_window_cursor_passthrough(_window: &WebviewWindow, _ignore: bool) {}

fn main() {
    tauri::Builder::default()
        .manage(HitRegions::default())
        .invoke_handler(tauri::generate_handler![
            click_probe,
            show_context_menu,
            update_hit_regions
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let (default_x, default_y) = default_window_position(&handle);

            let webview_url = match env::var("LIVE2D_PET_WEB_URL") {
                Ok(url) if is_trusted_local_url(&url) => WebviewUrl::External(url.parse()?),
                _ => WebviewUrl::App("index.html".into()),
            };

            let window = WebviewWindowBuilder::new(&handle, "live2d-pet", webview_url)
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

            let hit_regions = app.state::<HitRegions>();
            start_cursor_passthrough_monitor(window.clone(), hit_regions.inner());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Live2D pet");
}

#[tauri::command]
fn click_probe(x: f64, y: f64) {
    eprintln!("click_probe x={x} y={y}");
}

#[tauri::command]
fn show_context_menu(
    window: WebviewWindow,
    x: f64,
    y: f64,
    motions: Vec<String>,
) -> Option<String> {
    show_platform_context_menu(&window, x, y, &motions)
        .ok()
        .flatten()
}

fn is_trusted_local_url(url: &str) -> bool {
    let Ok(parsed) = url.parse::<url::Url>() else {
        return false;
    };

    parsed.scheme() == "http"
        && parsed.host_str() == Some("127.0.0.1")
        && parsed.port_or_known_default() == Some(18080)
        && parsed.username().is_empty()
        && parsed.password().is_none()
        && parsed.path() == "/"
        && parsed.query().is_none()
        && parsed.fragment().is_none()
}

#[tauri::command]
fn update_hit_regions(
    regions: Vec<HitRegion>,
    scale_factor: f64,
    state: tauri::State<'_, HitRegions>,
) {
    if let Ok(mut current_state) = state.0.lock() {
        current_state.regions = regions;
        current_state.scale_factor = if scale_factor.is_finite() && scale_factor > 0.0 {
            scale_factor
        } else {
            1.0
        };
    }
}

#[cfg(target_os = "windows")]
fn start_cursor_passthrough_monitor(window: WebviewWindow, state: &HitRegions) {
    let state = Arc::clone(&state.0);
    std::thread::spawn(move || {
        let mut ignored = false;
        loop {
            std::thread::sleep(Duration::from_millis(80));
            let Ok(position) = window.outer_position() else {
                break;
            };
            let Ok(current_state) = state.lock().map(|state| state.clone()) else {
                continue;
            };
            if current_state.regions.is_empty() {
                if ignored {
                    set_window_cursor_passthrough(&window, false);
                    ignored = false;
                }
                continue;
            }
            let mut point = POINT { x: 0, y: 0 };
            let cursor_available = unsafe { GetCursorPos(&mut point) != 0 };
            if !cursor_available {
                continue;
            }
            let scale_factor = if current_state.scale_factor > 0.0 {
                current_state.scale_factor
            } else {
                1.0
            };
            let local_x = f64::from(point.x - position.x) / scale_factor;
            let local_y = f64::from(point.y - position.y) / scale_factor;
            let in_interactive_region = current_state
                .regions
                .iter()
                .any(|region| region.contains(local_x, local_y));
            let should_ignore = !in_interactive_region;
            if should_ignore != ignored {
                set_window_cursor_passthrough(&window, should_ignore);
                ignored = should_ignore;
            }
        }
    });
}

#[cfg(not(target_os = "windows"))]
fn start_cursor_passthrough_monitor(_window: WebviewWindow, _state: &HitRegions) {}

#[cfg(target_os = "windows")]
fn show_platform_context_menu(
    window: &WebviewWindow,
    x: f64,
    y: f64,
    motions: &[String],
) -> tauri::Result<Option<String>> {
    let hwnd = match window.window_handle()?.as_raw() {
        RawWindowHandle::Win32(handle) => handle.hwnd.get() as isize,
        _ => return Ok(None),
    };
    let outer_position = window.outer_position()?;
    let menu_x = outer_position.x + x.round() as i32;
    let menu_y = outer_position.y + y.round() as i32;

    unsafe {
        let menu = CreatePopupMenu();
        let motions_menu = CreatePopupMenu();
        for (index, motion) in motions.iter().enumerate() {
            append_menu_text(motions_menu, MENU_MOTION_BASE + index as u32, motion);
        }
        AppendMenuW(
            menu,
            MF_POPUP,
            motions_menu as usize,
            wide("动作列表").as_ptr(),
        );
        AppendMenuW(menu, MF_SEPARATOR, 0, std::ptr::null());

        let floor_menu = CreatePopupMenu();
        for (index, (_, label)) in FLOOR_OPTIONS.iter().enumerate() {
            append_menu_text(floor_menu, MENU_FLOOR_BASE + index as u32, label);
        }
        AppendMenuW(
            menu,
            MF_POPUP,
            floor_menu as usize,
            wide("地板样式").as_ptr(),
        );

        let particle_menu = CreatePopupMenu();
        for (index, (_, label)) in PARTICLE_OPTIONS.iter().enumerate() {
            append_menu_text(particle_menu, MENU_PARTICLE_BASE + index as u32, label);
        }
        AppendMenuW(
            menu,
            MF_POPUP,
            particle_menu as usize,
            wide("粒子背景").as_ptr(),
        );

        let opacity_menu = CreatePopupMenu();
        for (index, opacity) in OPACITY_OPTIONS.iter().enumerate() {
            append_menu_text(
                opacity_menu,
                MENU_OPACITY_BASE + index as u32,
                &format!("{opacity}%"),
            );
        }
        AppendMenuW(
            menu,
            MF_POPUP,
            opacity_menu as usize,
            wide("透明度").as_ptr(),
        );

        let size_menu = CreatePopupMenu();
        for (index, (_, label)) in SIZE_OPTIONS.iter().enumerate() {
            append_menu_text(size_menu, MENU_SIZE_BASE + index as u32, label);
        }
        AppendMenuW(menu, MF_POPUP, size_menu as usize, wide("尺寸").as_ptr());

        let selected = TrackPopupMenu(
            menu,
            TPM_RETURNCMD | TPM_RIGHTBUTTON,
            menu_x,
            menu_y,
            0,
            hwnd as _,
            std::ptr::null(),
        );
        DestroyMenu(menu);
        Ok(menu_selection(selected as u32, motions))
    }
}

#[cfg(not(target_os = "windows"))]
fn show_platform_context_menu(
    _window: &WebviewWindow,
    _x: f64,
    _y: f64,
    _motions: &[String],
) -> tauri::Result<Option<String>> {
    Ok(None)
}

fn menu_selection(selected: u32, motions: &[String]) -> Option<String> {
    if selected == 0 {
        return None;
    }
    if (MENU_MOTION_BASE..MENU_FLOOR_BASE).contains(&selected) {
        let index = usize::try_from(selected - MENU_MOTION_BASE).ok()?;
        return motions.get(index).map(|motion| format!("motion:{motion}"));
    }
    if (MENU_FLOOR_BASE..MENU_PARTICLE_BASE).contains(&selected) {
        let index = usize::try_from(selected - MENU_FLOOR_BASE).ok()?;
        return FLOOR_OPTIONS
            .get(index)
            .map(|(id, _)| format!("floor:{id}"));
    }
    if (MENU_PARTICLE_BASE..MENU_OPACITY_BASE).contains(&selected) {
        let index = usize::try_from(selected - MENU_PARTICLE_BASE).ok()?;
        return PARTICLE_OPTIONS
            .get(index)
            .map(|(id, _)| format!("particle:{id}"));
    }
    if (MENU_OPACITY_BASE..MENU_SIZE_BASE).contains(&selected) {
        let index = usize::try_from(selected - MENU_OPACITY_BASE).ok()?;
        return OPACITY_OPTIONS
            .get(index)
            .map(|opacity| format!("opacity:{opacity}"));
    }
    if (MENU_SIZE_BASE..MENU_SIZE_BASE + SIZE_OPTIONS.len() as u32).contains(&selected) {
        let index = usize::try_from(selected - MENU_SIZE_BASE).ok()?;
        return SIZE_OPTIONS.get(index).map(|(id, _)| format!("size:{id}"));
    }
    None
}

#[cfg(target_os = "windows")]
unsafe fn append_menu_text(
    menu: windows_sys::Win32::UI::WindowsAndMessaging::HMENU,
    id: u32,
    label: &str,
) {
    AppendMenuW(menu, MF_STRING, id as usize, wide(label).as_ptr());
}

#[cfg(target_os = "windows")]
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn clamp_to_work_area(window: &WebviewWindow) -> tauri::Result<()> {
    let monitor = window
        .current_monitor()?
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return Ok(());
    };

    let work_area = monitor.work_area();
    let position = window.outer_position()?;
    let size = window.outer_size()?;

    let min_x = work_area.position.x;
    let min_y = work_area.position.y;
    let max_x = min_x + i32::try_from(work_area.size.width).unwrap_or(i32::MAX)
        - i32::try_from(size.width).unwrap_or(0);
    let max_y = min_y + i32::try_from(work_area.size.height).unwrap_or(i32::MAX)
        - i32::try_from(size.height).unwrap_or(0);

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

    let monitor = app.primary_monitor().ok().flatten().or_else(|| {
        app.available_monitors()
            .ok()
            .and_then(|monitors| monitors.into_iter().next())
    });

    let Some(monitor) = monitor else {
        return (f64::from(WINDOW_MARGIN), f64::from(WINDOW_MARGIN));
    };

    let work_area = monitor.work_area();
    let min_x = work_area.position.x + WINDOW_MARGIN;
    let min_y = work_area.position.y + WINDOW_MARGIN;
    let max_x = work_area.position.x + i32::try_from(work_area.size.width).unwrap_or(i32::MAX)
        - window_width
        - WINDOW_MARGIN;
    let max_y = work_area.position.y + i32::try_from(work_area.size.height).unwrap_or(i32::MAX)
        - window_height
        - WINDOW_MARGIN;

    (f64::from(max_x.max(min_x)), f64::from(max_y.max(min_y)))
}
