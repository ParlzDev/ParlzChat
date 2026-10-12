use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::time::Duration;

pub struct Response {
    pub status: u16,
    pub body: String,
}

pub struct Http {
    host: String,
    cookies: Vec<(String, String)>,
}

impl Http {
    pub fn new(base: &str) -> Result<Self, String> {
        let trimmed = base.trim().trim_end_matches('/');
        if trimmed.is_empty() {
            return Err("服务器地址为空".to_string());
        }
        let origin = if let Some(rest) = trimmed.strip_prefix("http://") {
            rest.to_string()
        } else if trimmed.contains("://") {
            return Err("只支持 http:// 地址（客户端不内置 TLS）".to_string());
        } else {
            trimmed.to_string()
        };
        let (host_name, port) = match origin.rsplit_once(':') {
            Some((host, port)) if !host.contains('/') && port.chars().all(|c| c.is_ascii_digit()) => {
                (host.to_string(), port.parse::<u16>().map_err(|_| "端口不合法".to_string())?)
            }
            _ => (origin.trim_end_matches('/').to_string(), 80),
        };
        if host_name.is_empty() {
            return Err("服务器地址为空".to_string());
        }
        Ok(Self {
            host: format!("{}:{}", host_name, port),
            cookies: Vec::new(),
        })
    }

    pub fn host(&self) -> &str {
        &self.host
    }

    fn cookie_header(&self) -> Option<String> {
        if self.cookies.is_empty() {
            return None;
        }
        Some(
            self.cookies
                .iter()
                .map(|(name, value)| format!("{}={}", name, value))
                .collect::<Vec<_>>()
                .join("; "),
        )
    }

    fn remember_cookies(&mut self, headers: &[(String, String)]) {
        for (name, value) in headers {
            if !name.eq_ignore_ascii_case("set-cookie") {
                continue;
            }
            let first = value.split(';').next().unwrap_or("");
            if let Some((key, val)) = first.split_once('=') {
                let key = key.trim().to_string();
                let val = val.trim().to_string();
                self.cookies.retain(|(existing, _)| existing != &key);
                self.cookies.push((key, val));
            }
        }
    }

    pub fn get(&mut self, path: &str) -> Result<Response, String> {
        self.send("GET", path, Vec::new(), &[])
    }

    pub fn post_json(&mut self, path: &str, body: &str) -> Result<Response, String> {
        self.send(
            "POST",
            path,
            body.as_bytes().to_vec(),
            &[("Content-Type".to_string(), "application/json".to_string())],
        )
    }

    pub fn post_multipart(
        &mut self,
        path: &str,
        field: &str,
        filename: &str,
        mime: &str,
        data: &[u8],
    ) -> Result<Response, String> {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let boundary = format!("----ParlzBoundary{:x}", stamp);
        let mut body: Vec<u8> = Vec::new();
        body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        body.extend_from_slice(
            format!("Content-Disposition: form-data; name=\"{}\"; filename=\"{}\"\r\n", field, filename)
                .as_bytes(),
        );
        body.extend_from_slice(format!("Content-Type: {}\r\n\r\n", mime).as_bytes());
        body.extend_from_slice(data);
        body.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());
        self.send(
            "POST",
            path,
            body,
            &[(
                "Content-Type".to_string(),
                format!("multipart/form-data; boundary={}", boundary),
            )],
        )
    }

    fn send(
        &mut self,
        method: &str,
        path: &str,
        payload: Vec<u8>,
        extra: &[(String, String)],
    ) -> Result<Response, String> {
        let mut stream = TcpStream::connect(&self.host)
            .map_err(|e| format!("连接 {} 失败: {}", self.host, e))?;
        let _ = stream.set_read_timeout(Some(Duration::from_secs(20)));
        let _ = stream.set_write_timeout(Some(Duration::from_secs(20)));

        let mut head = String::new();
        head.push_str(&format!("{} {} HTTP/1.1\r\n", method, path));
        head.push_str(&format!("Host: {}\r\n", self.host));
        head.push_str("Connection: close\r\n");
        head.push_str("User-Agent: ParlzRust/0.1\r\n");
        head.push_str("Accept: application/json\r\n");
        if let Some(cookie) = self.cookie_header() {
            head.push_str(&format!("Cookie: {}\r\n", cookie));
        }
        for (key, value) in extra {
            head.push_str(&format!("{}: {}\r\n", key, value));
        }
        if method == "POST" || !payload.is_empty() {
            head.push_str(&format!("Content-Length: {}\r\n", payload.len()));
        }
        head.push_str("\r\n");

        stream
            .write_all(head.as_bytes())
            .map_err(|e| format!("发送请求头失败: {}", e))?;
        if !payload.is_empty() {
            stream
                .write_all(&payload)
                .map_err(|e| format!("发送请求体失败: {}", e))?;
        }
        let _ = stream.flush();

        let mut reader = BufReader::new(stream);
        let mut status_line = String::new();
        reader
            .read_line(&mut status_line)
            .map_err(|e| format!("读取响应失败: {}", e))?;
        let status = status_line
            .split_whitespace()
            .nth(1)
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(0);

        let mut headers: Vec<(String, String)> = Vec::new();
        loop {
            let mut line = String::new();
            let read = reader
                .read_line(&mut line)
                .map_err(|e| format!("读取响应头失败: {}", e))?;
            if read == 0 {
                break;
            }
            let trimmed = line.trim_end_matches(['\r', '\n']);
            if trimmed.is_empty() {
                break;
            }
            if let Some((key, value)) = trimmed.split_once(':') {
                headers.push((key.trim().to_string(), value.trim().to_string()));
            }
        }
        self.remember_cookies(&headers);

        let chunked = headers.iter().any(|(key, value)| {
            key.eq_ignore_ascii_case("transfer-encoding") && value.to_ascii_lowercase().contains("chunked")
        });

        let mut raw: Vec<u8> = Vec::new();
        if chunked {
            loop {
                let mut size_line = String::new();
                if reader.read_line(&mut size_line).unwrap_or(0) == 0 {
                    break;
                }
                let size_text = size_line.trim();
                let size = usize::from_str_radix(
                    size_text.split(';').next().unwrap_or("0").trim(),
                    16,
                )
                .unwrap_or(0);
                if size == 0 {
                    break;
                }
                let mut chunk = vec![0u8; size];
                reader
                    .read_exact(&mut chunk)
                    .map_err(|e| format!("读取分块失败: {}", e))?;
                raw.extend_from_slice(&chunk);
                let mut crlf = [0u8; 2];
                let _ = reader.read_exact(&mut crlf);
            }
        } else {
            reader
                .read_to_end(&mut raw)
                .map_err(|e| format!("读取响应体失败: {}", e))?;
        }

        Ok(Response {
            status,
            body: String::from_utf8_lossy(&raw).to_string(),
        })
    }
}
