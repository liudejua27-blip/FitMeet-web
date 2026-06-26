import { type FormEvent, useState } from 'react';
import { waitlistApi, type WaitlistDeviceType } from '../../../api/waitlistApi';
import { WebsiteSection } from './WebsiteSection';

export function WaitlistSection() {
  const [email, setEmail] = useState('');
  const [deviceType, setDeviceType] = useState<WaitlistDeviceType>('ios');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    try {
      await waitlistApi.submitApp({
        email,
        country: 'China',
        city: 'Shanghai',
        preferredLanguage: 'zh-CN',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        deviceType,
        scenarios: ['agent_social'],
        interests: ['fitmeet_app_beta'],
        userRole: 'fitness_user',
        interviewWilling: true,
        source: 'public_app_preview',
      });
      setEmail('');
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  return (
    <WebsiteSection label="Beta 预约" title="加入第一批移动端体验。" id="waitlist" tone="plain">
      <form className="fm-form" onSubmit={handleSubmit}>
        <label>
          邮箱
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>
        <label>
          设备
          <select
            value={deviceType}
            onChange={(event) => setDeviceType(event.target.value as WaitlistDeviceType)}
          >
            <option value="ios">iOS</option>
            <option value="android">Android</option>
            <option value="both">都可以</option>
          </select>
        </label>
        <button
          className="fm-button fm-button--primary"
          type="submit"
          disabled={status === 'loading'}
        >
          {status === 'loading' ? '提交中' : '预约 Beta'}
        </button>
        <p aria-live="polite">
          {status === 'success' ? '已预约，我们会在 Beta 开放时联系你。' : null}
          {status === 'error' ? '暂时提交失败，请稍后再试。' : null}
        </p>
      </form>
    </WebsiteSection>
  );
}
