import { ShieldCheck } from 'lucide-react';

import type { VisibleCardAction } from './tool-card-actions';
import type {
  normalizeCandidateOpportunityView,
  ToolUISchemaType,
} from './tool-ui-schema';

export function OpportunityGuardrailStrip({
  schemaType,
  actions,
  items,
}: {
  schemaType: ToolUISchemaType;
  actions: VisibleCardAction[];
  items: Array<{ id: string; label: string; value: string }>;
}) {
  const requiresConfirmation = actions.some((action) => action.requiresConfirmation);
  const visibleItems = items.filter((item) => item.value.trim().length > 0).slice(0, 4);
  if (visibleItems.length === 0) return null;

  return (
    <div
      className="mt-3 grid gap-1.5 rounded-xl bg-[#fbfbfc] px-3 py-2 ring-1 ring-black/5 sm:grid-cols-4"
      data-testid="assistant-ui-opportunity-guardrails"
      data-schema-type={schemaType}
      data-confirmation-required={requiresConfirmation ? 'true' : 'false'}
      aria-label="机会安全摘要"
    >
      {visibleItems.map((item) => (
        <div key={item.id} className="min-w-0 text-xs leading-5" data-guardrail={item.id}>
          <span className="flex items-center gap-1 text-[11px] font-medium text-[#8a8f98]">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {item.label}
          </span>
          <span className="mt-0.5 block text-[#3f3f46]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function candidateSourceGuardrail(
  opportunity: ReturnType<typeof normalizeCandidateOpportunityView>,
) {
  const explicit = opportunity.discoverySafetySignals.find(
    (signal) =>
      signal.includes('公开') || signal.includes('可发现') || signal.includes('Agent 匹配'),
  );
  return explicit ?? '只基于公开可发现或已允许 Agent 匹配的信息';
}

export function candidatePrivacyGuardrail(
  opportunity: ReturnType<typeof normalizeCandidateOpportunityView>,
) {
  const explicit = opportunity.discoverySafetySignals.find(
    (signal) =>
      signal.includes('脱敏') ||
      signal.includes('精确位置') ||
      signal.includes('联系方式') ||
      signal.includes('模糊'),
  );
  return explicit ?? '资料已脱敏，不展示精确位置或私密联系方式';
}
