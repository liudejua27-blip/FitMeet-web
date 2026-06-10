import {
  buildSocialAgentCandidateMessageDraft,
  readSocialAgentCardActionDraftCandidate,
} from './social-agent-candidate-message-draft.presenter';

describe('social agent candidate message draft presenter', () => {
  it('prefers the card action draft message', () => {
    expect(
      buildSocialAgentCandidateMessageDraft({
        cardActionDraft: {
          message: ' 今晚先在青岛大学操场轻松跑一段吗？ ',
          suggestedOpener: '备用开场白',
        },
        candidates: [{ suggestedMessage: '候选人建议' }],
      }),
    ).toBe('今晚先在青岛大学操场轻松跑一段吗？');
  });

  it('uses card suggestedOpener before candidate suggestedMessage', () => {
    expect(
      buildSocialAgentCandidateMessageDraft({
        cardActionDraft: { suggestedOpener: '先低压力聊聊吗？' },
        candidates: [{ suggestedMessage: '候选人建议' }],
      }),
    ).toBe('先低压力聊聊吗？');
  });

  it('falls back to the first candidate suggested message', () => {
    expect(
      buildSocialAgentCandidateMessageDraft({
        candidates: [{ suggestedMessage: '这周末方便一起慢跑一圈吗？' }],
      }),
    ).toBe('这周末方便一起慢跑一圈吗？');
  });

  it('uses a stable safe default when no draft is available', () => {
    expect(buildSocialAgentCandidateMessageDraft({})).toBe(
      '你好，看到你也在附近，想先站内聊聊看看是否方便一起约练。',
    );
  });

  it('reads the nested card action draft candidate safely', () => {
    const candidate = { candidateUserId: 22, nickname: '小林' };
    expect(readSocialAgentCardActionDraftCandidate({ candidate })).toBe(
      candidate,
    );
    expect(
      readSocialAgentCardActionDraftCandidate({ candidate: null }),
    ).toEqual({});
  });
});
