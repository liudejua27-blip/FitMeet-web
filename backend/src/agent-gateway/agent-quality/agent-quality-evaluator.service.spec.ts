import { AgentQualityEvaluatorService } from './agent-quality-evaluator.service';
import type { FitMeetAlphaCard } from '../fitmeet-alpha-agent.types';

describe('AgentQualityEvaluatorService', () => {
  let service: AgentQualityEvaluatorService;

  beforeEach(() => {
    service = new AgentQualityEvaluatorService();
  });

  it('passes a natural recommendation result with explanation, safety and confirmation gates', () => {
    const report = service.evaluate({
      assistantMessage:
        '我先结合你的 Life Graph 看了时间、地点和运动强度。小林比较适合从一次轻松慢跑开始。',
      visibleSteps: [
        { id: 'understand', label: '正在理解你的需求', status: 'done' },
        { id: 'match', label: '正在筛选公开可发现的人', status: 'done' },
        { id: 'confirm', label: '正在等待你确认', status: 'running' },
      ],
      structuredIntent: {
        readiness: 'search',
        requiresSearch: true,
      },
      safety: {
        blocked: false,
        level: 'low',
        reasons: [],
        boundaryNotes: ['第一次建议选择公共场所。'],
        requiredConfirmations: ['send_message'],
      },
      candidates: [{ userId: 7, displayName: '小林' }],
      approvalRequiredActions: [{ id: 1, actionType: 'send_message' }],
      cards: [thisCandidateCard()],
    });

    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it('fails when user-facing output leaks technical artifacts', () => {
    const report = service.evaluate({
      assistantMessage: 'planner raw JSON: {"traceId":"abc","tool":"search"}',
      cards: [],
    });

    expect(report.passed).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'user_facing_tone',
          status: 'fail',
        }),
      ]),
    );
  });

  it('fails when vague low-pressure companionship jumps into candidate search', () => {
    const report = service.evaluate({
      assistantMessage: '可以。我先帮你找轻松一点、不需要太强社交压力的人。',
      structuredIntent: {
        readiness: 'clarify',
        requiresSearch: false,
      },
      candidates: [{ userId: 8 }],
      cards: [thisCandidateCard()],
    });

    expect(report.passed).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'clarification_gate',
          status: 'fail',
        }),
      ]),
    );
  });

  it('fails when blocked safety still produces execution artifacts', () => {
    const report = service.evaluate({
      assistantMessage: '这个请求不适合继续，我可以帮你换成更安全的方式。',
      safety: {
        blocked: true,
        level: 'blocked',
        reasons: ['精确定位'],
        boundaryNotes: ['不能索要对方精确位置。'],
        requiredConfirmations: [],
      },
      candidates: [{ userId: 9 }],
      approvalRequiredActions: [{ id: 1, actionType: 'send_message' }],
    });

    expect(report.passed).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'safety_gate',
          status: 'fail',
        }),
      ]),
    );
  });

  it('fails candidate cards without full recommendation explanation', () => {
    const incompleteCard: FitMeetAlphaCard = {
      ...thisCandidateCard(),
      data: {
        recommendationLine: '我推荐小林。',
        fitReasons: ['青岛大学附近活动'],
      },
    };

    const report = service.evaluate({
      candidates: [{ userId: 7 }],
      cards: [incompleteCard],
    });

    expect(report.passed).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'candidate_card_explanation',
          status: 'fail',
        }),
      ]),
    );
  });

  it('fails high-risk actions that skip confirmation', () => {
    const unsafeCard: FitMeetAlphaCard = {
      ...thisCandidateCard(),
      actions: [
        {
          id: 'send_now',
          label: '直接发送',
          action: 'send_message',
          requiresConfirmation: false,
        },
      ],
    };

    const report = service.evaluate({
      cards: [unsafeCard],
    });

    expect(report.passed).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'approval_gate',
          status: 'fail',
        }),
      ]),
    );
  });
});

function thisCandidateCard(): FitMeetAlphaCard {
  return {
    id: 'candidate_7',
    type: 'candidate_card',
    title: '候选人：小林',
    body: '我推荐小林，是因为你们的时间、活动区域和第一次见面的边界都比较一致。',
    status: 'ready',
    data: {
      recommendationLine:
        '你们的活动区域、时间、运动偏好和第一次见面边界都比较一致。',
      fitReasons: ['青岛大学附近活动', '周末下午活跃', '接受公共场所见面'],
      whyNow: '这周更适合先从低压力慢跑开始，不需要直接进入高强度训练。',
      safetyBoundary: '第一次建议选择校园操场或公共公园，不共享精确位置。',
      suggestedOpener:
        '你好，我看到你也喜欢周末下午跑步。如果你方便，这周六可以在校园操场轻松慢跑一圈。',
      nextActions: ['生成开场白', '看看更多', '只看同校', '创建约练'],
    },
    actions: [
      {
        id: 'generate_opener',
        label: '生成开场白',
        action: 'generate_opener',
        requiresConfirmation: false,
      },
      {
        id: 'create_activity',
        label: '创建约练',
        action: 'create_activity',
        requiresConfirmation: true,
      },
      {
        id: 'send_message',
        label: '确认发送',
        action: 'send_message',
        requiresConfirmation: true,
      },
    ],
  };
}
