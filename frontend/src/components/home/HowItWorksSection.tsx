import { memo } from 'react';

interface Step {
  num: string;
  title: string;
  desc: string;
}

const steps: Step[] = [
  {
    num: '01',
    title: '注册认证',
    desc: '手机号注册，完善健身档案，可选视频真人认证获得✓标识，约练列表优先展示。',
  },
  {
    num: '02',
    title: '发现浏览',
    desc: '信息流浏览 → 距离筛选 → 点赞评论互动 → "想约TA"一键发起连接请求。',
  },
  {
    num: '03',
    title: '确认约练',
    desc: '选择时间地点 → 设置人数费用 → 双方确认 → 训练开始自动启动行程共享。',
  },
  {
    num: '04',
    title: '完成评价',
    desc: '训练结束 → 双向五星评价 → 信用积分更新 → 成长数据沉淀到个人主页。',
  },
];

export const HowItWorksSection = memo(function HowItWorksSection() {
  return (
    <section className="py-20 border-t border-border">
      <div className="max-w-6xl mx-auto px-8">
        {/* Header */}
        <div className="mb-14">
          <div className="font-mono text-[10px] uppercase tracking-widest text-lime mb-3">
            使用流程
          </div>
          <h2 className="font-display font-extrabold text-[clamp(32px,5vw,52px)] leading-tight tracking-tight">
            4步开始你的<br />第一次约练
          </h2>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-0 mt-14">
          {steps.map((step, i) => (
            <StepCard key={step.num} step={step} isLast={i === steps.length - 1} />
          ))}
        </div>
      </div>
    </section>
  );
});

const StepCard = memo(function StepCard({ 
  step, 
  isLast 
}: { 
  step: Step; 
  isLast: boolean;
}) {
  return (
    <div className="px-7 py-10 border-r border-border last:border-r-0 relative">
      <div className="font-display font-extrabold text-5xl text-lime/10 leading-none mb-5">
        {step.num}
      </div>
      <h3 className="font-display font-bold text-[17px] text-white mb-2.5">
        {step.title}
      </h3>
      <p className="text-[13px] leading-relaxed text-textMuted">
        {step.desc}
      </p>
      {!isLast && (
        <span className="absolute -right-3 top-10 text-lg text-lime z-10">
          →
        </span>
      )}
    </div>
  );
});
