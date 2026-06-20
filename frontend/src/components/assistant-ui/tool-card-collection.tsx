import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  extractCanonicalAssistantCards,
  summarizeToolUICardCollection,
  type SchemaDrivenAssistantCard,
} from './tool-ui-schema';
import type { ProcessSummary, ProcessStatus } from './tool-process-model';

export type ToolUICardRenderer = (props: { card: SchemaDrivenAssistantCard }) => ReactNode;

export function ToolUICardCollectionBlock({
  data,
  cards: providedCards,
  summary,
  renderCard,
}: {
  data: unknown;
  cards?: SchemaDrivenAssistantCard[];
  summary: ProcessSummary;
  renderCard: ToolUICardRenderer;
}) {
  const cards = providedCards ?? extractCanonicalAssistantCards(data);
  if (cards.length === 0) return null;

  const collection = summarizeToolUICardCollection(cards);

  return (
    <section
      className="my-3 space-y-2 rounded-2xl border border-black/10 bg-[#f7f7f8] px-3 py-3 text-sm text-[#52525b] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
      data-testid="assistant-ui-generative-cards"
      aria-label="整理结果"
      data-schema-version="fitmeet.tool-ui.v1"
      data-product-components={collection.components.join(',')}
      data-candidate-count={collection.candidateCount}
      data-empty-count={collection.emptyCount}
      data-opportunity-count={collection.opportunityCount}
      data-approval-count={collection.approvalCount}
      data-life-graph-diff-count={collection.lifeGraphDiffCount}
      data-meet-loop-count={collection.meetLoopCount}
    >
      <div className="flex items-center gap-2 px-1">
        <CollectionStatusBadge status={summary.status}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        </CollectionStatusBadge>
        <div className="min-w-0">
          <p className="font-medium leading-5 text-[#27272a]">{collection.title}</p>
          <p className="text-xs leading-5 text-[#71717a]">{collection.detail}</p>
        </div>
      </div>
      <div className="space-y-2">
        {cards.map((card) => (
          <div
            key={card.id}
            data-testid="assistant-ui-schema-card"
            data-schema-type={card.schemaType}
            data-schema-version={card.schemaVersion}
          >
            <div data-renderer={card.schemaType}>
              {renderCard({ card })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CollectionStatusBadge({
  status,
  children,
}: {
  status: ProcessStatus;
  children: ReactNode;
}) {
  const tone =
    status === 'error'
      ? 'bg-[#fef2f2] text-[#dc2626] ring-[#fecaca]'
      : status === 'waiting'
        ? 'bg-[#fffbeb] text-[#b45309] ring-[#fde68a]'
        : status === 'running'
          ? 'bg-[#eff6ff] text-[#2563eb] ring-[#bfdbfe]'
          : 'bg-[#ecfdf5] text-[#059669] ring-[#bbf7d0]';

  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${tone}`}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}
