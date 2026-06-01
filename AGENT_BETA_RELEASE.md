# FitMeet Agent Beta 发布测试说明

## Beta 目标

`/agent` Beta 的核心不是演示聊天，而是打通一次可信的现实社交闭环：

用户说需求 -> Main Agent 安全过滤 -> 读取 Life Graph -> 补问缺失信息 -> 推荐候选人或活动 -> 解释推荐原因 -> 展示安全边界 -> 用户确认 -> 发消息/加好友/创建约练 -> 审计记录与 Life Graph 回写建议。

当前 Beta 只聚焦五个任务流：

1. 完善 Life Graph
2. 找附近搭子
3. 分析我的生活节奏
4. 推荐本周活动
5. 查看我的画像变化

其中“完善 Life Graph”和“找附近搭子”是发布前必须通过的主链路。

## Agent 架构

- `FitMeet Main Agent`：总入口、安全过滤、意图判断、权限门控。
- `Agent Brain`：OpenAI Agents SDK 薄适配层，负责 handoff、tools、guardrails、trace，不直接访问数据库。
- `Life Graph Agent`：读取授权画像、生活节奏、社交边界、画像更新建议。
- `Social Match Agent`：把自然语言需求转为结构化社交请求，输出候选人/活动和推荐解释。
- `Meet Loop Agent`：在用户确认后推进开场白、连接、活动创建、签到、评价和回写建议。

## 环境变量

本地和生产可先使用规则兜底模式，不影响 Beta 闭环测试：

```bash
OPENAI_AGENTS_SDK_ENABLED=false
```

启用真实 OpenAI Agents SDK 时配置：

```bash
OPENAI_AGENTS_SDK_ENABLED=true
OPENAI_API_KEY=sk-...
OPENAI_AGENTS_MODEL=gpt-5.4-mini
```

不要在日志、截图、提交或压缩包中暴露 `OPENAI_API_KEY`。

## 本地验收

```powershell
.\scripts\verify-agent-beta.ps1
```

该脚本会运行：

- `backend`: `pnpm run test:agent-beta`
- `backend`: `pnpm build`
- `frontend`: `pnpm test -- AppWaitlistPage Layout LifeGraphPage`
- `frontend`: `pnpm build`

手动检查：

- 打开 `http://127.0.0.1:5173/agent`
- 输入：`今晚想找青岛大学附近跑步搭子`
- 应看到需求理解、Life Graph、安全边界、候选人/活动、确认按钮和审计记录。
- 输入危险请求，例如跟踪、骚扰、未成年人相关内容，应被 Main Agent 拦截。

## 生产测试发布

当前项目生产部署走现有 Docker/Nginx 单机方案，而不是只发 Vercel 静态站。原因是 `/agent` 依赖 NestJS 后端、数据库、审计、审批和实时事件。

构建发布包：

```powershell
.\scripts\build-deploy-zip.ps1 -Output fitmeet-agent-beta.zip
```

上线步骤沿用 `DEPLOY_PRODUCTION.md`：

1. 上传压缩包到服务器 `/opt/fitmeet-new`
2. 放置生产 `.env.production` 和 SSL 证书
3. 执行 `bash scripts/deploy-production.sh`
4. 检查 `https://www.ourfitmeet.cn/api/health`
5. 检查 `https://www.ourfitmeet.cn/agent`

## App 复用路径

下一步做 App 时不要重写 Agent 业务逻辑，直接复用同一组后端能力：

- `/api/social-agent/chat/stream`：一句话需求、流式进度、结果卡片。
- `/api/social-agent/chat/tasks/:id/events`：审计与任务时间线。
- Candidate actions：发消息、加好友、保存候选、创建活动。
- Life Graph APIs：画像读取、补全、确认、撤回、变化记录。
- Activities/Proof/Review/Trust：活动、签到凭证、评价和信任分。

App 只需要重新实现移动端交互层，后端闭环保持一致。

## 发布前硬门槛

- 五个任务流按钮可用。
- “今晚想找青岛大学附近跑步搭子”能进入补问或候选推荐。
- 候选卡显示匹配分、推荐原因、风险提示、下一步动作。
- 发消息、加好友、创建活动都需要用户确认。
- 不展示 raw JSON、数据库字段或技术日志。
- `/agent` 仍是登录后真实工作台。
- 官网只做小修，不重构首页风格。
