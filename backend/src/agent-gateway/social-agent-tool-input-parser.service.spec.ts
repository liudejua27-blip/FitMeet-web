import { ForbiddenException, NotFoundException } from '@nestjs/common';

import {
  ActivityProofPolicy,
  ActivityType,
} from '../activities/entities/activity-template.entity';
import { SocialRequestType } from '../social-requests/social-request.entity';
import { PaymentIntentStatus } from './entities/payment-intent.entity';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';

describe('SocialAgentToolInputParserService', () => {
  let parser: SocialAgentToolInputParserService;

  beforeEach(() => {
    parser = new SocialAgentToolInputParserService();
  });

  it('normalizes scalar values without accepting empty or unsafe inputs', () => {
    expect(parser.string('  hello  ')).toBe('hello');
    expect(parser.string('   ')).toBeUndefined();
    expect(parser.number('42.5')).toBe(42.5);
    expect(parser.number(Number.NaN)).toBeUndefined();
    expect(parser.positiveAmount('12.345')).toBe(12.35);
    expect(parser.positiveAmount('0')).toBeUndefined();
    expect(parser.bool('是')).toBe(true);
    expect(parser.bool('no')).toBe(false);
    expect(parser.bool('maybe')).toBeUndefined();
  });

  it('normalizes collection and record shapes', () => {
    expect(parser.stringList([' a ', '', 3, 'b'])).toEqual(['a', 'b']);
    expect(parser.stringList(' solo ')).toEqual(['solo']);
    expect(parser.stringArray(['a', '', 1, ' b '])).toEqual(['a', ' b ']);
    expect(parser.asRecord({ ok: true })).toEqual({ ok: true });
    expect(parser.asRecord('value')).toEqual({ value: 'value' });
    expect(parser.isRecord({ ok: true })).toBe(true);
    expect(parser.isRecord(['nope'])).toBe(false);
  });

  it('keeps tool enum parsing on declared values only', () => {
    expect(parser.socialRequestType('city_walk')).toBe(
      SocialRequestType.CityWalk,
    );
    expect(parser.activityType('running')).toBe(ActivityType.Running);
    expect(parser.activityProofPolicy('mutual_or_proof')).toBe(
      ActivityProofPolicy.MutualOrProof,
    );
    expect(parser.paymentIntentStatus('completed')).toBe(
      PaymentIntentStatus.Completed,
    );
    expect(parser.socialRequestType('unknown')).toBeUndefined();
    expect(parser.paymentIntentStatus('paid')).toBeUndefined();
  });

  it('builds stable error payloads for Nest and unknown errors', () => {
    expect(
      parser.errorPayload(new ForbiddenException('blocked')),
    ).toMatchObject({
      code: 'tool_permission_blocked',
      message: 'blocked',
      statusCode: 403,
    });
    expect(parser.errorPayload(new NotFoundException('missing'))).toMatchObject(
      {
        code: 'TOOL_EXECUTION_FAILED',
        message: 'missing',
        statusCode: 404,
      },
    );
    expect(parser.errorPayload(new Error('boom'))).toEqual({
      code: 'tool_execution_failed',
      message: 'boom',
    });
  });

  it('serializes unknown values for audit previews', () => {
    expect(parser.safeUnknownText(null)).toBe('null');
    expect(parser.safeUnknownText({ value: 1 })).toBe('{"value":1}');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(parser.safeUnknownText(circular)).toBe('[unserializable]');
  });
});
