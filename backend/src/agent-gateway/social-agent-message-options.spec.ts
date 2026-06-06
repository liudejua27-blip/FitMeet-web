import {
  buildSocialAgentConversationOptions,
  buildSocialAgentDelegateMessageOptions,
  buildSocialAgentMessageMetadata,
  buildSocialAgentMessageSendOptions,
} from './social-agent-message-options';
import { SocialAgentToolName } from './social-agent-tool.types';

const task = {
  id: 101,
  ownerUserId: 7,
  agentConnectionId: 55,
};

describe('social agent message options', () => {
  it('builds stable message metadata from raw metadata', () => {
    expect(
      buildSocialAgentMessageMetadata(task as never, 'step_1', {
        source: 'custom',
        candidateRecordId: 12,
      }),
    ).toEqual({
      source: 'social_agent_tool_executor',
      candidateRecordId: 12,
      agentTaskId: 101,
      stepId: 'step_1',
      userId: 7,
    });
  });

  it('builds conversation options with task ownership metadata', () => {
    expect(
      buildSocialAgentConversationOptions(task as never, 'step_1', {
        toolName: 'send_message',
      }),
    ).toMatchObject({
      agentConnectionId: 55,
      ownerUserId: 7,
      actorUserId: 7,
      metadata: {
        agentTaskId: 101,
        stepId: 'step_1',
        userId: 7,
        source: 'social_agent_tool_executor',
        toolName: 'send_message',
      },
    });
  });

  it('sends user-confirmed messages as the owner when no agent connection exists', () => {
    const options = buildSocialAgentMessageSendOptions(
      { ...task, agentConnectionId: null } as never,
      'step_1',
      { userConfirmed: true },
      (toolName, input) =>
        toolName === SocialAgentToolName.SendMessage &&
        input.userConfirmed === true,
    );

    expect(options).toMatchObject({
      senderType: 'user',
      senderAgentId: null,
      agentConnectionId: null,
      ownerUserId: 7,
      actorUserId: 7,
      source: 'user',
    });
  });

  it('uses agent delegate options for agent-bound messages', () => {
    expect(
      buildSocialAgentDelegateMessageOptions(task as never, 'step_2', {
        activityId: 9,
      }),
    ).toMatchObject({
      senderType: 'agent',
      senderAgentId: 55,
      agentConnectionId: 55,
      ownerUserId: 7,
      actorUserId: 7,
      source: 'ai_delegate',
      metadata: {
        agentTaskId: 101,
        stepId: 'step_2',
        userId: 7,
        source: 'social_agent_tool_executor',
        activityId: 9,
      },
    });
  });
});
