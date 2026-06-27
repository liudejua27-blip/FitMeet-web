import { buildCandidateIdentityFields } from './social-agent-candidate-identity-fields';

describe('social-agent-candidate-identity-fields', () => {
  it('builds stable user identity fields for candidate cards', () => {
    expect(
      buildCandidateIdentityFields({
        user: {
          id: 22,
          avatar: 'https://cdn.fitmeet/avatar.png',
          color: '#168a55',
          updatedAt: new Date('2026-06-07T00:00:00.000Z'),
        },
        displayName: '林同学',
        city: '青岛',
      }),
    ).toEqual({
      targetUserId: 22,
      candidateUserId: 22,
      userId: 22,
      displayName: '林同学',
      nickname: '林同学',
      avatar: 'https://cdn.fitmeet/avatar.png',
      color: '#168a55',
      city: '青岛',
      updatedAt: '2026-06-07T00:00:00.000Z',
    });
  });

  it('keeps safe defaults for optional visual fields', () => {
    expect(
      buildCandidateIdentityFields({
        user: { id: 23, avatar: '', color: '', updatedAt: null },
        displayName: '青岛用户 23',
        city: '青岛',
      }),
    ).toMatchObject({
      avatar: '',
      color: '#202124',
      updatedAt: null,
    });
  });

  it('uses caller-provided avatar when candidate privacy hides the real avatar', () => {
    expect(
      buildCandidateIdentityFields({
        user: {
          id: 24,
          avatar: 'https://cdn.fitmeet/real.png',
          color: '#168a55',
          updatedAt: null,
        },
        displayName: '同城搭子 25',
        city: '青岛市南区',
        avatar: '',
      }),
    ).toMatchObject({
      displayName: '同城搭子 25',
      nickname: '同城搭子 25',
      avatar: '',
      city: '青岛市南区',
    });
  });
});
