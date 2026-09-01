const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function normalizeLoopbackEndpoint(value, fallbackPort) {
  const raw = String(value || "").trim() || `http://127.0.0.1:${fallbackPort}`;
  let url;
  try {
    url = new URL(raw.includes("://") ? raw : `http://${raw}`);
  } catch {
    throw new Error("请输入有效的本地服务地址。");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!LOOPBACK_HOSTS.has(hostname) || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("为保护本地生成服务，只允许连接 localhost、127.0.0.1 或 ::1。");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function fetchLocalJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("无法访问本地服务。请确认服务已启动，并允许当前编辑器地址跨域访问（CORS）。", { cause: error });
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.error || body?.detail || body?.message || "";
    } catch {
      // Status is enough when the response body is not JSON.
    }
    throw new Error(`本地服务返回 HTTP ${response.status}${detail ? `：${detail}` : ""}`);
  }
  return response.json();
}

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}
