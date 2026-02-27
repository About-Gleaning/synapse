# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` monorepo.
- `apps/server`: Fastify backend, SQLite integration, SSE APIs, and server tests.
- `apps/web`: React + Vite frontend.
- `apps/desktop`: Electron shell for local desktop startup.
- `packages/shared`: shared TypeScript types and stream/event contracts.
- `docs`: handoff notes and execution plans.
- `logs`, `.run`: local runtime artifacts.

Prefer editing `src/` files. Treat `dist/` as build output unless a release task explicitly requires updates.

## Build, Test, and Development Commands
- `pnpm install`: install workspace dependencies.
- `pnpm dev:server`: run backend at `http://127.0.0.1:38655`.
- `pnpm dev:web`: run frontend with Vite.
- `pnpm dev:desktop`: build and launch Electron app.
- `./dev.sh start|stop|restart|status|logs`: manage backend + web together with PID/log handling.
- `pnpm build`: build all workspaces recursively.
- `pnpm --filter @synapse/server test`: run backend test suite (`tests/**/*.test.ts`).

## Coding Style & Naming Conventions
- Language: TypeScript (strict mode enabled in `tsconfig.base.json`).
- Formatting style in current codebase: 2-space indentation, double quotes, trailing commas.
- Naming:
  - React components: `PascalCase` (e.g., `ChatProgressPanel.tsx`).
  - Utility/service modules: `kebab-case` or descriptive camel/prefix naming by domain.
  - Tests: `*.test.ts` and colocated under `apps/server/tests`.

No dedicated lint/formatter script is currently configured; keep changes consistent with nearby files and keep imports tidy.

## Testing Guidelines
Add or update tests when changing backend services, route behavior, stream events, or retrieval logic. Prefer focused unit tests plus at least one integration-path test for cross-module flows.

## Commit & Pull Request Guidelines
The repository currently has no commit history, so adopt this baseline convention:
- Commit message format: `type(scope): summary` (example: `feat(server): add material job retry guard`).
- Keep commits small and single-purpose.
- PRs should include: purpose, impacted modules, test evidence (command + result), config/env changes, and UI screenshots for frontend behavior changes.

## Security & Configuration Tips
- Copy `.env.example` files to local `.env`; never commit secrets.
- Do not commit local runtime data under `apps/server/.synapse-data/`.
- Validate all external URLs and user input at API boundaries; avoid leaking raw error details in responses.
