import { Injectable } from '@nestjs/common';

import { TonePolicyService } from './response-quality/tone-policy.service';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatRunBody,
  SocialAgentChatRunResult,
  StreamEmit,
} from './social-agent-chat.types';
import { SocialAgentQueuedRunService } from './social-agent-queued-run.service';
import { SocialAgentRunOrchestratorService } from './social-agent-run-orchestrator.service';

@Injectable()
export class SocialAgentChatRunFacadeService {
  constructor(
    private readonly queuedRuns: SocialAgentQueuedRunService,
    private readonly runOrchestrator: SocialAgentRunOrchestratorService,
    private readonly tonePolicy?: TonePolicyService,
  ) {}

  run(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
  ): Promise<SocialAgentChatRunResult> {
    return this.runOrchestrator.run(ownerUserId, body);
  }

  runStream(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
    emit: StreamEmit,
  ): Promise<SocialAgentChatRunResult> {
    return this.runOrchestrator.run(ownerUserId, body, emit);
  }

  runQueued(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
  ): Promise<SocialAgentAsyncRunSnapshot> {
    return this.queuedRuns.runQueued({
      ownerUserId,
      body,
      executeRun: (runBody, emit) =>
        this.runOrchestrator.run(ownerUserId, runBody, emit),
      visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
    });
  }

  private userVisibleStepLabel(id: string, label: string): string {
    return this.tonePolicy?.userStatus(id, label) ?? label;
  }
}
