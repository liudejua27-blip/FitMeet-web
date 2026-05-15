import { useState } from 'react';
import type {
  PrivacyMode,
  ProofType,
  SubmitProofPayload,
} from '../../api/activitiesApi';

const PROOF_LABEL: Record<ProofType, string> = {
  checkin: '签到',
  mutual_confirm: '双方确认',
  scene_photo: '场景照片',
  selfie_optional: '自拍（可选）',
  qr_code: '活动二维码',
  merchant_confirm: '场地确认',
};

const PRIVACY_LABEL: Record<PrivacyMode, string> = {
  hidden_face: '不露脸',
  scene_only: '仅场景',
  private: '私密',
};

interface Props {
  onMutualConfirm?: () => void | Promise<void>;
  onCheckin?: (locationApprox: string) => void | Promise<void>;
  onSubmit?: (payload: SubmitProofPayload) => void | Promise<void>;
  myConfirmed?: boolean;
  myCheckedIn?: boolean;
  busy?: boolean;
}

const PROOF_OPTIONS: ProofType[] = [
  'scene_photo',
  'qr_code',
  'merchant_confirm',
  'selfie_optional',
];

export function ActivityProofUploader({
  onMutualConfirm,
  onCheckin,
  onSubmit,
  myConfirmed,
  myCheckedIn,
  busy,
}: Props) {
  const [proofType, setProofType] = useState<ProofType>('scene_photo');
  const [photoUrl, setPhotoUrl] = useState('');
  const [note, setNote] = useState('');
  const [locationApprox, setLocationApprox] = useState('');
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>('scene_only');

  return (
    <section className="rounded-2xl bg-[#15150f] border border-[#26261d] p-5 space-y-4">
      <h2 className="text-sm tracking-[0.2em] uppercase text-[#8C8A6E]">
        完成证明
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          disabled={busy || myConfirmed}
          onClick={() => onMutualConfirm?.()}
          className={`px-4 py-3 rounded-xl text-sm border transition ${
            myConfirmed
              ? 'border-[#C8FF80]/60 bg-[#C8FF80]/10 text-[#C8FF80]'
              : 'border-[#26261d] hover:border-[#C8FF80]/50 hover:text-[#C8FF80] text-[#C7C2B0]'
          }`}
        >
          {myConfirmed ? '✓ 我已确认完成' : '双方确认完成'}
        </button>

        <button
          type="button"
          disabled={busy || myCheckedIn}
          onClick={() => onCheckin?.(locationApprox)}
          className={`px-4 py-3 rounded-xl text-sm border transition ${
            myCheckedIn
              ? 'border-sky-400/60 bg-sky-400/10 text-sky-300'
              : 'border-[#26261d] hover:border-sky-400/50 hover:text-sky-300 text-[#C7C2B0]'
          }`}
        >
          {myCheckedIn ? '✓ 已签到' : '签到'}
        </button>
      </div>

      <div className="rounded-xl border border-[#26261d] bg-[#0d0d0b] p-4 space-y-3">
        <div className="text-[10px] uppercase tracking-wider text-[#8C8A6E]">
          上传证明（可选）
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PROOF_OPTIONS.map((pt) => (
            <button
              key={pt}
              type="button"
              onClick={() => setProofType(pt)}
              className={`px-3 py-2 rounded-md text-xs border transition ${
                proofType === pt
                  ? 'border-[#C8FF80] text-[#C8FF80] bg-[#C8FF80]/10'
                  : 'border-[#26261d] text-[#C7C2B0] hover:border-[#6B7A5A]'
              }`}
            >
              {PROOF_LABEL[pt]}
            </button>
          ))}
        </div>

        <input
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          placeholder="照片 URL（可选，不强制露脸）"
          className="w-full bg-[#15150f] border border-[#26261d] rounded-md px-3 py-2 text-sm text-[#F4EFE6] placeholder:text-[#5e5d4a]"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="提交说明"
          className="w-full bg-[#15150f] border border-[#26261d] rounded-md px-3 py-2 text-sm text-[#F4EFE6] placeholder:text-[#5e5d4a]"
        />
        <input
          value={locationApprox}
          onChange={(e) => setLocationApprox(e.target.value)}
          placeholder="大致地点（如：朝阳公园西门附近）"
          className="w-full bg-[#15150f] border border-[#26261d] rounded-md px-3 py-2 text-sm text-[#F4EFE6] placeholder:text-[#5e5d4a]"
        />

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#8C8A6E]">
          <span>隐私模式：</span>
          {(['scene_only', 'hidden_face', 'private'] as PrivacyMode[]).map(
            (pm) => (
              <button
                key={pm}
                type="button"
                onClick={() => setPrivacyMode(pm)}
                className={`px-2 py-1 rounded border transition ${
                  privacyMode === pm
                    ? 'border-[#C8FF80] text-[#C8FF80]'
                    : 'border-[#26261d] hover:border-[#3a3a32]'
                }`}
              >
                {PRIVACY_LABEL[pm]}
              </button>
            ),
          )}
        </div>

        <p className="text-[11px] text-[#5e5d4a] leading-5">
          照片仅用于证明本次活动确实发生，FitMeet 不强制露脸。建议使用「场景」或「不露脸」模式保护隐私。
          <br />
          位置只接受大致区域（如「朝阳公园西门附近」），请勿填写精确经纬度。
          <br />
          提交后状态为「审核中」，由对方在「我的活动」中点击通过/拒绝。
        </p>

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSubmit?.({
              proofType,
              photoUrl: photoUrl || undefined,
              note,
              locationApprox,
              privacyMode,
            })
          }
          className="w-full px-4 py-2 rounded-md bg-[#C8FF80] text-[#0d0d0b] text-sm font-medium hover:bg-[#b8ef70] disabled:opacity-50"
        >
          提交证明
        </button>
      </div>
    </section>
  );
}

export default ActivityProofUploader;
