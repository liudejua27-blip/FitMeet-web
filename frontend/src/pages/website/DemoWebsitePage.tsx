import { type KeyboardEvent, useId, useMemo, useState } from 'react';
import clsx from 'clsx';
import { WebsiteHero } from '../../components/website/sections/WebsiteHero';

export function DemoWebsitePage() {
  const [step, setStep] = useState(0);
  const demoId = useId();
  const demoSteps = useMemo(
    () => [
      {
        title: '用户说出需求',
        body: '今晚想找一个低压力慢跑搭子，不尬聊，最好离我 3km 内。',
      },
      {
        title: 'Agent 生成卡片',
        body: '先整理成约练卡：时间、地点范围、跑步强度、人数、公开范围和安全边界。',
      },
      {
        title: '匹配候选',
        body: '推荐理由：同区域、今晚有空、都偏好轻松运动，适合先站内聊清楚。',
      },
      {
        title: '确认发布',
        body: '用户确认后才会发布到发现页；发送邀请、加好友或私信仍会再次确认。',
      },
    ],
    [],
  );

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowLeft'
    ) {
      return;
    }
    event.preventDefault();
    const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const next = (index + direction + demoSteps.length) % demoSteps.length;
    setStep(next);
    document.getElementById(`${demoId}-tab-${next}`)?.focus();
  };

  return (
    <>
      <WebsiteHero name="demo" />
      <section id="demo-flow" className="fm-demo">
        <div className="fm-demo__rail" role="tablist" aria-label="FitMeet 30 秒 Demo 步骤">
          {demoSteps.map((item, index) => (
            <button
              key={item.title}
              id={`${demoId}-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={index === step}
              aria-controls={`${demoId}-panel`}
              tabIndex={index === step ? 0 : -1}
              className={clsx(index === step && 'is-active')}
              onClick={() => setStep(index)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              {item.title}
            </button>
          ))}
        </div>
        <div
          id={`${demoId}-panel`}
          className="fm-demo__screen"
          role="tabpanel"
          aria-labelledby={`${demoId}-tab-${step}`}
        >
          <span>FitMeet Agent</span>
          <h2>{demoSteps[step].title}</h2>
          <p>{demoSteps[step].body}</p>
          <div className="fm-demo__controls">
            <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))}>
              上一步
            </button>
            <button
              type="button"
              onClick={() => setStep((value) => Math.min(demoSteps.length - 1, value + 1))}
            >
              下一步
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
