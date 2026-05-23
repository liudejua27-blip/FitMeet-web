import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentActionLog,
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';
import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';

/**
 * Input passed to {@link AgentActionLogService.logAgentAction}.
 *
 * Important: `ownerUserId` MUST be derived by the caller from the JWT or
 * Agent Token context. Callers must never accept it from request bodies.
 */
export interface LogAgentActionInput {
  ownerUserId: number;
  actionType: AgentActionType;
  actionStatus?: AgentActionStatus;
  riskLevel?: AgentActionRiskLevel;
  agentId?: number | null;
  agentTaskId?: number | null;
  eventType?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  status?: string | null;
  targetUserId?: number | null;
  targetAgentId?: number | null;
  relatedSocialRequestId?: number | null;
  relatedCandidateId?: number | null;
  relatedActivityId?: number | null;
  inputSummary?: string | null;
  outputSummary?: string | null;
  payload?: Record<string, unknown>;
  reason?: string | null;
}

export interface AgentActionLogQuery {
  ownerUserId: number;
  agentId?: number;
  actionType?: AgentActionType;
  actionStatus?: AgentActionStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class AgentActionLogService {
  private readonly logger = new Logger(AgentActionLogService.name);

  constructor(
    @InjectRepository(AgentActionLog)
    private readonly repo: Repository<AgentActionLog>,
  ) {}

  /**
   * Write a single audit entry for an agent action.
   *
   * Best-effort: failures here must never block the underlying business
   * action. We catch and log so callers can `await` without try/catch.
   */
  async logAgentAction(
    input: LogAgentActionInput,
  ): Promise<AgentActionLog | null> {
    try {
      const row = this.repo.create({
        ownerUserId: input.ownerUserId,
        actionType: input.actionType,
        actionStatus: input.actionStatus ?? AgentActionStatus.Executed,
        riskLevel: input.riskLevel ?? AgentActionRiskLevel.Low,
        agentId: input.agentId ?? null,
        agentTaskId: input.agentTaskId ?? null,
        eventType: truncate(input.eventType ?? null, 100),
        conversationId: truncate(input.conversationId ?? null, 64),
        messageId: truncate(input.messageId ?? null, 64),
        status: truncate(input.status ?? null, 40),
        targetUserId: input.targetUserId ?? null,
        targetAgentId: input.targetAgentId ?? null,
        relatedSocialRequestId: input.relatedSocialRequestId ?? null,
        relatedCandidateId: input.relatedCandidateId ?? null,
        relatedActivityId: input.relatedActivityId ?? null,
        inputSummary: truncate(
          cleanDisplayText(input.inputSummary ?? null, ''),
          500,
        ),
        outputSummary: truncate(
          cleanDisplayText(input.outputSummary ?? null, ''),
          500,
        ),
        payload: sanitizeForDisplay(input.payload ?? {}) as Record<
          string,
          unknown
        >,
        reason: cleanDisplayText(input.reason ?? null, '') || null,
      });
      return await this.repo.save(row);
    } catch (err) {
      this.logger.error(
        `Failed to write agent action log (owner=${input.ownerUserId}, type=${input.actionType}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  async list(query: AgentActionLogQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const params: unknown[] = [query.ownerUserId];

    const canonicalWhere = ['a."ownerUserId" = $1'];
    const legacyWhere = ['COALESCE(l."ownerUserId", l."userId") = $1'];
    if (query.agentId !== undefined) {
      params.push(query.agentId);
      const ref = `$${params.length}`;
      canonicalWhere.push(`a."agentId" = ${ref}`);
      legacyWhere.push(`l."agentConnectionId" = ${ref}`);
    }
    if (query.actionType !== undefined) {
      params.push(query.actionType);
      const ref = `$${params.length}`;
      canonicalWhere.push(`a."actionType"::text = ${ref}`);
      legacyWhere.push(`${legacyActionTypeSql('l')} = ${ref}`);
    }
    if (query.actionStatus !== undefined) {
      params.push(query.actionStatus);
      const ref = `$${params.length}`;
      canonicalWhere.push(`a."actionStatus"::text = ${ref}`);
      legacyWhere.push(`${legacyActionStatusSql('l')} = ${ref}`);
    }

    const unionSql = buildCombinedAuditSql(
      canonicalWhere,
      legacyWhere,
      query.agentId !== undefined,
    );
    const totalRows: Array<{ total: number | string }> = await this.repo.query(
      `WITH combined AS (${unionSql}) SELECT COUNT(*)::int AS total FROM combined`,
      params,
    );
    const total = Number(totalRows[0]?.total ?? 0);

    const offset = (page - 1) * limit;
    const items: AgentActionLogListRow[] = await this.repo.query(
      `WITH combined AS (${unionSql})
       SELECT ${AUDIT_LIST_COLUMNS}
       FROM combined
       ORDER BY "createdAt" DESC, "sortId" DESC
       OFFSET $${params.length + 1}
       LIMIT $${params.length + 2}`,
      [...params, offset, limit],
    );
    return { items, total, page, limit };
  }

  async getById(ownerUserId: number, id: number): Promise<AgentActionLog> {
    const row = await this.repo.findOne({ where: { id, ownerUserId } });
    if (!row) {
      throw new NotFoundException('Agent action log not found');
    }
    return row;
  }
}

function truncate(value: string | null, max: number): string | null {
  if (value == null) return null;
  return value.length > max ? value.slice(0, max) : value;
}

type AgentActionLogListRow = Omit<AgentActionLog, 'id'> & { id: number };

const AUDIT_LIST_COLUMNS = `
  "id",
  "agentId",
  "agentTaskId",
  "ownerUserId",
  "actionType",
  "eventType",
  "conversationId",
  "messageId",
  "status",
  "actionStatus",
  "riskLevel",
  "targetUserId",
  "targetAgentId",
  "relatedSocialRequestId",
  "relatedCandidateId",
  "relatedActivityId",
  "inputSummary",
  "outputSummary",
  "payload",
  "reason",
  "createdAt"
`;

function buildCombinedAuditSql(
  canonicalWhere: string[],
  legacyWhere: string[],
  agentScoped: boolean,
) {
  const legacyActionType = legacyActionTypeSql('l');
  const legacyActionStatus = legacyActionStatusSql('l');
  const legacyRiskLevel = legacyRiskLevelSql('l');
  const legacyTargetUserId = legacyPayloadNumberSql('l', [
    'targetUserId',
    'candidateUserId',
    'toUserId',
  ]);
  const legacySocialRequestId = legacyPayloadNumberSql('l', [
    'socialRequestId',
    'requestId',
  ]);
  const legacyActivityId = legacyPayloadNumberSql('l', ['activityId']);
  const legacyEventId = payloadTextSql('l', [
    'eventId',
    'event_id',
    'inboxEventId',
  ]);
  const canonicalEventId = payloadTextSql('a', [
    'eventId',
    'event_id',
    'inboxEventId',
  ]);
  const agentDedupeSql = agentScoped
    ? 'a."agentId" IS NOT DISTINCT FROM l."agentConnectionId"'
    : '(a."agentId" IS NOT DISTINCT FROM l."agentConnectionId" OR a."agentId" IS NULL)';
  const agentEventDedupeSql = `(
    ${legacyActionType} <> 'agent_event'
    OR (
      (l."eventType" IS NULL OR a."eventType" IS NOT DISTINCT FROM l."eventType")
      AND (l."status" IS NULL OR a."status" IS NOT DISTINCT FROM l."status")
      AND CASE
        WHEN ${legacyEventId} IS NOT NULL THEN ${canonicalEventId} = ${legacyEventId}
        WHEN l."messageId" IS NOT NULL THEN a."messageId" IS NOT DISTINCT FROM l."messageId"
          AND (l."conversationId" IS NULL OR a."conversationId" IS NOT DISTINCT FROM l."conversationId")
        WHEN l."conversationId" IS NOT NULL THEN a."conversationId" IS NOT DISTINCT FROM l."conversationId"
        ELSE FALSE
      END
    )
  )`;

  return `
    SELECT
      a."id" AS "id",
      a."id" AS "sortId",
      a."agentId" AS "agentId",
      a."agentTaskId" AS "agentTaskId",
      a."ownerUserId" AS "ownerUserId",
      a."actionType"::text AS "actionType",
      a."eventType" AS "eventType",
      a."conversationId" AS "conversationId",
      a."messageId" AS "messageId",
      a."status" AS "status",
      a."actionStatus"::text AS "actionStatus",
      a."riskLevel"::text AS "riskLevel",
      a."targetUserId" AS "targetUserId",
      a."targetAgentId" AS "targetAgentId",
      a."relatedSocialRequestId" AS "relatedSocialRequestId",
      a."relatedCandidateId" AS "relatedCandidateId",
      a."relatedActivityId" AS "relatedActivityId",
      a."inputSummary" AS "inputSummary",
      a."outputSummary" AS "outputSummary",
      a."payload" AS "payload",
      a."reason" AS "reason",
      a."createdAt" AS "createdAt"
    FROM "agent_action_logs" a
    WHERE ${canonicalWhere.join(' AND ')}
    UNION ALL
    SELECT
      -l."id" AS "id",
      -l."id" AS "sortId",
      l."agentConnectionId" AS "agentId",
      NULL::int AS "agentTaskId",
      COALESCE(l."ownerUserId", l."userId") AS "ownerUserId",
      ${legacyActionType} AS "actionType",
      l."eventType" AS "eventType",
      l."conversationId" AS "conversationId",
      l."messageId" AS "messageId",
      COALESCE(l."status", l."result"::text) AS "status",
      ${legacyActionStatus} AS "actionStatus",
      ${legacyRiskLevel} AS "riskLevel",
      ${legacyTargetUserId} AS "targetUserId",
      NULL::int AS "targetAgentId",
      ${legacySocialRequestId} AS "relatedSocialRequestId",
      NULL::int AS "relatedCandidateId",
      ${legacyActivityId} AS "relatedActivityId",
      COALESCE(
        NULLIF(l."payload"->>'query', ''),
        NULLIF(l."payload"->>'description', ''),
        NULLIF(l."payload"->>'type', ''),
        NULLIF(l."payload"->>'requestType', ''),
        l."action"::text
      ) AS "inputSummary",
      CONCAT(
        l."action"::text,
        ': ',
        l."result"::text,
        COALESCE(', count=' || NULLIF(COALESCE(l."payload"->>'resultCount', l."payload"->>'candidateCount'), ''), ''),
        COALESCE(', request=' || NULLIF(COALESCE(l."payload"->>'socialRequestId', l."payload"->>'requestId'), ''), '')
      ) AS "outputSummary",
      jsonb_build_object('legacyAction', l."action"::text) || COALESCE(l."payload", '{}'::jsonb) AS "payload",
      COALESCE(l."blockReason", NULLIF(l."payload"->>'reason', ''), CONCAT('legacy_', l."action"::text)) AS "reason",
      l."createdAt" AS "createdAt"
    FROM "agent_activity_logs" l
    WHERE ${legacyWhere.join(' AND ')}
      AND NOT EXISTS (
        SELECT 1
        FROM "agent_action_logs" a
        WHERE a."ownerUserId" = COALESCE(l."ownerUserId", l."userId")
          AND ${agentDedupeSql}
          AND a."actionType"::text = ${legacyActionType}
          AND a."actionStatus"::text = ${legacyActionStatus}
          AND ${agentEventDedupeSql}
          AND a."createdAt" BETWEEN l."createdAt" - INTERVAL '30 seconds' AND l."createdAt" + INTERVAL '30 seconds'
          AND (${legacySocialRequestId} IS NULL OR a."relatedSocialRequestId" = ${legacySocialRequestId})
          AND (${legacyTargetUserId} IS NULL OR a."targetUserId" = ${legacyTargetUserId})
          AND (${legacyActivityId} IS NULL OR a."relatedActivityId" = ${legacyActivityId})
      )
  `;
}

function legacyActionTypeSql(alias: string) {
  return `CASE ${alias}."action"::text
    WHEN 'agent_event' THEN 'agent_event'
    WHEN 'lab_chat' THEN 'agent_event'
    WHEN 'report_risk' THEN 'agent_event'
    WHEN 'create_social_request' THEN 'create_social_request'
    WHEN 'confirm_social_request_candidate' THEN CASE WHEN ${alias}."payload"->>'decision' = 'reject' THEN 'reject_action' ELSE 'approve_action' END
    WHEN 'search' THEN 'run_match'
    WHEN 'match_partner' THEN 'run_match'
    WHEN 'draft_post' THEN 'generate_invite'
    WHEN 'draft_message' THEN 'generate_invite'
    WHEN 'send_message' THEN 'send_message'
    WHEN 'contact_request' THEN 'add_friend'
    WHEN 'create_activity' THEN 'create_activity'
    WHEN 'join_activity' THEN 'join_activity'
    WHEN 'submit_completion_proof' THEN 'submit_proof'
    WHEN 'intercepted' THEN 'send_message'
    ELSE 'agent_event'
  END`;
}

function legacyActionStatusSql(alias: string) {
  return `CASE ${alias}."result"::text
    WHEN 'pending_approval' THEN 'pending_approval'
    WHEN 'blocked' THEN 'failed'
    WHEN 'error' THEN 'failed'
    ELSE 'executed'
  END`;
}

function legacyRiskLevelSql(alias: string) {
  return `CASE
    WHEN ${alias}."riskScore" >= 0.7 THEN 'high'
    WHEN ${alias}."riskScore" >= 0.3 OR ${alias}."result"::text <> 'success' THEN 'medium'
    ELSE 'low'
  END`;
}

function legacyPayloadNumberSql(alias: string, keys: string[]) {
  const parts = keys.map(
    (key) =>
      `CASE WHEN (${alias}."payload"->>'${key}') ~ '^-?[0-9]+$' THEN (${alias}."payload"->>'${key}')::int ELSE NULL END`,
  );
  return `COALESCE(${parts.join(', ')})`;
}

function payloadTextSql(alias: string, keys: string[]) {
  const parts = keys.map((key) => `NULLIF(${alias}."payload"->>'${key}', '')`);
  return `COALESCE(${parts.join(', ')})`;
}
