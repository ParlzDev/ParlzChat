use crate::http::Http;
use serde_json::{json, Value};

pub struct Session {
    http: Http,
    me: Option<Value>,
}

impl Session {
    pub fn new(base: &str) -> Result<Self, String> {
        Ok(Self {
            http: Http::new(base)?,
            me: None,
        })
    }

    pub fn host(&self) -> String {
        self.http.host().to_string()
    }

    pub fn me(&self) -> Option<&Value> {
        self.me.as_ref()
    }

    fn parse(body: &str) -> Result<Value, String> {
        let value: Value = serde_json::from_str(body).map_err(|error| {
            let preview: String = body.chars().take(120).collect();
            format!("服务器没有返回 JSON（{}）：{}", error, preview)
        })?;
        if value.get("ok").and_then(Value::as_bool) == Some(false) {
            let message = value
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("请求失败");
            return Err(message.to_string());
        }
        Ok(value)
    }

    fn post(&mut self, path: &str, payload: Value) -> Result<Value, String> {
        let body = serde_json::to_string(&payload).map_err(|error| error.to_string())?;
        let response = self.http.post_json(path, &body)?;
        Self::parse(&response.body)
    }

    pub fn post_json(&mut self, path: &str, body: &str) -> Result<Value, String> {
        let response = self.http.post_json(path, body)?;
        Self::parse(&response.body)
    }

    fn get(&mut self, path: &str) -> Result<Value, String> {
        let response = self.http.get(path)?;
        Self::parse(&response.body)
    }

    pub fn login(&mut self, username: &str, password: &str) -> Result<Value, String> {
        let value = self.post(
            "/api/auth.php",
            json!({"action": "login", "username": username, "password": password}),
        )?;
        self.me = value.get("user").cloned();
        Ok(value)
    }

    pub fn register(&mut self, username: &str, nickname: &str, password: &str) -> Result<Value, String> {
        let value = self.post(
            "/api/auth.php",
            json!({"action": "register", "username": username, "nickname": nickname, "password": password}),
        )?;
        self.me = value.get("user").cloned();
        Ok(value)
    }

    pub fn logout(&mut self) -> Result<Value, String> {
        let value = self.post("/api/auth.php", json!({"action": "logout"}))?;
        self.me = None;
        Ok(value)
    }

    pub fn profile(&mut self) -> Result<Value, String> {
        let value = self.get("/api/auth.php")?;
        self.me = value.get("user").cloned();
        Ok(value)
    }

    pub fn chats(&mut self) -> Result<Value, String> {
        self.get("/api/chats.php")
    }

    pub fn friends(&mut self) -> Result<Value, String> {
        self.get("/api/friends.php")
    }

    pub fn accept_friend(&mut self, user_id: i64) -> Result<Value, String> {
        self.post(
            "/api/friends.php",
            json!({"action": "accept", "user_id": user_id}),
        )
    }

    pub fn request_friend(&mut self, user_id: i64) -> Result<Value, String> {
        self.post(
            "/api/friends.php",
            json!({"action": "request", "user_id": user_id}),
        )
    }

    pub fn messages(&mut self, chat_id: i64, before: i64) -> Result<Value, String> {
        self.get(&format!(
            "/api/messages.php?chat_id={}&before={}",
            chat_id, before
        ))
    }

    pub fn send(&mut self, chat_id: i64, body: &str, kind: &str) -> Result<Value, String> {
        self.post(
            "/api/messages.php",
            json!({"chat_id": chat_id, "body": body, "kind": kind}),
        )
    }

    pub fn poll(&mut self, chat_id: i64, after: i64, typing: bool) -> Result<Value, String> {
        self.get(&format!(
            "/api/poll.php?chat_id={}&after={}&typing={}",
            chat_id,
            after,
            if typing { 1 } else { 0 }
        ))
    }

    pub fn open_dm(&mut self, user_id: i64) -> Result<Value, String> {
        self.post("/api/chats.php", json!({"action": "open", "user_id": user_id}))
    }

    pub fn search_users(&mut self, keyword: &str) -> Result<Value, String> {
        let encoded = keyword
            .bytes()
            .map(|byte| match byte {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    (byte as char).to_string()
                }
                _ => format!("%{:02X}", byte),
            })
            .collect::<String>();
        self.get(&format!("/api/friends.php?q={}", encoded))
    }

    pub fn upload_image(&mut self, path: &str) -> Result<String, String> {
        let data = std::fs::read(path).map_err(|error| format!("读不到文件 {}: {}", path, error))?;
        if data.is_empty() {
            return Err("文件是空的".to_string());
        }
        if data.len() > 8 * 1024 * 1024 {
            return Err("图片不能超过 8MB".to_string());
        }
        let filename = std::path::Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("image.png")
            .to_string();
        let mime = match filename
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str()
        {
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            _ => "image/jpeg",
        };
        let response = self
            .http
            .post_multipart("/api/uploads.php", "image", &filename, mime, &data)?;
        let value = Self::parse(&response.body)?;
        value
            .get("file")
            .and_then(Value::as_str)
            .map(|name| name.to_string())
            .ok_or_else(|| "服务器没有返回文件名".to_string())
    }
}
