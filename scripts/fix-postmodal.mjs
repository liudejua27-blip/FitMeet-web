import { readFileSync, writeFileSync } from 'fs';

const file = 'c:/Users/86152/fitness-app/frontend/src/components/common/CreatePostModal.tsx';
const content = readFileSync(file, 'utf8');

// Find where the JSX return starts
const cutMarker = `  if (!open) return null;`;
const cutIndex = content.indexOf(cutMarker);
if (cutIndex === -1) { console.error('Marker not found!'); process.exit(1); }

const head = content.slice(0, cutIndex);

const newJSX = `  if (!open) return null;

  const typeConfig: Record<PublishType, { icon: string; label: string; desc: string }> = {
    log: { icon: '📝', label: '运动日志', desc: '记录训练成果、分享心得' },
    meet: { icon: '🤝', label: '发起约练', desc: '招募运动搭子一起练' },
    help: { icon: '🆘', label: '求助', desc: '寻求建议、陪伴或器材帮助' },
  };

  const stepLabels = ['类型 & 标题', '内容 & 图片', '位置 & 标签'];

  const canNext1 = true;
  const canNext2 = content.trim().length > 0;
  const canSubmit = content.trim().length > 0 && !!selectedPlace;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" onClick={handleBackdropClick}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        ref={containerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="发布内容"
        className="relative mx-0 w-full max-w-xl sm:mx-4 sm:rounded-2xl overflow-hidden bg-white shadow-2xl outline-none"
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e5ddd5] px-5 py-4">
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-[#76543e] transition hover:bg-[#f5f0eb] hover:text-[#1a1208]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
          <div className="text-center">
            <h3 className="text-base font-black text-[#1a1208]">发布内容</h3>
            <p className="text-xs text-[#8b6a54]">步骤 {step} / 3 — {stepLabels[step - 1]}</p>
          </div>
          <div className="w-8" />
        </div>

        {/* Step progress */}
        <div className="flex h-1.5 w-full">
          {[1, 2, 3].map((s) => (
            <div key={s} className={\`flex-1 transition-all \${s <= step ? 'bg-lime' : 'bg-[#e5ddd5]'}\`} style={{ marginRight: s < 3 ? 2 : 0 }} />
          ))}
        </div>

        {/* Success overlay */}
        {submitted && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/95">
            <div className="text-center">
              <div className="mb-3 text-5xl">✅</div>
              <div className="text-lg font-black text-lime">发布成功！</div>
              <p className="mt-1 text-sm text-[#76543e]">你的内容已发布</p>
            </div>
          </div>
        )}

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(92vh - 130px)' }}>
          {submitError && (
            <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{submitError}</div>
          )}

          {/* Step 1: Type + Title */}
          {step === 1 && (
            <div className="p-5 space-y-5">
              <div>
                <div className="mb-3 text-xs font-black text-[#5a3d2b]">选择发布类型</div>
                <div className="grid grid-cols-3 gap-3">
                  {(Object.entries(typeConfig) as [PublishType, typeof typeConfig[PublishType]][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setType(key)}
                      className={\`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition \${
                        type === key
                          ? 'border-lime bg-lime/5 shadow-sm'
                          : 'border-[#e5ddd5] hover:border-lime/40 hover:bg-[#f9f6f3]'
                      }\`}
                    >
                      <span className="text-3xl">{cfg.icon}</span>
                      <span className={\`text-sm font-black \${type === key ? 'text-lime' : 'text-[#1a1208]'}\`}>{cfg.label}</span>
                      <span className="text-center text-[11px] leading-relaxed text-[#8b6a54]">{cfg.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-black text-[#5a3d2b]">
                  {type === 'meet' ? '约练活动名称' : type === 'help' ? '求助标题' : '添加标题（可选）'}
                </label>
                <input
                  type="text"
                  placeholder={
                    type === 'meet' ? '如：周末早起跑步5K，有人吗？' :
                    type === 'help' ? '如：求一位会看器械姿势的伙伴' :
                    '好标题会让更多人看到你的动态~'
                  }
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-xl border border-[#e5ddd5] bg-[#faf7f4] px-4 py-3 text-sm text-[#1a1208] outline-none transition placeholder:text-[#b09580] focus:border-lime/40 focus:bg-white"
                  maxLength={30}
                />
                <div className="mt-1 text-right text-[11px] text-[#b09580]">{title.length}/30</div>
              </div>

              {type === 'meet' && (
                <div>
                  <label className="mb-1.5 block text-xs font-black text-[#5a3d2b]">约练时间</label>
                  <input
                    type="text"
                    placeholder="如：今晚 19:30 或 周六 10:00"
                    value={meetTime}
                    onChange={(event) => setMeetTime(event.target.value)}
                    className="w-full rounded-xl border border-[#e5ddd5] bg-[#faf7f4] px-4 py-3 text-sm text-[#1a1208] outline-none transition placeholder:text-[#b09580] focus:border-lime/40 focus:bg-white"
                  />
                </div>
              )}
            </div>
          )}

          {/* Step 2: Content + Images */}
          {step === 2 && (
            <div className="p-5 space-y-5">
              <div>
                <label className="mb-1.5 block text-xs font-black text-[#5a3d2b]">
                  {type === 'meet' ? '活动详情' : type === 'help' ? '说清楚你的需求' : '分享内容'}
                  <span className="ml-1 font-normal text-red-400">*</span>
                </label>
                <textarea
                  placeholder={
                    type === 'meet' ? '描述你的约练计划、强度要求、联系方式...' :
                    type === 'help' ? '说清楚你需要什么帮助、时间和地点...' :
                    '分享你的健身故事、训练总结...'
                  }
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  className="h-36 w-full resize-none rounded-xl border border-[#e5ddd5] bg-[#faf7f4] px-4 py-3 text-sm text-[#1a1208] outline-none transition placeholder:text-[#b09580] focus:border-lime/40 focus:bg-white"
                  maxLength={500}
                />
                <div className="mt-1 flex items-center justify-between">
                  <span className={\`text-xs \${content.length > 400 ? 'text-orange-500' : 'text-[#b09580]'}\`}>{content.length > 0 ? \`\${content.length} 字\` : '最多500字'}</span>
                  <span className="text-[11px] text-[#b09580]">{content.length}/500</span>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-black text-[#5a3d2b]">添加图片 <span className="font-normal text-[#b09580]">（选填，最多9张）</span></div>
                <div className="flex flex-wrap gap-2">
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
                  {images.map((imgObj, index) => (
                    <div key={imgObj.url} className="group relative h-20 w-20 overflow-hidden rounded-xl border border-[#e5ddd5]">
                      <img src={imgObj.url} alt="uploaded" className="h-full w-full object-cover" />
                      <button
                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100"
                        onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== index))}
                      >
                        <span className="text-xs font-black text-white">删除</span>
                      </button>
                    </div>
                  ))}
                  {images.length < 9 && (
                    <button
                      className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#d5c9be] text-[#b09580] transition hover:border-lime/40 hover:text-lime"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? <span className="text-xs">上传中...</span> : <><span className="text-2xl leading-none">+</span><span className="text-[11px]">添加</span></>}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Location + Tags */}
          {step === 3 && (
            <div className="p-5 space-y-5">
              {/* Location - Full width, prominent */}
              <div className="rounded-2xl border border-[#e5ddd5] bg-[#faf7f4] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lime text-white text-xs">📍</span>
                    <span className="text-sm font-black text-[#1a1208]">发布位置 <span className="text-red-400">*</span></span>
                  </div>
                  <button
                    type="button"
                    disabled={locating}
                    onClick={handleUseCurrentLocation}
                    className="flex items-center gap-1 rounded-lg border border-[#e5ddd5] bg-white px-3 py-1.5 text-xs font-bold text-[#76543e] transition hover:border-lime/40 hover:text-lime disabled:opacity-60"
                  >
                    {locating ? (
                      <><span className="h-3 w-3 animate-spin rounded-full border border-lime border-t-transparent" />定位中...</>
                    ) : (
                      <><span>📡</span>用当前位置</>
                    )}
                  </button>
                </div>
                <LocationPicker
                  value={meetLoc}
                  error={locationError}
                  selectedLocation={selectedPlace?.location ?? null}
                  selectedTitle={selectedPlace?.name}
                  showMap
                  onTextChange={handleLocationTextChange}
                  onPlaceSelect={handlePlaceSelect}
                />
                {selectedPlace && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-lime/20 bg-lime/5 px-3 py-2.5">
                    <span className="mt-0.5 text-lime text-sm">✓</span>
                    <div className="text-xs text-[#5a3d2b]">
                      <span className="font-bold">{selectedPlace.name}</span>
                      {(selectedPlace.district || selectedPlace.address) && (
                        <span className="ml-1 text-[#8b6a54]">· {[selectedPlace.district, selectedPlace.address].filter(Boolean).join(' ')}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Sport type */}
              <div>
                <div className="mb-2 text-xs font-black text-[#5a3d2b]">运动类型</div>
                <div className="flex flex-wrap gap-2">
                  {SPORT_GROUP_OPTIONS.map((cat) => (
                    <button
                      key={cat.id}
                      className={\`rounded-lg border px-3 py-1.5 text-xs font-bold transition \${
                        sport === cat.id
                          ? 'border-lime bg-lime text-white'
                          : 'border-[#e5ddd5] text-[#5a3d2b] hover:border-lime/50 hover:text-lime'
                      }\`}
                      onClick={() => { setSport(cat.id); setSubcategoryId(''); }}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {selectedSport?.subcategories.length ? (
                <div>
                  <div className="mb-2 text-xs font-black text-[#5a3d2b]">细分项目</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedSport.subcategories.map((item) => (
                      <button
                        key={item.id}
                        className={\`rounded-lg border px-3 py-1.5 text-xs font-bold transition \${
                          subcategoryId === item.id
                            ? 'border-lime bg-lime/10 text-lime'
                            : 'border-[#e5ddd5] text-[#5a3d2b] hover:border-lime/50'
                        }\`}
                        onClick={() => setSubcategoryId((current) => (current === item.id ? '' : item.id))}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {sport === 'other' && (
                <div>
                  <label className="mb-1.5 block text-xs font-black text-[#5a3d2b]">自定义运动名称</label>
                  <input
                    type="text"
                    placeholder="如：宠物徒步、飞盘高尔夫"
                    value={customCategoryName}
                    onChange={(event) => setCustomCategoryName(event.target.value)}
                    className="w-full rounded-xl border border-[#e5ddd5] bg-[#faf7f4] px-4 py-3 text-sm text-[#1a1208] outline-none transition placeholder:text-[#b09580] focus:border-lime/40 focus:bg-white"
                    maxLength={20}
                  />
                </div>
              )}

              {/* Tags */}
              <div>
                <div className="mb-2 text-xs font-black text-[#5a3d2b]">添加标签 <span className="font-normal text-[#b09580]">（最多5个）</span></div>
                <div className="flex flex-wrap gap-2">
                  {SPORTS_TAGS.map((tag) => (
                    <button
                      key={tag}
                      className={\`rounded-lg border px-3 py-1.5 text-xs font-bold transition \${
                        selectedTags.includes(tag)
                          ? 'border-lime bg-lime/10 text-lime'
                          : 'border-[#e5ddd5] text-[#5a3d2b] hover:border-lime/50'
                      }\`}
                      onClick={() => toggleTag(tag)}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>

              <LightTagPicker title="场景标签（最多3个）" tags={SCENARIO_TAGS.slice(0, 10)} selected={scenarioTags} onToggle={(tag) => toggleLimitedTag(tag, setScenarioTags)} />
              <LightTagPicker title="装备标签（最多3个）" tags={EQUIPMENT_TAGS.slice(0, 10)} selected={equipmentTags} onToggle={(tag) => toggleLimitedTag(tag, setEquipmentTags)} />

              {type === 'meet' && (
                <div className="rounded-2xl border border-[#e5ddd5] bg-[#faf7f4] p-4">
                  <div className="mb-3 text-xs font-black text-[#5a3d2b]">约练参数</div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-[#76543e]">最多人数</label>
                    <input
                      type="number"
                      value={meetSlots}
                      onChange={(event) => setMeetSlots(event.target.value)}
                      min="1"
                      max="20"
                      className="w-20 rounded-xl border border-[#e5ddd5] bg-white px-3 py-2 text-center text-sm text-[#1a1208] outline-none focus:border-lime/40"
                    />
                    <span className="text-xs text-[#b09580]">人</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer navigation */}
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
                disabled={step === 2 && !canNext2}
                className="flex h-11 items-center gap-1.5 rounded-xl bg-lime px-5 text-sm font-black text-white transition hover:bg-[#e55f00] disabled:cursor-not-allowed disabled:bg-[#e5ddd5] disabled:text-[#a09080]"
              >
                下一步
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitted}
                className="flex h-11 items-center gap-2 rounded-xl bg-lime px-6 text-sm font-black text-white transition hover:bg-[#e55f00] disabled:cursor-not-allowed disabled:bg-[#e5ddd5] disabled:text-[#a09080]"
              >
                {submitted ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />发布中...</>
                ) : (
                  <>发布<svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

const LightTagPicker = memo(function LightTagPicker({
  onToggle,
  selected,
  tags,
  title,
}: {
  onToggle: (tag: string) => void;
  selected: string[];
  tags: readonly string[];
  title: string;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-black text-[#5a3d2b]">{title}</div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <button
            key={tag}
            className={\`rounded-lg border px-3 py-1.5 text-xs font-bold transition \${
              selected.includes(tag)
                ? 'border-lime bg-lime/10 text-lime'
                : 'border-[#e5ddd5] text-[#5a3d2b] hover:border-lime/50'
            }\`}
            onClick={() => onToggle(tag)}
          >
            #{tag}
          </button>
        ))}
      </div>
    </div>
  );
});
`;

const newContent = head + newJSX;
writeFileSync(file, newContent, 'utf8');
console.log(`Done! File now has ${newContent.split('\n').length} lines.`);
