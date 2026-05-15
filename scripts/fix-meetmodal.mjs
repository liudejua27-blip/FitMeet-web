import { readFileSync, writeFileSync } from 'fs';

const file = 'c:/Users/86152/fitness-app/frontend/src/components/meet/CreateMeetModal.tsx';
const content = readFileSync(file, 'utf8');

const cutMarker = `  if (!open) return null;`;
const cutIndex = content.indexOf(cutMarker);
if (cutIndex === -1) { console.error('Marker not found!'); process.exit(1); }

// Also add step state after [locating, setLocating]
let head = content.slice(0, cutIndex);
head = head.replace(
  `  const [locating, setLocating] = useState(false);`,
  `  const [locating, setLocating] = useState(false);
  const [step, setStep] = useState(1);`
);

const newJSX = `  if (!open) return null;

  const stepLabels = ['基本信息', '时间 & 地点', '详情设置'];

  const canNext1 = form.title.trim().length > 0;
  const hasLocation = Number.isFinite(form.lat) && Number.isFinite(form.lng);
  const canNext2 = !!form.time && hasLocation;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="发起约练"
        className="relative mx-0 w-full max-w-xl sm:mx-4 sm:rounded-2xl overflow-hidden bg-white shadow-2xl outline-none"
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e5ddd5] px-5 py-4">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#76543e] transition hover:bg-[#f5f0eb] hover:text-[#1a1208]"
            onClick={onClose}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
          <div className="text-center">
            <h3 className="text-base font-black text-[#1a1208]">发起约练</h3>
            <p className="text-xs text-[#8b6a54]">步骤 {step} / 3 — {stepLabels[step - 1]}</p>
          </div>
          <div className="w-8" />
        </div>

        {/* Progress bar */}
        <div className="flex h-1.5 w-full">
          {[1, 2, 3].map((s) => (
            <div key={s} className={\`flex-1 transition-all \${s <= step ? 'bg-lime' : 'bg-[#e5ddd5]'}\`} style={{ marginRight: s < 3 ? 2 : 0 }} />
          ))}
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(92vh - 130px)' }}>
          {clubContext && (
            <div className="mx-5 mt-4 rounded-xl border border-lime/20 bg-lime/5 px-4 py-2.5 text-xs font-bold text-lime">
              发布到「{clubContext.clubName}」· {clubContext.city}
            </div>
          )}

          {/* Step 1: Title + Sport + CreatorType */}
          {step === 1 && (
            <div className="p-5 space-y-5">
              <div>
                <label className="mb-1.5 block text-xs font-black text-[#5a3d2b]">约练标题 <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  placeholder="如：今晚望京深蹲约练，求搭子"
                  value={form.title}
                  maxLength={50}
                  onChange={(event) => updateField('title', event.target.value)}
                  className="w-full rounded-xl border border-[#e5ddd5] bg-[#faf7f4] px-4 py-3 text-sm text-[#1a1208] outline-none transition placeholder:text-[#b09580] focus:border-lime/40 focus:bg-white"
                />
                {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
                <div className="mt-1 text-right text-[11px] text-[#b09580]">{form.title.length}/50</div>
              </div>

              <div>
                <div className="mb-2 text-xs font-black text-[#5a3d2b]">运动类型</div>
                <div className="flex flex-wrap gap-2">
                  {SPORT_GROUP_OPTIONS.map((item) => (
                    <button
                      key={item.id}
                      className={\`rounded-lg border px-3 py-1.5 text-xs font-bold transition \${
                        form.type === item.id
                          ? 'border-lime bg-lime text-white'
                          : 'border-[#e5ddd5] text-[#5a3d2b] hover:border-lime/50 hover:text-lime'
                      }\`}
                      onClick={() => handleSportChange(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.type === 'other' && (
                <div>
                  <label className="mb-1.5 block text-xs font-black text-[#5a3d2b]">自定义运动名称</label>
                  <input
                    type="text"
                    placeholder="如：宠物徒步、飞盘高尔夫"
                    value={form.customCategoryName || ''}
                    maxLength={20}
                    onChange={(event) => updateField('customCategoryName', event.target.value)}
                    className="w-full rounded-xl border border-[#e5ddd5] bg-[#faf7f4] px-4 py-3 text-sm text-[#1a1208] outline-none transition placeholder:text-[#b09580] focus:border-lime/40 focus:bg-white"
                  />
                  {errors.customCategoryName && <p className="mt-1 text-xs text-red-500">{errors.customCategoryName}</p>}
                </div>
              )}

              <div>
                <div className="mb-2 text-xs font-black text-[#5a3d2b]">约练模式</div>
                <div className="grid grid-cols-3 gap-3">
                  {creatorTypes.map((item) => (
                    <button
                      key={item.id}
                      className={\`rounded-xl border-2 py-3 text-xs font-black transition \${
                        form.creatorType === item.id
                          ? 'border-lime bg-lime/5 text-lime'
                          : 'border-[#e5ddd5] text-[#5a3d2b] hover:border-lime/40'
                      }\`}
                      onClick={() => updateField('creatorType', item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Time + Location */}
          {step === 2 && (
            <div className="p-5 space-y-5">
              <div>
                <label className="mb-1.5 block text-xs font-black text-[#5a3d2b]">约练时间 <span className="text-red-400">*</span></label>
                <input
                  type="datetime-local"
                  value={form.time}
                  onChange={(event) => updateField('time', event.target.value)}
                  className="w-full rounded-xl border border-[#e5ddd5] bg-[#faf7f4] px-4 py-3 text-sm text-[#1a1208] outline-none transition focus:border-lime/40 focus:bg-white"
                />
                {errors.time && <p className="mt-1 text-xs text-red-500">{errors.time}</p>}
              </div>

              {/* Location - full width prominent */}
              <div className="rounded-2xl border border-[#e5ddd5] bg-[#faf7f4] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lime text-xs text-white">📍</span>
                      <span className="text-sm font-black text-[#1a1208]">约练地点 <span className="text-red-400">*</span></span>
                    </div>
                    <p className="mt-1 text-xs text-[#8b6a54]">搜索高德 POI 或使用当前位置</p>
                  </div>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-lg border border-[#e5ddd5] bg-white px-3 py-1.5 text-xs font-bold text-[#76543e] transition hover:border-lime/40 hover:text-lime disabled:opacity-60"
                    disabled={locating}
                    onClick={handleUseCurrentLocation}
                  >
                    {locating ? (
                      <><span className="h-3 w-3 animate-spin rounded-full border border-lime border-t-transparent" />定位中...</>
                    ) : (
                      <><span>📡</span>当前位置</>
                    )}
                  </button>
                </div>

                <LocationPicker
                  value={form.location}
                  error={errors.location}
                  selectedLocation={Number.isFinite(form.lat) && Number.isFinite(form.lng) ? { lat: form.lat as number, lng: form.lng as number } : null}
                  selectedTitle={form.location}
                  showMap
                  onTextChange={handleLocationTextChange}
                  onPlaceSelect={handlePlaceSelect}
                />

                {hasLocation && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-lime/20 bg-lime/5 px-3 py-2.5">
                    <span className="mt-0.5 text-sm text-lime">✓</span>
                    <div className="text-xs text-[#5a3d2b]">
                      <span className="font-bold">{form.location}</span>
                      {form.address && <span className="ml-1 text-[#8b6a54]">· {form.address}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: GroupType + MaxSlots + Level + Desc */}
          {step === 3 && (
            <div className="p-5 space-y-5">
              <div>
                <div className="mb-2 text-xs font-black text-[#5a3d2b]">组队类型</div>
                <div className="grid grid-cols-3 gap-3">
                  {groupTypes.map((item) => (
                    <button
                      key={item.id}
                      className={\`rounded-xl border-2 py-3 text-xs font-black transition \${
                        form.groupType === item.id
                          ? 'border-lime bg-lime/5 text-lime'
                          : 'border-[#e5ddd5] text-[#5a3d2b] hover:border-lime/40'
                      }\`}
                      onClick={() => updateField('groupType', item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-black text-[#5a3d2b]">人数上限</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={form.maxSlots}
                      onChange={(event) => updateField('maxSlots', parseInt(event.target.value, 10) || 1)}
                      className="w-full rounded-xl border border-[#e5ddd5] bg-[#faf7f4] px-4 py-3 text-center text-sm text-[#1a1208] outline-none transition focus:border-lime/40 focus:bg-white"
                    />
                    <span className="shrink-0 text-xs text-[#8b6a54]">人</span>
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-black text-[#5a3d2b]">要求水平</div>
                  <div className="flex flex-col gap-1.5">
                    {LEVEL_FILTERS.map((item) => (
                      <button
                        key={item.id}
                        className={\`rounded-lg border py-1.5 text-xs font-bold transition \${
                          form.level === item.id
                            ? 'border-lime bg-lime/10 text-lime'
                            : 'border-[#e5ddd5] text-[#5a3d2b] hover:border-lime/50'
                        }\`}
                        onClick={() => updateField('level', item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-black text-[#5a3d2b]">活动描述 <span className="font-normal text-[#b09580]">（选填）</span></label>
                <textarea
                  placeholder="描述约练的具体安排、器材需求、联系方式..."
                  value={form.desc}
                  maxLength={500}
                  onChange={(event) => updateField('desc', event.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-[#e5ddd5] bg-[#faf7f4] px-4 py-3 text-sm text-[#1a1208] outline-none transition placeholder:text-[#b09580] focus:border-lime/40 focus:bg-white"
                />
                {errors.desc && <p className="mt-1 text-xs text-red-500">{errors.desc}</p>}
                <div className="mt-1 text-right text-[11px] text-[#b09580]">{form.desc.length}/500</div>
              </div>

              <div className="rounded-xl border border-[#e5ddd5] bg-[#fff8f0] px-4 py-3 text-xs leading-relaxed text-[#76543e]">
                发布后申请者将默认待确认。建议选择公开地点，并在出发前开启行程分享。
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#e5ddd5] bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="flex h-11 items-center gap-1.5 rounded-xl border border-[#e5ddd5] px-4 text-sm font-bold text-[#76543e] transition hover:border-[#c5b9ae] hover:text-[#1a1208]"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                上一步
              </button>
            )}
            <div className="flex flex-1 items-center justify-center gap-1.5">
              {[1, 2, 3].map((s) => (
                <div key={s} className={\`h-2 rounded-full transition-all \${s === step ? 'w-6 bg-lime' : s < step ? 'w-2 bg-lime/40' : 'w-2 bg-[#e5ddd5]'}\`} />
              ))}
            </div>
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 1 && !canNext1}
                className="flex h-11 items-center gap-1.5 rounded-xl bg-lime px-5 text-sm font-black text-white transition hover:bg-[#e55f00] disabled:cursor-not-allowed disabled:bg-[#e5ddd5] disabled:text-[#a09080]"
              >
                下一步
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="flex h-11 items-center gap-2 rounded-xl bg-lime px-6 text-sm font-black text-white transition hover:bg-[#e55f00]"
              >
                发布约练
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

const FormField = memo(function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: import('react').ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-black text-[#5a3d2b]">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});
`;

const newContent = head + newJSX;
writeFileSync(file, newContent, 'utf8');
console.log(`Done! File now has ${newContent.split('\n').length} lines.`);
