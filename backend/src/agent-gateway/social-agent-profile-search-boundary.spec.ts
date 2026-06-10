import { hasSocialAgentImmediateSearchRequest } from './social-agent-profile-search-boundary';

describe('social agent profile/search boundary', () => {
  it('detects explicit search commands even when profile facts are present', () => {
    expect(
      hasSocialAgentImmediateSearchRequest(
        '我是青岛大学男生，周末下午喜欢跑步，现在帮我找同校跑步搭子',
      ),
    ).toBe(true);
    expect(
      hasSocialAgentImmediateSearchRequest(
        '搜索青岛今晚跑步搭子，返回真实候选人列表',
      ),
    ).toBe(true);
  });

  it('does not treat long-term social goals as immediate search commands', () => {
    expect(
      hasSocialAgentImmediateSearchRequest(
        '我是白羊男，18，身高181，在青岛上学，想找个同校的女生',
      ),
    ).toBe(false);
    expect(hasSocialAgentImmediateSearchRequest('我希望认识慢热一点的人')).toBe(
      false,
    );
  });
});
