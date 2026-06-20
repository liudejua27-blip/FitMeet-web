import {
  CheckCircle2,
  History,
  ShieldCheck,
} from 'lucide-react';

import { CardActionSummary } from './tool-card-actions';
import {
  MetaChip,
  ProductCardDetails,
  ReasonList,
} from './tool-card-shared';
import { ApprovalGuardrailList } from './tool-approval-card';
import {
  normalizeSafetyApprovalView,
  type SchemaDrivenAssistantCard,
} from './tool-ui-schema';

export function SafetyResultCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const approval = normalizeSafetyApprovalView(card);
  return (
    <article
      className="rounded-2xl bg-white p-3 ring-1 ring-black/5"
      data-testid="assistant-ui-approval-tool"
      data-card-model="assistant-ui-approval-card"
      data-product-component="ApprovalPanel"
      data-risk-level={approval.riskLevel ?? 'unknown'}
      data-has-checkpoint={String(Boolean(approval.checkpointLabel))}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f7f7f8] text-[#3f3f46]">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-5 text-[#27272a]">{approval.title}</p>
          <p className="mt-1 leading-6 text-[#52525b]">{approval.boundary}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {approval.riskLevel ? (
              <MetaChip
                icon={<ShieldCheck className="h-3 w-3" />}
                label={`风险等级：${approval.riskLevel}`}
              />
            ) : null}
            <MetaChip
              icon={<CheckCircle2 className="h-3 w-3" />}
              label={approval.confirmationLabel}
            />
            <MetaChip icon={<History className="h-3 w-3" />} label={approval.checkpointLabel} />
          </div>
          <ApprovalGuardrailList
            confirmationLabel={approval.confirmationLabel}
            checkpointLabel={approval.checkpointLabel}
            riskLevel={approval.riskLevel}
          />
          <ProductCardDetails title="查看确认依据">
            <ReasonList title="为什么需要确认" reasons={approval.reasons} />
            {approval.auditNote ? (
              <p className="rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5">
                确认记录：{approval.auditNote}
              </p>
            ) : null}
          </ProductCardDetails>
          <CardActionSummary card={card} actions={card.actions} />
        </div>
      </div>
    </article>
  );
}
