import { redactSensitiveValue } from './privacy-redaction.util';

describe('privacy redaction', () => {
  it('redacts phone, email, contact handles, coordinates and address hints', () => {
    const result = redactSensitiveValue({
      message:
        '手机号 15253005312，邮箱 15253005312@163.com，微信 wx_fitmeet_2026，身份证 370202199901011234，银行卡 6222 0202 0202 0202 020，地址 青岛大学1号楼302，坐标 36.123456,120.123456',
      lat: 36.123456,
      content: '私聊内容 15253005312',
      realName: '张三',
      identityCard: '370202199901011234',
    });

    const text = JSON.stringify(result);
    expect(text).not.toContain('15253005312');
    expect(text).not.toContain('wx_fitmeet_2026');
    expect(text).not.toContain('370202199901011234');
    expect(text).not.toContain('张三');
    expect(text).not.toContain('36.123456');
    expect(text).toContain('[REDACTED_PHONE]');
    expect(text).toContain('[REDACTED_EMAIL]');
    expect(text).toContain('[REDACTED_CONTACT]');
    expect(text).toContain('[REDACTED_ID_CARD]');
    expect(text).toContain('[REDACTED_BANK_CARD]');
    expect(text).toContain('[REDACTED_ADDRESS]');
  });

  it('keeps assistant-ui card arrays while redacting payment card fields', () => {
    const result = redactSensitiveValue({
      cards: [
        {
          type: 'candidate_card',
          schemaType: 'social_match.candidate',
          data: {
            schemaName: 'OpportunityCard',
            opportunityCard: true,
          },
        },
      ],
      bankCard: '6222 0202 0202 0202 020',
      creditCardNumber: '6222 0202 0202 0202 020',
    }) as {
      cards?: Array<Record<string, unknown>>;
      bankCard?: string;
      creditCardNumber?: string;
    };

    expect(result.cards?.[0]).toMatchObject({
      type: 'candidate_card',
      data: {
        schemaName: 'OpportunityCard',
        opportunityCard: true,
      },
    });
    expect(result.bankCard).toBe('[REDACTED]');
    expect(result.creditCardNumber).toBe('[REDACTED]');
  });
});
