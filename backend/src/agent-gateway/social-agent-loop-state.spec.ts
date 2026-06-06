import {
  appendSocialAgentLoopValue,
  buildSocialAgentActivityInviteDedupeKey,
  buildSocialAgentMessageDedupeKey,
  buildSocialAgentPaymentIntentDedupeKey,
  filterNewSocialAgentCounterpartMessages,
  filterPendingSocialAgentCounterpartMessages,
  normalizeSocialAgentDedupeText,
  socialAgentLoopStringArray,
  toSocialAgentMessageArray,
} from './social-agent-loop-state';
import { SocialAgentToolName } from './social-agent-tool.types';

describe('social agent loop state helpers', () => {
  it('builds stable dedupe keys for messages, activities, and payments', () => {
    expect(buildSocialAgentMessageDedupeKey(7, ' Hello   THERE ')).toBe(
      'message:7:hello there',
    );
    expect(
      buildSocialAgentActivityInviteDedupeKey(
        SocialAgentToolName.InviteActivity,
        {
          invitedUserId: 9,
          title: '  Morning   Run ',
          startTime: ' 2026-06-07 08:00 ',
          city: ' Qingdao ',
          locationName: ' Beach ',
        },
      ),
    ).toBe(
      'activity:invite_activity:9:morning run:2026-06-07 08:00:qingdao:beach',
    );
    expect(
      buildSocialAgentPaymentIntentDedupeKey({
        targetUserId: null,
        amount: 12,
        currency: 'CNY',
        description: '  Coffee   split ',
      }),
    ).toBe('payment:unknown:12.00:CNY:coffee split');
  });

  it('normalizes and caps loop string arrays', () => {
    expect(normalizeSocialAgentDedupeText(' A\n\tB   C ')).toBe('a b c');
    expect(socialAgentLoopStringArray(['a', 1, 'b', null])).toEqual(['a', 'b']);

    const values = Array.from({ length: 101 }, (_, index) => `k_${index}`);
    expect(appendSocialAgentLoopValue(values, 'k_101')).toHaveLength(100);
    expect(appendSocialAgentLoopValue(['a'], 'a')).toEqual(['a']);
  });

  it('normalizes backend message payloads', () => {
    expect(
      toSocialAgentMessageArray([
        {
          messageId: 'm1',
          conversationId: 'c1',
          content: 'hello',
          senderId: '8',
          senderType: 'user',
        },
        null,
      ]),
    ).toEqual([
      expect.objectContaining({
        id: 'm1',
        conversationId: 'c1',
        text: 'hello',
        senderId: 8,
        senderType: 'user',
      }),
    ]);
  });

  it('filters only new counterpart messages and supports pending fallback', () => {
    const messages = toSocialAgentMessageArray([
      { id: 'm1', text: 'old', senderId: 2, senderType: 'user' },
      { id: 'm2', text: 'mine', senderId: 1, senderType: 'user' },
      { id: 'm3', text: 'agent', senderId: 99, senderType: 'agent' },
      { id: 'm4', text: 'new', senderId: 2, senderType: 'user' },
    ]);

    expect(filterNewSocialAgentCounterpartMessages(messages, 'm1', 1)).toEqual([
      expect.objectContaining({ id: 'm4' }),
    ]);

    expect(
      filterPendingSocialAgentCounterpartMessages(
        messages,
        'm4',
        { pendingMessageId: 'm1', processedMessageIds: [] },
        1,
      ),
    ).toEqual([expect.objectContaining({ id: 'm1' })]);
  });
});
