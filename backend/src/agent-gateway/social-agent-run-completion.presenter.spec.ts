import { AgentTaskStatus } from './entities/agent-task.entity';
import { FitMeetAgentRunStatus } from './entities/fitmeet-agent-runtime.entity';
import type { SocialAgentChatRunResult } from './social-agent-chat.types';
import { buildSocialAgentRunCompletionSnapshot } from './social-agent-run-completion.presenter';

describe('social-agent-run-completion.presenter', () => {
  it('keeps runtime runs waiting when candidates require user review', () => {
    expect(
      buildSocialAgentRunCompletionSnapshot(
        makeResult({
          candidates: [{ targetUserId: 22 } as never],
          approvalRequiredActions: [],
        }),
      ),
    ).toEqual({
      status: FitMeetAgentRunStatus.WaitingConfirmation,
      resultPayload: {
        taskId: 101,
        candidateCount: 1,
        approvalRequiredCount: 0,
      },
    });
  });

  it('keeps runtime runs waiting when approval actions require confirmation', () => {
    expect(
      buildSocialAgentRunCompletionSnapshot(
        makeResult({
          candidates: [],
          approvalRequiredActions: [{ actionType: 'send_message' } as never],
        }),
      ),
    ).toEqual({
      status: FitMeetAgentRunStatus.WaitingConfirmation,
      resultPayload: {
        taskId: 101,
        candidateCount: 0,
        approvalRequiredCount: 1,
      },
    });
  });

  it('marks runtime runs completed when no candidate or approval remains', () => {
    expect(
      buildSocialAgentRunCompletionSnapshot(
        makeResult({
          candidates: [],
          approvalRequiredActions: [],
        }),
      ),
    ).toEqual({
      status: FitMeetAgentRunStatus.Completed,
      resultPayload: {
        taskId: 101,
        candidateCount: 0,
        approvalRequiredCount: 0,
      },
    });
  });
});

function makeResult(
  overrides: Pick<
    SocialAgentChatRunResult,
    'candidates' | 'approvalRequiredActions'
  >,
): SocialAgentChatRunResult {
  return {
    taskId: 101,
    status: AgentTaskStatus.Succeeded,
    visibleSteps: [],
    assistantMessage: '我整理好了',
    socialRequestDraft: null,
    candidates: overrides.candidates,
    approvalRequiredActions: overrides.approvalRequiredActions,
    events: [],
  };
}
