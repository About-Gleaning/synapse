# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Synapse 是一个本地学习资料库 + AI 问答助手系统，采用 pnpm monorepo 架构，技术栈为 TypeScript。

**核心功能**：
- 资料导入：抓取网页内容（URL 图文），存储为 `source.html`、`source.md`，基于 `canonical_url + content_hash` 判重
- 异步 AI 任务：自动生成摘要（`brief_summary.md`）、详细笔记（`detailed_notes.md`）、分类建议（`classification_suggestion.json`）
- 流式问答：支持全局/单资料流式问答，使用 HTTP + SSE 协议

**架构组成**：
- `apps/server`: Fastify 后端 + SQLite + SSE 流式响应
- `apps/web`: React + Vite 前端界面
- `apps/desktop`: Electron 桌面壳
- `packages/shared`: 前后端共享类型定义（Req/VO/SSE 事件）

## 开发命令

### 依赖安装
```bash
pnpm install
```

### 启动服务
```bash
# 后端服务（默认端口 38655）
pnpm dev:server

# 前端服务
pnpm dev:web

# Electron 桌面应用（可选）
pnpm dev:desktop

# 使用 dev.sh 统一管理后端和前端
./dev.sh start      # 启动后端与前端（后台运行，PID 管理）
./dev.sh stop       # 停止后端与前端
./dev.sh restart    # 重启后端与前端
./dev.sh status     # 查看运行状态
./dev.sh logs       # 实时查看日志
```

**注意**：`dev.sh` 将服务以后台模式运行，日志输出到 `logs/` 目录，PID 文件存储在 `.run/` 目录。

### 构建与测试
```bash
# 构建所有工作区
pnpm build

# 运行后端测试套件
pnpm --filter @synapse/server test

# 运行单个测试文件
pnpm --filter @synapse/server exec tsx --test tests/specific-test.test.ts
```

### 环境配置
首次启动前需配置环境变量：
```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
cp apps/desktop/.env.example apps/desktop/.env
```

## 核心架构与数据流

### 后端架构（apps/server）

**应用上下文初始化**（`src/core/app-context.ts`）：
- `buildAppContext()` 初始化所有服务实例并注册异步任务 worker
- 服务依赖链：`Database -> CategoryService/JobService -> MaterialService -> AiTaskService/ChatService`
- 异步任务类型：`generate_brief_summary`、`generate_detailed_notes`、`classify_material`

**关键服务模块**：
- `MaterialService`（`src/services/material-service.ts`）：资料导入、判重、内容管理
- `AiTaskService`（`src/services/ai-task-service.ts`）：异步 AI 任务编排与执行
- `ChatService`（`src/services/chat-service.ts`）：流式问答编排，分阶段（prepare → retrieve → synthesize）
- `JobService`（`src/services/job-service.ts`）：异步任务队列管理（基于 SQLite）
- `RetrievalService`（`src/services/retrieval-service.ts`）：多层级检索（brief_summary → detailed_notes → original）

**路由结构**（`src/api/routes.ts`）：
- `/api/materials/*`: 资料导入、列表、详情、内容获取、AI 重建
- `/api/categories/*`: 分类树管理、创建、更新、移动、绑定
- `/api/chat/*`: 创建问答会话、流式 SSE 端点、取消运行、历史查询
- `/api/settings/*`: 系统配置管理

**Ingestor 机制**（`src/services/ingestors/`）：
- 根据 URL 特征自动选择合适的 ingestor（微信公众号、小红书、通用网页）
- 统一接口：`canHandle(url)` + `ingest(url)` → 返回 `{ title, text, html, images, canonical_url }`

### 前端架构（apps/web）

**状态管理**（`src/features/chat/model/chatRunReducer.ts`）：
- 基于 reducer 的流式事件状态机，处理 10 种 SSE 事件类型
- 核心状态：`ChatRunViewState` 包含 runId、stages、citations、answer、retrieval 等

**流式接收 Hook**（`src/features/chat/hooks/useChatStreamRun.ts`）：
- 封装 SSE 连接管理、事件解析、状态更新、自动重连逻辑
- 支持取消运行（调用 `/api/chat/cancel-run`）

**四大展示面板**：
1. `ChatCitationsPanel`：引用的文档列表
2. `ChatTracePanel`：思考过程（stages trace）
3. `ChatAnswerPanel`：流式输出的最终答案
4. `ChatProgressPanel`：执行流程及进度条

### 共享类型定义（packages/shared）

**SSE 事件协议**（`src/chat-stream.ts`）：
- `session.started`: 会话启动，携带问题与作用域
- `stage.updated`: 阶段更新（7 个 stage：prepare → retrieve_brief → select_candidates → expand_detailed → read_original → synthesize_answer → finalize）
- `retrieval.candidates` / `retrieval.selected`: 检索候选与选中通知
- `citation.appended`: 引用追加（含 materialId、level、snippet）
- `answer.delta` / `answer.final`: 流式答案增量与最终完整内容
- `trace.final`: 完整执行轨迹
- `session.error` / `session.done`: 错误与完成事件

**命名规范**：
- 接口请求：`*Req` 后缀（如 `MaterialImportReq`）
- 接口响应：`*VO` 后缀（如 `MaterialDetailVO`）
- 查询对象：`*QueryReq` 后缀
- 缓存对象：`*CacheDTO` 后缀（如需 Redis）

## 数据存储与文件结构

**SQLite 数据库**：`apps/server/.synapse-data/app.db`
- 核心表：`materials`（资料元数据）、`categories`（分类树）、`jobs`（异步任务队列）、`chat_threads`（对话线程）

**资料文件存储**：`apps/server/.synapse-data/materials/{materialId}/`
- `source.html`: 原始网页内容
- `source.md`: Markdown 格式内容
- `brief_summary.md`: AI 生成的简要摘要
- `detailed_notes.md`: AI 生成的详细笔记
- `classification_suggestion.json`: 分类建议

**日志与运行时文件**：
- `logs/`: dev.sh 管理的服务日志（`server.log`, `web.log`）
- `.run/`: dev.sh 管理的 PID 文件（`server.pid`, `web.pid`）
- `apps/server/.synapse-data/`: 数据库与资料文件（**禁止提交到 Git**）

## 编码规范

### TypeScript 配置
- 使用 `tsconfig.base.json` 作为共享配置基础
- 严格模式：`strict: true`，`forceConsistentCasingInFileNames: true`
- 模块解析：`moduleResolution: "Bundler"`，支持 ESM

### 代码风格
- 缩进：2 空格
- 引号：双引号
- 尾随逗号：保持一致
- 命名约定：
  - React 组件：`PascalCase`（如 `ChatProgressPanel.tsx`）
  - 服务/工具模块：`kebab-case` 或 `camelCase`
  - 测试文件：`*.test.ts`，放置在 `apps/server/tests/` 下

### 禁止事项
- **禁止提交敏感信息**：`.env` 文件、API 密钥、数据库文件（`.synapse-data/`）
- **禁止硬编码配置**：使用 `src/core/settings.ts` 管理系统配置
- **禁止直接操作数据库**：必须通过 Service 层封装的方法进行数据访问

## 测试与调试

### 后端测试
- 测试文件位置：`apps/server/tests/*.test.ts`
- 运行全部测试：`pnpm --filter @synapse/server test`
- 测试重点：Service 层业务逻辑、路由行为、流式事件编排、检索逻辑

### 调试技巧
- 后端日志：直接查看控制台或 `logs/server.log`（dev.sh 模式）
- SSE 调试：浏览器 Network 面板查看 EventStream 类型请求
- 数据库检查：使用 SQLite 客户端打开 `apps/server/.synapse-data/app.db`

## Git 规范

### Commit Message 格式
遵循 `type(scope): summary` 格式，**统一使用中文描述**：
- `feat(server): 新增资料判重逻辑`
- `fix(web): 修复流式问答中断问题`
- `refactor(shared): 优化 SSE 事件类型定义`
- `test(server): 增加 ChatService 单元测试`

### 提交原则
- 保持 commits 原子化，每个 commit 只做一件事
- PR 应包含：目的说明、影响模块、测试证据、配置变更说明、UI 截图（前端变更时）

## 安全与配置

### 环境变量管理
- 使用 `.env.example` 作为模板，本地复制为 `.env`
- **禁止提交 `.env` 文件到 Git**

### API 安全
- 所有外部 URL 和用户输入必须在 API 边界进行校验
- 避免在响应中泄露原始错误堆栈信息
- 使用 `src/utils/response.ts` 的 `ok()` 和 `fail()` 封装统一响应格式

### 数据隐私
- 本地 SQLite 数据库，无需外部数据库服务
- 资料文件存储在本地 `.synapse-data/` 目录，确保不被 Git 跟踪

## 常见开发场景

### 新增一个资料 Ingestor
1. 在 `apps/server/src/services/ingestors/` 创建新 ingestor 文件（如 `zhihu-ingestor.ts`）
2. 实现 `IngestorInterface` 接口：`canHandle()` + `ingest()`
3. 在 `resolver.ts` 的 `resolveIngestor()` 中注册新 ingestor
4. 添加单元测试验证 URL 匹配与内容提取逻辑

### 新增一个 SSE 事件类型
1. 在 `packages/shared/src/chat-stream.ts` 定义新的 Payload 和 Event 类型
2. 在后端 `ChatService` 的流式编排中发送新事件
3. 在前端 `chatRunReducer.ts` 中添加对应的 case 处理
4. 更新前端展示组件以呈现新事件内容

### 修改检索策略
1. 编辑 `apps/server/src/services/retrieval-service.ts`
2. 调整 `retrieve()` 方法中的分层检索逻辑（brief → detailed → original）
3. 更新 `stage.updated` 事件的 summary 描述
4. 添加单元测试覆盖新检索路径

### 扩展分类功能
1. 修改 `CategoryService` 的树结构操作逻辑
2. 更新数据库 schema（如有需要，需手动执行 SQL）
3. 同步更新 `packages/shared` 中的类型定义（如 `CategoryVO`）
4. 前端 `CategoryManagementPanel` 适配新字段或行为
