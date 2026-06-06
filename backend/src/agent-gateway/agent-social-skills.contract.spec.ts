import {
  buildAgentSocialToolList,
  buildSocialSkillsManifest,
  buildSocialSkillsOpenApi,
} from './agent-social-skills.contract';
import {
  AgentPermissionLevel,
  ConnectionStatus,
} from './entities/agent-connection.entity';

describe('agent social skills contract', () => {
  it('builds the public OpenAPI document with core agent paths', () => {
    const doc = buildSocialSkillsOpenApi();

    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toBe('FitMeet Social Skills API');
    expect(doc.paths['/agent/skills/manifest']).toBeDefined();
    expect(doc.paths['/agent/messages/send']).toBeDefined();
    expect(doc.paths['/agent/a2a/search']).toBeDefined();
    expect(doc.components.securitySchemes.agentToken.scheme).toBe('bearer');
  });

  it('builds a manifest bound to the current agent connection', () => {
    const manifest = buildSocialSkillsManifest({
      id: 7,
      agentName: 'openclaw',
      agentDisplayName: 'OpenClaw',
      permissionLevel: AgentPermissionLevel.Open,
      status: ConnectionStatus.Active,
      dailyActionLimit: 100,
      dailyActionsUsed: 3,
    } as never);

    expect(manifest.agent.connectionId).toBe(7);
    expect(manifest.agent.name).toBe('openclaw');
    expect(manifest.openapi.publicPath).toBe(
      '/api/public/social-skills/openapi.json',
    );
    expect(manifest.tools.length).toBeGreaterThanOrEqual(17);
    expect(manifest.tools.map((tool) => tool.name)).toContain(
      'fitmeet_send_invite',
    );
    expect(manifest.skills.map((skill) => skill.name)).toContain(
      'send_private_message',
    );
  });

  it('keeps tool auth scoped to the agent token header', () => {
    const tools = buildAgentSocialToolList(
      'Authorization: Bearer <agent_token>',
    );

    expect(
      tools.every(
        (tool) => tool.auth === 'Authorization: Bearer <agent_token>',
      ),
    ).toBe(true);
    expect(tools.map((tool) => tool.name)).toContain(
      'fitmeet_get_agent_inbox_events',
    );
  });
});
