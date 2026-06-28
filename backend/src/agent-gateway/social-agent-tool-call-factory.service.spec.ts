import { BadRequestException } from '@nestjs/common';

import { AgentPermissionService } from './agent-permission.service';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import { SocialAgentToolCallFactoryService } from './social-agent-tool-call-factory.service';
import { SocialAgentToolName } from './social-agent-tool.types';

function makeFactory() {
  return new SocialAgentToolCallFactoryService(
    new AgentPermissionService(),
    new FitMeetAgentToolRegistryService(),
  );
}

describe('SocialAgentToolCallFactoryService', () => {
  it('resolves explicit tool names and registry aliases', () => {
    const factory = makeFactory();

    expect(
      factory.resolveToolName({ toolName: SocialAgentToolName.SendMessage }),
    ).toBe(SocialAgentToolName.SendMessage);
    expect(factory.normalizeToolName('send_message')).toBe(
      SocialAgentToolName.SendMessage,
    );
    expect(factory.normalizeToolName('publish_social_request')).toBe(
      SocialAgentToolName.PublishSocialRequest,
    );
    expect(factory.normalizeToolName('create_social_request')).toBe(
      SocialAgentToolName.CreateSocialRequest,
    );
    expect(factory.normalizeToolName('social_request_draft')).toBe(
      SocialAgentToolName.CreateSocialRequest,
    );
    expect(factory.normalizeToolName('unknown_tool')).toBeNull();
  });

  it('falls back from normalized agent actions to executor tool names', () => {
    const factory = makeFactory();

    expect(factory.resolveToolName({ action: 'send_message' })).toBe(
      SocialAgentToolName.SendMessage,
    );
    expect(factory.resolveToolName({ actionType: 'favorite_candidate' })).toBe(
      SocialAgentToolName.SaveCandidate,
    );
  });

  it('rejects steps without a known tool or action', () => {
    const factory = makeFactory();

    expect(() => factory.resolveToolName({ action: '???' })).toThrow(
      BadRequestException,
    );
  });

  it('detects remaining executable plan steps', () => {
    const factory = makeFactory();

    expect(factory.shouldExecuteStep({ status: 'planned' })).toBe(true);
    expect(factory.shouldExecuteStep({ status: 'succeeded' })).toBe(false);
    expect(
      factory.hasNoRemainingExecutableSteps([
        { status: 'succeeded' },
        { status: 'skipped' },
      ]),
    ).toBe(true);
    expect(
      factory.hasNoRemainingExecutableSteps([
        { status: 'succeeded' },
        { status: 'planned' },
      ]),
    ).toBe(false);
  });

  it('builds stable tool call records and writes them back to plan steps', () => {
    const factory = makeFactory();
    const startedAt = new Date('2026-06-06T00:00:00.000Z');
    const id = factory.safeToolCallId(
      42,
      SocialAgentToolName.SendMessage,
      startedAt,
    );
    const call = factory.buildToolCall({
      id,
      stepId: 'step_1',
      toolName: SocialAgentToolName.SendMessage,
      status: 'succeeded',
      input: { text: 'hello' },
      output: { ok: true },
      error: null,
      startedAt,
    });

    expect(call.id).toMatch(/^sm_42_/);
    expect(call.startedAt).toBe('2026-06-06T00:00:00.000Z');
    expect(call.completedAt).toEqual(expect.any(String));
    expect(call.durationMs).toEqual(expect.any(Number));
    expect(
      factory.withStepResult({ id: 'step_1', status: 'planned' }, call),
    ).toMatchObject({
      id: 'step_1',
      status: 'succeeded',
      toolCallId: call.id,
      output: { ok: true },
      error: null,
      completedAt: call.completedAt,
    });
  });

  it('keeps event-safe strings inside varchar bounds', () => {
    const factory = makeFactory();

    expect(factory.safeVarchar({ a: 1 }, 20)).toBe('{"a":1}');
    expect(factory.safeVarchar('abcdef', 4)).toBe('abc…');
    expect(factory.safeVarchar('abcdef', 0)).toBe('');
  });
});
