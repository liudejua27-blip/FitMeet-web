import {
  confirmedActionLoopToolForSocialExecution,
  recommendationLoopToolsForSocialExecution,
  SOCIAL_AGENT_EXECUTION_PIPELINE,
  socialExecutionStepIds,
} from './social-agent-execution-pipeline.contract';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';

describe('social-agent-execution-pipeline.contract', () => {
  it('keeps the product social/meet execution pipeline in the required order', () => {
    expect(socialExecutionStepIds()).toEqual([
      'check_profile_gate',
      'clarify_social_intent',
      'create_opportunity_card_draft',
      'safety_review',
      'optional_publish_public_intent',
      'search_public_candidates',
      'rank_candidates',
      'generate_opener',
      'request_approval',
      'execute_confirmed_action',
    ]);
  });

  it('marks ordinary chat as non-blocking and high-risk side effects as confirmation-gated', () => {
    expect(
      SOCIAL_AGENT_EXECUTION_PIPELINE.every(
        (step) => step.blocksOrdinaryChat === false,
      ),
    ).toBe(true);
    expect(
      SOCIAL_AGENT_EXECUTION_PIPELINE.filter(
        (step) =>
          step.sideEffect === 'conditional_publication' ||
          step.sideEffect === 'approval_checkpoint' ||
          step.sideEffect === 'confirmed_action',
      ).map((step) => [step.id, step.requiresUserConfirmation]),
    ).toEqual([
      ['optional_publish_public_intent', true],
      ['request_approval', true],
      ['execute_confirmed_action', true],
    ]);
  });

  it('maps the product pipeline onto the current AgentLoop recommendation tools', () => {
    const tools = recommendationLoopToolsForSocialExecution({
      ownerUserId: 7,
      permissionMode: AgentTaskPermissionMode.Confirm,
    });

    expect(tools.map((tool) => tool.toolName)).toEqual([
      'recommendation_understand_permission',
      'recommendation_read_profile_and_plan',
      'recommendation_create_social_intent',
      'recommendation_search_candidates',
      'recommendation_rank_safety_and_draft',
      'recommendation_final_answer',
    ]);
    expect(new Set(tools.flatMap((tool) => tool.covers))).toEqual(
      new Set([
        'check_profile_gate',
        'clarify_social_intent',
        'create_opportunity_card_draft',
        'safety_review',
        'optional_publish_public_intent',
        'search_public_candidates',
        'rank_candidates',
        'generate_opener',
        'request_approval',
      ]),
    );
    expect(
      tools.find(
        (tool) => tool.toolName === 'recommendation_create_social_intent',
      )?.input,
    ).toMatchObject({
      mode: 'private_draft_then_auto_public_if_authorized',
      sideEffectPolicy: 'no_messages_or_candidate_contact_without_approval',
    });
  });

  it('maps confirmed candidate commands onto the final execution step', () => {
    expect(
      confirmedActionLoopToolForSocialExecution({
        command: 'send_candidate_message',
        ownerUserId: 7,
        taskId: 101,
        payload: { targetUserId: 22, hasMessage: true },
      }),
    ).toMatchObject({
      agent: 'Match Agent',
      toolName: 'candidate_command_execute',
      covers: ['execute_confirmed_action'],
      requiresApproval: false,
      input: {
        command: 'send_candidate_message',
        ownerUserId: 7,
        taskId: 101,
        payload: { targetUserId: 22, hasMessage: true },
        confirmedEndpoint: true,
        pipelineSteps: ['execute_confirmed_action'],
        sideEffectPolicy: 'execute_only_after_user_confirmation',
      },
    });

    expect(
      confirmedActionLoopToolForSocialExecution({
        command: 'publish_draft',
        ownerUserId: 7,
        taskId: 101,
        payload: { socialRequestId: 55 },
      }).agent,
    ).toBe('Match Agent');
  });
});
