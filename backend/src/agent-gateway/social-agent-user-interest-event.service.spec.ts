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
    save: jest.fn((input: SocialAgentUserInterestEvent) => {
      if (
        input.dedupeKey &&
        rows.some((row) => row.dedupeKey === input.dedupeKey)
      ) {
        const error = new Error(
          'duplicate key value violates unique constraint',
        );
        (error as { code?: string }).code = '23505';
        return Promise.reject(error);
      }
      const saved = {
        ...input,
        id: rows.length + 1,
        createdAt: new Date(`2026-06-22T00:00:0${rows.length}.000Z`),
      } as SocialAgentUserInterestEvent;
      rows.push(saved);
      return Promise.resolve(saved);
    }),
    find: jest.fn((input: { where: { ownerUserId: number }; take: number }) =>
      Promise.resolve(
        rows
          .filter((row) => row.ownerUserId === input.where.ownerUserId)
          .slice(0, input.take),
      ),
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

  it('treats accepted invitations as stronger recommendation outcomes than sent invitations', async () => {
    const repo = makeRepo();
    const service = new SocialAgentUserInterestEventService(repo as never);

    await service.recordEvent({
      ownerUserId: 7,
      eventType: 'send_invite',
      targetUserId: 22,
      activityTags: ['散步'],
      city: '青岛',
      dedupeKey: 'send-invite',
    });
    await service.recordEvent({
      ownerUserId: 7,
      eventType: 'invite_accepted',
      targetUserId: 33,
      activityTags: ['羽毛球'],
      city: '青岛',
      dedupeKey: 'invite-accepted',
    });

    const summary = await service.summarizeForUser({ ownerUserId: 7 });

    expect(repo.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'send_invite', weight: 4 }),
        expect.objectContaining({ eventType: 'invite_accepted', weight: 6 }),
      ]),
    );
    expect(summary.positiveTargetUserIds[0]).toBe(33);
    expect(summary.highAffinityTargetUserIds[0]).toBe(33);
    expect(summary.activityTagWeights).toEqual([
      { tag: '羽毛球', weight: 6 },
      { tag: '散步', weight: 4 },
    ]);
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
      highAffinityTargetUserIds: [22],
      rejectedTargetUserIds: [33],
      overExposedTargetUserIds: [],
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

  it('decays stale behavior so recent recommendation signals win', async () => {
    const repo = makeRepo();
    const service = new SocialAgentUserInterestEventService(repo as never);

    await service.recordEvent({
      ownerUserId: 7,
      eventType: 'save_candidate',
      targetUserId: 22,
      activityTags: ['羽毛球'],
      dedupeKey: 'old-like',
    });
    repo.rows[0].createdAt = new Date('2026-01-01T00:00:00.000Z');

    await service.recordEvent({
      ownerUserId: 7,
      eventType: 'save_candidate',
      targetUserId: 33,
      activityTags: ['散步'],
      dedupeKey: 'recent-like',
    });
    repo.rows[1].createdAt = new Date('2026-06-22T00:00:00.000Z');

    const summary = await service.summarizeForUser({ ownerUserId: 7 });

    expect(summary.positiveTargetUserIds).toEqual([33, 22]);
    expect(summary.activityTagWeights).toEqual([
      { tag: '散步', weight: 4 },
      { tag: '羽毛球', weight: 1 },
    ]);
  });

  it('tracks repeated exposure separately from high-affinity actions', async () => {
    const repo = makeRepo();
    const service = new SocialAgentUserInterestEventService(repo as never);

    await service.recordEvent({
      ownerUserId: 7,
      eventType: 'view_profile',
      targetUserId: 22,
      dedupeKey: 'view-1',
    });
    await service.recordEvent({
      ownerUserId: 7,
      eventType: 'discover_click',
      targetUserId: 22,
      dedupeKey: 'view-2',
    });
    await service.recordEvent({
      ownerUserId: 7,
      eventType: 'connect_candidate',
      targetUserId: 33,
      dedupeKey: 'connect-33',
    });

    const summary = await service.summarizeForUser({ ownerUserId: 7 });

    expect(summary.overExposedTargetUserIds[0]).toBe(22);
    expect(summary.highAffinityTargetUserIds).toEqual([33]);
    expect(summary.rejectedTargetUserIds).toEqual([]);
  });
});
