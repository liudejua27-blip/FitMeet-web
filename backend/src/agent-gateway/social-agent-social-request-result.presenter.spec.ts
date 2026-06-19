import { buildSocialAgentSocialRequestResult } from './social-agent-social-request-result.presenter';

describe('buildSocialAgentSocialRequestResult', () => {
  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  it('wraps a private social request with stable ids', () => {
    const request = {
      id: 21,
      status: 'active',
      title: 'Weekend run',
      city: 'Qingdao',
    };

    expect(buildSocialAgentSocialRequestResult({ request, asRecord })).toEqual({
      ...request,
      socialRequest: request,
      socialRequestId: 21,
    });
  });

  it('adds public intent sync fields without dropping request fields', () => {
    const request = { id: 21, status: 'active', title: 'Weekend run' };
    const publicIntent = { id: 'public_21', status: 'active' };

    expect(
      buildSocialAgentSocialRequestResult({
        request,
        publicIntent,
        asRecord,
      }),
    ).toEqual({
      ...request,
      socialRequest: request,
      socialRequestId: 21,
      publicIntent,
      publicIntentId: 'public_21',
      publicIntentStatus: 'active',
      synced: true,
    });
  });
});
