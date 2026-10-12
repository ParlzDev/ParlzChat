use parlz_loader as dll;

use dll::{Core, Handle};
use serde_json::Value;
use std::ffi::{c_char, c_void, CString};
use std::io::{self, Write};
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Arc, Mutex};

const RESET: &str = "\x1b[0m";
const GREEN: &str = "\x1b[38;2;0;255;106m";
const FAINT: &str = "\x1b[38;2;220;255;233m";
const DIM: &str = "\x1b[38;2;110;165;135m";
const BOLD: &str = "\x1b[1m";

const STICKERS: [&str; 24] = [
    "smile", "grin", "laugh", "wink", "love", "cool", "cry", "angry", "surprise", "sleep", "heart",
    "star", "smug", "sneak", "pout", "doubt", "speechless", "fear", "clap", "rocket", "melon",
    "moon", "fire", "cake",
];

#[link(name = "kernel32")]
extern "system" {
    fn GetStdHandle(kind: u32) -> *mut c_void;
    fn GetConsoleMode(handle: *mut c_void, mode: *mut u32) -> i32;
    fn SetConsoleMode(handle: *mut c_void, mode: u32) -> i32;
}

fn enable_ansi() {
    unsafe {
        let handle = GetStdHandle(0xFFFF_FFF5);
        let mut mode = 0u32;
        if GetConsoleMode(handle, &mut mode) != 0 {
            SetConsoleMode(handle, mode | 0x0004);
        }
    }
}

use parlz_loader::time::{local_offset, stamp};

struct State {
    core: Core,
    handle: Handle,
    logged_in: AtomicBool,
    active_chat: AtomicI64,
    last_id: AtomicI64,
    stop: AtomicBool,
    output: Mutex<()>,
}

unsafe impl Send for State {}
unsafe impl Sync for State {}

fn cstring(text: &str) -> CString {
    CString::new(text).unwrap_or_default()
}

impl State {
    fn call_json(
        &self,
        call: impl FnOnce(*mut *mut c_char) -> *mut c_char,
    ) -> Result<Value, String> {
        let mut err: *mut c_char = std::ptr::null_mut();
        let pointer = call(&mut err);
        self.core.json(pointer, &mut err)
    }

    fn call_flag(
        &self,
        call: impl FnOnce(*mut *mut c_char) -> i32,
    ) -> Result<(), String> {
        let mut err: *mut c_char = std::ptr::null_mut();
        let code = call(&mut err);
        if code == 0 {
            Ok(())
        } else {
            Err(self.core.take_error(&mut err))
        }
    }

    fn nickname(&self) -> String {
        self.me_json()
            .ok()
            .and_then(|value| {
                value
                    .get("user")
                    .and_then(|user| user.get("nickname"))
                    .and_then(Value::as_str)
                    .map(|text| text.to_string())
            })
            .unwrap_or_default()
    }

    fn me_json(&self) -> Result<Value, String> {
        let handle = self.handle;
        let core = &self.core;
        self.call_json(move |err| unsafe { (core.me_json)(handle, err) })
    }

    fn print_messages(&self, chat_id: i64, limit: usize, header: bool) {
        let handle = self.handle;
        let core = &self.core;
        let value = match self.call_json(move |err| unsafe {
            (core.messages_json)(handle, chat_id, 0, err)
        }) {
            Ok(value) => value,
            Err(message) => {
                println!("{}✗ {}{}", DIM, message, RESET);
                return;
            }
        };
        let offset = local_offset();
        let messages = value
            .get("messages")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let start = messages.len().saturating_sub(limit);
        if header {
            println!(
                "{}── 打开 #{}，共 {} 条，显示最近 {} 条 ──{}",
                DIM,
                chat_id,
                messages.len(),
                messages.len() - start,
                RESET
            );
        }
        for message in &messages[start..] {
            print_message(message, offset);
        }
        if let Some(last) = messages.last() {
            if let Some(id) = last.get("id").and_then(Value::as_i64) {
                self.last_id.store(id, Ordering::SeqCst);
            }
        }
    }
}

fn print_message(message: &Value, offset: i64) {
    let kind = message
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("text");
    let author = message
        .get("author")
        .and_then(|author| author.get("nickname"))
        .and_then(Value::as_str)
        .unwrap_or("?");
    let body = message.get("body").and_then(Value::as_str).unwrap_or("");
    let at = message
        .get("created_at")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let text = match kind {
        "image" => format!("[图片] {}", body),
        "sticker" => format!("[表情] {}", body),
        "recalled" => "撤回了一条消息".to_string(),
        "merged" => "[聊天记录]".to_string(),
        "system" => body.to_string(),
        _ => body.to_string(),
    };
    if kind == "system" {
        println!("{}[{}] {}{}", DIM, stamp(at, offset, false), text, RESET);
        return;
    }
    println!(
        "{}[{}]{} {}{}{}: {}{}",
        DIM,
        stamp(at, offset, false),
        RESET,
        GREEN,
        author,
        RESET,
        FAINT,
        text
    );
}

fn poll_loop(state: Arc<State>) {
    while !state.stop.load(Ordering::SeqCst) {
        std::thread::sleep(std::time::Duration::from_millis(2000));
        if !state.logged_in.load(Ordering::SeqCst) {
            continue;
        }
        let chat_id = state.active_chat.load(Ordering::SeqCst);
        let after = state.last_id.load(Ordering::SeqCst);
        let handle = state.handle;
        let core = &state.core;
        let value = match state.call_json(move |err| unsafe {
            (core.poll_json)(handle, chat_id, after, err)
        }) {
            Ok(value) => value,
            Err(_) => continue,
        };

        if chat_id > 0 {
            let offset = local_offset();
            if let Some(messages) = value.get("messages").and_then(Value::as_array) {
                if !messages.is_empty() {
                    let _guard = state.output.lock();
                    for message in messages {
                        println!();
                        println!("{}● 新消息{}", GREEN, RESET);
                        print_message(message, offset);
                        if let Some(id) = message.get("id").and_then(Value::as_i64) {
                            state.last_id.store(id, Ordering::SeqCst);
                        }
                    }
                    print!("{}> {} ", GREEN, RESET);
                    let _ = io::stdout().flush();
                }
            }
        }

        if let Some(chats) = value.get("chats").and_then(Value::as_array) {
            let unread: i64 = chats
                .iter()
                .map(|chat| chat.get("unread").and_then(Value::as_i64).unwrap_or(0))
                .sum();
            if unread > 0 {
                let _guard = state.output.lock();
                print!("\r{}（未读 {} 条，用 /chats 看看）{}", DIM, unread, RESET);
                let _ = io::stdout().flush();
            }
        }
    }
}

fn print_help() {
    println!("{BOLD}Parlz 客户端{}", RESET);
    println!("  parlz-client [--server http://host:port]");
    println!("{DIM}命令：{RESET}");
    println!("  /login <用户名> <密码>            登录");
    println!("  /register <用户名> <昵称> <密码>  注册并登录");
    println!("  /logout                          退出登录");
    println!("  /me                              我的资料（含 UID）");
    println!("  /chats                           会话列表（含 UID 和未读数）");
    println!("  /open <会话号|A00001|U00004>     打开群聊或与某人的私聊");
    println!("  /history [条数]                  查看当前会话历史（默认 20）");
    println!("  /send <内容>                     发消息（支持 [微笑] 这类表情标记）");
    println!("  /sticker <名字>                  发一个表情，/stickers 看全部");
    println!("  /image <文件路径>                发送本地图片");
    println!("  /find <关键字>                   搜索用户（用户名/昵称/UID）");
    println!("  /quit                            退出");
}

fn read_config() -> Option<String> {
    let path = dll::exe_dir().join("parlz.conf");
    let text = std::fs::read_to_string(path).ok()?;
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("server=") {
            let value = rest.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn main() {
    enable_ansi();
    let mut server = String::new();
    let args: Vec<String> = std::env::args().collect();
    let mut index = 1;
    while index < args.len() {
        match args[index].as_str() {
            "--server" | "-s" => {
                if index + 1 < args.len() {
                    server = args[index + 1].clone();
                    index += 2;
                } else {
                    index += 1;
                }
            }
            "--help" | "-h" => {
                print_help();
                return;
            }
            other => {
                if server.is_empty() {
                    server = other.to_string();
                }
                index += 1;
            }
        }
    }
    if server.is_empty() {
        server = read_config().unwrap_or_else(|| "http://127.0.0.1:8137".to_string());
    }

    let core = match Core::load() {
        Ok(core) => core,
        Err(message) => {
            println!("{GREEN}✗ {}{RESET}", message);
            println!("{DIM}提示：本体和 parlz_core.dll 必须放在同一个目录{RESET}");
            return;
        }
    };
    let handle = match core.open(&server) {
        Ok(handle) => handle,
        Err(message) => {
            println!("{GREEN}✗ {}{RESET}", message);
            return;
        }
    };

    println!(
        "{GREEN}{BOLD}Parlz 客户端{RESET} {DIM}(核心 {}){RESET}",
        core.version()
    );
    println!("{DIM}服务器 {}{RESET}", server);
    println!("{DIM}输入 /help 看命令，/quit 退出{RESET}");

    let state = Arc::new(State {
        core,
        handle,
        logged_in: AtomicBool::new(false),
        active_chat: AtomicI64::new(0),
        last_id: AtomicI64::new(0),
        stop: AtomicBool::new(false),
        output: Mutex::new(()),
    });

    {
        let shared = Arc::clone(&state);
        std::thread::spawn(move || poll_loop(shared));
    }

    let stdin = io::stdin();
    loop {
        print!("{GREEN}>{RESET} ");
        let _ = io::stdout().flush();
        let mut line = String::new();
        if stdin.read_line(&mut line).unwrap_or(0) == 0 {
            break;
        }
        let input = line.trim();
        if input.is_empty() {
            continue;
        }
        if input == "/quit" || input == "/exit" {
            break;
        }
        handle_command(&state, input);
    }

    state.stop.store(true, Ordering::SeqCst);
    state.core.close(state.handle);
    println!("{DIM}再见{RESET}");
}

fn handle_command(state: &State, input: &str) {
    let (command, rest) = match input.split_once(char::is_whitespace) {
        Some((head, tail)) => (head, tail.trim()),
        None => (input, ""),
    };
    let arguments: Vec<&str> = rest.split_whitespace().collect();

    match command {
        "/help" | "/?" => print_help(),
        "/login" => {
            if arguments.len() < 2 {
                println!("{DIM}用法：/login <用户名> <密码>{RESET}");
                return;
            }
            let user = cstring(arguments[0]);
            let pass = cstring(arguments[1]);
            let handle = state.handle;
            let core = &state.core;
            match state.call_flag(move |err| unsafe {
                (core.login)(handle, user.as_ptr(), pass.as_ptr(), err)
            }) {
                Ok(()) => {
                    state.logged_in.store(true, Ordering::SeqCst);
                    println!("{GREEN}✓ 已登录 {}{RESET}", state.nickname());
                    println!("{DIM}用 /chats 看会话{RESET}");
                }
                Err(message) => println!("{GREEN}✗ {}{RESET}", message),
            }
        }
        "/register" => {
            if arguments.len() < 3 {
                println!("{DIM}用法：/register <用户名> <昵称> <密码>{RESET}");
                return;
            }
            let user = cstring(arguments[0]);
            let nick = cstring(arguments[1]);
            let pass = cstring(arguments[2]);
            let handle = state.handle;
            let core = &state.core;
            match state.call_flag(move |err| unsafe {
                (core.register)(handle, user.as_ptr(), nick.as_ptr(), pass.as_ptr(), err)
            }) {
                Ok(()) => {
                    state.logged_in.store(true, Ordering::SeqCst);
                    println!("{GREEN}✓ 注册成功，已登录 {}{RESET}", state.nickname());
                }
                Err(message) => println!("{GREEN}✗ {}{RESET}", message),
            }
        }
        "/logout" => {
            let handle = state.handle;
            let core = &state.core;
            match state.call_flag(move |err| unsafe { (core.logout)(handle, err) }) {
                Ok(()) => {
                    state.logged_in.store(false, Ordering::SeqCst);
                    state.active_chat.store(0, Ordering::SeqCst);
                    state.last_id.store(0, Ordering::SeqCst);
                    println!("{GREEN}✓ 已退出登录{RESET}");
                }
                Err(message) => println!("{GREEN}✗ {}{RESET}", message),
            }
        }
        "/me" => {
            let handle = state.handle;
            let core = &state.core;
            match state.call_json(move |err| unsafe { (core.me_json)(handle, err) }) {
                Ok(value) => {
                    let user = value.get("user").cloned().unwrap_or(Value::Null);
                    if user.is_null() {
                        println!("{DIM}当前未登录{RESET}");
                        return;
                    }
                    println!(
                        "{BOLD}{}{RESET} {DIM}@{}{RESET} {GREEN}{}{RESET}",
                        user.get("nickname").and_then(Value::as_str).unwrap_or(""),
                        user.get("username").and_then(Value::as_str).unwrap_or(""),
                        user.get("uid").and_then(Value::as_str).unwrap_or("")
                    );
                    let bio = user.get("bio").and_then(Value::as_str).unwrap_or("");
                    if !bio.is_empty() {
                        println!("{DIM}{}{RESET}", bio);
                    }
                }
                Err(message) => println!("{GREEN}✗ {}{RESET}", message),
            }
        }
        "/chats" => {
            let handle = state.handle;
            let core = &state.core;
            match state.call_json(move |err| unsafe { (core.chats_json)(handle, err) }) {
                Ok(value) => {
                    let chats = value
                        .get("chats")
                        .and_then(Value::as_array)
                        .cloned()
                        .unwrap_or_default();
                    if chats.is_empty() {
                        println!("{DIM}还没有会话{RESET}");
                        return;
                    }
                    for chat in &chats {
                        let unread = chat.get("unread").and_then(Value::as_i64).unwrap_or(0);
                        let marker = if unread > 0 {
                            format!("{GREEN}未读 {}{RESET}", unread)
                        } else {
                            String::new()
                        };
                        let preview_value = chat.get("last");
                        let preview_kind = preview_value
                            .and_then(|last| last.get("kind"))
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        let preview_body = preview_value
                            .and_then(|last| last.get("body"))
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        let preview: String = match preview_kind {
                            "image" => "[图片]".to_string(),
                            "sticker" => "[表情]".to_string(),
                            "merged" => "[聊天记录]".to_string(),
                            "recalled" => "撤回了一条消息".to_string(),
                            _ => preview_body.chars().take(18).collect(),
                        };
                        println!(
                            "{DIM}#{:<3}{RESET} {GREEN}{:<7}{RESET} {:<10} {DIM}{}{RESET} {} {}",
                            chat.get("id").and_then(Value::as_i64).unwrap_or(0),
                            chat.get("uid").and_then(Value::as_str).unwrap_or(""),
                            chat.get("title").and_then(Value::as_str).unwrap_or(""),
                            if chat.get("type").and_then(Value::as_str) == Some("group") {
                                format!("群聊 {} 人", chat.get("members").and_then(Value::as_i64).unwrap_or(0))
                            } else {
                                "私聊".to_string()
                            },
                            preview,
                            marker
                        );
                    }
                }
                Err(message) => println!("{GREEN}✗ {}{RESET}", message),
            }
        }
        "/open" => {
            let target = match arguments.first() {
                Some(value) => *value,
                None => {
                    println!("{DIM}用法：/open <会话号|A00001|U00004>{RESET}");
                    return;
                }
            };
            let chat_id = if let Some(rest) = target.strip_prefix(['U', 'u']) {
                match rest.parse::<i64>() {
                    Ok(user_id) => {
                        let handle = state.handle;
                        let core = &state.core;
                        match state.call_json(move |err| unsafe {
                            (core.open_dm_json)(handle, user_id, err)
                        }) {
                            Ok(value) => value.get("chat_id").and_then(Value::as_i64).unwrap_or(0),
                            Err(message) => {
                                println!("{GREEN}✗ {}{RESET}", message);
                                return;
                            }
                        }
                    }
                    Err(_) => {
                        println!("{GREEN}✗ UID 格式不对{RESET}");
                        return;
                    }
                }
            } else if let Some(rest) = target.strip_prefix(['A', 'a']) {
                rest.parse::<i64>().unwrap_or(0)
            } else {
                target.parse::<i64>().unwrap_or(0)
            };
            if chat_id <= 0 {
                println!("{GREEN}✗ 找不到这个会话{RESET}");
                return;
            }
            state.active_chat.store(chat_id, Ordering::SeqCst);
            state.last_id.store(0, Ordering::SeqCst);
            state.print_messages(chat_id, 20, true);
        }
        "/history" => {
            let chat_id = state.active_chat.load(Ordering::SeqCst);
            if chat_id <= 0 {
                println!("{DIM}先用 /open 打开一个会话{RESET}");
                return;
            }
            let limit = arguments
                .first()
                .and_then(|value| value.parse::<usize>().ok())
                .unwrap_or(20);
            state.print_messages(chat_id, limit, false);
        }
        "/send" => {
            let chat_id = state.active_chat.load(Ordering::SeqCst);
            if chat_id <= 0 {
                println!("{DIM}先用 /open 打开一个会话{RESET}");
                return;
            }
            if rest.is_empty() {
                println!("{DIM}用法：/send <内容>{RESET}");
                return;
            }
            let body = cstring(rest);
            let kind = cstring("text");
            let handle = state.handle;
            let core = &state.core;
            match state.call_json(move |err| unsafe {
                (core.send_json)(handle, chat_id, body.as_ptr(), kind.as_ptr(), err)
            }) {
                Ok(value) => {
                    let offset = local_offset();
                    let _guard = state.output.lock();
                    print!("{DIM}我:{RESET} ");
                    if let Some(message) = value.get("message") {
                        print_message(message, offset);
                    }
                }
                Err(message) => println!("{GREEN}✗ {}{RESET}", message),
            }
        }
        "/sticker" => {
            let chat_id = state.active_chat.load(Ordering::SeqCst);
            if chat_id <= 0 {
                println!("{DIM}先用 /open 打开一个会话{RESET}");
                return;
            }
            let name = match arguments.first() {
                Some(value) => (*value).to_string(),
                None => {
                    println!("{DIM}用法：/sticker <名字>，可选：{}", STICKERS.join(" "));
                    print!("{RESET}");
                    return;
                }
            };
            if !STICKERS.contains(&name.as_str()) {
                println!("{GREEN}✗ 没有这个表情，可选：{}{RESET}", STICKERS.join(" "));
                return;
            }
            let body = cstring(&name);
            let kind = cstring("sticker");
            let handle = state.handle;
            let core = &state.core;
            match state.call_json(move |err| unsafe {
                (core.send_json)(handle, chat_id, body.as_ptr(), kind.as_ptr(), err)
            }) {
                Ok(_) => println!("{GREEN}✓ 已发送表情 [{}]{RESET}", name),
                Err(message) => println!("{GREEN}✗ {}{RESET}", message),
            }
        }
        "/stickers" => println!("{DIM}可用表情：{}{RESET}", STICKERS.join(" ")),
        "/image" => {
            let chat_id = state.active_chat.load(Ordering::SeqCst);
            if chat_id <= 0 {
                println!("{DIM}先用 /open 打开一个会话{RESET}");
                return;
            }
            let path = match arguments.first() {
                Some(value) => (*value).to_string(),
                None => {
                    println!("{DIM}用法：/image <文件路径>{RESET}");
                    return;
                }
            };
            let file = cstring(&path);
            let handle = state.handle;
            let core = &state.core;
            let mut err: *mut c_char = std::ptr::null_mut();
            let pointer = unsafe { (core.upload_image)(handle, file.as_ptr(), &mut err) };
            let name = if pointer.is_null() {
                println!("{GREEN}✗ {}{RESET}", state.core.take_error(&mut err));
                return;
            } else {
                state.core.take(pointer)
            };
            if name.is_empty() {
                println!("{GREEN}✗ 上传失败{RESET}");
                return;
            }
            let body = cstring(&name);
            let kind = cstring("image");
            let handle = state.handle;
            let core = &state.core;
            match state.call_json(move |err| unsafe {
                (core.send_json)(handle, chat_id, body.as_ptr(), kind.as_ptr(), err)
            }) {
                Ok(_) => println!("{GREEN}✓ 图片已发送（{}）{RESET}", name),
                Err(message) => println!("{GREEN}✗ {}{RESET}", message),
            }
        }
        "/find" => {
            if rest.is_empty() {
                println!("{DIM}用法：/find <关键字或 UID>{RESET}");
                return;
            }
            let keyword = cstring(rest);
            let handle = state.handle;
            let core = &state.core;
            match state.call_json(move |err| unsafe {
                (core.search_json)(handle, keyword.as_ptr(), err)
            }) {
                Ok(value) => {
                    let results = value
                        .get("results")
                        .and_then(Value::as_array)
                        .cloned()
                        .unwrap_or_default();
                    if results.is_empty() {
                        println!("{DIM}没有找到{RESET}");
                        return;
                    }
                    for user in &results {
                        println!(
                            "{GREEN}{:<7}{RESET} {} {DIM}@{}{RESET} {}",
                            user.get("uid").and_then(Value::as_str).unwrap_or(""),
                            user.get("nickname").and_then(Value::as_str).unwrap_or(""),
                            user.get("username").and_then(Value::as_str).unwrap_or(""),
                            user.get("relation").and_then(Value::as_str).unwrap_or("")
                        );
                    }
                }
                Err(message) => println!("{GREEN}✗ {}{RESET}", message),
            }
        }
        other => println!("{DIM}不认识命令 {}，输入 /help 看帮助{RESET}", other),
    }
}
