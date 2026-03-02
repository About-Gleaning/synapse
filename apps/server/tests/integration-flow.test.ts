import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type Database from "better-sqlite3";
import type { FastifyReply } from "fastify";
import type { ChatStreamEventType } from "@synapse/shared";
import { updateSettings } from "../src/core/settings";
import { createDb } from "../src/db/database";
import { AiTaskService } from "../src/services/ai-task-service";
import { CategoryService } from "../src/services/category-service";
import { ChatService } from "../src/services/chat-service";
import { JobService, type JobEntity, type JobType } from "../src/services/job-service";
import { MaterialService } from "../src/services/material-service";

interface TestContext {
  conn: Database.Database;
  workspace: string;
  knowledgeRoot: string;
  categoryService: CategoryService;
  jobService: JobService;
  materialService: MaterialService;
  aiTaskService: AiTaskService;
  chatService: ChatService;
  cleanup: () => void;
}

interface MockSseRaw {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  flushHeaders: () => void;
  write: (chunk: string | Uint8Array) => boolean;
  end: (chunk?: string | Uint8Array) => void;
  getText: () => string;
}

function setupTestContext(): TestContext {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "synapse-integration-test-"));
  const dbPath = path.join(workspace, "test.sqlite");
  const knowledgeRoot = path.join(workspace, "knowledge-root");
  const dbClient = createDb(dbPath);

  updateSettings(dbClient.conn, {
    knowledgeRoot,
    llmProvider: {
      baseUrl: "https://llm.local/v1",
      apiKey: "test-key",
      model: "mock-model",
    },
  });

  const categoryService = new CategoryService(dbClient.conn);
  categoryService.ensureDefaults();
  const jobService = new JobService(dbClient.conn);
  const materialService = new MaterialService(dbClient.conn, jobService, categoryService);
  const aiTaskService = new AiTaskService(dbClient.conn, materialService, categoryService);
  const chatService = new ChatService(dbClient.conn, materialService);

  return {
    conn: dbClient.conn,
    workspace,
    knowledgeRoot,
    categoryService,
    jobService,
    materialService,
    aiTaskService,
    chatService,
    cleanup: () => {
      dbClient.close();
      fs.rmSync(workspace, { recursive: true, force: true });
    },
  };
}

function createMockSseRaw(): MockSseRaw {
  const chunks: string[] = [];
  return {
    statusCode: 200,
    setHeader: () => {},
    flushHeaders: () => {},
    write: (chunk) => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
      return true;
    },
    end: (chunk) => {
      if (chunk) {
        chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
      }
    },
    getText: () => chunks.join(""),
  };
}

function parseSseEvents(raw: string): ChatStreamEventType[] {
  const frames = raw.split("\n\n").filter(Boolean);
  const events: ChatStreamEventType[] = [];
  for (const frame of frames) {
    const dataLines = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    if (dataLines.length === 0) {
      continue;
    }
    events.push(JSON.parse(dataLines.join("\n")) as ChatStreamEventType);
  }
  return events;
}

async function drainQueuedJobs(
  jobService: JobService,
  handlers: Record<JobType, (job: JobEntity) => Promise<void>>,
): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    const pending = jobService.list("queued,running");
    if (pending.length === 0) {
      return;
    }
    await (jobService as any).tick(handlers);
  }
  throw new Error("任务消费超时：queued/running 状态未清空");
}

function createFetchMock(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("http://93.184.216.34/material-1")) {
      return new Response(
        `<!doctype html><html><head><title>Agent 工作流实战</title></head><body>
           <article>
             <h1>Agent 工作流实战</h1>
             <p>本文介绍 Agent 工作流、向量检索与知识库问答实践。</p>
             <p>重点包括检索门控、引用追踪、失败恢复。</p>
           </article>
         </body></html>`,
        {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      );
    }

    if (url === "https://llm.local/v1/chat/completions") {
      const payloadText = typeof init?.body === "string" ? init.body : "{}";
      const payload = JSON.parse(payloadText) as {
        messages?: Array<{ role: string; content: string }>;
      };
      const systemPrompt = payload.messages?.find((x) => x.role === "system")?.content ?? "";

      let content = "默认回复";
      if (systemPrompt.includes("非常精简")) {
        content = "Agent 工作流强调任务拆解、检索增强与可观测执行。";
      } else if (systemPrompt.includes("详细中文整理")) {
        content = "主线：基于资料做检索增强问答。方法：先精简召回，再详细复核，再按需补原文。";
      } else if (systemPrompt.includes("分类助手")) {
        content = JSON.stringify({
          categories: ["AI", "Agent"],
          reason: "文本核心围绕 AI Agent 与检索问答实践",
        });
      } else if (systemPrompt.includes("学习资料问答助手")) {
        content = "资料强调 Agent 工作流应先做候选检索，再按证据生成结论。";
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content,
              },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    throw new Error(`FETCH_NOT_MOCKED:${url}`);
  };
}

async function handleJobWithFinalize(ctx: TestContext, job: JobEntity): Promise<void> {
  try {
    await ctx.aiTaskService.handle(job);
  } catch (err) {
    ctx.aiTaskService.markJobFailure(job, err);
    throw err;
  } finally {
    if (job.materialId) {
      ctx.aiTaskService.finalizeMaterialStatus(job.materialId);
    }
  }
}

async function importReadyMaterial(ctx: TestContext): Promise<{ materialId: string }> {
  const importResp = await ctx.materialService.importMaterial({
    sourceUrl: "http://93.184.216.34/material-1",
    sourceTypeHint: "web_page",
  });

  assert.equal(importResp.status, "processing_ai");
  assert.equal(importResp.jobIds.length, 3);

  await drainQueuedJobs(ctx.jobService, {
    generate_brief_summary: async (job) => handleJobWithFinalize(ctx, job),
    generate_detailed_notes: async (job) => handleJobWithFinalize(ctx, job),
    classify_material: async (job) => handleJobWithFinalize(ctx, job),
  });

  const detail = ctx.materialService.getDetail(importResp.materialId);
  assert.ok(detail);
  assert.equal(detail.status, "ready");
  assert.equal(detail.briefSummaryStatus, "done");
  assert.equal(detail.detailedNotesStatus, "done");
  assert.equal(detail.classifyStatus, "done");

  return {
    materialId: importResp.materialId,
  };
}

test("集成链路：导入 -> AI 任务 -> 问答流式事件与持久化", async () => {
  const ctx = setupTestContext();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createFetchMock();

  try {
    const importResp = await importReadyMaterial(ctx);

    const jobs = ctx.jobService.list().filter((job) => job.materialId === importResp.materialId);
    assert.equal(jobs.length, 3);
    assert.ok(jobs.every((job) => job.status === "succeeded"));

    const fileInfo = ctx.materialService.getMaterialFileInfo(importResp.materialId);
    assert.equal(fs.existsSync(fileInfo.briefPath), true);
    assert.equal(fs.existsSync(fileInfo.detailedPath), true);
    assert.equal(fs.existsSync(fileInfo.classifyPath), true);

    const thread = ctx.chatService.createThread({
      scopeType: "global",
      scopeId: null,
      title: "集成测试会话",
    });

    const raw = createMockSseRaw();
    await ctx.chatService.streamAnswer(
      { scopeType: "global", scopeId: null },
      {
        threadId: thread.id,
        question: "请总结 Agent 工作流在知识库问答中的关键步骤",
      },
      { raw } as unknown as FastifyReply,
    );

    const events = parseSseEvents(raw.getText());
    assert.ok(events.length > 0);
    assert.ok(events.some((event) => event.type === "session.started"));
    assert.ok(events.some((event) => event.type === "retrieval.candidates"));
    assert.ok(events.some((event) => event.type === "citation.appended"));
    assert.ok(events.some((event) => event.type === "answer.final"));
    assert.ok(events.some((event) => event.type === "trace.final"));
    assert.equal(events.some((event) => event.type === "session.error"), false);

    const doneEvent = events.find((event) => event.type === "session.done");
    assert.ok(doneEvent);
    assert.equal(doneEvent.type, "session.done");
    assert.equal(doneEvent.payload.status, "completed");

    const messages = ctx.chatService.getMessages(thread.id);
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.role, "user");
    assert.equal(messages[1]?.role, "assistant");

    const runId = events[0]?.runId;
    assert.ok(runId);
    const run = ctx.chatService.getRun(runId);
    assert.ok(run);
    assert.equal(run.status, "completed");
  } finally {
    globalThis.fetch = originalFetch;
    ctx.cleanup();
  }
});

test("单资料模式：检索零命中时仍注入当前资料", async () => {
  const ctx = setupTestContext();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createFetchMock();

  try {
    const importResp = await importReadyMaterial(ctx);
    const thread = ctx.chatService.createThread({
      scopeType: "material",
      scopeId: importResp.materialId,
      title: "单资料零命中兜底",
    });

    const raw = createMockSseRaw();
    await ctx.chatService.streamAnswer(
      { scopeType: "material", scopeId: importResp.materialId },
      {
        threadId: thread.id,
        question: "如题提高第一个token的响应速度",
      },
      { raw } as unknown as FastifyReply,
    );

    const events = parseSseEvents(raw.getText());
    const candidatesEvent = events.find(
      (event): event is Extract<ChatStreamEventType, { type: "retrieval.candidates" }> =>
        event.type === "retrieval.candidates",
    );
    assert.ok(candidatesEvent);
    assert.ok(candidatesEvent.payload.candidates.some((x) => x.materialId === importResp.materialId));

    const citations = events.filter(
      (event): event is Extract<ChatStreamEventType, { type: "citation.appended" }> => event.type === "citation.appended",
    );
    assert.ok(citations.length > 0);
    assert.ok(citations.every((event) => event.payload.materialId === importResp.materialId));

    const messages = ctx.chatService.getMessages(thread.id);
    const assistant = messages.find((item) => item.role === "assistant");
    assert.ok(assistant?.citationsJson);
    const persistedCitations = JSON.parse(assistant.citationsJson ?? "[]") as Array<{ materialId: string }>;
    assert.ok(persistedCitations.length > 0);
    assert.ok(persistedCitations.every((item) => item.materialId === importResp.materialId));
  } finally {
    globalThis.fetch = originalFetch;
    ctx.cleanup();
  }
});

test("普通会话线程：通过 scopeOverride 指定资料时应按单资料范围检索", async () => {
  const ctx = setupTestContext();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createFetchMock();

  try {
    const importResp = await importReadyMaterial(ctx);
    const thread = ctx.chatService.createThread({
      scopeType: "global",
      scopeId: null,
      title: "普通会话 scopeOverride 单资料",
    });

    const raw = createMockSseRaw();
    await ctx.chatService.streamAnswer(
      { scopeType: "material", scopeId: importResp.materialId },
      {
        threadId: thread.id,
        question: "请基于指定资料总结核心观点",
      },
      { raw } as unknown as FastifyReply,
    );

    const events = parseSseEvents(raw.getText());
    const candidatesEvent = events.find(
      (event): event is Extract<ChatStreamEventType, { type: "retrieval.candidates" }> =>
        event.type === "retrieval.candidates",
    );
    assert.ok(candidatesEvent);
    assert.ok(candidatesEvent.payload.candidates.some((x) => x.materialId === importResp.materialId));

    const citations = events.filter(
      (event): event is Extract<ChatStreamEventType, { type: "citation.appended" }> => event.type === "citation.appended",
    );
    assert.ok(citations.length > 0);
    assert.ok(citations.every((event) => event.payload.materialId === importResp.materialId));
  } finally {
    globalThis.fetch = originalFetch;
    ctx.cleanup();
  }
});

test("单资料模式：分类不匹配时仍注入当前资料", async () => {
  const ctx = setupTestContext();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createFetchMock();

  try {
    const importResp = await importReadyMaterial(ctx);
    const thread = ctx.chatService.createThread({
      scopeType: "material",
      scopeId: importResp.materialId,
      title: "单资料分类过滤兜底",
    });

    const raw = createMockSseRaw();
    await ctx.chatService.streamAnswer(
      { scopeType: "material", scopeId: importResp.materialId },
      {
        threadId: thread.id,
        question: "请总结文章主旨",
        filters: {
          categoryIds: ["cat_not_exists"],
        },
      },
      { raw } as unknown as FastifyReply,
    );

    const events = parseSseEvents(raw.getText());
    const candidatesEvent = events.find(
      (event): event is Extract<ChatStreamEventType, { type: "retrieval.candidates" }> =>
        event.type === "retrieval.candidates",
    );
    assert.ok(candidatesEvent);
    assert.ok(candidatesEvent.payload.candidates.some((x) => x.materialId === importResp.materialId));
    assert.ok(events.some((event) => event.type === "citation.appended"));
  } finally {
    globalThis.fetch = originalFetch;
    ctx.cleanup();
  }
});
