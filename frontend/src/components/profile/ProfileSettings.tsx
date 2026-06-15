import { memo, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { UserProfile } from '../../types';
import * as dataService from '../../services/dataService';
import type { EmergencyContact, VerificationRequest } from '../../api/client';

interface ProfileSettingsProps {
  profile: UserProfile;
  onVerificationApproved?: () => Promise<void>;
}

export const ProfileSettings = memo(function ProfileSettings({
  profile,
  onVerificationApproved,
}: ProfileSettingsProps) {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [verifications, setVerifications] = useState<VerificationRequest[]>([]);
  const [realName, setRealName] = useState('');
  const [idNumberMasked, setIdNumberMasked] = useState('');
  const [certName, setCertName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRelation, setContactRelation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<'realName' | 'coach' | 'contact' | 'deleteContact' | null>(
    null,
  );

  const refreshSafety = useCallback(async () => {
    const [nextContacts, nextVerifications] = await Promise.all([
      dataService.getEmergencyContacts().catch(() => []),
      dataService.getMyVerificationRequests().catch(() => []),
    ]);
    setContacts(nextContacts);
    setVerifications(nextVerifications);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refreshSafety);
  }, [refreshSafety]);

  const submitRealName = useCallback(async () => {
    if (!realName.trim() || !idNumberMasked.trim()) {
      setMessage('请填写姓名和证件尾号');
      return;
    }
    try {
      setSaving('realName');
      setError('');
      const request = await dataService.createVerificationRequest({
        type: 'real_name',
        realName,
        idNumberMasked,
      });
      setRealName('');
      setIdNumberMasked('');
      setMessage(request.status === 'approved' ? '实名认证已通过' : '实名认证申请已提交');
      await refreshSafety();
      if (request.status === 'approved') {
        await onVerificationApproved?.();
      }
    } catch {
      setError('实名认证提交失败，请稍后重试。');
    } finally {
      setSaving(null);
    }
  }, [idNumberMasked, onVerificationApproved, realName, refreshSafety]);

  const submitCoach = useCallback(async () => {
    if (!certName.trim()) {
      setMessage('请填写教练资质名称');
      return;
    }
    try {
      setSaving('coach');
      setError('');
      await dataService.createVerificationRequest({
        type: 'coach',
        certName,
      });
      setCertName('');
      setMessage('教练认证申请已提交');
      void refreshSafety();
    } catch {
      setError('教练认证提交失败，请稍后重试。');
    } finally {
      setSaving(null);
    }
  }, [certName, refreshSafety]);

  const addContact = useCallback(async () => {
    if (!contactName.trim() || !contactPhone.trim()) {
      setMessage('请填写紧急联系人姓名和手机号');
      return;
    }
    try {
      setSaving('contact');
      setError('');
      await dataService.addEmergencyContact({
        name: contactName,
        phone: contactPhone,
        relation: contactRelation || '紧急联系人',
      });
      setContactName('');
      setContactPhone('');
      setContactRelation('');
      setMessage('紧急联系人已保存');
      void refreshSafety();
    } catch {
      setError('紧急联系人保存失败，请稍后重试。');
    } finally {
      setSaving(null);
    }
  }, [contactName, contactPhone, contactRelation, refreshSafety]);

  const latestRealName = verifications.find((item) => item.type === 'real_name');
  const latestCoach = verifications.find((item) => item.type === 'coach');
  const realNameStatus =
    profile.verified || latestRealName?.status === 'approved'
      ? '实名认证已通过'
      : latestRealName?.status || '未提交';

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-xl border border-lime/25 bg-lime/10 px-4 py-3 text-sm font-bold text-lime">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
          {error}
        </div>
      )}

      <SettingSection title="安全与认证">
        <SettingStatus label="实名认证" value={realNameStatus} />
        <div className="grid gap-2 px-4 py-3.5 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={realName}
            onChange={(event) => setRealName(event.target.value)}
            placeholder="真实姓名"
            className="rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm outline-none focus:border-lime/30"
          />
          <input
            value={idNumberMasked}
            onChange={(event) => setIdNumberMasked(event.target.value)}
            placeholder="证件后四位"
            className="rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm outline-none focus:border-lime/30"
          />
          <button
            className="rounded-full bg-lime px-4 py-2 text-sm font-bold text-white"
            onClick={submitRealName}
            disabled={saving === 'realName'}
          >
            {saving === 'realName' ? '提交中' : '提交'}
          </button>
        </div>

        <SettingStatus
          label="教练认证"
          value={profile.isCoach ? '已通过' : latestCoach?.status || '未提交'}
        />
        <div className="grid gap-2 px-4 py-3.5 sm:grid-cols-[1fr_auto]">
          <input
            value={certName}
            onChange={(event) => setCertName(event.target.value)}
            placeholder="证书或资质名称"
            className="rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm outline-none focus:border-lime/30"
          />
          <button
            className="rounded-full bg-lime px-4 py-2 text-sm font-bold text-white"
            onClick={submitCoach}
            disabled={saving === 'coach'}
          >
            {saving === 'coach' ? '提交中' : '提交'}
          </button>
        </div>

        <SettingLink icon="!" label="举报与社区规范" to="/community" />
      </SettingSection>

      <SettingSection title="紧急联系人">
        <div className="space-y-2 px-4 py-3.5">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surfaceMuted px-3 py-2"
            >
              <div>
                <div className="text-sm font-bold">{contact.name}</div>
                <div className="text-xs text-textMuted">
                  {contact.relation} · {contact.phone}
                </div>
              </div>
              <button
                className="text-xs font-bold text-red-300"
                disabled={saving === 'deleteContact'}
                onClick={async () => {
                  try {
                    setSaving('deleteContact');
                    setError('');
                    await dataService.deleteEmergencyContact(contact.id);
                    setMessage('紧急联系人已删除');
                    await refreshSafety();
                  } catch {
                    setError('删除紧急联系人失败，请稍后重试。');
                  } finally {
                    setSaving(null);
                  }
                }}
              >
                {saving === 'deleteContact' ? '删除中' : '删除'}
              </button>
            </div>
          ))}

          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              placeholder="姓名"
              className="rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm outline-none focus:border-lime/30"
            />
            <input
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              placeholder="手机号"
              className="rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm outline-none focus:border-lime/30"
            />
            <input
              value={contactRelation}
              onChange={(event) => setContactRelation(event.target.value)}
              placeholder="关系"
              className="rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm outline-none focus:border-lime/30"
            />
          </div>
          <button
            className="rounded-full border border-lime/30 px-4 py-2 text-sm font-bold text-lime transition hover:bg-lime hover:text-white"
            onClick={addContact}
            disabled={saving === 'contact'}
          >
            {saving === 'contact' ? '保存中' : '保存联系人'}
          </button>
        </div>
      </SettingSection>

      <SettingSection title="账号设置">
        <SettingItem label="手机号" value="绑定后可用于短信登录" />
        <SettingItem label="通知设置" value="系统通知、私信和约练提醒" />
        <SettingItem label="隐私设置" value="控制资料、动态和距离展示" />
      </SettingSection>

      <SettingSection title="关于">
        <SettingLink label="用户协议" to="/terms" />
        <SettingLink label="隐私政策" to="/privacy" />
        <SettingLink label="社区规范" to="/community" />
        <SettingItem label="联系我们" value="15253005312@163.com" />
      </SettingSection>
    </div>
  );
});

const SettingSection = memo(function SettingSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-3 font-display text-lg font-bold">{title}</h3>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {children}
      </div>
    </div>
  );
});

const SettingStatus = memo(function SettingStatus({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="flex-1 text-sm font-semibold">{label}</div>
      <span className="rounded-full border border-border px-3 py-1 text-xs text-textMuted">
        {value}
      </span>
    </div>
  );
});

const SettingItem = memo(function SettingItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="flex-1 text-sm font-semibold">{label}</div>
      <span className="text-xs text-textMuted">{value}</span>
    </div>
  );
});

const SettingLink = memo(function SettingLink({
  icon,
  label,
  to,
}: {
  icon?: string;
  label: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex cursor-pointer items-center gap-3 px-4 py-3.5 transition hover:bg-surfaceMuted/50"
    >
      {icon && <span className="text-xl">{icon}</span>}
      <div className="flex-1 text-sm font-semibold">{label}</div>
      <span className="text-xs font-bold text-lime">查看</span>
    </Link>
  );
});
