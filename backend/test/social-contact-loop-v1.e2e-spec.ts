import { fitMeetCoreOpenApi } from '../src/openapi/fitmeet-core.openapi';

type Operation = {
  parameters?: Array<{ name: string; in: string; required: boolean }>;
  requestBody?: unknown;
  responses?: Record<string, unknown>;
};

function operation(path: string, method: string): Operation {
  const item =
    fitMeetCoreOpenApi.paths[path as keyof typeof fitMeetCoreOpenApi.paths];
  if (!item) throw new Error(`Missing OpenAPI path ${path}`);
  const op = item[method as keyof typeof item] as Operation | undefined;
  if (!op)
    throw new Error(
      `Missing OpenAPI operation ${method.toUpperCase()} ${path}`,
    );
  return op;
}

function expectIdempotencyKey(path: string, method = 'post') {
  expect(operation(path, method).parameters).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
      }),
    ]),
  );
}

describe('Social Contact Loop V1 contract', () => {
  it('requires idempotency on externally visible side-effect endpoints', () => {
    [
      '/connections/requests',
      '/connections/requests/{id}/accept',
      '/connections/requests/{id}/reject',
      '/connections/requests/{id}/cancel',
      '/public/social-intents/{id}/applications',
      '/public-intent-applications/{id}/accept',
      '/public-intent-applications/{id}/reject',
      '/public-intent-applications/{id}/cancel',
      '/messages/start',
    ].forEach((path) => expectIdempotencyKey(path));
  });

  it('exposes relationship, application, and provisioning states to clients', () => {
    expect(
      operation('/relationships/users/{userId}', 'get').responses,
    ).toHaveProperty('200');
    expect(
      operation('/public-intent-applications/{id}/accept', 'post').responses,
    ).toHaveProperty('201');
    expect(fitMeetCoreOpenApi.components.schemas.RelationshipState).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          messagePermission: expect.objectContaining({
            enum: [
              'none',
              'opener_available',
              'awaiting_reply',
              'open',
              'closed',
            ],
          }),
        }),
      }),
    );
    expect(
      fitMeetCoreOpenApi.components.schemas
        .AcceptPublicIntentApplicationResponse,
    ).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          conversation: expect.objectContaining({
            properties: expect.objectContaining({
              status: expect.objectContaining({
                enum: ['provisioning', 'ready'],
              }),
            }),
          }),
        }),
      }),
    );
  });
});
