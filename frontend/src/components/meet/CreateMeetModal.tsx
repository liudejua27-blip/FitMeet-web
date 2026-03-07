import { memo, useState, useCallback } from 'react';
import { Button } from '../ui';
import { validateField, sanitizeInput } from '../../lib/utils';
import { useModalA11y } from '../../hooks/useModalA11y';

interface CreateMeetModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: MeetFormData) => void;
}

export interface MeetFormData {
  title: string;
  type: string;
  time: string;
  location: string;
  maxSlots: number;
  level: string;
  price: string;
  feeType: string;
  groupType: string;
  creatorType: string;
  desc: string;
}

const sportTypes = [
  { id: 'gym', label: '🏋️ 健身房' },
  { id: 'run', label: '🏃 跑步' },
  { id: 'yoga', label: '🧘 瑜伽' },
  { id: 'outdoor', label: '🌿 户外' },
  { id: 'swim', label: '🏊 游泳' },
  { id: 'martial', label: '🥊 武术' },
  { id: 'ball', label: '⚽ 球类' },
];

const levels = [
  { id: 'all', label: '全部水平' },
  { id: 'beginner', label: '新手' },
  { id: 'intermediate', label: '进阶' },
  { id: 'pro', label: '专业' },
];

const feeTypes = [
  { id: 'free', label: '免费' },
  { id: 'aa', label: 'AA制' },
  { id: 'paid', label: '付费带练' },
];

const groupTypes = [
  { id: '1v1', label: '1对1' },
  { id: 'small', label: '小组(3-5人)' },
  { id: 'group', label: '多人(6+)' },
];

const creatorTypes = [
  { id: 'find-coach', label: '寻找教练' },
  { id: 'coach-mode', label: '我来带练' },
  { id: 'peer', label: '互助约练' },
];

export const CreateMeetModal = memo(function CreateMeetModal({ open, onClose, onSubmit }: CreateMeetModalProps) {
  const { containerRef, handleBackdropClick } = useModalA11y<HTMLDivElement>({ open, onClose });
  const [form, setForm] = useState<MeetFormData>({
    title: '',
    type: 'gym',
    time: '',
    location: '',
    maxSlots: 4,
    level: 'all',
    price: '免费',
    feeType: 'free',
    groupType: 'small',
    creatorType: 'peer',
    desc: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = useCallback(<K extends keyof MeetFormData>(key: K, value: MeetFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    // Clear field error on change
    setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  }, []);

  const handleSubmit = useCallback(() => {
    const errs: Record<string, string> = {};

    const titleErr = validateField(form.title, '标题', { maxLength: 50 });
    if (titleErr) errs.title = titleErr;

    if (!form.time) errs.time = '请选择时间';

    const locErr = validateField(form.location, '地点', { maxLength: 100 });
    if (locErr) errs.location = locErr;

    if (form.desc && form.desc.trim().length > 500) errs.desc = '描述不能超过500个字符';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    // Sanitize text fields before submitting
    const sanitized: MeetFormData = {
      ...form,
      title: sanitizeInput(form.title, 50),
      location: sanitizeInput(form.location, 100),
      desc: sanitizeInput(form.desc, 500),
      price: sanitizeInput(form.price, 50),
    };
    onSubmit(sanitized);
    onClose();
  }, [form, onSubmit, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleBackdropClick}>
      <div ref={containerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="发起约练" className="bg-surface border border-border rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto outline-none">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-display font-extrabold text-xl">发起约练</h2>
          <button
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-textMuted hover:text-white hover:border-borderStrong transition cursor-pointer"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-5">
          {/* Title */}
          <FormField label="约练标题" error={errors.title}>
            <input
              type="text"
              placeholder="例：今晚望京深蹲约练"
              value={form.title}
              maxLength={50}
              onChange={e => updateField('title', e.target.value)}
              className="w-full bg-surfaceMuted border border-border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-textSofter outline-none focus:border-lime/30"
            />
          </FormField>

          {/* Sport Type */}
          <FormField label="运动类型">
            <div className="flex flex-wrap gap-2">
              {sportTypes.map(s => (
                <button
                  key={s.id}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer ${
                    form.type === s.id
                      ? 'bg-lime text-[#09090A] border-lime'
                      : 'border-border text-textMuted hover:border-borderStrong'
                  }`}
                  onClick={() => updateField('type', s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </FormField>

          {/* Creator Type */}
          <FormField label="约练模式">
            <div className="flex gap-2">
              {creatorTypes.map(c => (
                <button
                  key={c.id}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    form.creatorType === c.id
                      ? 'bg-lime/15 text-lime border-lime/30'
                      : 'border-border text-textMuted hover:border-borderStrong'
                  }`}
                  onClick={() => updateField('creatorType', c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </FormField>

          {/* Time & Location */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="时间" error={errors.time}>
              <input
                type="datetime-local"
                value={form.time}
                onChange={e => updateField('time', e.target.value)}
                className="w-full bg-surfaceMuted border border-border rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-lime/30"
              />
            </FormField>
            <FormField label="地点" error={errors.location}>
              <input
                type="text"
                placeholder="例：望京SOHO 极限健身"
                value={form.location}
                maxLength={100}
                onChange={e => updateField('location', e.target.value)}
                className="w-full bg-surfaceMuted border border-border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-textSofter outline-none focus:border-lime/30"
              />
            </FormField>
          </div>

          {/* Group Type & Slots */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="人数类型">
              <div className="flex flex-col gap-1.5">
                {groupTypes.map(g => (
                  <button
                    key={g.id}
                    className={`py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      form.groupType === g.id
                        ? 'bg-lime/15 text-lime border-lime/30'
                        : 'border-border text-textMuted hover:border-borderStrong'
                    }`}
                    onClick={() => updateField('groupType', g.id)}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="人数上限">
              <input
                type="number"
                min={1}
                max={20}
                value={form.maxSlots}
                onChange={e => updateField('maxSlots', parseInt(e.target.value) || 1)}
                className="w-full bg-surfaceMuted border border-border rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-lime/30"
              />
            </FormField>
          </div>

          {/* Level */}
          <FormField label="要求水平">
            <div className="flex gap-2">
              {levels.map(l => (
                <button
                  key={l.id}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    form.level === l.id
                      ? 'bg-lime/15 text-lime border-lime/30'
                      : 'border-border text-textMuted hover:border-borderStrong'
                  }`}
                  onClick={() => updateField('level', l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </FormField>

          {/* Fee */}
          <FormField label="费用设置">
            <div className="flex gap-2 mb-2">
              {feeTypes.map(f => (
                <button
                  key={f.id}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    form.feeType === f.id
                      ? 'bg-lime/15 text-lime border-lime/30'
                      : 'border-border text-textMuted hover:border-borderStrong'
                  }`}
                  onClick={() => {
                    updateField('feeType', f.id);
                    updateField('price', f.id === 'free' ? '免费' : f.id === 'aa' ? 'AA制' : '');
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {form.feeType === 'paid' && (
              <input
                type="text"
                placeholder="例：¥200/人"
                value={form.price}
                onChange={e => updateField('price', e.target.value)}
                className="w-full bg-surfaceMuted border border-border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-textSofter outline-none focus:border-lime/30"
              />
            )}
          </FormField>

          {/* Description */}
          <FormField label="详细描述" error={errors.desc}>
            <textarea
              placeholder="描述一下这次约练的具体安排..."
              value={form.desc}
              maxLength={500}
              onChange={e => updateField('desc', e.target.value)}
              rows={3}
              className="w-full bg-surfaceMuted border border-border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-textSofter outline-none focus:border-lime/30 resize-none"
            />
          </FormField>

          {/* Safety Notice */}
          <div className="flex items-center gap-2.5 p-3 bg-lime/5 border border-lime/15 rounded-xl">
            <span className="text-lg flex-shrink-0">🛡️</span>
            <p className="text-[11px] text-textMuted leading-relaxed">
              发布后系统将自动匹配附近用户。请确保个人信息真实，约练地点安全。支持开启行程分享和紧急联系人功能。
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-border">
          <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="lg" className="flex-1" onClick={handleSubmit}>
            发布约练
          </Button>
        </div>
      </div>
    </div>
  );
});

const FormField = memo(function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[11px] text-textMuted uppercase tracking-wider mb-2">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
});
