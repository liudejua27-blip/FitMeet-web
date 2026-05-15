'use client';

import { motion } from 'framer-motion';

export type PermissionLevel =
  | 'read_only'
  | 'draft_mode'
  | 'basic'
  | 'standard'
  | 'open';

interface CardDef {
  id: PermissionLevel;
  tier: string;
  headline: string;
  capabilities: string[];
  restrictions: string[];
  accent: string;          // tailwind text colour class
  border: string;          // tailwind border colour class
  recommended?: boolean;
}

const CARDS: CardDef[] = [
  {
    id: 'read_only',
    tier: '01 — Read Only',
    headline: 'Agent 只能看，不能动',
    capabilities: ['浏览推荐用户列表', '读取你的偏好设置'],
    restrictions: ['不能生成内容', '不能发送任何消息'],
    accent: 'text-[#8C8A6E]',
    border: 'border-[#3a3a30]',
  },
  {
    id: 'draft_mode',
    tier: '02 — Draft Mode',
    headline: '起草，但不发布',
    capabilities: ['搜索匹配对象', '生成帖子草稿', '生成私信草稿'],
    restrictions: ['所有草稿需人工确认后发布', '不能直接发送任何内容'],
    accent: 'text-[#A8B090]',
    border: 'border-[#454535]',
  },
  {
    id: 'basic',
    tier: '03 — Basic',
    headline: '你确认，Agent 执行',
    capabilities: ['发帖 / 意图识别 / 搜索 / 破冰 / 推荐', '用户点「同意」后才执行首发私信、加好友、邀约、凭证上传'],
    restrictions: ['所有写动作需你确认', '不会在你离线时自动操作'],
    accent: 'text-[#C8C4B0]',
    border: 'border-[#565640]',
    recommended: true,
  },
  {
    id: 'standard',
    tier: '04 — Standard',
    headline: '正常自动，高风险确认',
    capabilities: ['自动发帖、筛选匹配、普通聊天与续聊', '协助交换联系方式、发出活动邀请'],
    restrictions: ['首次联系陌生人 / 夜间 / 饮酒 / 支付 / 精确定位 / 上传照片 / 最终发布仍需确认'],
    accent: 'text-[#D4C898]',
    border: 'border-[#605840]',
  },
  {
    id: 'open',
    tier: '05 — Open',
    headline: '最高自由度，平台安全风控依然生效',
    capabilities: ['自动聊天 / 加好友 / 邀请 / 发布活动', '适合高信任用户与熟练 Agent'],
    restrictions: ['仍会拦截违法 / 骚扰 / 色情 / 暴力 / 诱导转账', '被拉黑或拒绝 Agent 的用户不会被联系'],
    accent: 'text-[#8CB8A8]',
    border: 'border-[#304840]',
  },
];

interface Props {
  selected: PermissionLevel | null;
  onSelect: (level: PermissionLevel) => void;
}

export function PermissionCard({ selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {CARDS.map((card, i) => {
        const active = selected === card.id;
        return (
          <motion.button
            key={card.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onSelect(card.id)}
            className={[
              'relative flex flex-col gap-4 rounded-2xl border p-6 text-left transition-all duration-300',
              'bg-[rgba(15,15,12,0.72)] backdrop-blur-xl',
              card.border,
              active ? 'ring-1 ring-[#F4EFE6]/30 scale-[1.02] shadow-[0_0_24px_rgba(244,239,230,0.08)]' : 'hover:scale-[1.01]',
            ].join(' ')}
          >
            {card.recommended && (
              <span className="absolute -top-2.5 left-4 rounded-full bg-[#6B7A5A]/80 px-3 py-0.5 text-[10px] tracking-widest text-[#F4EFE6] uppercase backdrop-blur">
                Recommended
              </span>
            )}

            <div>
              <p className={`text-[10px] tracking-[0.2em] uppercase mb-1 ${card.accent}`}>{card.tier}</p>
              <p className="text-sm font-medium text-[#E8E4DC] leading-snug">{card.headline}</p>
            </div>

            <div className="space-y-1">
              {card.capabilities.map((c) => (
                <div key={c} className="flex items-start gap-2 text-xs text-[#B8B5AC]">
                  <span className={`mt-0.5 shrink-0 ${card.accent}`}>✓</span>
                  <span>{c}</span>
                </div>
              ))}
            </div>

            <div className="mt-auto space-y-1 border-t border-[#2a2a22] pt-3">
              {card.restrictions.map((r) => (
                <div key={r} className="flex items-start gap-2 text-xs text-[#666660]">
                  <span className="mt-0.5 shrink-0">✕</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>

            {active && (
              <motion.div
                layoutId="selected-ring"
                className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-[#F4EFE6]/20"
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
