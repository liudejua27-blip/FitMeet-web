import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AiSocialRequestCta } from '../components/social-request/AiSocialRequestCta';
import {
  socialRequestsApi,
  type SocialRequestType,
} from '../api/socialRequestsApi';

const TYPE_OPTIONS: { value: SocialRequestType; label: string; hint: string }[] = [
  { value: 'coffee_chat', label: '咖啡轻聊', hint: '公共咖啡店、低压力' },
  { value: 'running_partner', label: '跑步搭子', hint: '同节奏的人' },
  { value: 'fitness_partner', label: '健身搭子', hint: '健身房一起练' },
  { value: 'dog_walking', label: '遛狗搭子', hint: '宠物公园会面' },
  { value: 'city_walk', label: '城市散步', hint: '附近公共打卡点' },
  { value: 'study_partner', label: '学习搭子', hint: '咖啡馆 / 自习室' },
  { value: 'custom', label: '自定义', hint: '描述你想认识的人' },
];

export function SocialRequestNewPage() {
  const navigate = useNavigate();
  const [type, setType] = useState<SocialRequestType>('coffee_chat');
  const [rawText, setRawText] = useState('');
  const [city, setCity] = useState('');
  const [radiusKm, setRadiusKm] = useState(5);
  const [tagsText, setTagsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const tags = tagsText
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const created = await socialRequestsApi.create({
        type,
        rawText: rawText || undefined,
        description: rawText || undefined,
        city: city || undefined,
        radiusKm,
        interestTags: tags,
      });
      // immediately run match so candidates page is populated
      await socialRequestsApi.runMatch(created.id, 5).catch(() => undefined);
      navigate(`/social-request/${created.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0d0b] text-[#F4EFE6]">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <header className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8C8A6E]">
            STEP 1 / 7
          </div>
          <h1 className="text-2xl font-light">告诉 FitMeet 你想认识什么人</h1>
          <p className="text-sm text-[#C7C2B0]">
            这一步只需要一句话。FitMeet Agent 会把它转成一张社交任务卡，
            匹配候选人、生成破冰邀约，并在你点确认后才发出去。
          </p>
        </header>

        <AiSocialRequestCta variant="inline" />

        <section className="space-y-3">
          <label className="text-xs uppercase tracking-wider text-[#8C8A6E]">
            类型
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={`px-3 py-3 rounded-xl border text-left transition ${
                  type === opt.value
                    ? 'border-[#C8FF80] bg-[#C8FF80]/10'
                    : 'border-[#26261d] hover:border-[#6B7A5A]'
                }`}
              >
                <div className="text-sm text-[#F4EFE6]">{opt.label}</div>
                <div className="text-[11px] text-[#8C8A6E] mt-0.5">
                  {opt.hint}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-[#8C8A6E]">
            一句话需求
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="例如：周六下午想找一个对独立电影感兴趣的人，在三里屯喝杯咖啡聊一小时。"
            rows={4}
            className="w-full bg-[#15150f] border border-[#26261d] rounded-xl px-4 py-3 text-sm placeholder:text-[#5e5d4a] resize-none"
          />
        </section>

        <section className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-[#8C8A6E]">
              城市
            </label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="北京"
              className="mt-1 w-full bg-[#15150f] border border-[#26261d] rounded-md px-3 py-2 text-sm placeholder:text-[#5e5d4a]"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-[#8C8A6E]">
              半径 ({radiusKm} km)
            </label>
            <input
              type="range"
              min={1}
              max={50}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="mt-3 w-full accent-[#C8FF80]"
            />
          </div>
        </section>

        <section className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-[#8C8A6E]">
            标签（逗号分隔，可选）
          </label>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="独立电影, 跑步, 摄影"
            className="w-full bg-[#15150f] border border-[#26261d] rounded-md px-3 py-2 text-sm placeholder:text-[#5e5d4a]"
          />
        </section>

        {error && (
          <div className="text-xs text-red-300 bg-red-900/20 border border-red-500/40 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <button
          disabled={busy}
          onClick={submit}
          className="w-full px-4 py-3 rounded-xl bg-[#C8FF80] text-[#0d0d0b] text-sm font-medium hover:bg-[#b8ef70] disabled:opacity-50"
        >
          {busy ? '正在生成任务卡...' : '生成社交任务卡 →'}
        </button>

        <p className="text-[11px] text-[#5e5d4a] text-center">
          这是一次真实创建，会写入后端。点击后下一页就能看到 AI 匹配的候选人。
        </p>
      </div>
    </div>
  );
}

export default SocialRequestNewPage;
