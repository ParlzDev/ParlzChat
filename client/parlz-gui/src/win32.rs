#![allow(non_snake_case, dead_code)]

use std::ffi::c_void;
use std::path::PathBuf;
use std::ptr;

pub type HWND = *mut c_void;
pub type HBRUSH = *mut c_void;
pub type HINSTANCE = *mut c_void;
pub type HMENU = *mut c_void;
pub type WPARAM = usize;
pub type LPARAM = isize;
pub type LRESULT = isize;

pub const WS_OVERLAPPEDWINDOW: u32 = 0x00CF_0000;
pub const SW_SHOW: i32 = 5;
pub const SW_HIDE: i32 = 0;
pub const WM_DESTROY: u32 = 0x0002;
pub const WM_SIZE: u32 = 0x0005;
pub const WM_CLOSE: u32 = 0x0010;
pub const WM_KEYDOWN: u32 = 0x0100;
pub const WM_ERASEBKGND: u32 = 0x0014;
pub const WM_GETMINMAXINFO: u32 = 0x0024;
pub const WM_APP: u32 = 0x8000;
pub const VK_F5: usize = 0x74;
pub const IDC_ARROW: u16 = 32512;
pub const IDI_APPLICATION: u16 = 32512;
pub const DWMWA_USE_IMMERSIVE_DARK_MODE: u32 = 20;
pub const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
pub const DWMWCP_ROUND: i32 = 2;
pub const MB_OK: u32 = 0x0;
pub const MB_ICONERROR: u32 = 0x10;

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct POINT {
    pub x: i32,
    pub y: i32,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct RECT {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

#[repr(C)]
pub struct MSG {
    pub hwnd: HWND,
    pub message: u32,
    pub wparam: WPARAM,
    pub lparam: LPARAM,
    pub time: u32,
    pub pt: POINT,
}

#[repr(C)]
pub struct WNDCLASSEXW {
    pub size: u32,
    pub style: u32,
    pub wnd_proc: Option<unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT>,
    pub cls_extra: i32,
    pub wnd_extra: i32,
    pub instance: HINSTANCE,
    pub icon: HINSTANCE,
    pub cursor: HINSTANCE,
    pub background: HBRUSH,
    pub menu_name: *const u16,
    pub class_name: *const u16,
    pub icon_small: HINSTANCE,
}

#[link(name = "user32")]
extern "system" {
    pub fn RegisterClassExW(class: *const WNDCLASSEXW) -> u16;
    pub fn CreateWindowExW(
        ex_style: u32,
        class_name: *const u16,
        window_name: *const u16,
        style: u32,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
        parent: HWND,
        menu: HMENU,
        instance: HINSTANCE,
        param: *const c_void,
    ) -> HWND;
    pub fn DefWindowProcW(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT;
    pub fn ShowWindow(hwnd: HWND, command: i32) -> i32;
    pub fn UpdateWindow(hwnd: HWND) -> i32;
    pub fn GetMessageW(msg: *mut MSG, hwnd: HWND, min: u32, max: u32) -> i32;
    pub fn TranslateMessage(msg: *const MSG) -> i32;
    pub fn DispatchMessageW(msg: *const MSG) -> LRESULT;
    pub fn PostQuitMessage(code: i32);
    pub fn InvalidateRect(hwnd: HWND, rect: *const RECT, erase: i32) -> i32;
    pub fn GetClientRect(hwnd: HWND, rect: *mut RECT) -> i32;
    pub fn SetWindowLongPtrW(hwnd: HWND, index: i32, value: isize) -> isize;
    pub fn GetWindowLongPtrW(hwnd: HWND, index: i32) -> isize;
    pub fn LoadCursorW(instance: HINSTANCE, name: u16) -> HINSTANCE;
    pub fn LoadIconW(instance: HINSTANCE, name: u16) -> HINSTANCE;
    pub fn MessageBoxW(hwnd: HWND, text: *const u16, caption: *const u16, kind: u32) -> i32;
    pub fn SetProcessDpiAwarenessContext(context: isize) -> i32;
    pub fn GetSystemMetrics(index: i32) -> i32;
    pub fn DestroyWindow(hwnd: HWND) -> i32;
    pub fn GetModuleFileNameW(module: HWND, buffer: *mut u16, size: u32) -> u32;
}

#[link(name = "gdi32")]
extern "system" {
    pub fn CreateSolidBrush(color: u32) -> HBRUSH;
    pub fn DeleteObject(object: HBRUSH) -> i32;
}

#[link(name = "dwmapi")]
extern "system" {
    pub fn DwmSetWindowAttribute(hwnd: HWND, attribute: u32, value: *const c_void, size: u32) -> i32;
}

#[link(name = "kernel32")]
extern "system" {
    pub fn GetModuleHandleW(name: *const u16) -> HINSTANCE;
}

pub const fn rgb(red: u8, green: u8, blue: u8) -> u32 {
    (red as u32) | ((green as u32) << 8) | ((blue as u32) << 16)
}

pub fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn exe_dir() -> PathBuf {
    let mut buffer = vec![0u16; 32768];
    let length = unsafe { GetModuleFileNameW(ptr::null_mut(), buffer.as_mut_ptr(), buffer.len() as u32) };
    if length == 0 {
        return PathBuf::from(".");
    }
    let text = String::from_utf16_lossy(&buffer[..length as usize]);
    std::path::Path::new(&text)
        .parent()
        .map(|dir| dir.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn read_server() -> String {
    if let Some(from_args) = read_server_from_args() {
        return from_args;
    }
    let candidates = [exe_dir().join("parlz.conf"), PathBuf::from("parlz.conf")];
    for path in candidates {
        if let Ok(text) = std::fs::read_to_string(&path) {
            for line in text.lines() {
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix("server=") {
                    let value = rest.trim();
                    if !value.is_empty() {
                        return value.to_string();
                    }
                }
            }
        }
    }
    "http://127.0.0.1:8137".to_string()
}

fn read_server_from_args() -> Option<String> {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let mut index = 0;
    while index < arguments.len() {
        let value = arguments[index].trim();
        if value == "--server" || value == "-s" {
            if let Some(next) = arguments.get(index + 1) {
                return Some(next.trim().to_string());
            }
        }
        if let Some(rest) = value.strip_prefix("--server=") {
            return Some(rest.trim().to_string());
        }
        if value.starts_with("http://") || value.starts_with("https://") {
            return Some(value.to_string());
        }
        index += 1;
    }
    None
}

pub fn message_box(text: &str, caption: &str) {
    let body = wide(text);
    let title = wide(caption);
    unsafe {
        MessageBoxW(
            ptr::null_mut(),
            body.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
}
