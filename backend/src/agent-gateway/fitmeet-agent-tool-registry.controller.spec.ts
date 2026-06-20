import {
  FitMeetAgentToolCategory,
  type FitMeetAgentToolRegistryManifest,
  FitMeetAgentToolRegistryService,
} from './fitmeet-agent-tool-registry.service';
import {
  FitMeetAgentToolRegistryAgentController,
  FitMeetAgentToolRegistryUserController,
} from './fitmeet-agent-tool-registry.controller';

function manifestWithAdminDebug(): FitMeetAgentToolRegistryManifest {
  return {
    name: 'FitMeet Agent Tool Registry',
    version: '1.0.0',
    description: 'test registry',
    categories: [
      {
        id: FitMeetAgentToolCategory.Candidate,
        label: 'Candidate Tools',
        description: 'candidate tools',
      },
      {
        id: FitMeetAgentToolCategory.AdminDebug,
        label: 'Admin/Debug Tools',
        description: 'debug tools',
      },
    ],
    tools: [
      {
        name: 'search_real_candidates',
        category: FitMeetAgentToolCategory.Candidate,
      },
      {
        name: 'get_candidate_pool_debug',
        category: FitMeetAgentToolCategory.AdminDebug,
      },
    ],
    modelTools: [
      {
        name: 'search_real_candidates',
        category: FitMeetAgentToolCategory.Candidate,
      },
      {
        name: 'get_candidate_pool_debug',
        category: FitMeetAgentToolCategory.AdminDebug,
      },
    ],
    safetyRules: [],
  } as unknown as FitMeetAgentToolRegistryManifest;
}

function mockRegistry() {
  return {
    getManifest: jest.fn().mockReturnValue(manifestWithAdminDebug()),
  } as unknown as FitMeetAgentToolRegistryService;
}

describe('FitMeetAgentToolRegistry controllers', () => {
  it('hides admin debug tools from the user-facing registry manifest', () => {
    const registry = mockRegistry();
    const controller = new FitMeetAgentToolRegistryUserController(registry);

    const manifest = controller.getRegistry(
      FitMeetAgentToolCategory.AdminDebug,
    );

    expect(manifest.categories.map((item) => item.id)).not.toContain(
      FitMeetAgentToolCategory.AdminDebug,
    );
    expect(manifest.tools.map((tool) => tool.name)).not.toContain(
      'get_candidate_pool_debug',
    );
    expect(manifest.modelTools.map((tool) => tool.name)).not.toContain(
      'get_candidate_pool_debug',
    );
  });

  it('hides admin debug tools from the agent-token registry manifest', () => {
    const registry = mockRegistry();
    const controller = new FitMeetAgentToolRegistryAgentController(registry);

    const manifest = controller.getRegistry(
      FitMeetAgentToolCategory.AdminDebug,
    );

    expect(manifest.categories.map((item) => item.id)).not.toContain(
      FitMeetAgentToolCategory.AdminDebug,
    );
    expect(manifest.tools.map((tool) => tool.name)).not.toContain(
      'get_candidate_pool_debug',
    );
    expect(manifest.modelTools.map((tool) => tool.name)).not.toContain(
      'get_candidate_pool_debug',
    );
  });
});
