import { SocialAgentUserInterestEvent } from './entities/social-agent-user-interest-event.entity';
import { SocialAgentUserInterestEventService } from './social-agent-user-interest-event.service';

function makeRepo() {
  const rows: SocialAgentUserInterestEvent[] = [];
  return {
    rows,
    create: jest.fn(
      (input: Partial<SocialAgentUserInterestEvent>) =>
        input as SocialAgentUserInterestEvent,
    ),
    save: jest.fn(async (input: SocialAgentUserInterestEvent) => {
      if (input.dedupeKey && rows.some((row) => row.dedupeKey === input.dedupeKey)) {
        const error = new Error('duplicate key value violates unique constraint');
        (error as { code?: string }).code = '23505';
        throw error;
      }
      const saved = {
        ...input,
        id: rows.length + 1,
        createdAt: new Date(`2026-06-22T00:00:0${rows.length}.000Z`),
      } as SocialAgentUserInterestEvent;
      rows.push(saved);
      return saved;
    }),
    find: jest.fn(async (input: { where: { ownerUserId: number }; take: number }) =>
      rows
        .filter((row) => row.ownerUserId === input.where.ownerUserId)
        .slice(0, input.take),
    ),
  };
}

describe('SocialAgentUserInterestEventService', () => {
  it('builds candidate interest events from low-risk card actions', () => {
    const repo = makeRepo();
    const service = new SocialAgentUserInterestEventService(repo as never);

    const event = service.eventFromCandidateAction({
      action: 'candidate.like',
      ownerUserId: 7,
      agentTaskId: 101,
      targetUserId: 22,
      candidateRecordId: 501,
      socialRequestId: 301,
      candidate: {
        displayName: '陈砚',
        city: '青岛',
        area: '青岛大学附近',
        timeWindow: '今天晚上',
        interests: ['散步', '编程'],
        matchReasons: ['低压力社交', '同城'],
      },
      dedupeKey: 'candidate-interest:7:101:like:22:501',
    });

    expect(event).toMatchObject({
      ownerUserId: 7,
      agentTaskId: 101,
      eventType: 'save_candidate',
      targetUserId: 22,
      candidateRecordId: 501,
      socialRequestId: 301,
      weight: 4,
      activityTags: ['散步', '编程'],
      candidatePreferenceTags: ['低压力社交', '同城'],
      city: '青岛',
      locationText: '青岛大学附近',
      timeWindow: '今天晚上',
      source: 'agent_candidate_card',
    });
  });

  it('normalizes product card action aliases into interest events', () => {
    const repo = makeRepo();
    const service = new SocialAgentUserInterestEventService(repo as never);

    expect(
      service.eventFromCandidateAction({
        action: 'view_candidate',
        ownerUserId: 7,
        targetUserId: 22,
      })?.eventType,
    ).toBe('view_profile');
    expect(
      service.eventFromCandidateAction({
        action: 'save_candidate',
        ownerUserId: 7,
        targetUserId: 22,
      })?.eventType,
    ).toBe('save_candidate');
    expect(
      service.eventFromCandidateAction({
        action: 'send_candidate_message',
        ownerUserId: 7,
        targetUserId: 22,
      })?.eventType,
    ).toBe('send_invite');
    expect(
      service.eventFromCandidateAction({
        action: 'candidate.connect_and_chat',
        ownerUserId: 7,
        targetUserId: 22,
      })?.eventType,
    ).toBe('connect_candidate');
  });

  it('deduplicates persisted events and summarizes weighted interests', async () => {
    const repo = makeRepo();
    const service = new SocialAgentUserInterestEventService(repo as never);

    await service.recordEvent({
      ownerUserId: 7,
      eventType: 'save_candidate',
      targetUserId: 22,
      weight: 4,
      activityTags: ['散步'],
      candidatePreferenceTags: ['低压力'],
      city: '青岛',
      locationText: '青岛大学',
      timeWindow: '今天晚上',
      dedupeKey: 'same-event',
    });
    await service.recordEvent({
      ownerUserId: 7,
      eventType: 'save_candidate',
      targetUserId: 22,
      weight: 4,
      activityTags: ['散步'],
      dedupeKey: 'same-event',
    });
    await service.recordEvent({
      ownerUserId: 7,
      eventType: 'skip_candidate',
      targetUserId: 33,
      weight: -3,
      activityTags: ['健身'],
      candidatePreferenceTags: ['太强社交'],
    });

    const summary = await service.summarizeForUser({ ownerUserId: 7 });

    expect(repo.save).toHaveBeenCalledTimes(3);
    expect(repo.rows).toHaveLength(2);
    expect(summary).toMatchObject({
      ownerUserId: 7,
      eventCount: 2,
      positiveTargetUserIds: [22],
      negativeTargetUserIds: [33],
      activityTagWeights: [
        { tag: '散步', weight: 4 },
        { tag: '健身', weight: -3 },
      ],
      candidatePreferenceWeights: [
        { tag: '低压力', weight: 4 },
        { tag: '太强社交', weight: -3 },
      ],
      cityWeights: [{ tag: '青岛', weight: 4 }],
      locationWeights: [{ tag: '青岛大学', weight: 4 }],
      timeWindowWeights: [{ tag: '今天晚上', weight: 4 }],
    });
  });
});
