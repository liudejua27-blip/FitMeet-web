import {
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { SocialAgentCandidateCommandService } from './social-agent-candidate-command.service';
import { SocialAgentToolName } from './social-agent-tool-executor.service';
import type { SocialAgentToolCallRecord } from './social-agent-tool-executor.service';

function makeToolCall(
  overrides: Partial<SocialAgentToolCallRecord> = {},
): SocialAgentToolCallRecord {
  return {
    id: 'tool_call_1',
    stepId: 'candidate.save',
    toolName: SocialAgentToolName.SaveCandidate,
    status: 'succeeded',
    input: {},
    output: { saved: true },
    error: null,
    startedAt: '2026-06-06T00:00:00.000Z',
    completedAt: '2026-06-06T00:00:00.000Z',
    durationMs: 12,
    ...overrides,
  };
}

function makeHarness() {
  const publishResult = {
    success: true,
    taskId: 101,
    socialRequestId: 301,
    status: 'published',
  };
  const saveResult = makeToolCall();
  const messageResult = {
    success: true,
    messageId: 'msg-22',
    conversationId: 'conv-22',
  };
  const connectResult = {
    success: true,
    friendRequestId: 'fr-22',
    conversationId: 'conv-22',
  };
  const candidateActions = {
    saveCandidate: jest.fn().mockResolvedValue(saveResult),
    sendCandidateMessage: jest.fn().mockResolvedValue(messageResult),
    connectCandidate: jest.fn().mockResolvedValue(connectResult),
  };
  const draftPublication = {
    publishDraft: jest.fn().mockResolvedValue(publishResult),
  };
  const service = new SocialAgentCandidateCommandService(
    candidateActions as never,
    draftPublication as never,
  );
  return {
    candidateActions,
    connectResult,
    draftPublication,
    messageResult,
    publishResult,
    saveResult,
    service,
  };
}

describe('SocialAgentCandidateCommandService', () => {
  it('delegates confirmed draft publishing to the draft publication service', async () => {
    const { draftPublication, publishResult, service } = makeHarness();
    const draft = {
      socialRequestId: 301,
      type: SocialRequestType.RunningPartner,
      rawText: '今晚青岛轻松跑步',
      title: '今晚青岛轻松跑步',
      visibility: SocialRequestVisibility.Private,
      status: UserSocialRequestStatus.Draft,
    };

    await expect(service.publishDraft(7, 101, draft)).resolves.toBe(
      publishResult,
    );
    expect(draftPublication.publishDraft).toHaveBeenCalledWith(7, 101, draft);
  });

  it('delegates candidate saving with target aliases intact', async () => {
    const { candidateActions, saveResult, service } = makeHarness();
    const body = {
      targetUserId: 22,
      candidateUserId: 22,
      candidateRecordId: 501,
      socialRequestId: 301,
      candidate: {
        nickname: '小林',
        suggestedMessage: '今晚先轻松跑一段吗？',
      },
    };

    await expect(service.saveCandidate(7, 101, body)).resolves.toBe(saveResult);
    expect(candidateActions.saveCandidate).toHaveBeenCalledWith(7, 101, body);
  });

  it('delegates candidate messaging without rewriting message payloads', async () => {
    const { candidateActions, messageResult, service } = makeHarness();
    const body = {
      targetUserId: 22,
      candidateRecordId: 501,
      message: '今晚先轻松跑一段吗？',
      suggestedOpener: '可以从低压力夜跑开始',
      candidate: {
        userId: 22,
        displayName: '小林',
      },
    };

    await expect(service.sendCandidateMessage(7, 101, body)).resolves.toBe(
      messageResult,
    );
    expect(candidateActions.sendCandidateMessage).toHaveBeenCalledWith(
      7,
      101,
      body,
    );
  });

  it('delegates candidate connection commands to candidate actions', async () => {
    const { candidateActions, connectResult, service } = makeHarness();
    const body = {
      candidateUserId: 22,
      candidateRecordId: 501,
      socialRequestId: 301,
      candidate: {
        targetUserId: 22,
        displayName: '小林',
      },
    };

    await expect(service.connectCandidate(7, 101, body)).resolves.toBe(
      connectResult,
    );
    expect(candidateActions.connectCandidate).toHaveBeenCalledWith(
      7,
      101,
      body,
    );
  });
});
