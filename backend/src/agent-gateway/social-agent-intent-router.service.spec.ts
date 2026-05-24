import { SocialAgentIntentRouterService } from './social-agent-intent-router.service';

function makeRouter() {
  return new SocialAgentIntentRouterService({
    get: jest.fn().mockReturnValue(undefined),
  } as never);
}

describe('SocialAgentIntentRouterService', () => {
  it('prioritizes candidate search when the user asks not to send messages', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '帮我找青岛今晚一起跑步的真实用户，推荐几个人，先不要自动发消息',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
      source: 'rules',
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('keeps explicit no-approval candidate list requests on social search', async () => {
    const router = makeRouter();

    const result = await router.route({
      message:
        '搜索青岛今晚跑步搭子，返回真实候选人列表，不要发送消息，不要创建待确认动作',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
      source: 'rules',
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('still routes explicit send requests to action confirmation', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '帮我发消息给第一个人',
      taskContext: { hasCandidates: true },
    });

    expect(result).toMatchObject({
      intent: 'action_request',
      shouldSearch: false,
      shouldExecuteAction: true,
      replyStrategy: 'execute_action',
      source: 'rules',
    });
  });
});
