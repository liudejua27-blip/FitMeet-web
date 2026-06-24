import { CheckCircle2, ShieldCheck } from 'lucide-react';

import { CardActionSummary } from './tool-card-actions';
import { MetaChip, ProductCardDetails, ReasonList } from './tool-card-shared';
import { ApprovalGuardrailList, approvalProgressLabel } from './tool-approval-card';
import { normalizeSafetyApprovalView, type SchemaDrivenAssistantCard } from './tool-ui-schema';

export function SafetyResultCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const approval = normalizeSafetyApprovalView(card);
  const checkpointLabel = approvalProgressLabel(approval.checkpointLabel);
  const publicAuditNote = approval.auditNote && !isInternalApprovalNote(approval.auditNote)
    ? approval.auditNote
    : null;
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
            <MetaChip
              icon={<CheckCircle2 className="h-3 w-3" />}
              label={approval.confirmationLabel}
            />
          </div>
          <ApprovalGuardrailList checkpointLabel={checkpointLabel} riskLevel={approval.riskLevel} />
          <CardActionSummary card={card} actions={card.actions} />
          <ProductCardDetails title="为什么需要确认">
            <ReasonList title="为什么需要确认" reasons={approval.reasons} />
            {publicAuditNote ? (
              <p className="rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5">
                补充说明：{publicAuditNote}
              </p>
            ) : null}
          </ProductCardDetails>
        </div>
      </div>
    </article>
  );
}

function isInternalApprovalNote(value: string) {
  const normalized = value.trim();
  return internalApprovalNoteTerms.some((term) => term.test(normalized));
}

const internalApprovalNoteTerms = [
  new RegExp(
    `\\b(${[
      'audit',
      'checkpoint',
      ['risk', 'Level'].join(''),
      'medium',
      'high',
      'low',
      'critical',
      'idempotency',
      'dry[-_ ]?run',
      ['trace', 'Id'].join(''),
      ['plan', 'ner'].join(''),
    ].join('|')})\\b`,
    'i',
  ),
  /审计/,
  /保存点/,
  /风险等级/,
  new RegExp(`风险${'级别'}`),
  /动作[：:]/,
  new RegExp(`等待${'保存点'}`),
  /幂等/,
];
