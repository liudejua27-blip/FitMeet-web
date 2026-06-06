import {
  buildSocialAgentProfileExtractionMessages,
  parseSocialAgentProfileExtractionContent,
  profileFieldsFromRecord,
} from './social-agent-profile-extraction.presenter';
import { AgentTask } from './entities/agent-task.entity';

describe('social agent profile extraction presenter', () => {
  it('builds a strict JSON extraction prompt with task context', () => {
    const messages = buildSocialAgentProfileExtractionMessages(
      { id: 42 } as AgentTask,
      '我是青岛大学的 INFP，想找同校搭子。',
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain('Return only one valid JSON object');
    expect(JSON.parse(messages[1]?.content ?? '{}')).toMatchObject({
      taskId: 42,
      message: '我是青岛大学的 INFP，想找同校搭子。',
    });
  });

  it('normalizes extracted profile fields without accepting nested objects', () => {
    expect(
      profileFieldsFromRecord({
        city: ' 青岛 ',
        availableTimes: [' 周六 ', '', '周日'],
        unsafeObject: { city: '青岛' },
        mixedArray: ['青岛', 7],
        empty: '',
      }),
    ).toEqual({
      city: '青岛',
      availableTimes: ['周六', '周日'],
    });
  });

  it('parses JSON object extraction content into normalized fields', () => {
    expect(
      parseSocialAgentProfileExtractionContent(
        JSON.stringify({
          school: ' 青岛大学 ',
          mbti: 'INFP',
          boundaries: ['不喝酒', ' 不熬夜 '],
        }),
      ),
    ).toEqual({
      school: '青岛大学',
      mbti: 'INFP',
      boundaries: ['不喝酒', '不熬夜'],
    });
  });
});
