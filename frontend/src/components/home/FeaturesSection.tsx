import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Tag } from '../ui';
import { cn } from '../../lib/utils';

interface Feature {
  num: string;
  icon: string;
  title: string;
  desc: string;
  tags: { text: string; lime?: boolean }[];
  to?: string;
}

const features: Feature[] = [
  {
    num: '01 — DISCOVER',
    icon: '🔥',
    title: '发现 · 信息流',
    desc: '类小红书的健身内容生态，瀑布流呈现健身日记、打卡照片、训练视频。基于地理位置推荐附近内容。',
    tags: [
      { text: '#晨跑搭子', lime: true },
      { text: '#深蹲100天', lime: true },
      { text: '#增肌食谱' },
    ],
    to: '/discover',
  },
  {
    num: '02 — MEET',
    icon: '📍',
    title: '约练 · 运动撮合',
    desc: '滴滴打车式约练撮合，地图实时显示附近活动，支持 1对1 / 小组约练，内置行程共享安全机制。',
    tags: [
      { text: '免费约练', lime: true },
      { text: '付费带练', lime: true },
      { text: 'SOS 紧急' },
    ],
    to: '/meet',
  },
  {
    num: '03 — COACH',
    icon: '🏋️',
    title: '教练 · 接单市场',
    desc: '人人皆可为教练。展示专长证书，设置可约时段，平台托管资金，阶梯抽佣6%–10%透明结算。',
    tags: [
      { text: '认证教练' },
      { text: '在线预约' },
      { text: '24h 提现', lime: true },
    ],
    to: '/coach',
  },
  {
    num: '04 — PROFILE',
    icon: '😊',
    title: '我的 · 个人主页',
    desc: '展示训练数据、身材变化、打卡记录，单身认证可选显示，教练模式一键切换，信用分可视。',
    tags: [
      { text: 'Before/After', lime: true },
      { text: '信用积分' },
      { text: '勋章系统' },
    ],
  },
];

export const FeaturesSection = memo(function FeaturesSection() {
  return (
    <section className="py-24">
      <div className="max-w-6xl mx-auto px-8">
        {/* Header */}
        <div className="mb-14">
          <div className="font-mono text-[10px] uppercase tracking-widest text-lime mb-3">
            核心功能
          </div>
          <h2 className="font-display font-extrabold text-[clamp(32px,5vw,52px)] leading-tight tracking-tight">
            四大模块<br />重构健身社交
          </h2>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature, i) => (
            <FeatureCard key={feature.num} feature={feature} delay={i * 0.05} />
          ))}
        </div>
      </div>
    </section>
  );
});

const FeatureCard = memo(function FeatureCard({ 
  feature, 
  delay 
}: { 
  feature: Feature; 
  delay: number;
}) {
  const content = (
    <article 
      className={cn(
        'bg-surface border border-border rounded-3xl p-10 relative overflow-hidden transition-all duration-300 cursor-pointer',
        'hover:border-borderStrong hover:-translate-y-1',
        'before:absolute before:inset-0 before:rounded-3xl before:bg-lime/5 before:opacity-0 before:transition-opacity hover:before:opacity-100'
      )}
      style={{ transitionDelay: `${delay}s` }}
    >
      <div className="relative z-10">
        <div className="font-mono text-[11px] text-lime tracking-widest mb-3">
          {feature.num}
        </div>
        <div className="text-4xl mb-5">{feature.icon}</div>
        <h3 className="font-display font-bold text-[22px] text-white mb-2.5">
          {feature.title}
        </h3>
        <p className="text-sm leading-relaxed text-textMuted mb-5">
          {feature.desc}
        </p>
        <div className="flex flex-wrap gap-2">
          {feature.tags.map(tag => (
            <Tag key={tag.text} variant={tag.lime ? 'lime' : 'default'}>
              {tag.text}
            </Tag>
          ))}
        </div>
      </div>
    </article>
  );

  if (feature.to) {
    return <Link to={feature.to} className="no-underline">{content}</Link>;
  }
  return content;
});
