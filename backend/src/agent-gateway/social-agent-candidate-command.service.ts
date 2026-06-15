import { Injectable, Optional } from '@nestjs/common';

import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { AgentLoopService } from './agent-loop.service';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentDraftPublicationService } from './social-agent-draft-publication.service';
import { SocialAgentToolCallRecord } from './social-agent-tool-executor.service';
import type { CandidateTargetBody } from './social-agent-action.types';
import { confirmedActionLoopToolForSocialExecution } from './social-agent-execution-pipeline.contract';

@Injectable()
export class SocialAgentCandidateCommandService {
  constructor(
    private readonly candidateActions: SocialAgentCandidateActionService,
    private readonly draftPublication: SocialAgentDraftPublicationService,
    @Optional()
    private readonly agentLoop?: AgentLoopService,
  ) {}

  async publishDraft(
    ownerUserId: number,
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ) {
    return this.executeCandidateCommand({
      ownerUserId,
      taskId,
      command: 'publish_draft',
      input: {
        socialRequestId: draft.socialRequestId ?? null,
        visibility: draft.visibility,
        status: draft.status,
      },
      run: () => this.draftPublication.publishDraft(ownerUserId, taskId, draft),
    });
  }

  saveCandidate(
    ownerUserId: number,
    taskId: number,
    body: CandidateTargetBody & {
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      targetUserId?: number | null;
      candidateUserId?: number | null;
      candidate?: Record<string, unknown>;
    },
  ): Promise<SocialAgentToolCallRecord> {
    return this.executeCandidateCommand({
      ownerUserId,
      taskId,
      command: 'save_candidate',
      input: this.commandInput(body),
      run: () => this.candidateActions.saveCandidate(ownerUserId, taskId, body),
    });
  }

  sendCandidateMessage(
    ownerUserId: number,
    taskId: number,
    body: CandidateTargetBody & {
      targetUserId?: number;
      candidateUserId?: number;
      message?: string;
      suggestedOpener?: string;
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      candidate?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    return this.executeCandidateCommand({
      ownerUserId,
      taskId,
      command: 'send_candidate_message',
      input: this.commandInput(body),
      run: () =>
        this.candidateActions.sendCandidateMessage(ownerUserId, taskId, body),
    });
  }

  connectCandidate(
    ownerUserId: number,
    taskId: number,
    body: CandidateTargetBody & {
      targetUserId?: number | null;
      candidateUserId?: number | null;
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      candidate?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    return this.executeCandidateCommand({
      ownerUserId,
      taskId,
      command: 'connect_candidate',
      input: this.commandInput(body),
      run: () =>
        this.candidateActions.connectCandidate(ownerUserId, taskId, body),
    });
  }

  private async executeCandidateCommand<T>(input: {
    ownerUserId: number;
    taskId: number;
    command: string;
    input: Record<string, unknown>;
    run: () => Promise<T>;
  }): Promise<T> {
    let didRun = false;
    let result: T | undefined;
    const loopService = this.agentLoop ?? new AgentLoopService();
    const tool = confirmedActionLoopToolForSocialExecution({
      command: input.command,
      ownerUserId: input.ownerUserId,
      taskId: input.taskId,
      payload: input.input,
    });
    await loopService.execute({
      taskId: input.taskId,
      goal: `candidate_command:${input.command}`,
      agent: 'FitMeet Main Agent',
      plan: {
        reason: 'Candidate command endpoints execute only through AgentLoop.',
        tools: [tool],
      },
      maxToolCalls: 1,
      maxRetries: 0,
      runner: async () => {
        result = await input.run();
        didRun = true;
        return {
          handled: true,
          command: input.command,
          result: this.commandObservation(result),
        };
      },
    });
    if (!didRun) {
      throw new Error(
        `Candidate command AgentLoop completed without result: ${input.command}`,
      );
    }
    return result as T;
  }

  private commandInput(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      targetUserId: value.targetUserId ?? value.candidateUserId ?? null,
      candidateRecordId: value.candidateRecordId ?? null,
      socialRequestId: value.socialRequestId ?? null,
      hasMessage: typeof value.message === 'string' && value.message.length > 0,
      hasCandidate:
        typeof value.candidate === 'object' && value.candidate !== null,
    };
  }

  private commandObservation(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') return { success: Boolean(value) };
    const record = value as Record<string, unknown>;
    return {
      success: record.success ?? true,
      status: record.status ?? null,
      id: record.id ?? record.messageId ?? record.friendRequestId ?? null,
    };
  }
}
