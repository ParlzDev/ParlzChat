#![allow(non_snake_case)]

mod win32;

use raw_window_handle::{
    HandleError, HasWindowHandle, RawWindowHandle, Win32WindowHandle, WindowHandle,
};
use std::num::NonZeroIsize;
use std::ptr;
use win32::*;
use wry::dpi::{PhysicalPosition, PhysicalSize, Position, Size};
use wry::Rect;
use wry::WebViewBuilder;

const TITLE: &str = "Parlz · 聊天客户端";
const CANVAS: u8 = 238;

struct Shell {
    hwnd: HWND,
}

impl HasWindowHandle for Shell {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        let handle = Win32WindowHandle::new(
            NonZeroIsize::new(self.hwnd as isize).expect("窗口句柄为空"),
        );
        Ok(unsafe { WindowHandle::borrow_raw(RawWindowHandle::Win32(handle)) })
    }
}

struct State {
    shell: Shell,
    webview: Option<wry::WebView>,
}

fn client_area(hwnd: HWND) -> (u32, u32) {
    let mut area = RECT::default();
    unsafe {
        GetClientRect(hwnd, &mut area);
    }
    (
        (area.right - area.left).max(1) as u32,
        (area.bottom - area.top).max(1) as u32,
    )
}

fn bounds_for(hwnd: HWND) -> Rect {
    let (width, height) = client_area(hwnd);
    Rect {
        position: Position::Physical(PhysicalPosition::new(0, 0)),
        size: Size::Physical(PhysicalSize::new(width, height)),
    }
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    let pointer = GetWindowLongPtrW(hwnd, -21) as *mut State;
    match message {
        WM_SIZE => {
            if !pointer.is_null() {
                if let Some(webview) = &(*pointer).webview {
                    let _ = webview.set_bounds(bounds_for(hwnd));
                }
            }
            0
        }
        WM_KEYDOWN if wparam == VK_F5 => {
            if !pointer.is_null() {
                if let Some(webview) = &(*pointer).webview {
                    let _ = webview.evaluate_script("location.reload()");
                }
            }
            0
        }
        WM_ERASEBKGND => 1,
        WM_CLOSE => {
            DestroyWindow(hwnd);
            0
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, message, wparam, lparam),
    }
}

fn main() {
    unsafe {
        SetProcessDpiAwarenessContext(-4);
    }

    let server = read_server();
    let version = match parlz_loader::Core::load() {
        Ok(core) => core.version(),
        Err(message) => {
            message_box(
                &format!("{}\n请把 parlz-client.exe 和 parlz_core.dll 放在同一个目录。", message),
                "Parlz",
            );
            return;
        }
    };

    let instance = unsafe { GetModuleHandleW(ptr::null()) };
    let class_name = wide("ParlzClientWindow");
    let background = unsafe { CreateSolidBrush(rgb(CANVAS, 252, 244)) };
    let class = WNDCLASSEXW {
        size: std::mem::size_of::<WNDCLASSEXW>() as u32,
        style: 0,
        wnd_proc: Some(wnd_proc),
        cls_extra: 0,
        wnd_extra: 0,
        instance,
        icon: unsafe { LoadIconW(ptr::null_mut(), IDI_APPLICATION) },
        cursor: unsafe { LoadCursorW(ptr::null_mut(), IDC_ARROW) },
        background,
        menu_name: ptr::null(),
        class_name: class_name.as_ptr(),
        icon_small: unsafe { LoadIconW(ptr::null_mut(), IDI_APPLICATION) },
    };
    unsafe {
        RegisterClassExW(&class);
    }

    let title = wide(TITLE);
    let width = 1180;
    let height = 780;
    let screen_w = unsafe { GetSystemMetrics(0) };
    let screen_h = unsafe { GetSystemMetrics(1) };
    let hwnd = unsafe {
        CreateWindowExW(
            0,
            class_name.as_ptr(),
            title.as_ptr(),
            WS_OVERLAPPEDWINDOW,
            (screen_w - width) / 2,
            (screen_h - height) / 2,
            width,
            height,
            ptr::null_mut(),
            ptr::null_mut(),
            instance,
            ptr::null(),
        )
    };
    if hwnd.is_null() {
        message_box("创建窗口失败", "Parlz");
        return;
    }

    let corner: i32 = DWMWCP_ROUND;
    let dark: i32 = 0;
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &corner as *const i32 as *const _,
            4,
        );
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &dark as *const i32 as *const _,
            4,
        );
    }

    let state = Box::new(State {
        shell: Shell { hwnd },
        webview: None,
    });
    let raw = Box::into_raw(state);
    unsafe {
        SetWindowLongPtrW(hwnd, -21, raw as isize);
    }

    let webview = WebViewBuilder::new()
        .with_url(server.as_str())
        .with_bounds(bounds_for(hwnd))
        .with_background_color((CANVAS, 252, 244, 255))
        .build(&unsafe { &*raw }.shell);
    match webview {
        Ok(webview) => unsafe {
            (*raw).webview = Some(webview);
        },
        Err(error) => {
            message_box(
                &format!("创建内嵌浏览器失败：{}\n请确认已安装 WebView2 运行时。", error),
                "Parlz",
            );
            unsafe {
                drop(Box::from_raw(raw));
            }
            return;
        }
    }

    unsafe {
        ShowWindow(hwnd, SW_SHOW);
        UpdateWindow(hwnd);
    }

    let mut message = unsafe { std::mem::zeroed::<MSG>() };
    loop {
        let result = unsafe { GetMessageW(&mut message, ptr::null_mut(), 0, 0) };
        if result <= 0 {
            break;
        }
        unsafe {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }

    unsafe {
        if !raw.is_null() {
            drop(Box::from_raw(raw));
        }
        DeleteObject(background);
    }
    let _ = version;
}
