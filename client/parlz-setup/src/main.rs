use std::ffi::c_void;
use std::path::{Path, PathBuf};
use std::process::Command;

const APP_NAME: &str = "Parlz";
const APP_VERSION: &str = "0.1.0";
const APP_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Parlz";
const DEFAULT_SERVER: &str = "http://127.0.0.1:8137";
const PAYLOAD: [&str; 4] = ["parlz-client.exe", "parlz-cli.exe", "parlz_core.dll", "parlz-setup.exe"];

const RESET: &str = "\x1b[0m";
const GREEN: &str = "\x1b[38;2;0;255;106m";
const DIM: &str = "\x1b[38;2;110;165;135m";
const BOLD: &str = "\x1b[1m";

#[link(name = "kernel32")]
extern "system" {
    fn GetStdHandle(kind: u32) -> *mut c_void;
    fn GetConsoleMode(handle: *mut c_void, mode: *mut u32) -> i32;
    fn SetConsoleMode(handle: *mut c_void, mode: u32) -> i32;
    fn GetModuleFileNameW(module: *mut c_void, buffer: *mut u16, size: u32) -> u32;
}

#[link(name = "advapi32")]
extern "system" {
    fn RegCreateKeyExW(
        root: *mut c_void,
        path: *const u16,
        reserved: u32,
        class: *const u16,
        options: u32,
        access: u32,
        security: *const c_void,
        result: *mut *mut c_void,
        disposition: *mut u32,
    ) -> i32;
    fn RegSetValueExW(
        key: *mut c_void,
        name: *const u16,
        reserved: u32,
        kind: u32,
        data: *const u8,
        size: u32,
    ) -> i32;
    fn RegDeleteTreeW(key: *mut c_void, path: *const u16) -> i32;
    fn RegCloseKey(key: *mut c_void) -> i32;
}

const HKEY_CURRENT_USER: *mut c_void = 0x8000_0001usize as *mut c_void;
const KEY_WRITE: u32 = 0x2_0006;
const REG_SZ: u32 = 1;

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
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

fn self_dir() -> PathBuf {
    let mut buffer = vec![0u16; 32768];
    let length = unsafe { GetModuleFileNameW(std::ptr::null_mut(), buffer.as_mut_ptr(), buffer.len() as u32) };
    if length == 0 {
        return PathBuf::from(".");
    }
    let text = String::from_utf16_lossy(&buffer[..length as usize]);
    Path::new(&text)
        .parent()
        .map(|dir| dir.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn environment(name: &str) -> Option<PathBuf> {
    std::env::var(name).ok().map(PathBuf::from)
}

fn run(command: &mut Command) -> bool {
    command
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn shortcut(link: &Path, target: &Path) -> bool {
    let script = format!(
        "$w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut('{}'); $s.TargetPath = '{}'; $s.WorkingDirectory = '{}'; $s.IconLocation = '{}'; $s.Description = 'Parlz 聊天客户端'; $s.Save()",
        link.display(),
        target.display(),
        target.parent().map(|dir| dir.display().to_string()).unwrap_or_default(),
        target.display()
    );
    let candidates = [
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        "powershell.exe",
        "pwsh.exe",
    ];
    candidates.iter().any(|program| {
        run(Command::new(program).args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ]))
    })
}

fn registry_write(values: &[(&str, &str)]) -> bool {
    unsafe {
        let path = wide(APP_KEY);
        let mut key: *mut c_void = std::ptr::null_mut();
        let mut disposition = 0u32;
        let status = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            path.as_ptr(),
            0,
            std::ptr::null(),
            0,
            KEY_WRITE,
            std::ptr::null(),
            &mut key,
            &mut disposition,
        );
        if status != 0 {
            return false;
        }
        let mut ok = true;
        for (name, value) in values {
            let wide_name = wide(name);
            let wide_value = wide(value);
            let bytes = std::slice::from_raw_parts(
                wide_value.as_ptr() as *const u8,
                wide_value.len() * 2,
            );
            let written = RegSetValueExW(
                key,
                wide_name.as_ptr(),
                0,
                REG_SZ,
                bytes.as_ptr(),
                bytes.len() as u32,
            );
            if written != 0 {
                ok = false;
            }
        }
        RegCloseKey(key);
        ok
    }
}

fn registry_delete() {
    unsafe {
        let path = wide(APP_KEY);
        RegDeleteTreeW(HKEY_CURRENT_USER, path.as_ptr());
    }
}

fn print_help() {
    println!("{BOLD}Parlz 客户端安装程序{RESET} {DIM}v{APP_VERSION}{RESET}");
    println!("  parlz-setup                     安装到 %LOCALAPPDATA%\\Programs\\Parlz");
    println!("  parlz-setup --dir <目录>         安装到指定目录");
    println!("  parlz-setup --server <地址>      指定默认服务器（默认 {DEFAULT_SERVER}）");
    println!("  parlz-setup --uninstall          卸载");
    println!("  parlz-setup --help               显示帮助");
}

fn copy_payload(source: &Path, target: &Path) -> Result<(), String> {
    for name in PAYLOAD {
        let from = source.join(name);
        if !from.is_file() {
            return Err(format!(
                "缺少文件 {}，请把安装程序和 parlz-client.exe、parlz_core.dll 放在同一个目录",
                from.display()
            ));
        }
    }
    std::fs::create_dir_all(target).map_err(|error| format!("创建 {} 失败: {}", target.display(), error))?;
    for name in PAYLOAD {
        let from = source.join(name);
        let to = target.join(name);
        std::fs::copy(&from, &to)
            .map_err(|error| format!("复制 {} 失败: {}", name, error))?;
    }
    Ok(())
}

fn install(source: &Path, target: &Path, server: &str) -> Result<(), String> {
    println!("{DIM}安装目录 {}{RESET}", target.display());
    copy_payload(source, target)?;

    let config = target.join("parlz.conf");
    std::fs::write(&config, format!("server={}\n", server))
        .map_err(|error| format!("写入配置失败: {}", error))?;

    let exe = target.join("parlz-client.exe");
    let mut made = Vec::new();

    if let Some(appdata) = environment("APPDATA") {
        let link = appdata
            .join("Microsoft\\Windows\\Start Menu\\Programs")
            .join(format!("{}.lnk", APP_NAME));
        if shortcut(&link, &exe) {
            made.push(link);
        }
    }
    if let Some(profile) = environment("USERPROFILE") {
        let link = profile.join("Desktop").join(format!("{}.lnk", APP_NAME));
        if shortcut(&link, &exe) {
            made.push(link);
        }
    }

    let uninstall = target.join("parlz-setup.exe");
    let ok = registry_write(&[
        ("DisplayName", "Parlz 聊天客户端"),
        ("DisplayVersion", APP_VERSION),
        ("Publisher", "Parlz"),
        ("InstallLocation", &target.display().to_string()),
        ("UninstallString", &format!("\"{}\" --uninstall", uninstall.display())),
        ("DisplayIcon", &exe.display().to_string()),
        ("NoModify", "1"),
        ("NoRepair", "1"),
    ]);

    println!("{GREEN}✓ 已安装到 {}{RESET}", target.display());
    for link in &made {
        println!("{DIM}  快捷方式 {}{RESET}", link.display());
    }
    println!("{DIM}  默认服务器 {}{RESET}", server);
    if !ok {
        println!("{DIM}  提示：注册表卸载项没写成功（不影响使用）{RESET}");
    }
    print!("要现在启动客户端吗？[Y/n] ");
    let mut answer = String::new();
    if std::io::stdin().read_line(&mut answer).is_ok() {
        let trimmed = answer.trim().to_lowercase();
        if trimmed.is_empty() || trimmed == "y" || trimmed == "yes" {
            let _ = Command::new(&exe).current_dir(target).spawn();
        }
    }
    Ok(())
}

fn uninstall(target: &Path) {
    println!("{DIM}卸载目录 {}{RESET}", target.display());
    let _ = Command::new("taskkill")
        .args(["/IM", "parlz-client.exe", "/F"])
        .output();
    let _ = Command::new("taskkill")
        .args(["/IM", "parlz-cli.exe", "/F"])
        .output();
    std::thread::sleep(std::time::Duration::from_millis(400));
    if let Some(appdata) = environment("APPDATA") {
        let link = appdata
            .join("Microsoft\\Windows\\Start Menu\\Programs")
            .join(format!("{}.lnk", APP_NAME));
        let _ = std::fs::remove_file(&link);
    }
    if let Some(profile) = environment("USERPROFILE") {
        let link = profile.join("Desktop").join(format!("{}.lnk", APP_NAME));
        let _ = std::fs::remove_file(&link);
    }
    registry_delete();

    let mut removed = 0;
    if let Ok(entries) = std::fs::read_dir(target) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.file_name().and_then(|name| name.to_str()) == Some("parlz-setup.exe") {
                continue;
            }
            if std::fs::remove_file(&path).is_ok() {
                removed += 1;
            }
        }
    }
    println!("{GREEN}✓ 已删除 {} 个文件、快捷方式与注册表项{RESET}", removed);

    let script = target.join("parlz-cleanup.bat");
    let body = format!(
        "@echo off\r\ntimeout /t 2 /nobreak >nul\r\ndel /f /q \"{}\"\r\ndel /f /q \"%~f0\"\r\nrmdir /q \"{}\"\r\n",
        target.join("parlz-setup.exe").display(),
        target.display()
    );
    if std::fs::write(&script, body).is_ok() {
        let _ = Command::new("cmd").arg("/C").arg(&script).spawn();
        println!("{DIM}（安装目录会在两秒后自动清理）{RESET}");
    }
}

fn main() {
    enable_ansi();
    let args: Vec<String> = std::env::args().collect();
    let mut target = environment("LOCALAPPDATA")
        .map(|base| base.join("Programs").join(APP_NAME))
        .unwrap_or_else(|| PathBuf::from("Parlz"));
    let mut server = DEFAULT_SERVER.to_string();
    let mut mode = "install";

    let mut index = 1;
    while index < args.len() {
        match args[index].as_str() {
            "--dir" | "-d" => {
                if index + 1 < args.len() {
                    target = PathBuf::from(&args[index + 1]);
                    index += 2;
                } else {
                    index += 1;
                }
            }
            "--server" | "-s" => {
                if index + 1 < args.len() {
                    server = args[index + 1].clone();
                    index += 2;
                } else {
                    index += 1;
                }
            }
            "--uninstall" | "-u" => {
                mode = "uninstall";
                index += 1;
            }
            "--help" | "-h" => {
                print_help();
                return;
            }
            _ => index += 1,
        }
    }

    println!("{GREEN}{BOLD}Parlz 客户端安装程序{RESET} {DIM}v{APP_VERSION}{RESET}");
    if mode == "uninstall" {
        let here = self_dir();
        if here.join("parlz-client.exe").is_file() {
            uninstall(&here);
        } else {
            uninstall(&target);
        }
        return;
    }

    match install(&self_dir(), &target, &server) {
        Ok(()) => {}
        Err(message) => {
            println!("{GREEN}✗ {}{RESET}", message);
            println!("{DIM}用 --help 看用法{RESET}");
        }
    }
}
