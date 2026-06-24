import { HeartHandshake } from 'lucide-react';

import { cn } from '../../lib/utils';
import { CardActionSummary } from './tool-card-actions';
import { ProductCardDetails } from './tool-card-shared';
import {
  normalizeMeetLoopTimelineView,
  type SchemaDrivenAssistantCard,
} from './tool-ui-schema';

export function MeetLoopResultCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const timeline = normalizeMeetLoopTimelineView(card);
  const currentSteps = timeline.steps.filter((step) => step.state === 'current').length;
  const isReplyReceived =
    timeline.stage === 'reply_received' || timeline.connectionState === 'reply_received';
  const isWaitingReply =
    !isReplyReceived &&
    (timeline.stage === 'message_sent' ||
      timeline.stage === 'invite_sent' ||
      timeline.connectionState === 'waiting_reply' ||
      timeline.waitingFor === 'counterpart_reply');

  return (
    <article
      className="rounded-2xl bg-white p-3 ring-1 ring-black/5"
      data-testid="assistant-ui-meet-loop-card"
      data-card-model="assistant-ui-meet-loop-timeline"
      data-product-component="MeetLoopTimeline"
      data-connection-state={timeline.connectionState ?? 'unknown'}
      data-step-count={String(timeline.steps.length)}
      data-current-step-count={String(currentSteps)}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f7f7f8] text-[#3f3f46]">
          <HeartHandshake className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-5 text-[#27272a]">{timeline.title}</p>
          <p className="mt-1 leading-6 text-[#52525b]">{timeline.description}</p>
          {isReplyReceived ? (
            <div
              className="mt-3 rounded-xl bg-emerald-50/70 px-3 py-2 text-xs leading-5 text-emerald-800 ring-1 ring-emerald-100"
              data-testid="meet-loop-reply-received-note"
              data-counterpart-intent={timeline.counterpartIntent ?? 'unknown'}
            >
              <p className="font-medium">
                {timeline.replyIntentLabel ?? meetLoopCounterpartIntentLabel(timeline.counterpartIntent)}
              </p>
              {timeline.replyIntentDescription ? (
                <p className="mt-1 text-emerald-700">{timeline.replyIntentDescription}</p>
              ) : null}
              {timeline.replyPreview ? (
                <p className="mt-1 text-emerald-700">脱敏摘要：{timeline.replyPreview}</p>
              ) : null}
              <p className="mt-1 text-emerald-700">
                {timeline.nextSafeStep ??
                  '发起约练、继续邀请或创建活动前，我仍会先让你确认。'}
              </p>
            </div>
          ) : null}
          {isWaitingReply ? (
            <div
              className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5"
              data-testid="meet-loop-waiting-reply-note"
              data-waiting-for={timeline.waitingFor ?? 'counterpart_reply'}
              data-side-effect-policy={timeline.sideEffectPolicy ?? 'none'}
            >
              <p className="font-medium text-[#3f3f46]">邀请已发出，正在等待对方回复。</p>
              {timeline.replyPreview ? (
                <p className="mt-1 text-[#71717a]">已发送：{timeline.replyPreview}</p>
              ) : null}
              <p className="mt-1 text-[#71717a]">
                我不会自动追发消息；继续聊天、改期或发起约练前都会再次确认。
              </p>
            </div>
          ) : null}
          <MeetLoopStageOverview timeline={timeline} />
          <ProductCardDetails title="查看完整约练时间线">
            {timeline.nextRecoverableActions.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {timeline.nextRecoverableActions.map((action) => (
                  <span
                    key={action}
                    className="rounded-full bg-white px-2 py-0.5 text-[11px] leading-5 text-[#52525b] ring-1 ring-black/[0.06]"
                  >
                    {meetLoopRecoverableActionLabel(action)}
                  </span>
                ))}
              </div>
            ) : null}
            {timeline.recoveryProtocol.length > 0 ? (
              <dl
                className="mb-2 grid gap-1.5 rounded-lg bg-white px-2.5 py-2 ring-1 ring-black/[0.04] sm:grid-cols-2"
                data-testid="meet-loop-recovery-protocol"
                aria-label="恢复协议"
              >
                {timeline.recoveryProtocol.map((item) => (
                  <div key={item.key}>
                    <dt className="font-medium text-[#3f3f46]">{item.label}</dt>
                    <dd className="text-[#71717a]">{item.detail}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <ol className="space-y-0.5" data-testid="meet-loop-timeline">
              {timeline.steps.map((step) => (
                <li
                  key={`${step.key}-${step.label}`}
                  className="grid grid-cols-[1.25rem_1fr] gap-2 text-xs"
                  data-meet-loop-step={step.key}
                  data-meet-loop-state={step.state}
                  data-checkpoint-ready={String(step.checkpointReady)}
                  data-resume-mode={step.resumeMode ?? 'none'}
                >
                  <span className="relative flex justify-center">
                    <span
                      className={cn(
                        'mt-1 h-2.5 w-2.5 rounded-full ring-4',
                        step.state === 'done' && 'bg-emerald-500 ring-emerald-50',
                        step.state === 'current' && 'bg-[#18181b] ring-black/10',
                        step.state === 'next' && 'bg-[#d4d4d8] ring-[#f7f7f8]',
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      'rounded-xl px-2.5 py-2 ring-1',
                      step.state === 'done' && 'bg-emerald-50/60 text-emerald-800 ring-emerald-100',
                      step.state === 'current' && 'bg-[#18181b] text-white ring-[#18181b]',
                      step.state === 'next' && 'bg-[#f7f7f8] text-[#71717a] ring-black/5',
                    )}
                  >
                    <span className="font-medium">{step.label}</span>
                    <span className="mt-0.5 block leading-5 opacity-80">{step.description}</span>
                    {step.actionLabel || step.checkpointReady || step.resumeMode ? (
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {step.actionLabel ? (
                          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-current ring-1 ring-current/10">
                            {step.actionLabel}
                          </span>
                        ) : null}
                        {step.checkpointReady ? (
                          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-current ring-1 ring-current/10">
                            可以继续
                          </span>
                        ) : null}
                        {step.resumeMode ? (
                          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-current ring-1 ring-current/10">
                            {meetLoopResumeModeLabel(step.resumeMode)}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </ProductCardDetails>
          <p className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5">
            下一步：{timeline.nextAction}
          </p>
          <CardActionSummary card={card} actions={card.actions} />
        </div>
      </div>
    </article>
  );
}

function MeetLoopStageOverview({
  timeline,
}: {
  timeline: ReturnType<typeof normalizeMeetLoopTimelineView>;
}) {
  const currentIndex = meetLoopOverviewCurrentIndex(timeline);
  const stages = [
    '发起',
    '等待回复',
    '改期',
    '确认',
    '见面',
    '评价',
    '更新资料',
  ];
  return (
    <div
      className="mt-3 rounded-xl bg-[#fafafa] px-3 py-2 ring-1 ring-black/[0.04]"
      data-testid="meet-loop-stage-overview"
      data-current-stage-index={String(currentIndex)}
      aria-label="约练阶段总览"
    >
      <p className="text-xs font-medium leading-5 text-[#3f3f46]">约练阶段</p>
      <ol className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {stages.map((stage, index) => {
          const state =
            index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'next';
          return (
            <li
              key={stage}
              className={cn(
                'rounded-lg px-2 py-1.5 text-[11px] leading-4 ring-1',
                state === 'done' && 'bg-emerald-50 text-emerald-700 ring-emerald-100',
                state === 'current' && 'bg-[#18181b] text-white ring-[#18181b]',
                state === 'next' && 'bg-white text-[#71717a] ring-black/[0.05]',
              )}
              data-meet-loop-overview-stage={stage}
              data-meet-loop-overview-state={state}
            >
              <span className="font-medium">{stage}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function meetLoopOverviewCurrentIndex(
  timeline: ReturnType<typeof normalizeMeetLoopTimelineView>,
) {
  const text = [
    timeline.stage,
    timeline.connectionState,
    timeline.waitingFor,
    ...timeline.steps.flatMap((step) => [
      step.key,
      step.label,
      step.description,
      step.state === 'current' ? step.key : null,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/write|memory|life graph|画像|回写/.test(text)) return 6;
  if (/review|评价|完成|complete/.test(text)) return 5;
  if (/meet|check.?in|arrived|见面|签到|到达/.test(text)) return 4;
  if (/confirm|confirmed|确认/.test(text)) return 3;
  if (/reschedule|modify|改期|调整/.test(text)) return 2;
  if (/wait|waiting|reply|sent|invite|回复|等待|已发送|邀请/.test(text)) return 1;
  return 0;
}

function meetLoopResumeModeLabel(mode: 'resume' | 'reschedule' | 'review' | 'memory') {
  if (mode === 'reschedule') return '改期';
  if (mode === 'review') return '评价';
  if (mode === 'memory') return '回写';
  return '继续';
}

function meetLoopRecoverableActionLabel(action: string) {
  if (action === 'meet_loop.resume') return '可继续';
  if (action === 'meet_loop.reschedule') return '可改期';
  if (action === 'activity.modify_time') return '可修改卡片';
  if (action === 'activity.modify_location') return '可修改卡片';
  if (action === 'candidate.connect') return '确认后连接';
  return '可以继续';
}

function meetLoopCounterpartIntentLabel(intent: string | null) {
  if (intent === 'accepted') return '对方愿意继续。';
  if (intent === 'reschedule_requested') return '对方想调整时间。';
  if (intent === 'ask_question') return '对方在追问细节。';
  if (intent === 'declined') return '对方暂不继续。';
  return '对方已回复，可以继续站内聊。';
}
