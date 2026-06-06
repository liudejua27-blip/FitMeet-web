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
cd backend && pnpm lint && pnpm build && pnpm test
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
- `/feed`
- `/feed/interactions`
- `/feed/{id}/like`
- `/feed/{id}/save`
- `/feed/{postId}/comments`
- `/social-agent/chat/messages`
- `/social-agent/chat/route-message`
- `/social-agent/chat/stream-user`
- `/social-agent/chat/tasks/{taskId}/messages`
- `/social-agent/chat/tasks/{taskId}/actions`
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
- `social-agent-chat.service.ts`：聊天 facade，负责对 controller 保持稳定入口。
- `social-agent-run-orchestrator.service.ts`：一次完整 Agent run 的创建任务、Main Agent turn、推荐执行和 runtime 状态收口。
- `social-agent-route-turn.service.ts`：用户消息路由、上下文补充和候选人跟进 turn。
- `social-agent-queued-run.service.ts`：异步 run 入队、进度快照和失败状态。
- `social-agent-replan-run.service.ts`：补充要求后的 replan/background run。
- `social-agent-session-query.service.ts`：session restore、current task、timeline 和 run status 查询。
- `social-agent-card-action-router.service.ts`：卡片按钮动作分发，包括候选人 opener、meet loop 和 fallback message。

`social-agent-chat.service.ts` 已从早期的千行级 service 收敛到 facade，但它仍是 Agent Gateway 的高流量入口；后续改动应优先继续把 replan facade、candidate command facade 和 controller action 边界拆清楚。

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
- frontend：install、lint、build、test
- fitmeet-landing：install、lint、build、test

`fitmeet-landing` 的 `pnpm test` 已覆盖公开落地页组成、导航锚点、gateway 数据和 Agent Hub 产品入口。后续仍应继续补 Playwright 交互和视觉回归测试。

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
cd backend && pnpm lint && pnpm build && pnpm test
cd backend && pnpm check:prod-env -- ../.env.production
cd backend && pnpm migration:run:prod
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

如果检查器报 `OBJECT_STORAGE`，头像上传和朋友圈图片会在生产环境被禁用；如果报 `DEEPSEEK_API_KEY`，Social Agent 会退回确定性 fallback，不满足企业级 Agent 发布标准。

容器启动后检查：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -fsS https://www.ourfitmeet.cn/health
curl -fsS https://www.ourfitmeet.cn/api/health
```

`nginx` 会等 `backend` 的 `/api/health` 通过后再进入 healthy 状态；如果这里失败，先看 `docker compose ... logs backend nginx`，再排查数据库、Redis、Mongo、Kafka 的 healthcheck。

Next 落地页可以独立部署到 Vercel、Node 服务或容器，和主 Web 的发布节奏可以分开。

## 当前已知技术债

- `backend/src/agent-gateway/social-agent-chat.service.ts` 已完成 run、route turn、queued run、session query、card action 多轮抽取；下一轮应继续拆 replan facade、candidate command facade，并给新拆出的服务补独立单测。
- `frontend/src/api/client.ts` 仍保留历史兼容 API，后续应继续迁移 meet、club、message、safety 到独立 client。
- `frontend/src/global.css` 仍有较多跨页面样式，需要继续迁移到业务域 CSS。
- `fitmeet-landing` 已有真实 smoke 覆盖，后续应继续补交互和视觉回归测试。
- App 的真实后端端到端测试已有 staging smoke 入口，后续应把账号、对象存储和消息目标用户接入 CI secret。
