# FitMeet P1 Life Graph 2.0 Acceptance Report

生成日期：2026-05-26

## 1. P1 完成范围

Life Graph 2.0 P1 已完成企业级闭环：

- 后端 Life Graph 数据模型、迁移、实体、DTO、Service、Controller。
- AI 从对话抽取画像字段，但默认生成 proposal，不静默写入正式画像。
- 用户可确认、拒绝、撤回字段，所有关键变更进入 audit log。
- Life Graph match signals 接入 Social Agent、CandidatePoolService、CandidateExplanationService、SceneRiskPolicyService。
- `/life-graph` 前端控制台完成展示、编辑、确认、撤回、缺失项、审计时间线和隐私提示。
- 收口阶段补齐测试、审计分页、关键索引、结构化日志和错误兜底。

## 2. 新增/修改文件

核心后端：

- `backend/src/life-graph/life-graph.module.ts`
- `backend/src/life-graph/life-graph.service.ts`
- `backend/src/life-graph/life-graph.controller.ts`
- `backend/src/life-graph/life-graph-extraction.service.ts`
- `backend/src/life-graph/life-graph.enums.ts`
- `backend/src/life-graph/dto/life-graph.dto.ts`
- `backend/src/life-graph/entities/life-graph-profile.entity.ts`
- `backend/src/life-graph/entities/life-graph-field.entity.ts`
- `backend/src/life-graph/entities/life-graph-audit-log.entity.ts`
- `backend/src/life-graph/entities/life-graph-proposal.entity.ts`
- `backend/src/database/migrations/1773900000000-AddLifeGraph.ts`

Agent 与匹配接入：

- `backend/src/agent-gateway/social-agent-chat.service.ts`
- `backend/src/agent-gateway/social-agent-candidate-pool.service.ts`
- `backend/src/agent-gateway/candidate-explanation.service.ts`
- `backend/src/agent-gateway/scene-risk-policy.service.ts`
- 相关 spec 文件。

前端：

- `frontend/src/api/lifeGraphApi.ts`
- `frontend/src/pages/LifeGraphPage.tsx`
- `frontend/src/pages/ProfilePage.tsx`
- `frontend/src/App.tsx`
- `frontend/src/test/LifeGraphPage.test.tsx`

收口测试：

- `backend/src/life-graph/life-graph.service.spec.ts`
- `backend/src/life-graph/life-graph-extraction.service.spec.ts`
- `backend/src/life-graph/life-graph-controller.spec.ts`
- `backend/src/agent-gateway/social-agent-brain.e2e-spec.ts`

## 3. 数据模型

新增表：

- `life_graph_profiles`：用户 Life Graph 主体、完整度、当前目标、摘要、地区和时区。
- `life_graph_fields`：结构化画像字段，包含 category、fieldKey、fieldValue、source、confidence、confirmedByUser、editable、revoked、revokedAt、lastInferredAt。
- `life_graph_audit_logs`：字段变更审计，包含 oldValue、newValue、source、confidence、action、reason、taskId、messageId。
- `life_graph_proposals`：AI 画像提案，支持 proposed、confirmed、rejected、revoked 语义。

关键索引：

- `life_graph_profiles.userId`
- `life_graph_fields.userId`
- `life_graph_fields.userId + category`
- `life_graph_fields.userId + fieldKey`
- `life_graph_fields.userId + category + fieldKey`
- `life_graph_audit_logs.userId + createdAt`
- `life_graph_audit_logs.createdAt`
- `life_graph_proposals.userId + createdAt`

## 4. API 列表

所有 Life Graph API 均通过 JWT 鉴权：

- `GET /api/life-graph/me`
- `PATCH /api/life-graph/me`
- `GET /api/life-graph/completeness`
- `GET /api/life-graph/match-signals`
- `GET /api/life-graph/audit?limit=&cursor=`
- `POST /api/life-graph/extract-from-chat`
- `POST /api/life-graph/confirm-update`
- `POST /api/life-graph/reject-update`
- `POST /api/life-graph/revoke-field`

API 返回结构面向多端稳定使用，不绑定网页组件。

## 5. 前端页面

`/life-graph` 已实现：

- Life Graph 顶部总览。
- AI Summary 卡片。
- 画像完整度和六大模块完整度。
- Identity、Social Intent、Lifestyle、Fitness Activity、Trust Safety、Interaction Memory 六大模块。
- 字段来源、置信度、确认状态、可编辑状态。
- 编辑、确认、撤回、忽略、关闭用于匹配。
- 缺失项说明与 Agent 追问入口。
- AI proposal 确认区。
- 审计时间线。
- 隐私与授权提示。
- 加载、空状态、自然语言错误提示。

前端错误兜底已避免展示 raw JSON、stack trace、内部异常文本。

## 6. Agent 接入点

- `SocialAgentChatService` 在画像补充场景调用 Life Graph extraction，返回 proposal，不静默保存。
- 缺少关键字段时，Social Agent 先追问，不盲目搜索。
- Agent 后续匹配读取 confirmed/manual Life Graph signals。
- revoked 字段不会进入后续 match signals。

## 7. 匹配接入点

- `CandidatePoolService` 读取 Life Graph match signals，用于地理、时间、运动偏好、社交目标、社交风格、安全边界、信任信号、语言和时区排序。
- `CandidateExplanationService` 输出 `lifeGraphExplanation`，包含 usedSignals、missingSignals、boundaryNotes、confidenceLevel。
- 候选解释会说明推荐依据、不确定项、安全边界和第一安全步骤。

## 8. 安全规则

已验证：

- AI 推断不能直接覆盖 manual 字段。
- AI 推断默认 proposal，用户确认后才进入正式画像。
- 用户拒绝 proposal 不写入正式画像。
- 用户撤回字段后，字段不会进入 match signals。
- revoked 字段不能被 AI 自动恢复，只能生成 revoked conflict proposal。
- Trust Safety Graph 不能通过普通聊天写入。
- 精确定位、联系方式、支付、钱包、健康数据不能通过 Life Graph 自动共享。
- 用户隐私边界会影响 SceneRiskPolicyService。
- P0 Agent 动作仍继续走风险策略和 PendingApproval。

## 9. 审计日志

已覆盖动作：

- `created`
- `updated`
- `imported`
- `ai_proposed`
- `conflict_detected`
- `confirmed`
- `rejected`
- `revoked`

新增结构化日志事件：

- `life_graph.initialized`
- `life_graph.field_updated`
- `life_graph.ai_proposed`
- `life_graph.confirmed`
- `life_graph.rejected`
- `life_graph.revoked`
- `life_graph.match_signals_generated`
- `life_graph.audit_write_failed`

日志不输出字段值等隐私明文，只记录 userId、fieldKey、category、action、source、requestId。

## 10. 测试结果

后端 Life Graph：

```bash
npm test -- life-graph --runInBand
```

结果：3 test suites passed，25 tests passed。

后端 Agent 安全闭环：

```bash
npm test -- social-agent-brain.e2e-spec.ts social-agent-chat.service.spec.ts social-agent-tool-executor.service.spec.ts --runInBand
```

结果：3 test suites passed，82 tests passed。

前端：

```bash
pnpm test
```

结果：4 test files passed，26 tests passed。

## 11. Build 结果

后端：

```bash
npm run build
```

结果：通过。

前端：

```bash
pnpm build
```

结果：通过，`check:prod-build` 通过。Vite 仍提示既有大 chunk 警告，非 Life Graph 功能阻塞。

## 12. 已知问题

- 前端生产构建仍有既有 `EarthScene` 大 chunk 警告，P1 未扩大该问题。
- `/life-graph` 当前使用通用页面组件实现，未来可进一步抽离为跨 Web/App 的设计系统 tokens 与 schema renderer。
- 当前 proposal 列表以前端兼容方式接收 `pendingProposal`，后续如需要多提案管理，可增加只读 proposal list API。

## 13. 下一步建议：P2 App 内测增长系统

P2 建议围绕 App 内测增长与多端同步推进：

- App 内测预约漏斗、邀请机制、种子用户分层。
- Flutter App 复用 Life Graph API。
- 小程序/Watch 端只读摘要与授权开关。
- Life Graph 多端变更同步与冲突提示。
- Agent 主动追问缺失项的轻量任务流。
- 基于 Life Graph 的高质量种子用户匹配实验。

## 14. 最终验收结论

P1 Life Graph 2.0 已满足：

- 用户可以看到、编辑 Life Graph。
- AI 可以提出画像更新，但不能静默保存。
- 用户可以确认、拒绝、撤回字段。
- 字段具备来源、置信度、确认状态、撤回状态。
- 缺失项可以驱动 Agent 追问。
- Life Graph 影响候选匹配、推荐解释和风险策略。
- 关键更新可审计，可分页查看。
- 前端不暴露 JSON、stack、内部错误。
- 后端测试、Agent 交叉测试、前端测试、后端 build、前端 build 均通过。
- P0 Agent 安全确认闭环未被破坏。
