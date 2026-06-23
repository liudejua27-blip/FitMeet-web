# FitMeet 工程手册

FitMeet 当前代码库服务于主站、Discover、Agent 和消息/好友闭环。旧 Coach、
Feed、Search、Notifications 独立页、AI Profile 独立页、Life Graph 独立页、
Social Request 独立发布页、旧外部集成和运行时 mock adapter 已经下线。

## 项目结构

- `backend/`：NestJS API。保留认证、用户、个人信息、Agent、Discover 公开意图、消息、好友、约练、活动、安全、上传、waitlist 和必要后台。
- `frontend/`：Vite + React 主站和 Agent Web App。保留核心页面和隐藏基础页。
- `docs/agent-skills/`：Agent workflow/skill 合同。它们不是额外 subagent。

核心架构边界见 [docs/core-architecture.md](docs/core-architecture.md)。

## 本地前置条件

- Node.js 22+
- pnpm 10.23.0+
- Docker Desktop
- PostgreSQL、MongoDB、Redis

Codex Desktop 里运行 Vite、Vitest、Next 或 Rollup 时，优先使用独立 runtime Node：

```bash
export PATH="/Users/liuchongjiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/liuchongjiang/Library/pnpm:$PATH"
```

## 安装依赖

```bash
cd backend && pnpm install --frozen-lockfile
cd ../frontend && pnpm install --frozen-lockfile
```

## 启动

```bash
docker compose up -d postgres mongo redis

cd backend
pnpm migration:run
pnpm start:dev

cd ../frontend
pnpm dev
```

默认地址：

- Backend: `http://localhost:3000/api`
- Frontend: `http://localhost:5173`

## 当前页面边界

主体验：

- `/`
- `/discover`
- `/features`
- `/agent`
- `/safety`
- `/download`
- `/about`
- `/demo`
- `/login`
- `/user/:id`
- `/public-intent/:id`

隐藏基础页：

- `/messages`
- `/privacy`
- `/terms`
- `/forgot-password`
- `/admin/safety`
- `/admin/waitlist`
- `/admin/agent-l5`

Agent 内部能力：

- `/agent/chat`
- `/agent/chat/:taskId`
- `/agent/profile`

## Agent 闭环

约练闭环：

1. 用户在 `/agent` 表达约练或找搭子目标。
2. Agent 基于当前 task slots 生成 OpportunityCard。
3. 草稿态显示 `发布卡片 / 修改信息 / 暂不发布`。
4. 发布前需要确认。
5. 成功发布返回 `discoverHref` 和 `publicIntentId`。
6. `/discover` 展示真实公开卡片，详情打开 `/public-intent/:id`。

交友闭环：

1. 用户在 `/agent/profile` 完善基本信息、兴趣、运动偏好和安全边界。
2. Agent 可写入个人信息，但必须先展示更新预览并由用户确认。
3. 公开画像和公开意图进入 candidate pool。
4. Match Agent 生成候选卡，支持查看详情、收藏、生成开场白、邀请、加好友和私信。
5. 邀请、私信、加好友、公开精确位置、联系方式和敏感画像更新都需要 inline 确认。
6. 邀请、好友、私信和对方回复进入 `/messages`。

## Agent 拓扑与成本控制

运行时只保留一个编排器和三个执行 agent：

- `FitMeet Main Agent`：编排和确认边界。
- `Agent Brain`：普通聊天、轻量意图判断、无副作用计算。最多 1 个工具，无重试。
- `Life Graph Agent`：个人信息补全和画像更新预览。最多 2 个工具。
- `Match Agent`：约练卡、Discover 同步、候选匹配、邀请/私信/加好友和 meet-loop。最多 3 个工具。

`docs/agent-skills/` 中的 10 个 skill 是 workflow 合同，用来减少提示词和行为漂移，不是 10 个模型智能体。

## API 契约

核心契约集中在：

- `backend/src/openapi/fitmeet-core.openapi.ts`
- `GET /api/openapi/fitmeet-core.json`
- `frontend/src/api/fitmeetCoreContract.ts`

公开/前端保留 API 族：

- `auth`
- `users`
- `social-agent chat/actions/checkpoints`
- `public social intents`
- `discover data`
- `messages`
- `friends`
- `safety`
- `uploads`
- `waitlist`
- 必要 admin

## 数据库

当前迁移已重写为单一 core baseline：

```text
backend/src/database/migrations/1780000000000-CoreBaseline.ts
```

不要把该 baseline 直接跑到旧生产库上。上线前必须先备份，再重建 schema 或执行受控数据迁移。

## 验证

基础质量门：

```bash
pnpm --dir backend lint
pnpm --dir backend build
pnpm --dir frontend lint
pnpm --dir frontend build
```

Agent/Discover 核心闭环：

```bash
pnpm --dir backend exec jest \
  src/agent-gateway/social-agent-chat.acceptance.spec.ts \
  src/agent-gateway/social-agent-draft-publication.service.spec.ts \
  src/agent-gateway/social-agent-candidate-pool.service.spec.ts \
  src/agent-gateway/public-social-intent-list-query.spec.ts \
  src/agent-gateway/public-social-intent.presenter.spec.ts \
  src/users/social-profile.service.spec.ts --runInBand

pnpm --dir frontend exec vitest run \
  src/test/AgentRouteIsolation.test.ts \
  src/test/AgentWorkspacePage.test.tsx \
  src/test/DiscoverClosure.test.ts \
  src/test/DiscoverPage.test.tsx \
  src/test/routeBoundaries.test.ts \
  src/test/agentAdapter.test.ts \
  src/test/agentWorkspaceRuntime.test.ts \
  src/test/toolCardActions.test.ts \
  src/test/toolUiSchema.test.ts
```

Skill/workflow 合同：

```bash
node scripts/verify-agent-skills.mjs
node scripts/run-agent-skill-evals.mjs --backend
```

前端入口审计：

```bash
pnpm --dir frontend check:discover-entrypoints
```
