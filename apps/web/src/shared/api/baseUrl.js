const RAW_BASE_URL = (import.meta.env.VITE_SERVER_BASE_URL ?? "").trim();
export function getApiBaseUrl() {
    return RAW_BASE_URL.replace(/\/+$/, "");
}
export function describeApiBaseUrl() {
    const base = getApiBaseUrl();
    return base || "同源 /api（Vite 代理）";
}
export function buildApiUrl(path) {
    if (!path.startsWith("/")) {
        throw new Error(`API 路径必须以 / 开头：${path}`);
    }
    const base = getApiBaseUrl();
    return base ? `${base}${path}` : path;
}
