import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import {
  FitMeetAgentToolCategory,
  FitMeetAgentToolRegistryFilter,
  FitMeetAgentToolRegistryService,
} from './fitmeet-agent-tool-registry.service';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import { AgentTokenGuard } from './guards/agent-token.guard';

function registryFilter(input: {
  category?: string;
  permissionMode?: string;
  plannerOnly?: string;
}): FitMeetAgentToolRegistryFilter {
  const filter: FitMeetAgentToolRegistryFilter = {};
  if (
    input.category &&
    (Object.values(FitMeetAgentToolCategory) as string[]).includes(
      input.category,
    )
  ) {
    filter.category = input.category as FitMeetAgentToolCategory;
  }
  if (
    input.permissionMode &&
    (Object.values(AgentTaskPermissionMode) as string[]).includes(
      input.permissionMode,
    )
  ) {
    filter.permissionMode = input.permissionMode as AgentTaskPermissionMode;
  }
  if (input.plannerOnly === 'true') {
    filter.runtimeStatus = 'implemented';
    filter.plannerEnabled = true;
  }
  return filter;
}

@Controller('social-agent/tools')
@UseGuards(AuthGuard('jwt'))
export class FitMeetAgentToolRegistryUserController {
  constructor(private readonly registry: FitMeetAgentToolRegistryService) {}

  @Get('registry')
  getRegistry(
    @Query('category') category?: string,
    @Query('permissionMode') permissionMode?: string,
    @Query('plannerOnly') plannerOnly?: string,
  ) {
    return this.registry.getManifest(
      registryFilter({ category, permissionMode, plannerOnly }),
    );
  }
}

@Controller('agent/tools')
@UseGuards(AgentTokenGuard)
export class FitMeetAgentToolRegistryAgentController {
  constructor(private readonly registry: FitMeetAgentToolRegistryService) {}

  @Get('registry')
  getRegistry(
    @Query('category') category?: string,
    @Query('permissionMode') permissionMode?: string,
    @Query('plannerOnly') plannerOnly?: string,
  ) {
    return this.registry.getManifest(
      registryFilter({ category, permissionMode, plannerOnly }),
    );
  }
}
