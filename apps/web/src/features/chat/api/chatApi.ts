import type {
  ChatAskReq,
  ChatMessageVO,
  ChatRunVO,
  ChatThreadListVO,
  ChatStreamEventType,
  ChatThreadCreateReq,
  ChatThreadVO,
} from "@synapse/shared";
import { parseSseStream } from "./sseParser";
import { isAbortError, requestJson, requestSse } from "../../../shared/api/httpClient";

export interface StreamChatParams {
  path: string;
  body: ChatAskReq;
  signal?: AbortSignal;
  onEvent: (event: ChatStreamEventType) => void;
}

export async function streamChat(params: StreamChatParams): Promise<void> {
  try {
    const resp = await requestSse(params.path, {
      method: "POST",
      body: JSON.stringify(params.body),
      signal: params.signal,
    });
    const stream = resp.body;
    if (!stream) {
      throw new Error("流式请求失败：响应体为空");
    }
    await parseSseStream(stream, (jsonText) => {
      try {
        const event = JSON.parse(jsonText) as ChatStreamEventType;
        params.onEvent(event);
      } catch {
        // 忽略非法事件帧
      }
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : "未知错误";
    throw new Error(`流式提问失败（path=${params.path}）：${detail}`);
  }
}

export async function createThread(req: ChatThreadCreateReq): Promise<ChatThreadVO> {
  const data = await requestJson<ChatThreadVO>("/api/chats/threads", {
    method: "POST",
    body: JSON.stringify(req),
  });
  return data;
}

export async function listThreads(params: {
  scopeType?: "global" | "material";
  scopeId?: string | null;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<ChatThreadListVO> {
  const query = new URLSearchParams();
  if (params.scopeType) {
    query.set("scopeType", params.scopeType);
  }
  if (params.scopeId === null) {
    query.set("scopeId", "__NULL__");
  } else if (typeof params.scopeId === "string" && params.scopeId) {
    query.set("scopeId", params.scopeId);
  }
  if (params.keyword?.trim()) {
    query.set("keyword", params.keyword.trim());
  }
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));
  return requestJson<ChatThreadListVO>(`/api/chats/threads?${query.toString()}`, {
    method: "GET",
  });
}

export async function getThreadMessages(threadId: string): Promise<ChatMessageVO[]> {
  return requestJson<ChatMessageVO[]>(`/api/chats/threads/${threadId}/messages`, {
    method: "GET",
  });
}

export async function cancelRun(runId: string): Promise<void> {
  await requestJson(`/api/chats/runs/${runId}/cancel`, {
    method: "POST",
  });
}

export async function getRun(runId: string): Promise<ChatRunVO> {
  return requestJson<ChatRunVO>(`/api/chats/runs/${runId}`, {
    method: "GET",
  });
}

export async function checkServerHealth(): Promise<void> {
  await requestJson<{ status: string }>("/api/health", {
    method: "GET",
  });
}
