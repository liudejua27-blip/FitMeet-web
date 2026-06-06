import { UserSocialRequest } from '../social-requests/social-request.entity';
import { AgentTask } from './entities/agent-task.entity';
import {
  buildCandidatePoolResolvedQuery,
  normalizeCandidatePoolArray,
  uniqueCandidatePoolStrings,
} from './social-agent-candidate-pool-query';

describe('buildCandidatePoolResolvedQuery', () => {
  it('prefers explicit tool input over request and task context', () => {
    const query = buildCandidatePoolResolvedQuery({
      query: {
        ownerUserId: 1,
        intent: 'activity_search',
        city: '青岛',
        activityType: '跑步',
        interestTags: ['跑步', '咖啡'],
        timePreference: '周末上午',
        locationPreference: '青岛大学',
        rawText: '青岛周末上午跑步搭子',
      },
      socialRequestId: 301,
      request: {
        city: '北京',
        activityType: '羽毛球',
        interestTags: ['羽毛球'],
        rawText: '北京羽毛球',
        title: '北京约练',
      } as UserSocialRequest,
      task: { goal: '上海咖啡聊天' } as AgentTask,
    });

    expect(query).toEqual({
      city: '青岛',
      intent: 'activity_search',
      interestTags: ['跑步', '咖啡', '羽毛球'],
      activityType: '跑步',
      timePreference: '周末上午',
      locationPreference: '青岛大学',
      socialRequestId: 301,
      rawText: '青岛周末上午跑步搭子',
    });
  });

  it('falls back to social request fields when direct input is omitted', () => {
    const query = buildCandidatePoolResolvedQuery({
      query: {
        ownerUserId: 1,
        city: '',
      },
      socialRequestId: 302,
      request: {
        city: '上海',
        activityType: '咖啡',
        interestTags: ['咖啡', '摄影'],
        rawText: '上海周末咖啡摄影局',
        title: '上海咖啡',
      } as UserSocialRequest,
      task: { goal: '青岛跑步' } as AgentTask,
    });

    expect(query).toMatchObject({
      city: '上海',
      intent: 'social_search',
      activityType: '咖啡',
      timePreference: '周末',
      socialRequestId: 302,
      rawText: '上海周末咖啡摄影局',
    });
    expect(query.interestTags).toEqual(
      expect.arrayContaining(['咖啡', '摄影', '拍照']),
    );
  });

  it('extracts city, activity, tags, and time from task goal raw text', () => {
    const query = buildCandidatePoolResolvedQuery({
      query: { ownerUserId: 1, taskId: 88 },
      socialRequestId: null,
      task: { goal: '想在青岛周末找跑步和咖啡搭子' } as AgentTask,
    });

    expect(query.city).toBe('青岛');
    expect(query.activityType).toBe('咖啡');
    expect(query.timePreference).toBe('周末');
    expect(query.interestTags).toEqual(
      expect.arrayContaining(['跑步', '咖啡']),
    );
  });

  it('normalizes candidate pool arrays and unique text consistently', () => {
    expect(normalizeCandidatePoolArray('跑步、咖啡, 跑步；摄影|')).toEqual([
      '跑步',
      '咖啡',
      '摄影',
    ]);
    expect(
      uniqueCandidatePoolStrings([' Qingdao ', 'qingdao', '', '青岛']),
    ).toEqual(['Qingdao', '青岛']);
  });
});
