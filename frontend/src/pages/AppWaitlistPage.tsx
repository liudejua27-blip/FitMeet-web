import { memo, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  waitlistApi,
  type SubmitAppWaitlistInput,
  type WaitlistDeviceType,
  type WaitlistUserRole,
} from '../api/waitlistApi';

const scenarios = [
  '跑步搭子',
  '健身约练',
  '周末活动',
  '附近活动',
  '拍照搭子',
  '教练约课',
  '安全见面',
  'Life Graph 画像同步',
];

const roles: Array<{ value: WaitlistUserRole; label: string }> = [
  { value: 'student', label: '学生' },
  { value: 'white_collar', label: '白领' },
  { value: 'fitness_user', label: '运动用户' },
  { value: 'coach', label: '教练' },
  { value: 'merchant', label: '商家' },
  { value: 'developer', label: '开发者' },
  { value: 'other', label: '其他' },
];

const devices: Array<{ value: WaitlistDeviceType; label: string }> = [
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'both', label: '两者都可以' },
];

const initialForm: SubmitAppWaitlistInput = {
  email: '',
  phone: '',
  country: '中国',
  region: '',
  city: '',
  preferredLanguage: 'zh-CN',
  timezone: 'Asia/Shanghai',
  deviceType: 'ios',
  scenarios: ['跑步搭子'],
  interests: [],
  userRole: 'fitness_user',
  interviewWilling: true,
  inviteCode: '',
  source: 'app_page',
};

export const AppWaitlistPage = memo(function AppWaitlistPage() {
  const [form, setForm] = useState<SubmitAppWaitlistInput>(initialForm);
  const [interestInput, setInterestInput] = useState('跑步, 健身');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{
    deviceType: WaitlistDeviceType;
    scenarios: string[];
    email: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [inviteStatus, setInviteStatus] = useState('');

  useEffect(() => {
    document.title = 'FitMeet App 内测 - 私人生活社交 Agent';
    void waitlistApi.track('app_page_view', { source: 'app_page' }).catch(() => undefined);
  }, []);

  const canSubmit = useMemo(
    () => Boolean(form.email.trim() && form.city.trim() && form.scenarios.length),
    [form.city, form.email, form.scenarios.length],
  );

  const update = <K extends keyof SubmitAppWaitlistInput>(
    key: K,
    value: SubmitAppWaitlistInput[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
    setSuccess(null);
  };

  const toggleScenario = (scenario: string) => {
    const next = form.scenarios.includes(scenario)
      ? form.scenarios.filter((item) => item !== scenario)
      : [...form.scenarios, scenario];
    update('scenarios', next);
    void waitlistApi.track('scenario_selected', { scenario }).catch(() => undefined);
  };

  const validateInvite = async () => {
    const code = form.inviteCode?.trim();
    if (!code) {
      setInviteStatus('');
      return;
    }
    try {
      const result = await waitlistApi.validateInvite(code);
      setInviteStatus(result.valid ? '邀请码有效，会提升内测优先级。' : result.reason || '邀请码不可用。');
    } catch {
      setInviteStatus('邀请码暂时无法校验，不影响提交申请。');
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      setError('请至少填写邮箱、城市和一个核心场景。');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        ...form,
        interests: interestInput
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        phone: form.phone?.trim() || undefined,
        inviteCode: form.inviteCode?.trim() || undefined,
      };
      const result = await waitlistApi.submitApp(payload);
      setSuccess({
        deviceType: result.deviceType,
        scenarios: result.scenarios,
        email: result.email,
      });
    } catch (submitError) {
      setError(friendlyError(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0c0d] text-[#f6efe5]">
      <section className="border-b border-white/10 bg-[#111315] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_480px] lg:items-start">
          <div className="pt-4">
            <h1 className="max-w-4xl text-4xl font-black leading-tight text-white sm:text-6xl">
              FitMeet App 内测
              <span className="block text-[#c8ff80]">招募 100-500 位高质量种子用户</span>
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-[#c9b9a7]">
              App 承担日常使用：定位授权、消息推送、附近机会、语音对话、活动签到和多端 Life Graph 同步。
              网站继续作为 Agent 控制台、画像管理和权限中心。
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <Metric label="核心目标" value="100-500" />
              <Metric label="优先城市" value="青岛 / 一线" />
              <Metric label="验证重点" value="安全闭环" />
            </div>
          </div>

          <form className="rounded-xl border border-white/10 bg-white/[0.045] p-5 shadow-card" onSubmit={submit}>
            <h2 className="text-2xl font-black text-white">加入 App 内测等待名单</h2>
            <p className="mt-2 text-sm leading-7 text-[#a99b8d]">
              我们会优先邀请场景明确、愿意反馈、符合早期城市和运动社交需求的用户。
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Field label="邮箱">
                <input className={inputClass} value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="you@example.com" />
              </Field>
              <Field label="手机号，可选">
                <input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="用于短信通知" />
              </Field>
              <Field label="国家/地区">
                <input className={inputClass} value={form.country} onChange={(event) => update('country', event.target.value)} />
              </Field>
              <Field label="城市">
                <input
                  className={inputClass}
                  value={form.city}
                  onChange={(event) => {
                    update('city', event.target.value);
                    if (event.target.value.trim().length >= 2) {
                      void waitlistApi.track('city_selected', { city: event.target.value.trim() }).catch(() => undefined);
                    }
                  }}
                  placeholder="青岛"
                />
              </Field>
              <Field label="语言">
                <select className={inputClass} value={form.preferredLanguage} onChange={(event) => update('preferredLanguage', event.target.value)}>
                  <option value="zh-CN">中文</option>
                  <option value="en-US">English</option>
                </select>
              </Field>
              <Field label="用户身份">
                <select className={inputClass} value={form.userRole} onChange={(event) => update('userRole', event.target.value as WaitlistUserRole)}>
                  {roles.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-5">
              <p className="text-sm font-black text-white">设备类型</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {devices.map((device) => (
                  <button
                    key={device.value}
                    type="button"
                    className={choiceClass(form.deviceType === device.value)}
                    onClick={() => update('deviceType', device.value)}
                  >
                    {device.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-sm font-black text-white">最想使用的场景</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {scenarios.map((scenario) => (
                  <button
                    key={scenario}
                    type="button"
                    className={choiceClass(form.scenarios.includes(scenario))}
                    onClick={() => toggleScenario(scenario)}
                  >
                    {scenario}
                  </button>
                ))}
              </div>
            </div>

            <Field label="兴趣标签，可选" className="mt-5">
              <input className={inputClass} value={interestInput} onChange={(event) => setInterestInput(event.target.value)} placeholder="跑步, 羽毛球, 健身" />
            </Field>

            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="邀请码，可选">
                <input className={inputClass} value={form.inviteCode} onChange={(event) => update('inviteCode', event.target.value)} onBlur={validateInvite} placeholder="QDU2026" />
              </Field>
              <label className="flex items-end gap-2 rounded-lg border border-white/10 bg-[#0b0c0d] px-3 py-3 text-sm font-bold text-[#dffcf3]">
                <input type="checkbox" checked={form.interviewWilling} onChange={(event) => update('interviewWilling', event.target.checked)} />
                愿意参与访谈
              </label>
            </div>
            {inviteStatus ? <p className="mt-2 text-xs font-bold text-[#8ff0d1]">{inviteStatus}</p> : null}

            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="mt-5 w-full rounded-lg bg-[#c8ff80] px-5 py-3 text-sm font-black text-[#111315] transition hover:bg-[#d7ff9f] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {submitting ? '正在提交' : '加入等待名单'}
            </button>
            {success ? (
              <div className="mt-4 rounded-lg border border-[#18b98f]/30 bg-[#18b98f]/10 px-4 py-3 text-sm font-bold leading-7 text-[#8ff0d1]">
                <p>你已加入 FitMeet App 内测等待名单。</p>
                <p>设备类型：{deviceLabel(success.deviceType)}；核心场景：{success.scenarios.join('、')}。</p>
                <p>如果获得资格，我们会通过邮箱或短信通知你。</p>
              </div>
            ) : null}
            {error ? (
              <p className="mt-4 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-3 text-sm font-bold text-[#ffb4b4]">
                {error}
              </p>
            ) : null}
          </form>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="grid gap-4 md:grid-cols-4">
          {['AI 对话找搭子', '动态 Life Graph', '活动确认与评价', '高风险场景双确认'].map((feature) => (
            <div key={feature} className="rounded-lg border border-white/10 bg-[#151719] p-4">
              <div className="h-2 w-2 rounded-full bg-[#c8ff80]" />
              <h3 className="mt-4 text-base font-black text-white">{feature}</h3>
            </div>
          ))}
        </section>

        <section className="mt-10 rounded-xl border border-white/10 bg-[#151719] p-6">
          <h2 className="text-2xl font-black text-white">上线前最该验证</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            {['一句话需求是否清晰', 'Agent 是否能补全画像', '推荐解释是否可信', '风险动作是否强制确认'].map((item) => (
              <p key={item} className="rounded-lg border border-white/10 bg-[#0f1113] p-4 text-sm font-bold leading-6 text-[#c9b9a7]">{item}</p>
            ))}
          </div>
          <Link to="/life-graph" className="mt-5 inline-flex rounded-lg border border-[#c8ff80]/40 px-4 py-2 text-sm font-black text-[#dfff9f] transition hover:bg-[#c8ff80]/10">
            查看 Life Graph 控制台
          </Link>
        </section>
      </main>
    </div>
  );
});

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-black text-[#8f8174]">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="text-sm font-black text-white">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-white/10 bg-[#0b0c0d] px-3 py-3 text-sm font-bold text-white outline-none transition placeholder:text-[#756c63] focus:border-[#c8ff80]/60';

function choiceClass(active: boolean) {
  return active
    ? 'rounded-lg border border-[#c8ff80]/50 bg-[#c8ff80]/15 px-3 py-2 text-sm font-black text-[#dfff9f]'
    : 'rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-black text-[#c9b9a7]';
}

function deviceLabel(value: WaitlistDeviceType) {
  if (value === 'ios') return 'iOS';
  if (value === 'android') return 'Android';
  return 'iOS 和 Android';
}

function friendlyError(error: unknown) {
  if (error instanceof Error && error.message) {
    if (/^\s*[{[]/.test(error.message) || /stack|trace|exception/i.test(error.message)) {
      return '提交暂时没有成功，请稍后重试。';
    }
    return error.message;
  }
  return '提交暂时没有成功，请稍后重试。';
}

export default AppWaitlistPage;
