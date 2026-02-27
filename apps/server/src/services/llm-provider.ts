import type { LlmGenerateReq, LlmGenerateResp } from "@synapse/shared";
import { splitForStreaming } from "../utils/text";

export interface LlmProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmProvider {
  generate(req: LlmGenerateReq): Promise<LlmGenerateResp>;
  streamGenerate(req: LlmGenerateReq): AsyncGenerator<string, void, void>;
}

export interface LlmProviderLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  error?: (obj: Record<string, unknown>, msg?: string) => void;
}

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(
    private readonly config: LlmProviderConfig,
    private readonly logger?: LlmProviderLogger,
  ) {}

  async generate(req: LlmGenerateReq): Promise<LlmGenerateResp> {
    const startedAtMs = Date.now();
    const model = req.model || this.config.model;
    this.logRequest(req, model);

    if (!this.config.apiKey) {
      return this.handleFallbackWithLog(req, "NO_API_KEY", model, startedAtMs);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), resolveGenerateTimeoutMs(req));
      const resp = await (async () => {
        try {
          return await fetch(buildChatCompletionsUrl(this.config.baseUrl), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
              model,
              temperature: req.temperature ?? 0.2,
              messages: buildMessages(req),
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
      })();

      if (!resp.ok) {
        const errorText = await safeReadText(resp);
        return this.handleFallbackWithLog(
          req,
          `HTTP_${resp.status}${errorText ? `:${errorText}` : ""}`,
          model,
          startedAtMs,
        );
      }

      const json = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const content = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!content) {
        return this.handleFallbackWithLog(req, "EMPTY_CONTENT", model, startedAtMs);
      }

      const result: LlmGenerateResp = {
        content,
        usage: {
          promptTokens: json.usage?.prompt_tokens,
          completionTokens: json.usage?.completion_tokens,
          totalTokens: json.usage?.total_tokens,
        },
        meta: {
          provider: "remote",
        },
      };
      this.logResponse("success", model, startedAtMs, result.usage);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
      return this.handleFallbackWithLog(req, `REQUEST_ERROR:${message}`, model, startedAtMs);
    }
  }

  async *streamGenerate(req: LlmGenerateReq): AsyncGenerator<string, void, void> {
    const result = await this.generate(req);
    const chunks = splitForStreaming(result.content, 26);
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  private async mockGenerate(req: LlmGenerateReq): Promise<LlmGenerateResp> {
    const lastUser = [...req.messages].reverse().find((x) => x.role === "user")?.content ?? "";
    const lines = [
      "这是基于本地资料生成的草稿结果。",
      "核心观点：",
      `1. 问题焦点是：${lastUser.slice(0, 64) || "未提供问题"}`,
      "2. 建议优先查看精简总结，再按需展开详细整理和原文。",
      "3. 输出内容仅基于当前已索引资料。",
    ];
    return {
      content: lines.join("\n"),
      usage: {
        totalTokens: Math.ceil(lines.join("\n").length / 3),
      },
      meta: {
        provider: "mock",
      },
    };
  }

  private async handleFallback(req: LlmGenerateReq, reason: string): Promise<LlmGenerateResp> {
    if (req.options?.allowFallback === false) {
      throw new Error(`LLM_PROVIDER_UNAVAILABLE:${reason}`);
    }
    const resp = await this.mockGenerate(req);
    return {
      ...resp,
      meta: {
        provider: "mock",
        fallbackReason: reason,
      },
    };
  }

  private async handleFallbackWithLog(
    req: LlmGenerateReq,
    reason: string,
    model: string,
    startedAtMs: number,
  ): Promise<LlmGenerateResp> {
    const normalizedReason = normalizeReason(reason);
    try {
      const result = await this.handleFallback(req, normalizedReason);
      const isFallback = result.meta?.provider === "mock";
      this.logResponse(isFallback ? "fallback" : "success", model, startedAtMs, result.usage, normalizedReason);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
      this.logError(model, startedAtMs, message, normalizedReason);
      throw err;
    }
  }

  private logRequest(req: LlmGenerateReq, model: string): void {
    const payload: Record<string, unknown> = {
      event: "llm.request",
      provider: "openai-compatible",
      baseUrl: sanitizeBaseUrlForLog(this.config.baseUrl),
      model,
      temperature: req.temperature ?? 0.2,
      allowFallback: req.options?.allowFallback !== false,
      traceContext: req.traceContext,
      timestamp: new Date().toISOString(),
    };
    if (isPromptLoggingEnabled()) {
      payload.prompt = {
        systemPrompt: req.systemPrompt ?? "",
        messages: req.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };
    }
    this.logger?.info(payload, "LLM 请求");
  }

  private logResponse(
    status: "success" | "fallback",
    model: string,
    startedAtMs: number,
    usage?: LlmGenerateResp["usage"],
    fallbackReason?: string,
  ): void {
    this.logger?.info(
      {
        event: "llm.response",
        provider: "openai-compatible",
        baseUrl: sanitizeBaseUrlForLog(this.config.baseUrl),
        model,
        status,
        usage,
        fallbackReason,
        durationMs: Date.now() - startedAtMs,
        timestamp: new Date().toISOString(),
      },
      "LLM 响应",
    );
  }

  private logError(model: string, startedAtMs: number, errorMessage: string, fallbackReason?: string): void {
    const payload = {
      event: "llm.error",
      provider: "openai-compatible",
      baseUrl: sanitizeBaseUrlForLog(this.config.baseUrl),
      model,
      status: "error",
      errorMessage: normalizeReason(errorMessage),
      fallbackReason,
      durationMs: Date.now() - startedAtMs,
      timestamp: new Date().toISOString(),
    };
    if (this.logger?.error) {
      this.logger.error(payload, "LLM 调用失败");
      return;
    }
    this.logger?.info(payload, "LLM 调用失败");
  }
}

export function resolveGenerateTimeoutMs(req: LlmGenerateReq): number {
  const inputChars = (req.systemPrompt?.length ?? 0) + req.messages.reduce((sum, msg) => sum + msg.content.length, 0);
  if (inputChars >= 12_000) {
    return 120_000;
  }
  if (inputChars >= 6_000) {
    return 90_000;
  }
  return 30_000;
}

function buildMessages(req: LlmGenerateReq): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  if (req.systemPrompt) {
    messages.push({ role: "system", content: req.systemPrompt });
  }
  for (const m of req.messages) {
    messages.push({ role: m.role, content: m.content });
  }
  return messages;
}

async function safeReadText(resp: Response): Promise<string> {
  try {
    const raw = (await resp.text()).trim();
    if (!raw) {
      return "";
    }
    return raw.slice(0, 120);
  } catch {
    return "";
  }
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "/chat/completions";
  }
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

function isPromptLoggingEnabled(): boolean {
  const raw = process.env.SYNAPSE_LLM_PROMPT_LOG_ENABLED?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no" || raw === "off") {
    return false;
  }
  return process.env.NODE_ENV !== "production";
}

function sanitizeBaseUrlForLog(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(trimmed);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return trimmed.split("?")[0].replace(/\/+$/, "");
  }
}

function normalizeReason(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 240);
}
