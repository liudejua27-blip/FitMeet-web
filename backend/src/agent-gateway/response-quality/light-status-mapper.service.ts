import { Injectable } from '@nestjs/common';

import type {
  UserFacingAgentLightStatus,
  UserFacingAgentPendingConfirmation,
  SanitizableAgentResult,
} from '../user-facing-agent-response';

@Injectable()
export class LightStatusMapperService {
  resolve(
    result: SanitizableAgentResult,
    pendingConfirmations: UserFacingAgentPendingConfirmation[],
  ): UserFacingAgentLightStatus {
    const safety = 'safety' in result ? result.safety : undefined;
    if (safety?.blocked) return '正在检查安全边界';
    if (pendingConfirmations.length > 0) return '正在等待你确认';

    if ('profileUpdateProposal' in result && result.profileUpdateProposal) {
      return '正在更新你的 Life Graph';
    }
    if ('profileUpdated' in result && result.profileUpdated) {
      return '正在更新你的 Life Graph';
    }
    if (
      'activityResults' in result &&
      (result.activityResults?.length ?? 0) > 0
    ) {
      return '正在创建约练计划';
    }
    if ('shouldQueueRun' in result && result.shouldQueueRun) {
      return '正在筛选合适的人';
    }
    if ('candidates' in result && result.candidates.length > 0) {
      return '正在排除时间不合适的人';
    }
    if (
      safety &&
      safety.boundaryNotes.length > 0 &&
      this.hasSocialExecutionSurface(result)
    ) {
      return '正在检查安全边界';
    }

    return '正在理解你的需求';
  }

  private hasSocialExecutionSurface(result: SanitizableAgentResult): boolean {
    if ('shouldSearch' in result && result.shouldSearch) return true;
    if ('shouldExecuteAction' in result && result.shouldExecuteAction) {
      return true;
    }
    if ('shouldQueueRun' in result && result.shouldQueueRun) return true;
    if ('candidates' in result && result.candidates.length > 0) return true;
    if (
      'activityResults' in result &&
      (result.activityResults?.length ?? 0) > 0
    ) {
      return true;
    }
    if (
      'approvalRequiredActions' in result &&
      result.approvalRequiredActions.length > 0
    ) {
      return true;
    }
    if ('pendingApproval' in result && result.pendingApproval) return true;
    if ('cards' in result) {
      return (result.cards ?? []).some((card) =>
        [
          'candidate_card',
          'activity_card',
          'safety_boundary',
          'approval_required',
          'tool_ui',
        ].includes(String(card.type)),
      );
    }
    return false;
  }
}
