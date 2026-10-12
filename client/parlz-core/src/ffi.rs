use crate::api::Session;
use std::ffi::{c_char, CStr, CString};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::Mutex;

pub struct Handle {
    session: Mutex<Session>,
}

fn to_c_string(value: String) -> *mut c_char {
    CString::new(value)
        .unwrap_or_default()
        .into_raw()
}

unsafe fn read_text(pointer: *const c_char) -> String {
    if pointer.is_null() {
        return String::new();
    }
    CStr::from_ptr(pointer).to_string_lossy().to_string()
}

unsafe fn set_error(err: *mut *mut c_char, message: String) {
    if !err.is_null() {
        *err = to_c_string(message);
    }
}

unsafe fn run<F>(handle: *mut Handle, err: *mut *mut c_char, task: F) -> *mut c_char
where
    F: FnOnce(&mut Session) -> Result<String, String>,
{
    if !err.is_null() {
        *err = std::ptr::null_mut();
    }
    if handle.is_null() {
        set_error(err, "无效的句柄".to_string());
        return std::ptr::null_mut();
    }
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        let borrowed = &*handle;
        let mut guard = borrowed
            .session
            .lock()
            .map_err(|_| "内部状态锁失效".to_string())?;
        task(&mut guard)
    }));
    match outcome {
        Ok(Ok(text)) => to_c_string(text),
        Ok(Err(message)) => {
            set_error(err, message);
            std::ptr::null_mut()
        }
        Err(_) => {
            set_error(err, "客户端内部错误".to_string());
            std::ptr::null_mut()
        }
    }
}

unsafe fn run_flag<F>(handle: *mut Handle, err: *mut *mut c_char, task: F) -> i32
where
    F: FnOnce(&mut Session) -> Result<String, String>,
{
    let result = run(handle, err, task);
    if result.is_null() {
        return 1;
    }
    drop(CString::from_raw(result));
    0
}

#[no_mangle]
pub unsafe extern "C" fn parlz_friends_json(handle: *mut Handle, err: *mut *mut c_char) -> *mut c_char {
    run(handle, err, move |session| {
        let value = session.friends()?;
        serde_json::to_string(&value).map_err(|error| error.to_string())
    })
}

#[no_mangle]
pub unsafe extern "C" fn parlz_recall(
    handle: *mut Handle,
    message_id: i64,
    err: *mut *mut c_char,
) -> i32 {
    run_flag(handle, err, move |session| {
        let payload = serde_json::json!({"action": "recall", "id": message_id});
        let body = serde_json::to_string(&payload).map_err(|error| error.to_string())?;
        session.post_json("/api/messages.php", &body)?;
        Ok("ok".to_string())
    })
}

#[no_mangle]
pub unsafe extern "C" fn parlz_post_json(
    handle: *mut Handle,
    path: *const c_char,
    body: *const c_char,
    err: *mut *mut c_char,
) -> *mut c_char {
    let target = read_text(path);
    let payload = read_text(body);
    run(handle, err, move |session| {
        let value = session.post_json(&target, &payload)?;
        serde_json::to_string(&value).map_err(|error| error.to_string())
    })
}

#[no_mangle]
pub unsafe extern "C" fn parlz_friend_action(
    handle: *mut Handle,
    action: *const c_char,
    user_id: i64,
    err: *mut *mut c_char,
) -> *mut c_char {
    let name = read_text(action);
    run(handle, err, move |session| {
        let value = if name == "accept" {
            session.accept_friend(user_id)?
        } else {
            session.request_friend(user_id)?
        };
        serde_json::to_string(&value).map_err(|error| error.to_string())
    })
}

#[no_mangle]
pub unsafe extern "C" fn parlz_version() -> *const c_char {
    static VERSION: &[u8] = b"ParlzRust 0.1.0\0";
    VERSION.as_ptr() as *const c_char
}
#[no_mangle]
pub unsafe extern "C" fn parlz_new(base_url: *const c_char) -> *mut Handle {
    let base = read_text(base_url);
    match Session::new(&base) {
        Ok(session) => Box::into_raw(Box::new(Handle {
            session: Mutex::new(session),
        })),
        Err(_) => std::ptr::null_mut(),
    }
}

#[no_mangle]
pub unsafe extern "C" fn parlz_free(handle: *mut Handle) {
    if !handle.is_null() {
        drop(Box::from_raw(handle));
    }
}

#[no_mangle]
pub unsafe extern "C" fn parlz_free_string(text: *mut c_char) {
    if !text.is_null() {
        drop(CString::from_raw(text));
    }
}

#[no_mangle]
pub unsafe extern "C" fn parlz_login(
    handle: *mut Handle,
    username: *const c_char,
    password: *const c_char,
    err: *mut *mut c_char,
) -> i32 {
    let user = read_text(username);
    let pass = read_text(password);
    run_flag(handle, err, move |session| {
        let value = session.login(&user, &pass)?;
        serde_json::to_string(&value).map_err(|error| error.to_string())
    })
}

#[no_mangle]
pub unsafe extern "C" fn parlz_register(
    handle: *mut Handle,
    username: *const c_char,
    nickname: *const c_char,
    password: *const c_char,
    err: *mut *mut c_char,
) -> i32 {
    let user = read_text(username);
    let nick = read_text(nickname);
    let pass = read_text(password);
    run_flag(handle, err, move |session| {
        let value = session.register(&user, &nick, &pass)?;
        serde_json::to_string(&value).map_err(|error| error.to_string())
    })
}

#[no_mangle]
pub unsafe extern "C" fn parlz_logout(handle: *mut Handle, err: *mut *mut c_char) -> i32 {
    run_flag(handle, err, move |session| {
        session.logout()?;
        Ok("ok".to_string())
    })
}

#[no_mangle]
pub unsafe extern "C" fn parlz_me_json(handle: *mut Handle, err: *mut *mut c_char) -> *mut c_char {
    run(handle, err, move |session| {
        let value = session.profile()?;
        serde_json::to_string(&value).map_err(|error| error.to_string())
    })
}

#[no_mangle]
pub unsafe extern "C" fn parlz_chats_json(handle: *mut Handle, err: *mut *mut c_char) -> *mut c_char {
    run(handle, err, move |session| {
        let value = session.chats()?;
        serde_json::to_string(&value).map_err(|error| error.to_string())
    })
}

#[no_mangle]
pub unsafe extern "C" fn parlz_messages_json(
    handle: *mut Handle,
    chat_id: i64,
    before: i64,
    err: *mut *mut c_char,
) -> *mut c_char {
    run(handle, err, move |session| {
        let value = session.messages(chat_id, before)?;
        serde_json::to_string(&value).map_err(|error| error.to_string())
    })
}

#[no_mangle]
pub unsafe extern "C" fn parlz_send_json(
    handle: *mut Handle,
    chat_id: i64,
    body: *const c_char,
    kind: *const c_char,
    err: *mut *mut c_char,
) -> *mut c_char {
    let text = read_text(body);
    let kind_text = read_text(kind);
    run(handle, err, move |session| {
        let value = session.send(chat_id, &text, &kind_text)?;
        serde_json::to_string(&value).map_err(|error| error.to_string())
    })
}

#[no_mangle]
pub unsafe extern "C" fn parlz_poll_json(
    handle: *mut Handle,
    chat_id: i64,
    after: i64,
    err: *mut *mut c_char,
) -> *mut c_char {
    run(handle, err, move |session| {
        let value = session.poll(chat_id, after, false)?;
        serde_json::to_string(&value).map_err(|error| error.to_string())
    })
}

#[no_mangle]
pub unsafe extern "C" fn parlz_open_dm_json(
    handle: *mut Handle,
    user_id: i64,
    err: *mut *mut c_char,
) -> *mut c_char {
    run(handle, err, move |session| {
        let value = session.open_dm(user_id)?;
        serde_json::to_string(&value).map_err(|error| error.to_string())
    })
}

#[no_mangle]
pub unsafe extern "C" fn parlz_search_json(
    handle: *mut Handle,
    keyword: *const c_char,
    err: *mut *mut c_char,
) -> *mut c_char {
    let query = read_text(keyword);
    run(handle, err, move |session| {
        let value = session.search_users(&query)?;
        serde_json::to_string(&value).map_err(|error| error.to_string())
    })
}

#[no_mangle]
pub unsafe extern "C" fn parlz_upload_image(
    handle: *mut Handle,
    path: *const c_char,
    err: *mut *mut c_char,
) -> *mut c_char {
    let file = read_text(path);
    run(handle, err, move |session| session.upload_image(&file))
}
