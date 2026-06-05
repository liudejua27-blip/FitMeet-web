import { Injectable } from '@nestjs/common';

import { AgentTaskPermissionMode } from '../entities/agent-task.entity';
import type { SanitizableAgentResult } from '../user-facing-agent-response';
import { UserFacingResponseSanitizerService } from './user-facing-response-sanitizer.service';

@Injectable()
export class DebugEnvelopeBuilderService {
  constructor(private readonly sanitizer: UserFacingResponseSanitizerService) {}

  buildRouteMessageEnvelope(
    result: SanitizableAgentResult,
  ): Record<string, unknown> {
    const permissionMode =
      'permissionMode' in result && result.permissionMode
        ? result.permissionMode
        : AgentTaskPermissionMode.Confirm;

    return {
      userFacing: this.sanitizer.toUserFacingAgentResponse(
        result,
        permissionMode,
      ),
      debug: {
        traceId: 'traceId' in result ? result.traceId : undefined,
        agentTrace: 'agentTrace' in result ? result.agentTrace : undefined,
        structuredIntent:
          'structuredIntent' in result ? result.structuredIntent : undefined,
        source: 'source' in result ? result.source : undefined,
        action: 'action' in result ? result.action : undefined,
        taskId: result.taskId,
      },
      raw: result,
    };
  }
}
