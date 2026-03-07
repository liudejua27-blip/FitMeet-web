import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui';

export const HeroSection = memo(function HeroSection() {
  return (
    <section className="min-h-[calc(100vh-64px)] flex flex-col justify-center items-center text-center relative overflow-hidden px-8 py-20">
      {/* Floating Orbs — decorative */}
      <div 
        aria-hidden="true"
        className="absolute w-[600px] h-[600px] -top-[150px] -left-[100px] rounded-full pointer-events-none animate-pulse"
        style={{ 
          background: 'radial-gradient(circle, rgba(200,255,0,0.09) 0%, transparent 65%)',
          animation: 'orbFloat 8s ease-in-out infinite'
        }}
      />
      <div 
        aria-hidden="true"
        className="absolute w-[500px] h-[500px] -bottom-[100px] -right-[80px] rounded-full pointer-events-none"
        style={{ 
          background: 'radial-gradient(circle, rgba(68,136,255,0.06) 0%, transparent 65%)',
          animation: 'orbFloat 10s ease-in-out infinite reverse'
        }}
      />

      {/* Badge */}
      <div className="inline-flex items-center gap-2 border border-lime/25 px-4 py-1.5 rounded-full mb-8 animate-fadeUp">
        <div className="w-1.5 h-1.5 rounded-full bg-lime shadow-[0_0_6px_#C8FF00] animate-pulse" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-lime">
          企业级健身社交平台 · 现已上线
        </span>
      </div>

      {/* Heading */}
      <h1 className="font-display font-extrabold text-[clamp(56px,9vw,116px)] leading-[0.95] tracking-tight text-white mb-7 animate-fadeUp">
        <span className="block">找到你的</span>
        <span className="block text-lime">运动搭子</span>
        <span 
          className="block text-transparent"
          style={{ WebkitTextStroke: '1.5px rgba(236,236,236,0.3)' }}
        >
          MOVE TOGETHER
        </span>
      </h1>

      {/* Subtitle */}
      <p className="text-[17px] leading-relaxed text-textMuted max-w-[520px] mx-auto mb-11 animate-fadeUp">
        约练、社交、教练市场——三位一体。<br />
        附近 3 公里内，连接志同道合的运动伙伴。
      </p>

      {/* CTA Buttons */}
      <div className="flex gap-3.5 justify-center flex-wrap animate-fadeUp">
        <Link to="/meet">
          <Button variant="primary" size="xl">立即约练 →</Button>
        </Link>
        <Link to="/discover">
          <Button variant="outline" size="xl">浏览动态</Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-12 justify-center mt-[72px] pt-10 border-t border-border animate-fadeUp">
        <StatItem value="3km" label="精准匹配范围" />
        <StatItem value="5★" label="认证评价体系" />
        <StatItem value="6层" label="安全保障机制" />
        <StatItem value="¥28" label="Pro 月度会员" />
      </div>
    </section>
  );
});

const StatItem = memo(function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display font-extrabold text-4xl text-lime tracking-tight">
        {value}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted mt-1">
        {label}
      </div>
    </div>
  );
});
