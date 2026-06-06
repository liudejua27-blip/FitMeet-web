'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PermissionCard, PermissionLevel } from './PermissionCard';

const KNOWN_AGENTS = [
  { id: 'openclaw', name: 'OpenClaw', desc: 'Autonomous fitness-companion agent', color: '#E8906A' },
  { id: 'codex',    name: 'Codex',    desc: 'Context-aware social intelligence', color: '#6A9AE8' },
  { id: 'hermes',   name: 'Hermes',   desc: 'Swift messaging & scheduling agent', color: '#9AE86A' },
  { id: 'qclaw',    name: 'QClaw',    desc: 'Quantum-indexed preference matching', color: '#C86AE8' },
  { id: 'custom',   name: 'Custom',   desc: 'Connect your own agent via API key', color: '#E8D46A' },
];

export function AgentConnectPanel() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [chosenAgent, setChosenAgent] = useState<string | null>(null);
  const [permLevel, setPermLevel] = useState<PermissionLevel | null>(null);
  const [customName, setCustomName] = useState('');
  const [customWebhook, setCustomWebhook] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [agentToken, setAgentToken] = useState<string | null>(null);

  const agent = KNOWN_AGENTS.find((a) => a.id === chosenAgent);

  const handleConnect = async () => {
    if (!chosenAgent || !permLevel) return;

    // Landing preview mirrors the authenticated POST /api/agents/register payload.
    try {
      const payload = {
        agentName: chosenAgent,
        agentDisplayName: chosenAgent === 'custom' ? customName : agent?.name ?? '',
        agentWebhookUrl: chosenAgent === 'custom' ? customWebhook || undefined : undefined,
        permissionLevel: permLevel,
        dailyActionLimit: 50,
      };
      console.info('FitMeet agent registration preview:', payload);
      setAgentToken('fitmeet_agent_' + Math.random().toString(36).slice(2, 14));
      setSubmitted(true);
    } catch (e) {
      console.error(e);
    }
  };

  if (submitted && agentToken) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-[#3a3a30] bg-[rgba(15,15,12,0.82)] p-8 backdrop-blur-xl"
      >
        <p className="mb-2 text-xs tracking-[0.2em] uppercase text-[#8C8A6E]">连接成功</p>
        <h3 className="mb-4 text-xl font-light text-[#F4EFE6]">
          {agent?.name ?? customName} 已接入 FitMeet
        </h3>
        <p className="mb-2 text-xs text-[#8C8A6E]">Agent Token — 仅显示一次，请妥善保存</p>
        <code className="block break-all rounded-xl bg-[#0A0A09] p-4 font-mono text-xs text-[#C8FF80] select-all">
          {agentToken}
        </code>
        <p className="mt-4 text-xs text-[#666660]">
          将此 Token 配置到你的 Agent 软件的 <code className="text-[#8C8A6E]">X-Agent-Token</code> 请求头中。
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Step indicator */}
      <div className="flex items-center gap-3">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-3">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] transition-all ${
              step >= s
                ? 'border-[#8C8A6E] bg-[#6B7A5A]/20 text-[#C8C4B0]'
                : 'border-[#2a2a22] text-[#444440]'
            }`}>
              {s}
            </div>
            {s < 3 && <div className={`h-px w-8 transition-all ${step > s ? 'bg-[#6B7A5A]' : 'bg-[#2a2a22]'}`} />}
          </div>
        ))}
        <span className="ml-2 text-xs text-[#666660]">
          {step === 1 ? '选择 Agent' : step === 2 ? '设置权限' : '确认连接'}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1 — Choose agent */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          >
            {KNOWN_AGENTS.map((ag) => (
              <button
                key={ag.id}
                onClick={() => { setChosenAgent(ag.id); setStep(2); }}
                className={`flex flex-col gap-2 rounded-2xl border p-5 text-left transition-all duration-300 hover:scale-[1.02] ${
                  chosenAgent === ag.id
                    ? 'border-[#6B7A5A]/60 bg-[rgba(107,122,90,0.12)]'
                    : 'border-[#2a2a22] bg-[rgba(15,15,12,0.6)]'
                } backdrop-blur-xl`}
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-base font-bold"
                  style={{ background: ag.color + '22', color: ag.color }}
                >
                  {ag.name[0]}
                </span>
                <span className="text-sm font-medium text-[#E8E4DC]">{ag.name}</span>
                <span className="text-xs text-[#666660] leading-snug">{ag.desc}</span>
              </button>
            ))}
          </motion.div>
        )}

        {/* Step 2 — Permission level */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            {chosenAgent === 'custom' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs text-[#8C8A6E] tracking-wider uppercase">Agent 名称</label>
                  <input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="My Custom Agent"
                    className="w-full rounded-xl border border-[#2a2a22] bg-[rgba(15,15,12,0.7)] px-4 py-2.5 text-sm text-[#E8E4DC] placeholder-[#444440] outline-none focus:border-[#6B7A5A] transition"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#8C8A6E] tracking-wider uppercase">Webhook URL (可选)</label>
                  <input
                    value={customWebhook}
                    onChange={(e) => setCustomWebhook(e.target.value)}
                    placeholder="https://agents.ourfitmeet.cn/webhook"
                    className="w-full rounded-xl border border-[#2a2a22] bg-[rgba(15,15,12,0.7)] px-4 py-2.5 text-sm text-[#E8E4DC] placeholder-[#444440] outline-none focus:border-[#6B7A5A] transition"
                  />
                </div>
              </div>
            )}

            <PermissionCard selected={permLevel} onSelect={(l) => { setPermLevel(l); setStep(3); }} />
          </motion.div>
        )}

        {/* Step 3 — Review & confirm */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            <div className="rounded-2xl border border-[#2a2a22] bg-[rgba(15,15,12,0.7)] p-6 backdrop-blur-xl space-y-4">
              <div className="flex items-center gap-4">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-xl font-bold"
                  style={{
                    background: (KNOWN_AGENTS.find((a) => a.id === chosenAgent)?.color ?? '#8C8A6E') + '22',
                    color: KNOWN_AGENTS.find((a) => a.id === chosenAgent)?.color ?? '#8C8A6E',
                  }}
                >
                  {(agent?.name ?? customName)[0]}
                </span>
                <div>
                  <p className="text-base font-medium text-[#F4EFE6]">{agent?.name ?? customName}</p>
                  <p className="text-xs text-[#8C8A6E]">权限等级：{permLevel?.replace('_', ' ')}</p>
                </div>
              </div>

              <p className="text-xs text-[#666660] leading-relaxed">
                授权后，该 Agent 将获得一次性 API Token。
                所有 Agent 行为均有完整审计日志，你可以随时在 Activity 中查看或在 Connections 中撤销授权。
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="rounded-xl border border-[#2a2a22] px-6 py-2.5 text-sm text-[#8C8A6E] hover:border-[#3a3a30] transition"
              >
                返回修改
              </button>
              <button
                onClick={handleConnect}
                className="rounded-xl bg-[#6B7A5A] px-8 py-2.5 text-sm font-medium text-[#F4EFE6] hover:bg-[#7A8A68] transition"
              >
                确认连接 Agent
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
