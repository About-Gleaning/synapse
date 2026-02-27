import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { createDb } from "../db/database";
import { CategoryService } from "../services/category-service";
import { JobService } from "../services/job-service";
import { MaterialService } from "../services/material-service";
import { AiTaskService } from "../services/ai-task-service";
import { ChatService } from "../services/chat-service";

export interface AppContext {
  db: ReturnType<typeof createDb>;
  categoryService: CategoryService;
  jobService: JobService;
  materialService: MaterialService;
  aiTaskService: AiTaskService;
  chatService: ChatService;
  close: () => void;
}

export function buildAppContext(logger: FastifyBaseLogger): AppContext {
  const db = createDb(path.join(process.cwd(), ".synapse-data", "app.db"));
  const categoryService = new CategoryService(db.conn);
  const jobService = new JobService(db.conn);
  const materialService = new MaterialService(db.conn, jobService, categoryService);
  const aiTaskService = new AiTaskService(db.conn, materialService, categoryService, logger);
  const chatService = new ChatService(db.conn, materialService, logger);

  categoryService.ensureDefaults();

  jobService.startWorker({
    generate_brief_summary: async (job) => {
      try {
        await aiTaskService.handle(job);
      } catch (err) {
        aiTaskService.markJobFailure(job, err);
        throw err;
      } finally {
        if (job.materialId) {
          aiTaskService.finalizeMaterialStatus(job.materialId);
        }
      }
    },
    generate_detailed_notes: async (job) => {
      try {
        await aiTaskService.handle(job);
      } catch (err) {
        aiTaskService.markJobFailure(job, err);
        throw err;
      } finally {
        if (job.materialId) {
          aiTaskService.finalizeMaterialStatus(job.materialId);
        }
      }
    },
    classify_material: async (job) => {
      try {
        await aiTaskService.handle(job);
      } catch (err) {
        aiTaskService.markJobFailure(job, err);
        throw err;
      } finally {
        if (job.materialId) {
          aiTaskService.finalizeMaterialStatus(job.materialId);
        }
      }
    },
  });

  logger.info("应用上下文初始化完成");

  return {
    db,
    categoryService,
    jobService,
    materialService,
    aiTaskService,
    chatService,
    close: () => {
      jobService.stopWorker();
      db.close();
    },
  };
}
