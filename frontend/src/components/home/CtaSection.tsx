import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui';

export const CtaSection = memo(function CtaSection() {
  return (
    <section className="py-20 border-t border-border">
      <div className="max-w-6xl mx-auto px-8 text-center">
        <div className="font-mono text-[10px] uppercase tracking-widest text-lime mb-4">
          立即开始
        </div>
        
        <h2 className="font-display font-extrabold text-[clamp(36px,6vw,72px)] leading-none tracking-tight mb-7">
          你的运动搭子<br />
          <span className="text-lime">就在附近 3km</span>
        </h2>
        
        <div className="flex gap-3 justify-center flex-wrap">
          <Link to="/meet">
            <Button variant="primary" size="xl">查看附近约练</Button>
          </Link>
          <Link to="/coach">
            <Button variant="outline" size="xl">找专业教练</Button>
          </Link>
        </div>
      </div>
    </section>
  );
});
