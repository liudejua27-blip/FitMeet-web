import { memo } from 'react';

interface AnonymousSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const AnonymousSwitch = memo(function AnonymousSwitch({
  checked,
  onChange,
}: AnonymousSwitchProps) {
  return (
    <label className="flex items-center justify-between p-3 transition-colors border rounded-lg cursor-pointer border-border hover:border-lime/30">
      <div className="flex-1">
        <div className="text-sm font-medium mb-0.5">匿名参与</div>
        <div className="text-xs text-muted">以昵称身份参与，降低社交压力</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime ${
          checked ? 'bg-lime' : 'bg-border'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
});
