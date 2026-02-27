# Synapse

本项目是本地学习资料库 + AI 问答助手的一期实现，技术栈为 TypeScript，包含：

- `apps/server`: 本地后端（Fastify + SQLite + SSE）
- `apps/web`: 前端界面（React + Vite）
- `apps/desktop`: Electron 壳（本地桌面启动入口）
- `packages/shared`: 前后端共享类型（Req/VO/SSE 事件）

## 已实现能力

1. 资料导入（URL 图文）
- 抓取网页
- 存储 `source.html` 与 `source.md`
- 每份资料单独目录存放
- 基于 `canonical_url + content_hash` 判重

2. 异步 AI 任务
- 自动生成 `brief_summary.md`
- 自动生成 `detailed_notes.md`
- 自动生成 `classification_suggestion.json`

3. 全局/单资料流式问答
- `HTTP + SSE` 协议
- 事件类型：`session.started` / `stage.updated` / `retrieval.*` / `citation.appended` / `answer.*` / `trace.final` / `session.done`
- 支持取消运行

4. 前端四大模块
- 引用的文档
- 思考过程
- 最终输出
- 执行流程及进度

## 目录结构

```text
apps/
  server/
  web/
  desktop/
packages/
  shared/
```

## 启动说明（环境准备后）

1. 安装依赖
```bash
pnpm install
```

2. 配置环境变量（按需）
```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
cp apps/desktop/.env.example apps/desktop/.env
```

3. 启动后端
```bash
pnpm dev:server
```

4. 启动前端
```bash
pnpm dev:web
```

5. 启动 Electron（可选）
```bash
pnpm dev:desktop
```

默认后端地址：`http://127.0.0.1:38655`

## 协议与实现入口

- 后端路由：`apps/server/src/api/routes.ts`
- 聊天流式编排：`apps/server/src/services/chat-service.ts`
- 资料导入：`apps/server/src/services/material-service.ts`
- 异步任务处理：`apps/server/src/services/ai-task-service.ts`
- 前端状态机：`apps/web/src/features/chat/model/chatRunReducer.ts`
- 前端流式 Hook：`apps/web/src/features/chat/hooks/useChatStreamRun.ts`
- 共享 SSE 类型：`packages/shared/src/chat-stream.ts`
