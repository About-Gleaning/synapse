import type { ApiResp } from "@synapse/shared";
import { buildApiUrl, describeApiBaseUrl } from "./baseUrl";

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await request(path, init);
  const json = await readApiResp<T>(resp);
  if (!resp.ok || json.code !== "OK") {
    throw new Error(json.message || `请求失败（${resp.status}）`);
  }
  return json.data;
}

export async function requestSse(path: string, init: RequestInit): Promise<Response> {
  const resp = await request(path, init);
  if (!resp.ok) {
    const message = await readErrorMessage(resp);
    throw new Error(`流式请求失败（${resp.status}）：${message}`);
  }
  if (!resp.body) {
    throw new Error("流式请求失败：响应体为空");
  }
  return resp;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function request(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(buildApiUrl(path), {
      ...init,
      headers: mergeHeaders(init.headers, init.body),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new Error(
      `无法连接后端服务，请确认服务端已启动且端口可访问。请求路径：${path}；接口基址：${describeApiBaseUrl()}`,
    );
  }
}

async function readApiResp<T>(resp: Response): Promise<ApiResp<T>> {
  try {
    return (await resp.clone().json()) as ApiResp<T>;
  } catch {
    if (!resp.ok) {
      const message = await readErrorMessage(resp);
      return {
        code: "HTTP_ERROR",
        message,
      } as ApiResp<T>;
    }
    throw new Error("响应解析失败：服务端返回了非 JSON 数据");
  }
}

async function readErrorMessage(resp: Response): Promise<string> {
  try {
    const cloned = resp.clone();
    const json = (await cloned.json()) as Partial<ApiResp<unknown>>;
    if (typeof json.message === "string" && json.message.trim()) {
      return json.message.trim();
    }
  } catch {
    // ignore
  }
  try {
    const text = (await resp.text()).trim();
    if (text) {
      return text.slice(0, 200);
    }
  } catch {
    // ignore
  }
  return "请求失败";
}

function mergeHeaders(headers: HeadersInit | undefined, body: BodyInit | null | undefined): HeadersInit | undefined {
  if (!body || body instanceof FormData) {
    return headers;
  }
  const finalHeaders = new Headers(headers ?? {});
  if (!finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }
  return finalHeaders;
}
