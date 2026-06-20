import { CardActionSummary } from './tool-card-actions';
import {
  normalizeGenericCardView,
  type SchemaDrivenAssistantCard,
} from './tool-ui-schema';

export function GenericResultCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const view = normalizeGenericCardView(card);
  return (
    <article
      className="rounded-2xl bg-white p-3 ring-1 ring-black/5"
      data-product-component="GenericCard"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium leading-5 text-[#27272a]">{view.title}</p>
        {view.statusLabel ? (
          <span className="rounded-full bg-[#f7f7f8] px-2 py-0.5 text-[11px] font-medium text-[#52525b] ring-1 ring-black/5">
            {view.statusLabel}
          </span>
        ) : null}
      </div>
      {view.body ? <p className="mt-1 leading-6 text-[#52525b]">{view.body}</p> : null}
      {view.details.length > 0 ? (
        <ul className="mt-2 space-y-1 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#71717a] ring-1 ring-black/5">
          {view.details.map((detail) => (
            <li key={detail}>• {detail}</li>
          ))}
        </ul>
      ) : null}
      <CardActionSummary card={card} actions={card.actions} />
    </article>
  );
}
