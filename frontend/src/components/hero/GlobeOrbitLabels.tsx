import { externalAgentLabels, identityLabels } from '@/data/heroCopy';

export function GlobeOrbitLabels() {
  return (
    <div className="globe-orbit-labels" aria-hidden="true">
      {identityLabels.map((label) => (
        <div key={label.en} className={`orbit-label ${label.className}`}>
          <span>{label.symbol}</span>
          <p>{label.zh}</p>
          <small>{label.en}</small>
        </div>
      ))}

      <div className="agent-orbit-tags">
        {externalAgentLabels.map((label, index) => (
          <span key={label} className={`agent-orbit-tag agent-orbit-tag--${index + 1}`}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
