use std::ffi::{c_char, c_void, CStr, CString};
use std::path::PathBuf;
use std::ptr;

pub mod time;

#[link(name = "kernel32")]
extern "system" {
    fn LoadLibraryW(name: *const u16) -> *mut c_void;
    fn GetProcAddress(module: *mut c_void, name: *const u8) -> *mut c_void;
    fn GetModuleFileNameW(module: *mut c_void, buffer: *mut u16, size: u32) -> u32;
}

pub type Handle = *mut c_void;

pub struct Core {
    version: unsafe extern "C" fn() -> *const c_char,
    new: unsafe extern "C" fn(*const c_char) -> Handle,
    free: unsafe extern "C" fn(Handle),
    free_string: unsafe extern "C" fn(*mut c_char),
    pub login: unsafe extern "C" fn(Handle, *const c_char, *const c_char, *mut *mut c_char) -> i32,
    pub register:
        unsafe extern "C" fn(Handle, *const c_char, *const c_char, *const c_char, *mut *mut c_char) -> i32,
    pub logout: unsafe extern "C" fn(Handle, *mut *mut c_char) -> i32,
    pub me_json: unsafe extern "C" fn(Handle, *mut *mut c_char) -> *mut c_char,
    pub chats_json: unsafe extern "C" fn(Handle, *mut *mut c_char) -> *mut c_char,
    pub messages_json:
        unsafe extern "C" fn(Handle, i64, i64, *mut *mut c_char) -> *mut c_char,
    pub send_json:
        unsafe extern "C" fn(Handle, i64, *const c_char, *const c_char, *mut *mut c_char) -> *mut c_char,
    pub poll_json: unsafe extern "C" fn(Handle, i64, i64, *mut *mut c_char) -> *mut c_char,
    pub open_dm_json: unsafe extern "C" fn(Handle, i64, *mut *mut c_char) -> *mut c_char,
    pub search_json: unsafe extern "C" fn(Handle, *const c_char, *mut *mut c_char) -> *mut c_char,
    pub friends_json: unsafe extern "C" fn(Handle, *mut *mut c_char) -> *mut c_char,
    pub recall: unsafe extern "C" fn(Handle, i64, *mut *mut c_char) -> i32,
    pub post_json:
        unsafe extern "C" fn(Handle, *const c_char, *const c_char, *mut *mut c_char) -> *mut c_char,
    pub friend_action:
        unsafe extern "C" fn(Handle, *const c_char, i64, *mut *mut c_char) -> *mut c_char,
    pub upload_image: unsafe extern "C" fn(Handle, *const c_char, *mut *mut c_char) -> *mut c_char,
}

unsafe impl Send for Core {}
unsafe impl Sync for Core {}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn exe_dir() -> PathBuf {
    let mut buffer = vec![0u16; 32768];
    let length = unsafe { GetModuleFileNameW(ptr::null_mut(), buffer.as_mut_ptr(), buffer.len() as u32) };
    if length == 0 {
        return PathBuf::from(".");
    }
    let path = String::from_utf16_lossy(&buffer[..length as usize]);
    PathBuf::from(path)
        .parent()
        .map(|dir| dir.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

macro_rules! symbol {
    ($module:expr, $name:literal, $ty:ty) => {{
        let pointer = unsafe { GetProcAddress($module, concat!($name, "\0").as_ptr()) };
        if pointer.is_null() {
            return Err(format!("parlz_core.dll 缺少导出函数 {}", $name));
        }
        unsafe { std::mem::transmute::<*mut c_void, $ty>(pointer) }
    }};
}

impl Core {
    pub fn load() -> Result<Self, String> {
        let directory = exe_dir();
        let mut module = ptr::null_mut();
        for candidate in [
            directory.join("parlz_core.dll"),
            PathBuf::from("parlz_core.dll"),
        ] {
            let name = wide(&candidate.to_string_lossy());
            module = unsafe { LoadLibraryW(name.as_ptr()) };
            if !module.is_null() {
                break;
            }
        }
        if module.is_null() {
            return Err(format!(
                "加载 parlz_core.dll 失败（找过 {}）",
                directory.display()
            ));
        }
        Ok(Self {
            version: symbol!(
                module,
                "parlz_version",
                unsafe extern "C" fn() -> *const c_char
            ),
            new: symbol!(module, "parlz_new", unsafe extern "C" fn(*const c_char) -> Handle),
            free: symbol!(module, "parlz_free", unsafe extern "C" fn(Handle)),
            free_string: symbol!(
                module,
                "parlz_free_string",
                unsafe extern "C" fn(*mut c_char)
            ),
            login: symbol!(
                module,
                "parlz_login",
                unsafe extern "C" fn(Handle, *const c_char, *const c_char, *mut *mut c_char) -> i32
            ),
            register: symbol!(
                module,
                "parlz_register",
                unsafe extern "C" fn(
                    Handle,
                    *const c_char,
                    *const c_char,
                    *const c_char,
                    *mut *mut c_char
                ) -> i32
            ),
            logout: symbol!(
                module,
                "parlz_logout",
                unsafe extern "C" fn(Handle, *mut *mut c_char) -> i32
            ),
            me_json: symbol!(
                module,
                "parlz_me_json",
                unsafe extern "C" fn(Handle, *mut *mut c_char) -> *mut c_char
            ),
            chats_json: symbol!(
                module,
                "parlz_chats_json",
                unsafe extern "C" fn(Handle, *mut *mut c_char) -> *mut c_char
            ),
            messages_json: symbol!(
                module,
                "parlz_messages_json",
                unsafe extern "C" fn(Handle, i64, i64, *mut *mut c_char) -> *mut c_char
            ),
            send_json: symbol!(
                module,
                "parlz_send_json",
                unsafe extern "C" fn(Handle, i64, *const c_char, *const c_char, *mut *mut c_char)
                    -> *mut c_char
            ),
            poll_json: symbol!(
                module,
                "parlz_poll_json",
                unsafe extern "C" fn(Handle, i64, i64, *mut *mut c_char) -> *mut c_char
            ),
            open_dm_json: symbol!(
                module,
                "parlz_open_dm_json",
                unsafe extern "C" fn(Handle, i64, *mut *mut c_char) -> *mut c_char
            ),
            search_json: symbol!(
                module,
                "parlz_search_json",
                unsafe extern "C" fn(Handle, *const c_char, *mut *mut c_char) -> *mut c_char
            ),
            friends_json: symbol!(
                module,
                "parlz_friends_json",
                unsafe extern "C" fn(Handle, *mut *mut c_char) -> *mut c_char
            ),
            recall: symbol!(
                module,
                "parlz_recall",
                unsafe extern "C" fn(Handle, i64, *mut *mut c_char) -> i32
            ),
            post_json: symbol!(
                module,
                "parlz_post_json",
                unsafe extern "C" fn(Handle, *const c_char, *const c_char, *mut *mut c_char)
                    -> *mut c_char
            ),
            friend_action: symbol!(
                module,
                "parlz_friend_action",
                unsafe extern "C" fn(Handle, *const c_char, i64, *mut *mut c_char) -> *mut c_char
            ),
            upload_image: symbol!(
                module,
                "parlz_upload_image",
                unsafe extern "C" fn(Handle, *const c_char, *mut *mut c_char) -> *mut c_char
            ),
        })
    }

    pub fn version(&self) -> String {
        let pointer = unsafe { (self.version)() };
        if pointer.is_null() {
            return "未知".to_string();
        }
        unsafe { CStr::from_ptr(pointer).to_string_lossy().to_string() }
    }

    pub fn open(&self, base: &str) -> Result<Handle, String> {
        let url = CString::new(base).map_err(|_| "服务器地址不合法".to_string())?;
        let handle = unsafe { (self.new)(url.as_ptr()) };
        if handle.is_null() {
            return Err("初始化核心失败（服务器地址不合法？）".to_string());
        }
        Ok(handle)
    }

    pub fn close(&self, handle: Handle) {
        if !handle.is_null() {
            unsafe { (self.free)(handle) };
        }
    }

    pub fn take(&self, pointer: *mut c_char) -> String {
        if pointer.is_null() {
            return String::new();
        }
        let text = unsafe { CStr::from_ptr(pointer).to_string_lossy().to_string() };
        unsafe { (self.free_string)(pointer) };
        text
    }

    pub fn take_error(&self, err: *mut *mut c_char) -> String {
        let message = self.take(unsafe { *err });
        if message.is_empty() {
            "未知错误".to_string()
        } else {
            message
        }
    }

    pub fn json(&self, pointer: *mut c_char, err: *mut *mut c_char) -> Result<serde_json::Value, String> {
        if pointer.is_null() {
            return Err(self.take_error(err));
        }
        let text = self.take(pointer);
        serde_json::from_str(&text).map_err(|error| format!("解析返回失败: {}", error))
    }
}
