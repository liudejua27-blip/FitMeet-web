# FitMeet 工程手册

FitMeet 目前由三个 Web 子项目和一个 iOS App 组成：

- `backend/`：NestJS API 服务，负责认证、Feed、上传、Social Agent、消息、审核、画像匹配和数据持久化。
- `frontend/`：Vite + React 主站和 Web App 壳，包含公开官网、Agent 工作台、真实社交 Feed、约练等页面。
- `fitmeet-landing/`：Next.js 落地页项目，面向独立投放和部署。
- `/Users/liuchongjiang/Documents/FitMeet app/`：iOS SwiftUI App，也叫 `FitMeetAlpha`。

## 本地前置条件

- Node.js 22+
- pnpm 10.23.0+
- Xcode 26+（运行 iOS App 和 UI tests）
- PostgreSQL、MongoDB、Redis（后端完整本地环境）

本机 pnpm 可临时这样加入 PATH：

```bash
export PATH="/Users/liuchongjiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/liuchongjiang/Library/pnpm:$PATH"
pnpm --version
```

在 Codex Desktop 里运行 Vite、Vitest、Next 或 Rollup 时，优先把上面的独立 runtime Node 放到 PATH 最前面。Codex app 内置 Node 带有 app runtime 签名，macOS 会拒绝加载第三方原生包（例如 `@rollup/rollup-darwin-arm64`、`@next/swc-darwin-arm64`），表现为 `code signature ... different Team IDs`。这不是项目依赖错误，切到独立 runtime Node 后再跑 `pnpm lint && pnpm build && pnpm test`。

## 安装依赖

三个 JS 项目各自维护锁文件，进入对应目录安装：

```bash
cd backend && pnpm install --frozen-lockfile
cd ../frontend && pnpm install --frozen-lockfile
cd ../fitmeet-landing && pnpm install --frozen-lockfile
```

如果 `node_modules` 损坏，优先删除对应项目的 `node_modules` 后用锁文件重装，不要跨项目复用依赖目录。

## 环境变量

根目录 `.env.example` 是生产/容器化部署的总参考，后端和前端也各有本地示例：

- `backend/.env.example`：复制为 `backend/.env`，配置数据库、JWT、对象存储、短信、微信、AI、Agent webhook 等服务。
- `frontend/.env.example`：复制为 `frontend/.env.local` 或 `.env`，至少配置 `VITE_API_BASE_URL=http://localhost:3000/api`。
- `fitmeet-landing/`：按部署平台配置公开站点需要的环境变量。

iOS App 的 API 地址按优先级读取：

1. 运行环境变量 `FITMEET_ALPHA_API_BASE_URL`
2. `Info.plist` 里的 `FITMEET_API_BASE_URL`
3. Debug 默认 `http://localhost:3000/api`
4. Release 默认 `https://www.ourfitmeet.cn/api`

模拟器访问宿主机后端时，必要时把 Debug 地址改成 `http://127.0.0.1:3000/api` 或可被模拟器访问的局域网地址。

## 启动顺序

先启动依赖服务，再启动后端，最后启动 Web 或 App：

```bash
# 1. 后端依赖
docker compose up -d postgres mongo redis

# 2. 后端 API
cd backend
pnpm start:dev

# 3. 主 Web
cd ../frontend
pnpm dev

# 4. Next 落地页
cd ../fitmeet-landing
pnpm dev
```

默认端口：

- 后端 API：`http://localhost:3000/api`
- 主 Web：`http://localhost:5173`
- 落地页：`http://localhost:3000` 或 Next 自动分配的可用端口

如果后端和落地页同时占用 `3000`，先启动后端，再让 Next 使用其他端口。

## 数据库策略

后端现在采用 migration-first 策略：`DB_SYNCHRONIZE=false` 是所有环境的默认值，包括本地开发。需要变更 schema 时，先生成或创建 migration，再运行 `pnpm migration:run`。只有临时 scratch 数据库可以显式设置 `DB_SYNCHRONIZE=true`，不要把这个设置提交或带到共享环境。

## 验证命令

每次提交前至少跑通这组基线：

```bash
./scripts/release-preflight.sh
```

默认会顺序验证 backend、frontend、fitmeet-landing 和 iOS App 单测。只验证 Web 侧可运行：

```bash
./scripts/release-preflight.sh --web-only
```

如果 pnpm 不在默认 PATH，可设置 `FITMEET_PNPM_BIN_DIR=/path/to/pnpm/bin`；如果 iOS App 不在默认路径，可设置 `FITMEET_APP_DIR`。

如果要把 iOS UI tests 也纳入发布前检查：

```bash
./scripts/release-preflight.sh --include-ios-ui
```

分项目命令如下，便于定位失败点：

```bash
cd backend && pnpm lint && pnpm build && pnpm test && APP_SMOKE_DRY_RUN=true pnpm smoke:app-core
cd ../frontend && pnpm lint && pnpm build && pnpm test
cd ../fitmeet-landing && pnpm lint && pnpm build && pnpm test
```

iOS App：

```bash
cd "/Users/liuchongjiang/Documents/FitMeet app"
xcodebuild test -project FitMeetAlpha.xcodeproj -scheme FitMeetAlpha -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.5' -only-testing:FitMeetAlphaTests
xcodebuild test -project FitMeetAlpha.xcodeproj -scheme FitMeetAlpha -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' -only-testing:FitMeetAlphaUITests
```

UI tests 对模拟器状态比较敏感，如果遇到 runner busy，可以换一个已安装模拟器或先重启 Simulator。

## API 契约

核心 App/Web 契约目前集中维护在：

- 后端 OpenAPI：`backend/src/openapi/fitmeet-core.openapi.ts`
- 运行时 JSON：`GET /api/openapi/fitmeet-core.json`
- 前端 typed endpoint registry：`frontend/src/api/fitmeetCoreContract.ts`

当前契约覆盖：

- `/auth/register`
- `/auth/login`
- `/auth/sms/send`
- `/auth/sms/verify`
- `/auth/wechat/url`
- `/auth/wechat/login`
- `/auth/refresh`
- `/auth/profile`
- `/users/profile`
- `/feed`
- `/feed/interactions`
- `/feed/{id}/like`
- `/feed/{id}/save`
- `/feed/{postId}/comments`
- `/feed/comments/{commentId}/like`
- `/messages/start`
- `/messages/public-intents/{id}/start`
- `/messages/conversations`
- `/messages/conversations/{conversationId}`
- `/messages/conversations/{conversationId}/send`
- `/messages/unread`
- `/social-agent/chat/run`
- `/social-agent/chat/run-async`
- `/social-agent/chat/messages`
- `/social-agent/chat/route-message`
- `/social-agent/chat/stream`
- `/social-agent/chat/stream-user`
- `/social-agent/chat/session`
- `/social-agent/chat/tasks/{taskId}/session`
- `/social-agent/chat/tasks/{taskId}/runs/{runId}`
- `/social-agent/chat/tasks/{taskId}/messages`
- `/social-agent/chat/tasks/{taskId}/publish-social-request`
- `/social-agent/chat/tasks/{taskId}/replan-run`
- `/social-agent/chat/tasks/{taskId}/append-context`
- `/social-agent/chat/tasks/{taskId}/actions`
- `/social-agent/chat/tasks/{taskId}/save-candidate`
- `/social-agent/chat/tasks/{taskId}/send-message`
- `/social-agent/chat/tasks/{taskId}/connect-candidate`
- `/social-agent/tasks/current`
- `/social-agent/tasks/{taskId}/timeline`
- `/social-agent/tasks/{taskId}/events`
- `/social-agent/tasks/{taskId}/replan`
- `/uploads/image`
- `/uploads/video`

新增 App 或 Web 调用时，先补契约，再补 client 和测试。App 不应该长期依赖宽松 decoding 来吸收后端漂移。

## Web 模块边界

前端 API client 已开始按业务域收敛：

- `frontend/src/api/baseClient.ts`：基础 request、鉴权 token、错误类型。
- `frontend/src/api/authClient.ts`：认证与 profile。
- `frontend/src/api/feedClient.ts`：真实社交 Feed。
- `frontend/src/api/socialAgentApi.ts`：Social Agent 聊天和任务。
- `frontend/src/api/uploadApi.ts`：图片和视频上传。
- `frontend/src/api/client.ts`：兼容层，仍保留 meet、club、message、safety 等历史 API。

路由边界在 `frontend/src/routes/routeBoundaries.ts`，用于区分公开官网、Agent 工作台、Agent onboarding、真实社交 Feed 等布局体验。后续整理样式时，应继续把 Agent 工作台样式、公开官网样式和 App 社交 Feed 样式拆开，减少 `global.css` 里的跨页面选择器。

后端 Social Agent 聊天模块已开始拆分：

- `social-agent-chat.controller.ts`：HTTP/SSE 控制器。
- `social-agent-chat.controller.types.ts`：controller body DTO 类型。
- `social-agent-chat-stream.presenter.ts`：SSE presenter。
- `social-agent-chat.types.ts`：service 共享类型。
- `social-agent-chat.service.ts`：兼容 re-export，保持旧 import 稳定。
- `social-agent-chat-facade.service.ts`：聊天 facade，负责对 controller 保持稳定入口。
- `social-agent-run-orchestrator.service.ts`：一次完整 Agent run 的创建任务、Main Agent turn、推荐执行和 runtime 状态收口。
- `social-agent-route-turn.service.ts`：用户消息路由、上下文补充和候选人跟进 turn。
- `social-agent-queued-run.service.ts`：异步 run 入队、进度快照和失败状态。
- `social-agent-replan-run.service.ts`：补充要求后的 replan/background run。
- `social-agent-session-query.service.ts`：session restore、current task、timeline 和 run status 查询。
- `social-agent-card-action-router.service.ts`：卡片按钮动作分发，包括候选人 opener、meet loop 和 fallback message。
- `social-agent-replan-facade.service.ts`：补充上下文、replan 入队和失败兜底 facade。
- `social-agent-candidate-command.service.ts`：候选人保存、发送消息、连接和草稿发布命令 facade。
- `social-agent-initial-search-queue.service.ts`：route turn 触发初始搜索时的 task 状态和异步 run 入队。

`social-agent-chat.service.ts` 已从早期的千行级 service 收敛到约 120 行的 controller-facing facade；后续改动应优先给新拆出的服务补独立单测，并继续压低 route turn 与 controller action 的耦合。

## iOS App 产品化约定

App 认证态现在应通过 `AppState.restoreSession()` 恢复：

- 优先使用已保存 access token 调 `/auth/profile`
- access token 失效时用 refresh token 调 `/auth/refresh`
- 恢复成功后持久化 `AuthUser`
- 登出时同时清理 access token、refresh token 和本地 user cache

真实流程不再依赖 Agent mock fallback。后端不可用时，App 应显示明确错误状态，而不是注入虚假候选人。

头像流程：

1. App 通过 `/uploads/image` 上传图片。
2. 使用返回 URL 更新 profile avatar。
3. 本地 `currentUser` 和 `profilePhotoURLString` 同步更新。

朋友圈发布和消息页要保持真实接口优先；测试环境可通过 launch arguments 注入状态，但不要把 mock 数据带进生产路径。

## CI

GitHub Actions 工作流在 `.github/workflows/ci.yml`。当前基线包含：

- backend：install、lint、build、test
- backend app contract smoke：`APP_SMOKE_DRY_RUN=true pnpm smoke:app-core`
- frontend：install、lint、build、test
- fitmeet-landing：install、lint、build、test（source + rendered smoke）

后端 smoke 会以 dry-run 方式检查 `/auth`、`/feed`、`/social-agent/chat` 和 `/uploads` 的 App 核心契约，确保 OpenAPI、typed client 和 App 调用路径不会静默漂移。

`fitmeet-landing` 的 `pnpm test` 已覆盖公开落地页组成、导航锚点、gateway 数据、Agent Hub 产品入口，并在 `pnpm build` 后检查 Next 产物里的首页、Agent Hub 和三个 gateway 静态 HTML。后续仍应继续补 Playwright 交互和视觉回归测试。

## 部署

容器化部署以根目录 `docker-compose.yml` 和 `.env.example` 为参考：

1. 准备生产 `.env`，替换所有 `CHANGE_ME`。
2. 运行生产环境变量检查，不会打印密钥值，只报告缺失项和风险项：

```bash
cd backend
pnpm check:prod-env -- ../.env.production
```

3. 确认 `JWT_SECRET`、数据库密码、Redis 密码、对象存储密钥、微信/短信/AI key 不使用默认值。
4. 后端构建后运行 `pnpm migration:run:prod` 或等价迁移流程。
5. 前端生产环境设置 `VITE_API_BASE_URL=/api` 或目标 API 域名。
6. 配置反向代理，把 `/api` 转发到 Nest 服务，把 Web 静态资源指向对应构建产物。

部署前建议按这个顺序收口：

```bash
./scripts/release-preflight.sh --web-only
cd backend && pnpm check:prod-env -- ../.env.production
cd backend && pnpm migration:run:prod
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

生产服务器可以直接使用：

```bash
APP_DIR=/opt/fitmeet-new ./scripts/deploy-production.sh
```

该脚本默认会先跑 `./scripts/release-preflight.sh --web-only`，再跑 `pnpm -C backend run check:prod-env -- ../.env.production`。如果已经在构建机或 CI 跑过完整 Web preflight，并且服务器内存紧张，可以显式设置 `RUN_RELEASE_PREFLIGHT=false`，但生产环境变量检查仍会执行。

如果检查器报 `OBJECT_STORAGE`，头像上传和朋友圈图片会在生产环境被禁用；如果报 `DEEPSEEK_API_KEY`，Social Agent 会退回确定性 fallback，不满足企业级 Agent 发布标准。

容器启动后检查：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
BASE_URL=https://www.ourfitmeet.cn ./scripts/verify-production.sh
```

`verify-production.sh` 默认只做非破坏性检查：Web 首页、`/api/health`、`/api/ready`、运行时 OpenAPI、公开 feed、App 保护接口的 401、Agent manifest 的未授权保护。需要真实 App 账号链路时，可设置 `APP_SMOKE_EMAIL`、`APP_SMOKE_PASSWORD`、`APP_SMOKE_TARGET_USER_ID` 后追加 `--run-app-smoke`；需要写入 public intent 时，再显式追加 `--run-public-intent-write`。

上线前的第一道容量 smoke 可以跑只读 1000 并发检查：

```bash
LOAD_TEST_BASE_URL=https://www.ourfitmeet.cn \
LOAD_TEST_ALLOW_REMOTE=true \
node scripts/load-1000-readonly.mjs
```

也可以把它纳入 Web 发布前基线：

```bash
LOAD_TEST_BASE_URL=http://localhost:3000 ./scripts/release-preflight.sh --web-only --include-load-smoke
```

该脚本只打 `/api/health`、`/api/feed?page=1&limit=5` 和 `/api/openapi/fitmeet-core.json`，默认要求错误率不超过 1%、p95 不超过 1000ms、p99 不超过 2000ms。远端目标必须显式设置 `LOAD_TEST_ALLOW_REMOTE=true`，避免误压生产。它不能替代完整 Artillery/k6 长时压测，但可以作为部署后确认 1000 个并发只读请求不会立刻卡死的快速门槛。

真正的“1000 人在线”还需要验证 Socket.IO 实时链路。准备 staging 用户 token 池，或提供 staging 登录账号后运行：

```bash
REALTIME_SMOKE_BASE_URL=https://www.ourfitmeet.cn \
REALTIME_SMOKE_ALLOW_REMOTE=true \
REALTIME_SMOKE_EMAIL=test@example.com \
REALTIME_SMOKE_PASSWORD='***' \
node scripts/realtime-1000-online-smoke.mjs
```

更接近真实多人在线的方式是提供 token 文件，每行一个 staging 用户 token：

```bash
REALTIME_SMOKE_BASE_URL=https://www.ourfitmeet.cn \
REALTIME_SMOKE_ALLOW_REMOTE=true \
REALTIME_SMOKE_TOKENS_FILE=/secure/fitmeet-staging-tokens.txt \
node scripts/realtime-1000-online-smoke.mjs
```

也可以纳入 Web preflight：

```bash
REALTIME_SMOKE_BASE_URL=http://localhost:3000 \
REALTIME_SMOKE_TOKEN='eyJ...' \
./scripts/release-preflight.sh --web-only --include-realtime-smoke
```

该脚本默认按 1000 个逻辑用户打开 `/realtime` 和 `/messages` 两组 Socket.IO 连接，等待实时网关 `realtime:connected` 和消息网关 `connect`，保持在线 5 秒，并检查错误率和连接 p95。远端目标同样必须显式设置 `REALTIME_SMOKE_ALLOW_REMOTE=true`。如果只想压某一条链路，可设置 `REALTIME_SMOKE_NAMESPACES=realtime` 或 `REALTIME_SMOKE_NAMESPACES=messages`。

`nginx` 会等 `backend` 的 `/api/health` 通过后再进入 healthy 状态；如果这里失败，先看 `docker compose ... logs backend nginx`，再排查数据库、Redis、Mongo、Kafka 的 healthcheck。Windows 环境也可继续使用 `powershell -ExecutionPolicy Bypass -File .\scripts\verify-production.ps1`。

Next 落地页可以独立部署到 Vercel、Node 服务或容器，和主 Web 的发布节奏可以分开。

## 当前已知技术债

- `backend/src/agent-gateway/social-agent-chat.service.ts` 已完成 run、route turn、queued run、session query、card action、replan facade、candidate command、initial search queue 多轮抽取；下一轮应继续拆 `social-agent-route-turn.service.ts`，并给新拆出的服务补独立单测。
- `frontend/src/api/client.ts` 仍保留历史兼容 API，后续应继续迁移 meet、club、message、safety 到独立 client。
- `frontend/src/global.css` 仍有较多跨页面样式，需要继续迁移到业务域 CSS。
- `fitmeet-landing` 已有源码 smoke 和 build 后 rendered smoke 覆盖，后续应继续补交互和视觉回归测试。
- App 的真实后端端到端测试已有 staging smoke 入口，后续应把账号、对象存储和消息目标用户接入 CI secret。
