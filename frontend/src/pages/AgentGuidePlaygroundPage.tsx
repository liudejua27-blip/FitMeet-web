import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  AntGuide,
  ANT_GUIDE_STATE_ASSETS,
  ANT_GUIDE_COPY,
  AntGuideAssetDebugProvider,
  type AntGuideAssetMode,
  type AntGuideState,
  type AntGuideTarget,
} from '../components/agent/ant-guide';

const states: AntGuideState[] = [
  'idle',
  'thinking',
  'discovering',
  'recommending',
  'reminding',
  'confirming',
  'success',
  'error',
];

const targets: Array<{ label: string; value: AntGuideTarget }> = [
  { label: '无目标', value: null },
  { label: '输入框', value: 'input' },
  { label: '推荐卡片', value: 'recommendation' },
  { label: '确认按钮', value: 'confirmButton' },
  { label: '安全卡片', value: 'safetyCard' },
];

const recommendationCards = [
  ['咖啡轻聊', '低压力、适合先破冰'],
  ['Citywalk', '一起走走，话题自然出现'],
  ['周末跑步', '目标明确，互动节奏轻'],
];

export function AgentGuidePlaygroundPage() {
  const [state, setState] = useState<AntGuideState>('idle');
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [target, setTarget] = useState<AntGuideTarget>('input');
  const [interactive, setInteractive] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [overrideCopy, setOverrideCopy] = useState(false);
  const [forceSvgFallback, setForceSvgFallback] = useState(false);
  const [simulateWebpFailure, setSimulateWebpFailure] = useState(false);
  const [simulatePngFailure, setSimulatePngFailure] = useState(false);
  const [assetMode, setAssetMode] = useState<AntGuideAssetMode>('webp');
  const copy = useMemo(
    () =>
      overrideCopy
        ? {
            title: '这是一段外部覆写文案',
            description: '页面可以按当前任务替换 title 和 description。',
          }
        : undefined,
    [overrideCopy],
  );
  const assetDebugValue = useMemo(
    () => ({
      forceSvgFallback,
      simulateWebpFailure,
      simulatePngFailure,
      onModeChange: setAssetMode,
    }),
    [forceSvgFallback, simulatePngFailure, simulateWebpFailure],
  );
  const currentAsset = ANT_GUIDE_STATE_ASSETS[state];
  const currentAssetPath =
    assetMode === 'webp'
      ? currentAsset.webp
      : assetMode === 'png'
        ? currentAsset.png
        : 'AntGuideSvg fallback';
  const cardsActive = state === 'discovering' || state === 'recommending';

  return (
    <main className="agent-guide-playground">
      <div className="agent-guide-playground__shell">
        <aside className="agent-guide-playground__panel">
          <div>
            <h1>AntGuide Playground</h1>
            <p>用于检查 FitMeet Agent 状态型小蚁助手的状态、目标和动效边界。</p>
          </div>

          <div className="agent-guide-playground__control">
            <label htmlFor="ant-size">尺寸</label>
            <select
              id="ant-size"
              value={size}
              onChange={(event) => setSize(event.target.value as 'sm' | 'md' | 'lg')}
            >
              <option value="sm">sm</option>
              <option value="md">md</option>
              <option value="lg">lg</option>
            </select>
          </div>

          <div className="agent-guide-playground__control">
            <label htmlFor="ant-target">目标</label>
            <select
              id="ant-target"
              value={target ?? 'none'}
              onChange={(event) => {
                const next = targets.find((item) => (item.value ?? 'none') === event.target.value);
                setTarget(next?.value ?? null);
              }}
            >
              {targets.map((item) => (
                <option key={item.value ?? 'none'} value={item.value ?? 'none'}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="agent-guide-playground__control">
            <label>状态</label>
            <div className="agent-guide-playground__state-grid">
              {states.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={clsx(item === state && 'is-active')}
                  onClick={() => setState(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <label className="agent-guide-playground__toggle">
            <input
              type="checkbox"
              checked={interactive}
              onChange={(event) => setInteractive(event.target.checked)}
            />
            开启鼠标跟随
          </label>
          <label className="agent-guide-playground__toggle">
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(event) => setReducedMotion(event.target.checked)}
            />
            模拟 reduced motion
          </label>
          <label className="agent-guide-playground__toggle">
            <input
              type="checkbox"
              checked={overrideCopy}
              onChange={(event) => setOverrideCopy(event.target.checked)}
            />
            覆写默认文案
          </label>
          <label className="agent-guide-playground__toggle">
            <input
              type="checkbox"
              checked={forceSvgFallback}
              onChange={(event) => setForceSvgFallback(event.target.checked)}
            />
            强制 SVG fallback
          </label>
          <label className="agent-guide-playground__toggle">
            <input
              type="checkbox"
              checked={simulateWebpFailure}
              onChange={(event) => setSimulateWebpFailure(event.target.checked)}
            />
            模拟 WebP 加载失败
          </label>
          <label className="agent-guide-playground__toggle">
            <input
              type="checkbox"
              checked={simulatePngFailure}
              onChange={(event) => setSimulatePngFailure(event.target.checked)}
            />
            模拟 PNG 加载失败
          </label>

          <div className="agent-guide-playground__asset-status" aria-live="polite">
            <strong>当前资产状态</strong>
            <span>state: {state}</span>
            <span>size: {size}</span>
            <span>target: {target ?? 'none'}</span>
            <span>mode: {assetMode}</span>
            <code>{currentAssetPath}</code>
          </div>
        </aside>

        <section className="agent-guide-playground__stage" aria-label="AntGuide 状态演示">
          <div className="agent-guide-playground__hero">
            <AntGuideAssetDebugProvider value={assetDebugValue}>
              <AntGuide
                state={state}
                size={size}
                target={target}
                interactive={interactive}
                reducedMotion={reducedMotion}
                copy={copy}
              />
            </AntGuideAssetDebugProvider>
            <div>
              <strong>{ANT_GUIDE_COPY[state].title}</strong>
              <p>{ANT_GUIDE_COPY[state].description}</p>
            </div>
          </div>

          <div className="agent-guide-playground__input">
            <span>今晚想找人散步，不要太远，先站内聊</span>
            <button
              type="button"
              className={clsx(state === 'confirming' && 'is-active')}
              onMouseEnter={() => setTarget('confirmButton')}
            >
              确认执行
            </button>
          </div>

          <div className="agent-guide-playground__cards" aria-label="模拟推荐卡片">
            {recommendationCards.map(([title, description]) => (
              <article
                key={title}
                className={clsx('agent-guide-playground__card', cardsActive && 'is-active')}
                onMouseEnter={() => setTarget('recommendation')}
              >
                <i aria-hidden="true" />
                <strong>{title}</strong>
                <span>{description}</span>
              </article>
            ))}
          </div>

          <section
            className={clsx(
              'agent-guide-playground__safety',
              state === 'reminding' && 'is-active',
            )}
            onMouseEnter={() => setTarget('safetyCard')}
          >
            <strong>安全提醒</strong>
            <span>第一次见面建议选择公共场所，并先在站内聊几句。</span>
          </section>
        </section>
      </div>
    </main>
  );
}
