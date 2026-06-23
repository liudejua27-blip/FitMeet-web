import { ShieldCheck } from 'lucide-react';

import type { VisibleCardAction } from './tool-card-actions';
import {
  defaultOpportunityActionsForSchema,
  type ToolUISchemaAction,
  type ToolUISchemaType,
} from './tool-ui-schema';

export function OpportunityActionPath({
  actions,
  schemaType,
}: {
  actions: VisibleCardAction[];
  schemaType: ToolUISchemaType;
}) {
  const steps = actionPathSteps(actions, schemaType);
  if (steps.length === 0) return null;

  return (
    <div
      className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5"
      data-testid="assistant-ui-opportunity-path"
      data-schema-type={schemaType}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        安全推进路径
      </p>
      <ol className="mt-2 grid gap-1.5 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={`${step.schemaAction}-${step.label}`}
            className="flex min-w-0 items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-xs leading-5 text-[#52525b] ring-1 ring-black/[0.04]"
            data-schema-action={step.schemaAction}
            data-requires-confirmation={String(step.requiresConfirmation)}
            data-action-source={step.source}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#18181b] text-[10px] font-medium text-white">
              {index + 1}
            </span>
            <span className="min-w-0 truncate">{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function actionPathSteps(actions: VisibleCardAction[], schemaType: ToolUISchemaType) {
  const bySchemaAction = new Map<ToolUISchemaAction, VisibleCardAction>();
  actions.forEach((action) => {
    if (action.schemaAction && !bySchemaAction.has(action.schemaAction)) {
      bySchemaAction.set(action.schemaAction, action);
    }
  });
  const order: ToolUISchemaAction[] =
    schemaType === 'social_match.activity'
      ? [
          'publish_to_discover',
          'activity.confirm_create',
          'activity.modify_time',
          'activity.skip_publish',
          'activity.view_detail',
          'activity.modify_location',
          'activity.check_in',
          'activity.complete',
          'review.submit',
        ]
      : [
          'candidate.view_detail',
          'candidate.like',
          'candidate.generate_opener',
          'opener.confirm_send',
          'candidate.connect',
        ];

  const defaultSteps = new Map(
    defaultOpportunityActionsForSchema(schemaType).map((step) => [step.schemaAction, step]),
  );
  return order
    .map((schemaAction) => {
      const action = bySchemaAction.get(schemaAction);
      const defaultStep = defaultSteps.get(schemaAction);
      if (!action && !defaultStep) return null;
      const requiresConfirmation =
        action?.requiresConfirmation ?? defaultStep?.requiresConfirmation ?? false;
      return {
        schemaAction,
        requiresConfirmation,
        source: action?.source ?? defaultStep?.source ?? 'default',
        label: actionPathLabel(schemaAction),
      };
    })
    .filter(Boolean) as Array<{
    schemaAction: ToolUISchemaAction;
    requiresConfirmation: boolean;
    source: VisibleCardAction['source'];
    label: string;
  }>;
}

function actionPathLabel(schemaAction: ToolUISchemaAction) {
  if (schemaAction === 'candidate.view_detail') return '先看详情';
  if (schemaAction === 'candidate.like') return '收藏';
  if (schemaAction === 'candidate.generate_opener') return '生成开场白';
  if (schemaAction === 'opener.confirm_send') return '发送邀请';
  if (schemaAction === 'candidate.connect') {
    return '加好友并聊天';
  }
  if (schemaAction === 'activity.view_detail') return '查看活动';
  if (schemaAction === 'activity.modify_time') return '修改';
  if (schemaAction === 'activity.modify_location') return '调整地点';
  if (schemaAction === 'activity.skip_publish') return '暂不发布';
  if (schemaAction === 'publish_to_discover') return '发布卡片';
  if (schemaAction === 'activity.confirm_create') return '创建约练';
  if (schemaAction === 'activity.check_in') return '到达签到';
  if (schemaAction === 'activity.complete') return '记录完成';
  if (schemaAction === 'review.submit') return '提交评价';
  return '继续处理';
}
