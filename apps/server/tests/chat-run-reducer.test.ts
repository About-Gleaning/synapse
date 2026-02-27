import assert from "node:assert/strict";
import test from "node:test";
import type { ChatRunVO, ChatStreamEventType } from "@synapse/shared";
import { chatRunViewReducer } from "../../web/src/features/chat/model/chatRunReducer";
import { createInitialChatRunViewState } from "../../web/src/features/chat/model/chatRunViewState";

function buildBaseEvent(): Pick<ChatStreamEventType, "eventId" | "runId" | "threadId" | "timestamp"> {
  return {
    eventId: "evt_1",
    runId: "run_1",
    threadId: "thread_1",
    timestamp: "2026-02-27T15:30:00.000Z",
  };
}

test("session.started 会重置并初始化运行上下文", () => {
  const initial = createInitialChatRunViewState();
  const event: Extract<ChatStreamEventType, { type: "session.started" }> = {
    ...buildBaseEvent(),
    type: "session.started",
    payload: {
      question: "如何做向量检索？",
      scopeType: "global",
      scopeId: null,
    },
  };

  const next = chatRunViewReducer(initial, { type: "APPLY_EVENT", event });
  assert.equal(next.status, "starting");
  assert.equal(next.runId, "run_1");
  assert.equal(next.threadId, "thread_1");
  assert.equal(next.question, "如何做向量检索？");
  assert.equal(next.recoveryHint, null);
});

test("stage.updated 会更新阶段状态与总体进度", () => {
  const base = chatRunViewReducer(createInitialChatRunViewState(), {
    type: "APPLY_EVENT",
    event: {
      ...buildBaseEvent(),
      type: "session.started",
      payload: {
        question: "query",
        scopeType: "global",
        scopeId: null,
      },
    },
  });

  const event: Extract<ChatStreamEventType, { type: "stage.updated" }> = {
    ...buildBaseEvent(),
    type: "stage.updated",
    payload: {
      stage: "retrieve_brief",
      status: "running",
      progress: 50,
      summary: "正在检索候选资料",
    },
  };
  const next = chatRunViewReducer(base, { type: "APPLY_EVENT", event });

  assert.equal(next.status, "running");
  assert.equal(next.stages.retrieve_brief.status, "running");
  assert.equal(next.stages.retrieve_brief.progress, 50);
  assert.match(next.stages.retrieve_brief.summary ?? "", /检索候选资料/);
  assert.ok(next.overallProgress > 0);
  assert.equal(next.traceSteps.length, 1);
  assert.equal(next.traceSteps[0].stage, "retrieve_brief");
});

test("citation.appended 会按 citationId 去重", () => {
  const base = chatRunViewReducer(createInitialChatRunViewState(), {
    type: "APPLY_EVENT",
    event: {
      ...buildBaseEvent(),
      type: "session.started",
      payload: {
        question: "query",
        scopeType: "global",
        scopeId: null,
      },
    },
  });

  const citationEvent: Extract<ChatStreamEventType, { type: "citation.appended" }> = {
    ...buildBaseEvent(),
    type: "citation.appended",
    payload: {
      citationId: "cit_1",
      materialId: "mat_1",
      materialTitle: "资料 1",
      level: "detailed_notes",
      snippet: "first snippet",
    },
  };

  const next = chatRunViewReducer(base, { type: "APPLY_EVENT", event: citationEvent });
  const deduped = chatRunViewReducer(next, {
    type: "APPLY_EVENT",
    event: {
      ...citationEvent,
      payload: {
        ...citationEvent.payload,
        snippet: "second snippet should be ignored",
      },
    },
  });

  assert.equal(deduped.citations.length, 1);
  assert.equal(deduped.citations[0].snippet, "first snippet");
});

test("APPLY_RUN_RECOVERY 会将 failed run 映射为失败态并补齐默认错误信息", () => {
  const initial = createInitialChatRunViewState();
  const recoveredRun: ChatRunVO = {
    id: "run_2",
    threadId: "thread_2",
    status: "failed",
    currentStage: "synthesize_answer",
    errorCode: null,
    errorMessage: null,
    startedAt: "2026-02-27T15:20:00.000Z",
    finishedAt: "2026-02-27T15:21:00.000Z",
    createdAt: "2026-02-27T15:20:00.000Z",
    updatedAt: "2026-02-27T15:21:00.000Z",
  };

  const next = chatRunViewReducer(initial, {
    type: "APPLY_RUN_RECOVERY",
    run: recoveredRun,
    message: "检测到断线，已恢复运行状态",
  });

  assert.equal(next.runId, "run_2");
  assert.equal(next.threadId, "thread_2");
  assert.equal(next.status, "failed");
  assert.equal(next.error?.code, "INTERNAL_ERROR");
  assert.equal(next.error?.message, "运行异常结束");
  assert.equal(next.recoveryHint, "检测到断线，已恢复运行状态");
});
