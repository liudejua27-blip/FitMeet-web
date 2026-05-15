'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AgentConnectPanel } from '../../components/agent/AgentConnectPanel';
import { PreferenceStudio } from '../../components/agent/PreferenceStudio';

const TABS = [
  { id: 'connect',   label: '接入 Agent' },
  { id: 'prefs',     label: '偏好设置' },
  { id: 'security',  label: '安全承诺' },
] as const;

type Tab = typeof TABS[number]['id'];

const SECURITY_ITEMS = [
  {
    title: '双重确认不可绕过',
    desc: '任何 Agent 都不能在你不知情的情况下发送消息或交换联系方式。所有「真人确认」步骤均在服务端强制执行。',
    icon: '🛡',
  },
  {
    title: 'Token 永不存储明文',
    desc: 'Agent Token 使用 bcrypt 单向加密后才写入数据库。即便数据库泄露，攻击者也无法推算出原始 Token。',
    icon: '🔐',
  },
  {
    title: '完整审计日志',
    desc: '每一条 Agent 指令都有不可篡改的日志记录，包括风险评分、执行结果和拦截原因，你随时可查。',
    icon: '📋',
  },
  {
    title: '骚扰检测引擎',
    desc: '所有 Agent 生成的内容经过实时语义分析。高风险内容会被拦截，生成安全事件记录并通知你。',
    icon: '🚫',
  },
  {
    title: '随时断联',
    desc: '在 Connections 页面点击「撤销」即可立即吊销 Token。Agent 下一次请求就会收到 401，无需联系客服。',
    icon: '⚡',
  },
  {
    title: '每日配额硬上限',
    desc: 'Agent 每天最多执行 50 次操作（可调低）。超限后自动挂起，等待你手动重置或次日 UTC 0 点自动恢复。',
    icon: '📊',
  },
];

export default function AgentHubPage() {
  const [tab, setTab] = useState<Tab>('connect');

  return (
    <main className="relative min-h-screen bg-[#0A0A09] text-[#F4EFE6] selection:bg-[#6B7A5A]/40">
      {/* Ambient radial */}
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(107,122,90,0.22) 0%, transparent 70%)',
        }}
      />

      {/* Hero */}
      <section className="relative mx-auto flex max-w-4xl flex-col items-center px-6 pt-32 pb-16 text-center">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-4 text-xs tracking-[0.35em] uppercase text-[#8C8A6E]"
        >
          Agent-Native Social Matching
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mb-5 text-4xl font-light leading-tight tracking-tight sm:text-5xl lg:text-6xl"
        >
          Your AI.
          <br />
          <span className="text-[#8C8A6E]">Your Rules.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="max-w-2xl text-base text-[#7A7870] leading-relaxed"
        >
          把你的 AI Agent 连入 FitMeet，让它根据你设定的理想型、审美偏好和隐私边界，
          帮你搜索匹配对象、起草内容——所有操作都在你的明确授权下进行，随时可以断开。
        </motion.p>
      </section>

      {/* Tab nav */}
      <div className="sticky top-0 z-20 border-b border-[#1a1a14] bg-[rgba(10,10,9,0.85)] backdrop-blur-xl">
        <nav className="mx-auto flex max-w-4xl gap-1 px-6 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative rounded-lg px-5 py-2 text-sm transition-colors ${
                tab === t.id ? 'text-[#F4EFE6]' : 'text-[#555550] hover:text-[#8C8A6E]'
              }`}
            >
              {t.label}
              {tab === t.id && (
                <motion.div
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-lg bg-[rgba(107,122,90,0.18)]"
                />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="mx-auto max-w-4xl px-6 py-12">
        {tab === 'connect' && (
          <motion.div
            key="connect"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <SectionHeader
              label="接入你的 AI Agent"
              desc="选择你已有的 Agent 或接入自定义平台，分三步完成授权配置。"
            />
            <AgentConnectPanel />
          </motion.div>
        )}

        {tab === 'prefs' && (
          <motion.div
            key="prefs"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <SectionHeader
              label="偏好工作室"
              desc="设置你的理想型和隐私边界，Agent 将严格基于这些参数搜索和行动。"
            />
            <PreferenceStudio />
          </motion.div>
        )}

        {tab === 'security' && (
          <motion.div
            key="security"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <SectionHeader
              label="安全承诺"
              desc="Agent 集成不是失去控制，而是精准授权。以下是我们在技术层面的强制保障。"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SECURITY_ITEMS.map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-2xl border border-[#1e1e18] bg-[rgba(15,15,12,0.7)] p-6 backdrop-blur-xl"
                >
                  <span className="mb-3 block text-2xl">{item.icon}</span>
                  <p className="mb-2 text-sm font-medium text-[#E8E4DC]">{item.title}</p>
                  <p className="text-xs leading-relaxed text-[#555550]">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom CTA */}
      <section className="mx-auto max-w-4xl px-6 pb-32 pt-8 text-center">
        <p className="text-xs text-[#333330] tracking-wider">
          FitMeet Agent Gateway · 所有功能需要主应用账号登录后使用
        </p>
      </section>
    </main>
  );
}

function SectionHeader({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="mb-8">
      <p className="mb-1.5 text-xs tracking-[0.2em] uppercase text-[#8C8A6E]">{label}</p>
      <p className="text-sm text-[#555550] max-w-xl leading-relaxed">{desc}</p>
    </div>
  );
}
