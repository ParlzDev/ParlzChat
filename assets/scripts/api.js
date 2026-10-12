async function handle(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload === null || payload.ok === false) {
    const message = payload && payload.error ? payload.error : '请求失败（HTTP ' + response.status + '）';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function buildUrl(path, params) {
  const url = new URL(path, window.location.origin);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

export async function apiGet(path, params) {
  const response = await fetch(buildUrl(path, params), {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  return handle(response);
}

export async function apiPost(path, data) {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(data ?? {}),
  });
  return handle(response);
}

export function apiFormProgress(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', String(buildUrl(path)));
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))));
      }
    };
    xhr.onload = () => {
      const payload = xhr.response ?? null;
      if (xhr.status >= 200 && xhr.status < 300 && payload !== null && payload.ok !== false) {
        resolve(payload);
        return;
      }
      const message = payload && payload.error ? payload.error : '请求失败（HTTP ' + xhr.status + '）';
      const error = new Error(message);
      error.status = xhr.status;
      reject(error);
    };
    xhr.onerror = () => {
      const error = new Error('网络错误，上传失败');
      error.status = 0;
      reject(error);
    };
    xhr.send(formData);
  });
}
