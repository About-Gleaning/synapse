import type Database from "better-sqlite3";
import type {
  ChatAskReq,
  ChatMessageVO,
  ChatRunVO,
  ChatThreadListQueryReq,
  ChatThreadListVO,
  ChatThreadCreateReq,
  ChatThreadVO,
  CitationAppendedPayload,
  ChatStage,
  ChatStreamEventType,
} from "@synapse/shared";
import { getInternalSettings } from "../core/settings";
import { genId } from "../utils/id";
import { nowIso } from "../utils/time";
import { splitForStreaming } from "../utils/text";
import { OpenAiCompatibleProvider } from "./llm-provider";
import { RetrievalService, type BriefCandidate } from "./retrieval-service";
import type { MaterialService } from "./material-service";
import type { FastifyBaseLogger, FastifyReply } from "fastify";

interface StageTrace {
  stage: ChatStage;
  summary: string;
}

export class ChatService {
  private readonly retrievalService: RetrievalService;

  constructor(
    private readonly conn: Database.Database,
    private readonly materialService: MaterialService,
    private readonly logger?: FastifyBaseLogger,
  ) {
    this.retrievalService = new RetrievalService(conn);
  }

  createThread(req: ChatThreadCreateReq): ChatThreadVO {
    const id = genId("thread");
    const now = nowIso();
    this.conn
      .prepare(
        `INSERT INTO chat_threads(id, scope_type, scope_id, title, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?)`,
      )
      .run(id, req.scopeType, req.scopeId, req.title, now, now);

    return {
      id,
      scopeType: req.scopeType,
      scopeId: req.scopeId,
      title: req.title,
      createdAt: now,
      updatedAt: now,
    };
  }

  listThreads(req: ChatThreadListQueryReq): ChatThreadListVO {
    const page = Math.max(1, req.page ?? 1);
    const pageSize = Math.max(1, Math.min(req.pageSize ?? 20, 100));
    const offset = (page - 1) * pageSize;
    const keyword = req.keyword?.trim() ?? "";
    const whereParts: string[] = [];
    const params: unknown[] = [];
    const fromSql = "FROM chat_threads t LEFT JOIN materials mt ON mt.id = t.scope_id";

    if (req.scopeType) {
      whereParts.push("t.scope_type = ?");
      params.push(req.scopeType);
    }
    if (typeof req.scopeId === "string") {
      whereParts.push("t.scope_id = ?");
      params.push(req.scopeId);
    } else if (req.scopeId === null) {
      whereParts.push("t.scope_id IS NULL");
    }
    if (keyword) {
      whereParts.push("(t.title LIKE ? OR t.id LIKE ? OR COALESCE(mt.title, '') LIKE ?)");
      const like = `%${keyword}%`;
      params.push(like, like, like);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    const totalRow = this.conn
      .prepare(
        `SELECT COUNT(1) AS total
         ${fromSql}
         ${whereSql}`,
      )
      .get(...params) as { total: number };

    const rows = this.conn
      .prepare(
        `SELECT
          t.id,
          t.scope_type,
          t.scope_id,
          mt.title AS scope_title,
          t.title,
          t.created_at,
          t.updated_at,
          COUNT(m.id) AS message_count,
          MAX(m.created_at) AS last_message_at
        ${fromSql}
        LEFT JOIN chat_messages m ON m.thread_id = t.id
        ${whereSql}
        GROUP BY t.id, mt.title
        ORDER BY COALESCE(MAX(m.created_at), t.updated_at) DESC, t.created_at DESC
        LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as Array<{
      id: string;
      scope_type: "global" | "material";
      scope_id: string | null;
      scope_title: string | null;
      title: string;
      created_at: string;
      updated_at: string;
      message_count: number;
      last_message_at: string | null;
    }>;

    return {
      total: totalRow.total,
      page,
      pageSize,
      items: rows.map((row) => ({
        id: row.id,
        scopeType: row.scope_type,
        scopeId: row.scope_id,
        scopeTitle: row.scope_title,
        title: row.title,
        messageCount: row.message_count,
        lastMessageAt: row.last_message_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  }

  getMessages(threadId: string): ChatMessageVO[] {
    return this.conn
      .prepare(
        `SELECT id, thread_id, run_id, role, content, citations_json, stage_trace_json, created_at
         FROM chat_messages
         WHERE thread_id = ?
         ORDER BY created_at ASC`,
      )
      .all(threadId)
      .map((x: any) => ({
        id: x.id,
        threadId: x.thread_id,
        runId: x.run_id,
        role: x.role,
        content: x.content,
        citationsJson: x.citations_json,
        stageTraceJson: x.stage_trace_json,
        createdAt: x.created_at,
      }));
  }

  getRun(runId: string): ChatRunVO | null {
    const row = this.conn
      .prepare("SELECT * FROM chat_runs WHERE id = ?")
      .get(runId) as Record<string, any> | undefined;
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      threadId: row.thread_id,
      status: row.status,
      currentStage: row.current_stage,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  cancelRun(runId: string): boolean {
    const result = this.conn
      .prepare(
        `UPDATE chat_runs
         SET cancel_requested = 1, updated_at = ?
         WHERE id = ? AND status IN ('queued', 'running')`,
      )
      .run(nowIso(), runId);
    return result.changes > 0;
  }

  async streamAnswer(
    scope: { scopeType: "global" | "material"; scopeId: string | null },
    req: ChatAskReq,
    reply: FastifyReply,
  ): Promise<void> {
    const thread = this.conn
      .prepare("SELECT id FROM chat_threads WHERE id = ?")
      .get(req.threadId) as { id: string } | undefined;
    if (!thread) {
      throw new Error("CHAT_THREAD_NOT_FOUND");
    }

    const runId = genId("run");
    const startedAt = nowIso();

    this.conn
      .prepare(
        `INSERT INTO chat_runs(id, thread_id, status, current_stage, cancel_requested, created_at, updated_at, started_at)
         VALUES(?, ?, 'running', 'prepare', 0, ?, ?, ?)`,
      )
      .run(runId, req.threadId, startedAt, startedAt, startedAt);

    this.insertUserMessage(req.threadId, runId, req.question);

    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders();

    const traces: StageTrace[] = [];
    const citationIds: string[] = [];
    const citations: CitationAppendedPayload[] = [];
    let finalAnswer = "";
    const startMs = Date.now();
    const deadline = Date.now() + (req.options?.timeoutMs ?? 120_000);
    const settings = getInternalSettings(this.conn);
    const retrievalConfig = settings.retrieval;

    try {
      this.sendEvent(reply, {
        eventId: genId("evt"),
        runId,
        threadId: req.threadId,
        type: "session.started",
        timestamp: nowIso(),
        payload: {
          question: req.question,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
        },
      });

      await this.updateStage(reply, runId, req.threadId, traces, "prepare", 100, "请求校验完成，准备检索资料", deadline);

      const maxCandidates = req.options?.maxCandidateMaterials ?? 8;
      const maxExpanded = req.options?.maxExpandedMaterials ?? 3;

      await this.updateStage(reply, runId, req.threadId, traces, "retrieve_brief", 40, "正在基于精简总结检索候选资料", deadline);

      let candidates = this.retrievalService.searchByBrief(
        req.question,
        req.filters?.categoryIds,
        maxCandidates,
        retrievalConfig,
      );
      if (req.filters?.materialIds && req.filters.materialIds.length > 0) {
        const include = new Set(req.filters.materialIds);
        candidates = candidates.filter((x) => include.has(x.materialId));
      }
      if (scope.scopeType === "material" && scope.scopeId) {
        const candidateCountBeforeScope = candidates.length;
        candidates = candidates.filter((x) => x.materialId === scope.scopeId);
        if (candidates.length === 0) {
          const forcedCandidate = this.buildForcedScopeCandidate(scope.scopeId);
          if (forcedCandidate) {
            candidates = [forcedCandidate];
            this.logger?.info(
              {
                event: "chat.retrieval.force_scope_material",
                runId,
                threadId: req.threadId,
                scopeType: scope.scopeType,
                scopeId: scope.scopeId,
                categoryIds: req.filters?.categoryIds ?? [],
                candidateCountBefore: candidateCountBeforeScope,
              },
              "单资料模式触发强制资料兜底",
            );
          }
        }
      }

      this.logger?.info(
        {
          event: "chat.retrieval.candidates",
          runId,
          threadId: req.threadId,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          candidateCount: candidates.length,
        },
        "候选资料检索完成",
      );

      this.sendEvent(reply, {
        eventId: genId("evt"),
        runId,
        threadId: req.threadId,
        type: "retrieval.candidates",
        timestamp: nowIso(),
        payload: {
          candidates: this.retrievalService.toEventCandidates(candidates),
        },
      });

      await this.ensureNotCancelled(runId, deadline);

      await this.updateStage(reply, runId, req.threadId, traces, "select_candidates", 100, `已筛选 ${candidates.length} 份候选资料`, deadline);

      const selectedByBrief = candidates.slice(0, Math.max(1, maxExpanded));
      for (const item of selectedByBrief) {
        this.sendEvent(reply, {
          eventId: genId("evt"),
          runId,
          threadId: req.threadId,
          type: "retrieval.selected",
          timestamp: nowIso(),
          payload: {
            materialId: item.materialId,
            level: "brief_summary",
            reason: "精简总结命中，进入详细整理复核",
          },
        });
      }

      await this.ensureNotCancelled(runId, deadline);

      await this.updateStage(
        reply,
        runId,
        req.threadId,
        traces,
        "expand_detailed",
        100,
        `展开读取 ${selectedByBrief.length} 份详细整理`,
        deadline,
      );

      const selected = this.retrievalService.rerankByDetailed(
        req.question,
        selectedByBrief,
        maxExpanded,
        retrievalConfig,
      );
      for (const item of selected) {
        this.sendEvent(reply, {
          eventId: genId("evt"),
          runId,
          threadId: req.threadId,
          type: "retrieval.selected",
          timestamp: nowIso(),
          payload: {
            materialId: item.materialId,
            level: "detailed_notes",
            reason: item.originalDecision,
          },
        });
      }

      const contextBlocks: string[] = [];
      let originalReadCount = 0;
      for (const item of selected) {
        const detail = this.materialService.getDetail(item.materialId);
        if (!detail) {
          continue;
        }
        const detailed =
          item.detailedNotes ||
          this.materialService.getContent(item.materialId, "detailed_notes")?.content ||
          "";
        const original = item.needsOriginal ? this.retrievalService.readOriginalByMaterial(item.materialId) : "";
        const snippet = (detailed || original || item.briefSummary).slice(0, 180);
        const level = item.needsOriginal ? "original" : "detailed_notes";
        if (item.needsOriginal) {
          originalReadCount += 1;
          this.sendEvent(reply, {
            eventId: genId("evt"),
            runId,
            threadId: req.threadId,
            type: "retrieval.selected",
            timestamp: nowIso(),
            payload: {
              materialId: item.materialId,
              level: "original",
              reason: item.originalDecision,
            },
          });
        }

        const citation: CitationAppendedPayload = {
          citationId: genId("cit"),
          materialId: item.materialId,
          materialTitle: detail.title,
          level,
          anchor: {
            sectionTitle: "自动片段",
            chunkIndex: 0,
          },
          snippet,
        };
        citations.push(citation);
        citationIds.push(citation.citationId);

        this.sendEvent(reply, {
          eventId: genId("evt"),
          runId,
          threadId: req.threadId,
          type: "citation.appended",
          timestamp: nowIso(),
          payload: citation,
        });

        contextBlocks.push(
          `资料标题：${detail.title}\n精简总结：${item.briefSummary}\n详细整理：${detailed}\n原文片段：${original.slice(0, 1200)}`,
        );
      }

      await this.updateStage(
        reply,
        runId,
        req.threadId,
        traces,
        "read_original",
        100,
        selected.length > 0
          ? `已按需补充原文片段（${originalReadCount} 份），跳过 ${Math.max(0, selected.length - originalReadCount)} 份`
          : "未命中可读资料，跳过原文读取",
        deadline,
      );

      await this.ensureNotCancelled(runId, deadline);

      await this.updateStage(reply, runId, req.threadId, traces, "synthesize_answer", 20, "正在生成最终回答", deadline);

      const provider = new OpenAiCompatibleProvider(settings.llmProvider, this.logger);

      const prompt = buildAnswerPrompt(req.question, contextBlocks);
      const llmResp = await provider.generate({
        model: settings.llmProvider.model,
        systemPrompt:
          "你是学习资料问答助手。请基于提供的资料回答问题。若信息不足要明确说明。输出中文。不要暴露隐式推理。",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        options: {
          allowFallback: true,
        },
      });

      if (llmResp.meta?.provider === "mock") {
        const reason = llmResp.meta.fallbackReason ?? "未知原因";
        await this.updateStage(
          reply,
          runId,
          req.threadId,
          traces,
          "synthesize_answer",
          45,
          `LLM 服务异常，已降级为本地草稿输出（${reason.slice(0, 64)}）`,
          deadline,
        );
      }

      for (const delta of splitForStreaming(llmResp.content, 26)) {
        await this.ensureNotCancelled(runId, deadline);
        finalAnswer += delta;
        this.sendEvent(reply, {
          eventId: genId("evt"),
          runId,
          threadId: req.threadId,
          type: "answer.delta",
          timestamp: nowIso(),
          payload: { delta },
        });
      }

      if (!finalAnswer) {
        finalAnswer = fallbackAnswer(req.question, citations);
        for (const delta of splitForStreaming(finalAnswer, 18)) {
          await this.ensureNotCancelled(runId, deadline);
          this.sendEvent(reply, {
            eventId: genId("evt"),
            runId,
            threadId: req.threadId,
            type: "answer.delta",
            timestamp: nowIso(),
            payload: { delta },
          });
        }
      }

      this.sendEvent(reply, {
        eventId: genId("evt"),
        runId,
        threadId: req.threadId,
        type: "answer.final",
        timestamp: nowIso(),
        payload: {
          content: finalAnswer,
          citations: citationIds,
        },
      });

      await this.updateStage(reply, runId, req.threadId, traces, "synthesize_answer", 100, "回答生成完成", deadline);
      await this.updateStage(reply, runId, req.threadId, traces, "finalize", 100, "已完成持久化与收尾", deadline);

      this.sendEvent(reply, {
        eventId: genId("evt"),
        runId,
        threadId: req.threadId,
        type: "trace.final",
        timestamp: nowIso(),
        payload: {
          steps: traces,
        },
      });

      this.insertAssistantMessage(req.threadId, runId, finalAnswer, citations, traces);
      this.finishRun(runId, "completed");

      this.sendEvent(reply, {
        eventId: genId("evt"),
        runId,
        threadId: req.threadId,
        type: "session.done",
        timestamp: nowIso(),
        payload: {
          status: "completed",
          durationMs: Date.now() - startMs,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      const { code, status } = mapError(message);

      if (code !== "CHAT_RUN_CANCELLED") {
        this.insertAssistantMessage(req.threadId, runId, "本次回答失败，请重试。", [], traces);
      }

      this.failRun(runId, status, code, message);

      this.sendEvent(reply, {
        eventId: genId("evt"),
        runId,
        threadId: req.threadId,
        type: "session.error",
        timestamp: nowIso(),
        payload: {
          code,
          message,
        },
      });

      this.sendEvent(reply, {
        eventId: genId("evt"),
        runId,
        threadId: req.threadId,
        type: "session.done",
        timestamp: nowIso(),
        payload: {
          status,
          durationMs: Date.now() - startMs,
        },
      });
    } finally {
      reply.raw.end();
    }
  }

  private sendEvent(reply: FastifyReply, event: ChatStreamEventType): void {
    reply.raw.write(`event: message\n`);
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  private buildForcedScopeCandidate(materialId: string): BriefCandidate | null {
    const detail = this.materialService.getDetail(materialId);
    if (!detail) {
      return null;
    }

    const briefSummary = this.materialService.getContent(materialId, "brief_summary")?.content ?? "";
    return {
      materialId,
      title: detail.title,
      briefScore: 1,
      briefSummary,
      categoryPaths: detail.categories.map((x) => x.path),
    };
  }

  private insertUserMessage(threadId: string, runId: string, question: string): void {
    this.conn
      .prepare(
        `INSERT INTO chat_messages(id, thread_id, run_id, role, content, citations_json, stage_trace_json, created_at)
         VALUES(?, ?, ?, 'user', ?, NULL, NULL, ?)`,
      )
      .run(genId("msg"), threadId, runId, question, nowIso());
  }

  private insertAssistantMessage(
    threadId: string,
    runId: string,
    content: string,
    citations: CitationAppendedPayload[],
    traces: StageTrace[],
  ): void {
    this.conn
      .prepare(
        `INSERT INTO chat_messages(id, thread_id, run_id, role, content, citations_json, stage_trace_json, created_at)
         VALUES(?, ?, ?, 'assistant', ?, ?, ?, ?)`,
      )
      .run(genId("msg"), threadId, runId, content, JSON.stringify(citations), JSON.stringify(traces), nowIso());
  }

  private finishRun(runId: string, status: "completed" | "failed" | "cancelled" | "timeout"): void {
    this.conn
      .prepare(
        `UPDATE chat_runs
         SET status=?, current_stage='finalize', finished_at=?, updated_at=?
         WHERE id=?`,
      )
      .run(status, nowIso(), nowIso(), runId);
  }

  private failRun(
    runId: string,
    status: "failed" | "cancelled" | "timeout",
    errorCode: string,
    errorMessage: string,
  ): void {
    this.conn
      .prepare(
        `UPDATE chat_runs
         SET status=?, error_code=?, error_message=?, finished_at=?, updated_at=?
         WHERE id=?`,
      )
      .run(status, errorCode, errorMessage, nowIso(), nowIso(), runId);
  }

  private async updateStage(
    reply: FastifyReply,
    runId: string,
    threadId: string,
    traces: StageTrace[],
    stage: ChatStage,
    progress: number,
    summary: string,
    deadline?: number,
  ): Promise<void> {
    await this.ensureNotCancelled(runId, deadline);
    const now = nowIso();

    this.conn
      .prepare("UPDATE chat_runs SET current_stage=?, updated_at=? WHERE id=?")
      .run(stage, now, runId);

    const idx = traces.findIndex((x) => x.stage === stage);
    const trace = { stage, summary };
    if (idx >= 0) {
      traces[idx] = trace;
    } else {
      traces.push(trace);
    }

    this.sendEvent(reply, {
      eventId: genId("evt"),
      runId,
      threadId,
      type: "stage.updated",
      timestamp: now,
      payload: {
        stage,
        status: progress >= 100 ? "completed" : "running",
        progress,
        summary,
      },
    });
  }

  private async ensureNotCancelled(runId: string, deadline?: number): Promise<void> {
    if (deadline && Date.now() > deadline) {
      throw new Error("CHAT_RUN_TIMEOUT");
    }

    const row = this.conn
      .prepare("SELECT cancel_requested FROM chat_runs WHERE id = ?")
      .get(runId) as { cancel_requested: number } | undefined;

    if (row?.cancel_requested === 1) {
      throw new Error("CHAT_RUN_CANCELLED");
    }
  }
}

function buildAnswerPrompt(question: string, contextBlocks: string[]): string {
  if (contextBlocks.length === 0) {
    return `问题：${question}\n\n当前没有命中的资料，请给出可执行的下一步建议。`;
  }
  return `问题：${question}\n\n参考资料：\n${contextBlocks.join("\n\n---\n\n")}\n\n请输出结构化回答：结论、依据、行动建议。`;
}

function fallbackAnswer(question: string, citations: CitationAppendedPayload[]): string {
  const lines = [
    `问题：${question}`,
    "目前已根据现有资料生成基础回答。",
    "建议：",
    "1. 优先阅读引用中的精简总结确认方向。",
    "2. 再查看详细整理补足背景。",
    "3. 如果仍有疑问，再回看原文片段。",
    `引用数量：${citations.length}`,
  ];
  return lines.join("\n");
}

function mapError(message: string): {
  code: "CHAT_RUN_CANCELLED" | "CHAT_RUN_TIMEOUT" | "INTERNAL_ERROR";
  status: "cancelled" | "timeout" | "failed";
} {
  if (message.includes("CHAT_RUN_CANCELLED")) {
    return { code: "CHAT_RUN_CANCELLED", status: "cancelled" };
  }
  if (message.includes("CHAT_RUN_TIMEOUT")) {
    return { code: "CHAT_RUN_TIMEOUT", status: "timeout" };
  }
  return {
    code: "INTERNAL_ERROR",
    status: "failed",
  };
}
