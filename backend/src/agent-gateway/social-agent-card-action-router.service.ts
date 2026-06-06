import { BadRequestException, Injectable } from '@nestjs/common';

import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { messageForSocialAgentSchemaAction } from './social-agent-card-action.presenter';
import type {
  SocialAgentCardActionBody,
  SocialAgentIntentRouteResult,
  SocialAgentRouteMessageBody,
} from './social-agent-chat.types';
import { SocialAgentMeetLoopService } from './social-agent-meet-loop.service';

type HandleMessage = (
  body: SocialAgentRouteMessageBody,
) => Promise<SocialAgentIntentRouteResult>;

@Injectable()
export class SocialAgentCardActionRouterService {
  constructor(
    private readonly candidateActions: SocialAgentCandidateActionService,
    private readonly meetLoop: SocialAgentMeetLoopService,
  ) {}

  async perform(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentCardActionBody;
    handleMessage: HandleMessage;
  }): Promise<SocialAgentIntentRouteResult> {
    const { ownerUserId, taskId, body, handleMessage } = input;
    const action = body.action;
    if (!action) throw new BadRequestException('Missing agent action');

    if (action === 'opener.confirm_send') {
      return handleMessage({
        taskId,
        message: '确认发送',
        hasCandidates: true,
      });
    }

    if (
      action === 'candidate.more_like_this' ||
      action === 'candidate.skip' ||
      action === 'candidate.like'
    ) {
      return handleMessage({
        taskId,
        message:
          action === 'candidate.skip'
            ? '不喜欢这个推荐，换一个低压力的人'
            : action === 'candidate.like'
              ? '我喜欢这个推荐，继续下一步'
              : '看看更多类似的人',
        hasCandidates: true,
      });
    }

    if (action === 'candidate.generate_opener') {
      return this.candidateActions.createOpenerDraftFromCardAction(
        ownerUserId,
        taskId,
        body,
      );
    }

    if (this.isActivityAction(action)) {
      return this.meetLoop.performActivityAction(ownerUserId, taskId, body);
    }

    return handleMessage({
      taskId,
      message: messageForSocialAgentSchemaAction(action),
      hasCandidates: true,
    });
  }

  private isActivityAction(action: string) {
    return (
      action === 'activity.confirm_create' ||
      action === 'activity.check_in' ||
      action === 'activity.complete' ||
      action === 'review.submit'
    );
  }
}
