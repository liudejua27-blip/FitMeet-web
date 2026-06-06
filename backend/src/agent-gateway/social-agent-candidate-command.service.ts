import { Injectable } from '@nestjs/common';

import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentDraftPublicationService } from './social-agent-draft-publication.service';
import { SocialAgentToolCallRecord } from './social-agent-tool-executor.service';
import type { CandidateTargetBody } from './social-agent-chat.types';

@Injectable()
export class SocialAgentCandidateCommandService {
  constructor(
    private readonly candidateActions: SocialAgentCandidateActionService,
    private readonly draftPublication: SocialAgentDraftPublicationService,
  ) {}

  publishDraft(
    ownerUserId: number,
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ) {
    return this.draftPublication.publishDraft(ownerUserId, taskId, draft);
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
    return this.candidateActions.saveCandidate(ownerUserId, taskId, body);
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
    return this.candidateActions.sendCandidateMessage(
      ownerUserId,
      taskId,
      body,
    );
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
    return this.candidateActions.connectCandidate(ownerUserId, taskId, body);
  }
}
