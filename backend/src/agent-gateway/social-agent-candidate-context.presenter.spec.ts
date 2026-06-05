import type { AgentTask } from './entities/agent-task.entity';
import {
  hasSocialAgentSearchContext,
  socialAgentCandidateFollowupReply,
} from './social-agent-candidate-context.presenter';

function task(patch: Partial<AgentTask>): AgentTask {
  return { id: 101, memory: {}, result: {}, ...patch } as AgentTask;
}

describe('social-agent-candidate-context.presenter', () => {
  it('detects search context from stored candidates and chat run metadata', () => {
    expect(
      hasSocialAgentSearchContext(
        task({
          memory: {
            shortTerm: {
              candidates: [{ nickname: '小周', userId: 7 }],
            },
          },
        }),
      ),
    ).toBe(true);
    expect(
      hasSocialAgentSearchContext(
        task({
          result: {
            chatRun: {
              candidateCount: 2,
            },
          },
        }),
      ),
    ).toBe(true);
    expect(hasSocialAgentSearchContext(task({}))).toBe(false);
  });

  it('answers candidate match-reason follow-ups for the selected candidate', () => {
    const reply = socialAgentCandidateFollowupReply(
      task({
        memory: {
          shortTerm: {
            candidates: [
              { nickname: '小林', userId: 1, reasons: ['同城'] },
              {
                nickname: '小周',
                userId: 2,
                reasons: ['都喜欢跑步', '周末时间接近'],
              },
            ],
          },
        },
      }),
      '为什么推荐第二个',
    );

    expect(reply).toContain('小周');
    expect(reply).toContain('都喜欢跑步');
  });

  it('answers candidate risk follow-ups without hiding warnings', () => {
    const reply = socialAgentCandidateFollowupReply(
      task({
        memory: {
          shortTerm: {
            candidates: [
              {
                nickname: '小周',
                userId: 2,
                riskWarnings: ['资料还不完整', '建议先站内聊'],
              },
            ],
          },
        },
      }),
      '靠谱吗，有风险吗',
    );

    expect(reply).toContain('资料还不完整');
    expect(reply).toContain('公开地点');
  });

  it('falls back when no candidate context is available', () => {
    expect(socialAgentCandidateFollowupReply(task({}), '为什么')).toContain(
      '还没有可参考的候选人',
    );
  });
});
