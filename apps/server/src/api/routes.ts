import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  CategoryCreateReq,
  CategoryMoveReq,
  CategoryUpdateReq,
  ChatAskReq,
  ChatThreadListQueryReq,
  ChatThreadCreateReq,
  MaterialCategoryBindReq,
  MaterialContentKind,
  MaterialImportReq,
  MaterialImportRecoveryReq,
  MaterialListQueryReq,
  SettingsUpdateReq,
} from "@synapse/shared";
import { fail, ok } from "../utils/response";
import { getSettings, updateSettings } from "../core/settings";
import type { AppContext } from "../core/app-context";

export async function registerRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/api/health", async (_req, reply) => ok(reply, { status: "ok" }));

  app.post("/api/materials/import", async (req, reply) => {
    const body = req.body as MaterialImportReq;
    if (!body?.sourceUrl) {
      return fail(reply, "BAD_REQUEST", "sourceUrl 不能为空", 400);
    }

    try {
      const result = await ctx.materialService.importMaterial(body);
      if (result.duplicateOf) {
        return fail(reply, "MATERIAL_DUPLICATE", "资料已存在", 409, {
          materialId: result.materialId,
          status: result.status,
        });
      }
      return ok(reply, result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.get("/api/materials", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const query: MaterialListQueryReq = {
      keyword: q.keyword,
      categoryId: q.categoryId,
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 20,
      sortBy: q.sortBy as "createdAt" | "updatedAt" | undefined,
      sortOrder: q.sortOrder as "asc" | "desc" | undefined,
      status: q.status ? (q.status.split(",") as any) : undefined,
    };
    return ok(reply, ctx.materialService.list(query));
  });

  app.get("/api/materials/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const detail = ctx.materialService.getDetail(id);
    if (!detail) {
      return fail(reply, "MATERIAL_NOT_FOUND", "资料不存在", 404);
    }
    return ok(reply, detail);
  });

  app.get("/api/materials/:id/content", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { kind } = req.query as { kind?: MaterialContentKind };
    const finalKind: MaterialContentKind = kind ?? "original";
    const content = ctx.materialService.getContent(id, finalKind);
    if (!content) {
      return fail(reply, "MATERIAL_NOT_FOUND", "资料不存在", 404);
    }
    return ok(reply, content);
  });

  app.post("/api/materials/:id/rebuild-ai", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const jobIds = ctx.materialService.rebuildAi(id);
      return ok(reply, { jobIds });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.post("/api/materials/recovery/import-failures", async (req, reply) => {
    const body = (req.body ?? {}) as MaterialImportRecoveryReq;
    try {
      const result = ctx.materialService.recoverImportFailures(body);
      return ok(reply, result);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.get("/api/categories/tree", async (_req, reply) => ok(reply, ctx.categoryService.getTree()));

  app.post("/api/categories", async (req, reply) => {
    const body = req.body as CategoryCreateReq;
    if (!body?.name) {
      return fail(reply, "BAD_REQUEST", "name 不能为空", 400);
    }
    try {
      const id = ctx.categoryService.create(body);
      return ok(reply, { id });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.patch("/api/categories/:id", async (req, reply) => {
    const body = req.body as CategoryUpdateReq;
    const { id } = req.params as { id: string };
    const changed = ctx.categoryService.update(id, body);
    if (!changed) {
      return fail(reply, "BAD_REQUEST", "分类不存在", 404);
    }
    return ok(reply, { id });
  });

  app.post("/api/categories/:id/move", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as CategoryMoveReq;
    try {
      const changed = ctx.categoryService.move(id, body);
      if (!changed) {
        return fail(reply, "BAD_REQUEST", "分类不存在", 404);
      }
      return ok(reply, { id });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.delete("/api/categories/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const changed = ctx.categoryService.remove(id);
      if (!changed) {
        return fail(reply, "BAD_REQUEST", "分类不存在", 404);
      }
      return ok(reply, { id });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.post("/api/materials/:id/categories:bind", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as MaterialCategoryBindReq;
    if (!body || !Array.isArray(body.categoryIds)) {
      return fail(reply, "BAD_REQUEST", "categoryIds 必须是数组", 400);
    }
    try {
      ctx.categoryService.bindMaterial(id, body);
      ctx.materialService.upsertSearchIndex(id);
      return ok(reply, { materialId: id });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  app.get("/api/jobs", async (req, reply) => {
    const { status } = req.query as { status?: string };
    const jobs = ctx.jobService.list(status).map((x) => ({
      id: x.id,
      jobType: x.jobType,
      materialId: x.materialId ?? undefined,
      status: x.status,
      retryCount: x.retryCount,
      maxRetries: x.maxRetries,
      lastError: x.lastError ?? undefined,
      createdAt: x.createdAt,
      updatedAt: x.updatedAt,
    }));
    return ok(reply, jobs);
  });

  app.get("/api/jobs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = ctx.jobService.get(id);
    if (!job) {
      return fail(reply, "JOB_NOT_FOUND", "任务不存在", 404);
    }
    return ok(reply, {
      id: job.id,
      jobType: job.jobType,
      materialId: job.materialId ?? undefined,
      status: job.status,
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
      lastError: job.lastError ?? undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  });

  app.post("/api/jobs/:id/retry", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = ctx.jobService.get(id);
    if (!job) {
      return fail(reply, "JOB_NOT_FOUND", "任务不存在或状态不可重试", 404);
    }
    const changed = ctx.jobService.retry(id);
    if (!changed) {
      return fail(reply, "JOB_NOT_FOUND", "任务不存在或状态不可重试", 404);
    }

    if (job.materialId) {
      if (job.jobType === "generate_brief_summary") {
        ctx.materialService.updateAiStatus(job.materialId, {
          status: "processing_ai",
          briefSummaryStatus: "queued",
        });
      } else if (job.jobType === "generate_detailed_notes") {
        ctx.materialService.updateAiStatus(job.materialId, {
          status: "processing_ai",
          detailedNotesStatus: "queued",
        });
      } else if (job.jobType === "classify_material") {
        ctx.materialService.updateAiStatus(job.materialId, {
          status: "processing_ai",
          classifyStatus: "queued",
        });
      }
    }

    return ok(reply, { id });
  });

  app.post("/api/jobs/:id/cancel", async (req, reply) => {
    const { id } = req.params as { id: string };
    const changed = ctx.jobService.cancel(id);
    if (!changed) {
      return fail(reply, "JOB_NOT_FOUND", "任务不存在或不可取消", 404);
    }
    return ok(reply, { id });
  });

  app.post("/api/chats/threads", async (req, reply) => {
    const body = req.body as ChatThreadCreateReq;
    if (!body?.title || !body.scopeType) {
      return fail(reply, "BAD_REQUEST", "线程参数不完整", 400);
    }
    return ok(reply, ctx.chatService.createThread(body));
  });

  app.get("/api/chats/threads", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const scopeId = q.scopeId === "__NULL__" ? null : q.scopeId;
    const query: ChatThreadListQueryReq = {
      scopeType: q.scopeType as "global" | "material" | undefined,
      scopeId,
      keyword: q.keyword,
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 20,
    };
    return ok(reply, ctx.chatService.listThreads(query));
  });

  app.get("/api/chats/threads/:id/messages", async (req, reply) => {
    const { id } = req.params as { id: string };
    return ok(reply, ctx.chatService.getMessages(id));
  });

  app.get("/api/chats/runs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const run = ctx.chatService.getRun(id);
    if (!run) {
      return fail(reply, "CHAT_RUN_NOT_FOUND", "运行记录不存在", 404);
    }
    return ok(reply, run);
  });

  app.post("/api/chats/runs/:id/cancel", async (req, reply) => {
    const { id } = req.params as { id: string };
    const okFlag = ctx.chatService.cancelRun(id);
    if (!okFlag) {
      return fail(reply, "CHAT_RUN_NOT_FOUND", "运行不存在或不可取消", 404);
    }
    return ok(reply, { runId: id });
  });

  app.post("/api/chats/stream", async (req, reply) => {
    await streamChat(reply, req, ctx, { scopeType: "global", scopeId: null });
  });

  app.post("/api/materials/:id/chats/stream", async (req, reply) => {
    const { id } = req.params as { id: string };
    await streamChat(reply, req, ctx, { scopeType: "material", scopeId: id });
  });

  app.get("/api/settings", async (_req, reply) => {
    return ok(reply, getSettings(ctx.db.conn));
  });

  app.put("/api/settings", async (req, reply) => {
    const body = req.body as SettingsUpdateReq;
    const result = updateSettings(ctx.db.conn, body);
    return ok(reply, result);
  });
}

async function streamChat(
  reply: FastifyReply,
  req: FastifyRequest,
  ctx: AppContext,
  scope: { scopeType: "global" | "material"; scopeId: string | null },
): Promise<void> {
  const body = req.body as ChatAskReq;
  if (!body?.threadId || !body?.question) {
    reply.hijack();
    reply.raw.statusCode = 400;
    reply.raw.end(JSON.stringify({ code: "BAD_REQUEST", message: "缺少 threadId 或 question" }));
    return;
  }

  const finalScope = body.scopeOverride ?? scope;
  if (finalScope.scopeType === "material" && !finalScope.scopeId) {
    reply.hijack();
    reply.raw.statusCode = 400;
    reply.raw.end(JSON.stringify({ code: "BAD_REQUEST", message: "scopeOverride.scopeId 不能为空" }));
    return;
  }
  if (finalScope.scopeType === "material" && finalScope.scopeId) {
    const detail = ctx.materialService.getDetail(finalScope.scopeId);
    if (!detail) {
      reply.hijack();
      reply.raw.statusCode = 404;
      reply.raw.end(JSON.stringify({ code: "MATERIAL_NOT_FOUND", message: "资料不存在" }));
      return;
    }
  }

  reply.hijack();
  try {
    await ctx.chatService.streamAnswer(finalScope, body, reply);
  } catch (err) {
    reply.raw.statusCode = 500;
    reply.raw.end(JSON.stringify({ code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "未知错误" }));
  }
}

function handleError(reply: FastifyReply, err: unknown): FastifyReply {
  const message = err instanceof Error ? err.message : "未知错误";
  if (message.includes("INVALID_URL")) {
    return fail(reply, "INVALID_URL", "URL 非法", 400);
  }
  if (message.includes("URL_BLOCKED")) {
    return fail(reply, "URL_BLOCKED", "URL 被安全策略拦截", 400);
  }
  if (message.includes("INGEST_FETCH_FAILED")) {
    return fail(reply, "INGEST_FETCH_FAILED", "抓取网页失败", 502);
  }
  if (message.includes("LLM_PROVIDER_UNAVAILABLE")) {
    return fail(reply, "LLM_PROVIDER_UNAVAILABLE", "LLM 服务不可用，请检查 baseUrl、apiKey 与模型配置", 502);
  }
  if (message.includes("SOURCE_NOT_SUPPORTED")) {
    return fail(reply, "SOURCE_NOT_SUPPORTED", "当前来源暂不支持自动抓取", 422);
  }
  if (message.includes("MATERIAL_NOT_FOUND")) {
    return fail(reply, "MATERIAL_NOT_FOUND", "资料不存在", 404);
  }
  if (message.includes("CATEGORY_NOT_FOUND")) {
    return fail(reply, "CATEGORY_NOT_FOUND", "分类不存在", 404);
  }
  if (message.includes("CATEGORY_DELETE_HAS_CHILDREN")) {
    return fail(reply, "CATEGORY_DELETE_HAS_CHILDREN", "请先处理子分类后再删除", 400);
  }
  if (message.includes("CATEGORY_MOVE_INVALID_SELF")) {
    return fail(reply, "CATEGORY_MOVE_INVALID_SELF", "分类不能移动到自身", 400);
  }
  if (message.includes("CATEGORY_MOVE_INVALID_PARENT")) {
    return fail(reply, "CATEGORY_MOVE_INVALID_PARENT", "分类不能移动到自己的子分类下", 400);
  }
  if (message.includes("CHAT_THREAD_NOT_FOUND")) {
    return fail(reply, "CHAT_THREAD_NOT_FOUND", "会话不存在", 404);
  }
  return fail(reply, "INTERNAL_ERROR", message, 500);
}
