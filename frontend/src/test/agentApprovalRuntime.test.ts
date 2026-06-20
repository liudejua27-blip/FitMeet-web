import { describe, expect, it } from 'vitest';

import {
  findApprovalDecisionStepId,
  resolveApprovalDecisionSteps,
} from '../components/agent-workspace/useAgentApprovalRuntime';
import type { Step } from '../components/agent-workspace/socialAgentThreadStore';

const step = (overrides: Partial<Step>): Step => ({
  id: 'step',
  label: '步骤',
  status: 'waiting',
  ...overrides,
});

describe('agent approval runtime', () => {
  it('only resolves the matching approval waiting step', () => {
    const steps: Step[] = [
      step({
        id: 'slot-filling',
        label: '等待你补充信息',
        processType: 'slot_filling',
      }),
      step({
        id: 'approval-send-invite',
        label: '发送邀请前需要你确认',
        processType: 'approval',
        metadata: { approvalId: 88, actionType: 'send_invite' },
      }),
      step({
        id: 'approval-publish',
        label: '发布到发现前需要你确认',
        processType: 'approval',
        metadata: { approvalId: 99, actionType: 'publish_social_request' },
      }),
    ];

    const next = resolveApprovalDecisionSteps(steps, 88);

    expect(next.map((item) => [item.id, item.status])).toEqual([
      ['slot-filling', 'waiting'],
      ['approval-send-invite', 'success'],
      ['approval-publish', 'waiting'],
    ]);
    expect(findApprovalDecisionStepId(steps, 88)).toBe('approval-send-invite');
  });

  it('falls back to approval-shaped steps when legacy events do not include an approval id', () => {
    const steps: Step[] = [
      step({
        id: 'candidate-search',
        label: '正在筛选公开可发现的人',
        processType: 'candidate_search',
      }),
      step({
        id: 'approval',
        label: '需要你确认后继续',
        processType: 'approval',
      }),
    ];

    const next = resolveApprovalDecisionSteps(steps, 1001);

    expect(next.map((item) => [item.id, item.status])).toEqual([
      ['candidate-search', 'waiting'],
      ['approval', 'success'],
    ]);
    expect(findApprovalDecisionStepId(steps, 1001)).toBe('approval');
  });
});
