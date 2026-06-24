import { UserSocialRequest } from '../social-requests/social-request.entity';
import {
  CandidateRiskLevel,
  SocialRequestCandidate,
  SocialRequestCandidateStatus,
} from '../match/social-request-candidate.entity';
import {
  AgentAutonomyLevel,
  AgentProfile,
} from './entities/agent-profile.entity';
import {
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import { AiSocialAutopilotService } from './ai-social-autopilot.service';

function repo() {
  return {
    count: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
  };
}

function makeService() {
  const profileRepo = repo();
  const requestRepo = repo();
  const candidateRepo = repo();
  const actionLogRepo = repo();
  const matchService = { runMatch: jest.fn() };
  const approvals = {
    create: jest.fn().mockResolvedValue({ id: 123 }),
    approve: jest.fn(),
  };
  const dispatcher = { dispatch: jest.fn() };
  const actionLogs = { logAgentAction: jest.fn().mockResolvedValue({ id: 1 }) };
  const webhooks = { emitToConnection: jest.fn().mockResolvedValue(undefined) };

  const service = new AiSocialAutopilotService(
    profileRepo as never,
    requestRepo as never,
    candidateRepo as never,
    actionLogRepo as never,
    matchService as never,
    approvals as never,
    dispatcher as never,
    actionLogs as never,
    webhooks as never,
  );

  return {
    actionLogRepo,
    actionLogs,
    approvals,
    dispatcher,
    service,
    webhooks,
  };
}

describe('AiSocialAutopilotService', () => {
  it('keeps stranger outreach pending approval even when autonomy allows auto action', async () => {
    const harness = makeService();
    harness.actionLogRepo.findOne.mockResolvedValue(null);

    const decide = (
      harness.service as unknown as {
        decideAndExecute: (
          profile: AgentProfile,
          request: UserSocialRequest,
          candidate: SocialRequestCandidate,
          remainingCap: number,
        ) => Promise<string>;
      }
    ).decideAndExecute.bind(harness.service);

    const decision = await decide(
      {
        id: 8,
        ownerUserId: 7,
        agentConnectionId: 77,
        autonomyLevel: AgentAutonomyLevel.Open,
      } as AgentProfile,
      { id: 301 } as UserSocialRequest,
      {
        id: 501,
        candidateUserId: 22,
        riskLevel: CandidateRiskLevel.Low,
        score: 0.91,
        status: SocialRequestCandidateStatus.Suggested,
        suggestedMessage: '你好，周末要不要一起在公共路线慢跑？',
      } as SocialRequestCandidate,
      5,
    );

    expect(decision).toBe('pending');
    expect(harness.approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        agentConnectionId: 77,
        type: ApprovalType.SendMessage,
        actionType: 'send_message',
        riskLevel: ApprovalRiskLevel.Low,
        relatedSocialRequestId: 301,
        relatedCandidateId: 501,
        payload: expect.objectContaining({
          toUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
        }),
      }),
    );
    expect(harness.approvals.approve).not.toHaveBeenCalled();
    expect(harness.dispatcher.dispatch).not.toHaveBeenCalled();
    expect(harness.actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentId: 77,
        actionType: AgentActionType.SendMessage,
        actionStatus: AgentActionStatus.PendingApproval,
        riskLevel: AgentActionRiskLevel.Low,
        targetUserId: 22,
        outputSummary: 'autopilot_pending_approval',
        reason: 'autopilot_pending_user_confirmation',
        payload: expect.objectContaining({
          approvalId: 123,
          sideEffectPolicy: 'approval_required_before_send',
        }),
      }),
    );
    expect(harness.webhooks.emitToConnection).toHaveBeenCalledWith(
      77,
      'autopilot.action_executed',
      expect.objectContaining({
        approvalId: 123,
        decision: 'pending',
      }),
    );
  });
});
