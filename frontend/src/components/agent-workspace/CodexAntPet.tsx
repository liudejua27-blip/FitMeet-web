import clsx from 'clsx';
import {
  ANT_GUIDE_ARIA_LABELS,
  ANT_GUIDE_COPY,
  type AntGuideCopy,
  type AntGuideState,
  type AntGuideTarget,
} from '../agent/ant-guide';

export function CodexAntPet({
  state,
  target = null,
  copy,
  size = 'md',
  surface,
}: {
  state: AntGuideState;
  target?: AntGuideTarget;
  copy?: AntGuideCopy;
  size?: 'sm' | 'md';
  surface: 'home' | 'thread';
}) {
  const guideCopy = {
    ...ANT_GUIDE_COPY[state],
    ...copy,
  };
  const label = ANT_GUIDE_ARIA_LABELS[state].replace('智能小蚁', 'FitMeet Pet');

  return (
    <div
      className={clsx(
        'codex-ant-pet',
        `codex-ant-pet--${state}`,
        `codex-ant-pet--${surface}`,
        `codex-ant-pet--${size}`,
      )}
      data-state={state}
      data-target={target ?? 'none'}
      role="group"
      aria-label={`${label}${guideCopy.title ? `：${guideCopy.title}` : ''}`}
    >
      <div className="codex-ant-pet__sprite" role="img" aria-label={label}>
        <span className="codex-ant-pet__antenna codex-ant-pet__antenna--left" />
        <span className="codex-ant-pet__antenna codex-ant-pet__antenna--right" />
        <span className="codex-ant-pet__body">
          <span className="codex-ant-pet__mark" />
          <span className="codex-ant-pet__eye codex-ant-pet__eye--left" />
          <span className="codex-ant-pet__eye codex-ant-pet__eye--right" />
          <span className="codex-ant-pet__mouth" />
        </span>
        <span className="codex-ant-pet__shadow" />
        <span className="codex-ant-pet__signal codex-ant-pet__signal--one" />
        <span className="codex-ant-pet__signal codex-ant-pet__signal--two" />
      </div>
      <div className="codex-ant-pet__bubble" role="status" aria-live="polite">
        <strong>{guideCopy.title}</strong>
        <span>{guideCopy.description}</span>
      </div>
    </div>
  );
}
