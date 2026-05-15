'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

const RELATIONSHIP_GOALS = [
  { id: 'fitness_buddy', label: '健身伙伴', emoji: '🏃' },
  { id: 'casual',        label: '轻松社交', emoji: '☕' },
  { id: 'dating',        label: '约会',     emoji: '💫' },
  { id: 'serious',       label: '认真恋爱', emoji: '🌿' },
];

const CHAT_STYLES = [
  { id: 'playful',      label: '轻松幽默', desc: '有梗、emoji 随意' },
  { id: 'direct',       label: '直接坦率', desc: '言简意赅' },
  { id: 'intellectual', label: '深度交流', desc: '喜欢聊想法和理念' },
  { id: 'warm',         label: '温暖陪伴', desc: '关心细节、重情绪' },
];

const PRIVACY_TOGGLES = [
  { id: 'noPhotoSharing',      label: '不允许 Agent 分享我的照片' },
  { id: 'noPolitics',          label: '禁止讨论政治话题' },
  { id: 'noContactBypass',     label: '禁止绕过平台交换联系方式', locked: true },
  { id: 'requireDoubleConsent',label: '联系方式交换需双方同意',    locked: true },
];

interface Prefs {
  idealPartner: string;
  relationshipGoal: string;
  chatStyle: string;
  privacy: Record<string, boolean>;
  ageMin: string;
  ageMax: string;
  city: string;
  agentMessaging: boolean;
  acceptAgentMessages: boolean;
}

const initial: Prefs = {
  idealPartner: '',
  relationshipGoal: 'fitness_buddy',
  chatStyle: 'warm',
  privacy: { noPhotoSharing: false, noPolitics: false, noContactBypass: true, requireDoubleConsent: true },
  ageMin: '22',
  ageMax: '35',
  city: '',
  agentMessaging: false,
  acceptAgentMessages: true,
};

export function PreferenceStudio() {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof Prefs>(key: K, val: Prefs[K]) =>
    setPrefs((p) => ({ ...p, [key]: val }));

  const handleSave = () => {
    // Would PUT /api/agents/preferences
    console.log('Saving preferences:', prefs);
    setSaved(true);
    setTimeout(() => setSaved(false), 2400);
  };

  return (
    <div className="space-y-10">
      {/* Ideal partner */}
      <Section label="理想型描述" hint="Agent 将以此为核心筛选依据">
        <textarea
          value={prefs.idealPartner}
          onChange={(e) => set('idealPartner', e.target.value)}
          rows={3}
          maxLength={800}
          placeholder="例如：喜欢早起跑步、热爱户外运动、有自己的事业目标、不抽烟…"
          className="w-full resize-none rounded-xl border border-[#2a2a22] bg-[rgba(15,15,12,0.7)] p-4 text-sm text-[#E8E4DC] placeholder-[#3a3a32] outline-none focus:border-[#6B7A5A] transition"
        />
        <p className="text-right text-[10px] text-[#3a3a32]">{prefs.idealPartner.length}/800</p>
      </Section>

      {/* Age + city */}
      <Section label="基础条件" hint="硬性筛选条件">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8C8A6E]">年龄</span>
            <NumberInput value={prefs.ageMin} onChange={(v) => set('ageMin', v)} min={18} max={80} />
            <span className="text-xs text-[#444440]">—</span>
            <NumberInput value={prefs.ageMax} onChange={(v) => set('ageMax', v)} min={18} max={80} />
            <span className="text-xs text-[#8C8A6E]">岁</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8C8A6E]">城市</span>
            <input
              value={prefs.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder="北京"
              className="w-28 rounded-xl border border-[#2a2a22] bg-[rgba(15,15,12,0.7)] px-3 py-1.5 text-sm text-[#E8E4DC] placeholder-[#3a3a32] outline-none focus:border-[#6B7A5A] transition"
            />
          </div>
        </div>
      </Section>

      {/* Relationship goal */}
      <Section label="关系目标" hint="告诉 Agent 你在寻找什么">
        <div className="flex flex-wrap gap-3">
          {RELATIONSHIP_GOALS.map((g) => (
            <button
              key={g.id}
              onClick={() => set('relationshipGoal', g.id)}
              className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm transition-all ${
                prefs.relationshipGoal === g.id
                  ? 'border-[#6B7A5A] bg-[rgba(107,122,90,0.15)] text-[#C8C4B0]'
                  : 'border-[#2a2a22] text-[#666660] hover:border-[#3a3a30]'
              }`}
            >
              <span>{g.emoji}</span>
              <span>{g.label}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Chat style */}
      <Section label="聊天风格偏好" hint="Agent 生成草稿时会模仿这种风格">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CHAT_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => set('chatStyle', s.id)}
              className={`flex flex-col gap-1 rounded-xl border p-4 text-left transition-all ${
                prefs.chatStyle === s.id
                  ? 'border-[#6B7A5A] bg-[rgba(107,122,90,0.12)] text-[#C8C4B0]'
                  : 'border-[#2a2a22] text-[#666660] hover:border-[#3a3a30]'
              }`}
            >
              <span className="text-sm font-medium">{s.label}</span>
              <span className="text-[11px] leading-snug opacity-60">{s.desc}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Agent messaging toggles */}
      <Section label="Agent 消息权限" hint="控制 Agent 是否可以代你发送或代收消息">
        <div className="space-y-3">
          <Toggle
            label="允许 Agent 代我发送消息（每次仍需确认）"
            value={prefs.agentMessaging}
            onChange={(v) => set('agentMessaging', v)}
          />
          <Toggle
            label="接受来自对方 Agent 发送的消息"
            value={prefs.acceptAgentMessages}
            onChange={(v) => set('acceptAgentMessages', v)}
          />
        </div>
      </Section>

      {/* Privacy boundaries */}
      <Section label="隐私边界" hint="🔒 标记为平台强制规则，不可关闭">
        <div className="space-y-3">
          {PRIVACY_TOGGLES.map((t) => (
            <Toggle
              key={t.id}
              label={t.label}
              value={prefs.privacy[t.id] ?? false}
              locked={t.locked}
              onChange={(v) =>
                !t.locked && set('privacy', { ...prefs.privacy, [t.id]: v })
              }
            />
          ))}
        </div>
      </Section>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          className="rounded-xl bg-[#6B7A5A] px-8 py-2.5 text-sm font-medium text-[#F4EFE6] hover:bg-[#7A8A68] transition"
        >
          保存偏好
        </button>
        {saved && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-[#8C8A6E]"
          >
            ✓ 已保存
          </motion.span>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium tracking-[0.15em] uppercase text-[#8C8A6E]">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] text-[#444440]">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  value,
  locked,
  onChange,
}: {
  label: string;
  value: boolean;
  locked?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => !locked && onChange(!value)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          value ? 'bg-[#6B7A5A]' : 'bg-[#2a2a22]'
        } ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#F4EFE6] shadow transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <span className={`text-xs ${locked ? 'text-[#555550]' : 'text-[#B8B5AC]'}`}>
        {locked && <span className="mr-1 text-[#6B7A5A]">🔒</span>}
        {label}
      </span>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className="w-16 rounded-xl border border-[#2a2a22] bg-[rgba(15,15,12,0.7)] px-3 py-1.5 text-center text-sm text-[#E8E4DC] outline-none focus:border-[#6B7A5A] transition"
    />
  );
}
