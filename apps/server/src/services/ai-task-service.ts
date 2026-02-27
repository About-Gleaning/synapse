import fs from "node:fs";
import type { LlmGenerateReq, MaterialAiStageStatus } from "@synapse/shared";
import { getInternalSettings } from "../core/settings";
import type { JobEntity } from "./job-service";
import { OpenAiCompatibleProvider } from "./llm-provider";
import type { MaterialService } from "./material-service";
import type Database from "better-sqlite3";
import type { CategoryService } from "./category-service";
import type { FastifyBaseLogger } from "fastify";

export class AiTaskService {
  constructor(
    private readonly conn: Database.Database,
    private readonly materialService: MaterialService,
    private readonly categoryService: CategoryService,
    private readonly logger?: FastifyBaseLogger,
  ) {}

  async handle(job: JobEntity): Promise<void> {
    if (!job.materialId) {
      throw new Error("任务缺少资料ID");
    }

    const info = this.materialService.getMaterialFileInfo(job.materialId);
    const sourceMd = fs.existsSync(info.sourceMdPath) ? fs.readFileSync(info.sourceMdPath, "utf-8") : "";
    const settings = getInternalSettings(this.conn);
    const provider = new OpenAiCompatibleProvider(settings.llmProvider, this.logger);

    if (job.jobType === "generate_brief_summary") {
      this.materialService.updateAiStatus(job.materialId, { briefSummaryStatus: "running", errorMessage: null });
      const content = await this.generateBrief(provider, info.title, sourceMd);
      fs.writeFileSync(info.briefPath, content, "utf-8");
      this.materialService.updateAiStatus(job.materialId, { briefSummaryStatus: "done" });
      this.materialService.upsertSearchIndex(job.materialId);
      return;
    }

    if (job.jobType === "generate_detailed_notes") {
      this.materialService.updateAiStatus(job.materialId, { detailedNotesStatus: "running", errorMessage: null });
      const content = await this.generateDetailed(provider, info.title, sourceMd);
      fs.writeFileSync(info.detailedPath, content, "utf-8");
      this.materialService.updateAiStatus(job.materialId, { detailedNotesStatus: "done" });
      this.materialService.upsertSearchIndex(job.materialId);
      return;
    }

    if (job.jobType === "classify_material") {
      this.materialService.updateAiStatus(job.materialId, { classifyStatus: "running", errorMessage: null });
      const suggestion = await this.generateClassification(provider, sourceMd);
      fs.writeFileSync(info.classifyPath, JSON.stringify(suggestion, null, 2), "utf-8");

      const names = suggestion.categories.slice(0, 2);
      if (names.length > 0) {
        const tree = this.categoryService.getTree();
        const allNodes = flattenTree(tree.nodes);
        const matched = allNodes.filter((x) => names.includes(x.name));
        if (matched.length > 0) {
          this.categoryService.bindMaterial(job.materialId, {
            categoryIds: matched.map((x) => x.id),
            source: "ai_suggested",
          });
        }
      }

      this.materialService.updateAiStatus(job.materialId, { classifyStatus: "done" });
      this.materialService.upsertSearchIndex(job.materialId);
      return;
    }

    throw new Error(`未知任务类型: ${job.jobType}`);
  }

  finalizeMaterialStatus(materialId: string): void {
    const detail = this.materialService.getDetail(materialId);
    if (!detail) {
      return;
    }

    const stageStatuses: MaterialAiStageStatus[] = [
      detail.briefSummaryStatus,
      detail.detailedNotesStatus,
      detail.classifyStatus,
    ];
    const hasInFlight = stageStatuses.some((x) => x === "pending" || x === "queued" || x === "running");
    if (hasInFlight) {
      this.materialService.updateAiStatus(materialId, { status: "processing_ai" });
      return;
    }

    const hasFailed = stageStatuses.some((x) => x === "failed");
    if (hasFailed) {
      this.materialService.updateAiStatus(materialId, { status: "failed" });
      return;
    }

    const allDone = stageStatuses.every((x) => x === "done");
    if (allDone) {
      this.materialService.updateAiStatus(materialId, { status: "ready", ingestStage: "completed", errorMessage: null });
      return;
    }

    this.materialService.updateAiStatus(materialId, { status: "processing_ai" });
  }

  markJobFailure(job: JobEntity, err: unknown): void {
    if (!job.materialId) {
      return;
    }

    const shouldRetry = job.retryCount + 1 <= job.maxRetries;
    const nextStageStatus: MaterialAiStageStatus = shouldRetry ? "queued" : "failed";
    const message = err instanceof Error ? err.message : "任务执行失败";
    if (job.jobType === "generate_brief_summary") {
      this.materialService.updateAiStatus(job.materialId, {
        briefSummaryStatus: nextStageStatus,
        status: shouldRetry ? "processing_ai" : undefined,
        errorMessage: message,
      });
    } else if (job.jobType === "generate_detailed_notes") {
      this.materialService.updateAiStatus(job.materialId, {
        detailedNotesStatus: nextStageStatus,
        status: shouldRetry ? "processing_ai" : undefined,
        errorMessage: message,
      });
    } else if (job.jobType === "classify_material") {
      this.materialService.updateAiStatus(job.materialId, {
        classifyStatus: nextStageStatus,
        status: shouldRetry ? "processing_ai" : undefined,
        errorMessage: message,
      });
    }

    const info = this.materialService.getMaterialFileInfo(job.materialId);
    const log = `[${new Date().toISOString()}] job=${job.jobType} retry=${job.retryCount + 1}/${job.maxRetries} error=${message}`;
    fs.appendFileSync(info.folderPath + "/logs/ai_jobs.log", `${log}\n`, "utf-8");
  }

  private async generateBrief(provider: OpenAiCompatibleProvider, title: string, sourceMd: string): Promise<string> {
    const req: LlmGenerateReq = {
      model: "",
      systemPrompt: "你是学习资料整理助手。请输出非常精简的中文总结，控制在8行内，保留关键术语。",
      messages: [
        {
          role: "user",
          content: `标题：${title}\n\n内容：\n${sourceMd.slice(0, 6000)}`,
        },
      ],
      temperature: 0.2,
      options: {
        allowFallback: false,
      },
    };

    const resp = await provider.generate(req);
    return `# 精简总结\n\n${resp.content.trim()}\n`;
  }

  private async generateDetailed(provider: OpenAiCompatibleProvider, title: string, sourceMd: string): Promise<string> {
    const req: LlmGenerateReq = {
      model: "",
      systemPrompt:
        "你是学习资料整理助手。请输出详细中文整理，结构包含：主线、关键概念、方法步骤、易错点、可行动建议。",
      messages: [
        {
          role: "user",
          content: `标题：${title}\n\n内容：\n${sourceMd.slice(0, 12000)}`,
        },
      ],
      temperature: 0.2,
      options: {
        allowFallback: false,
      },
    };

    const resp = await provider.generate(req);
    return `# 详细整理\n\n${resp.content.trim()}\n`;
  }

  private async generateClassification(
    provider: OpenAiCompatibleProvider,
    sourceMd: string,
  ): Promise<{ categories: string[]; reason: string }> {
    const req: LlmGenerateReq = {
      model: "",
      systemPrompt:
        "你是分类助手。请根据内容给出最多3个分类名称（优先AI、Agent、产品设计），并给出一句原因。输出JSON格式。",
      messages: [
        {
          role: "user",
          content: sourceMd.slice(0, 4000),
        },
      ],
      temperature: 0,
      options: {
        allowFallback: false,
      },
    };

    const resp = await provider.generate(req);
    const fallback = {
      categories: guessCategories(sourceMd),
      reason: "基于关键词自动分类",
    };

    try {
      const parsed = JSON.parse(stripCodeFence(resp.content)) as { categories?: string[]; reason?: string };
      const categories = (parsed.categories ?? []).filter(Boolean).slice(0, 3);
      if (categories.length === 0) {
        return fallback;
      }
      return {
        categories,
        reason: parsed.reason ?? fallback.reason,
      };
    } catch {
      return fallback;
    }
  }
}

function stripCodeFence(raw: string): string {
  const value = raw.trim();
  if (value.startsWith("```")) {
    return value.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  return value;
}

function flattenTree(nodes: Array<{ id: string; name: string; children: any[] }>): Array<{ id: string; name: string }> {
  const results: Array<{ id: string; name: string }> = [];
  const stack = [...nodes];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    results.push({ id: current.id, name: current.name });
    stack.push(...current.children);
  }
  return results;
}

function guessCategories(text: string): string[] {
  const lower = text.toLowerCase();
  const arr: string[] = [];
  if (lower.includes("agent") || lower.includes("智能体")) {
    arr.push("Agent");
  }
  if (lower.includes("ai") || lower.includes("llm") || lower.includes("模型")) {
    arr.push("AI");
  }
  if (lower.includes("产品") || lower.includes("设计") || lower.includes("用户")) {
    arr.push("产品设计");
  }
  if (arr.length === 0) {
    arr.push("AI");
  }
  return Array.from(new Set(arr)).slice(0, 3);
}
