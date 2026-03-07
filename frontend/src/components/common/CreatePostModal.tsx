import { memo, useState, useCallback, useRef } from 'react';
import { CATEGORIES } from '../../data/mockData';
import { useModalA11y } from '../../hooks/useModalA11y';
import * as dataService from '../../services/dataService';
import { uploadImage } from '../../api/uploadApi';

interface CreatePostModalProps {
  open: boolean;
  onClose: () => void;
}

const SPORTS_TAGS = ['增肌', '减脂', '跑步', '瑜伽', '游泳', '户外', '武术', '球类', 'HIIT', '深蹲', '卧推', '硬拉'];

export const CreatePostModal = memo(function CreatePostModal({ open, onClose }: CreatePostModalProps) {
  const { containerRef, handleBackdropClick } = useModalA11y<HTMLDivElement>({ open, onClose });
  const [type, setType] = useState<'log' | 'meet'>('log');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<{ url: string; width: number; height: number }[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sport, setSport] = useState('gym');
  const [meetTime, setMeetTime] = useState('');
  const [meetLoc, setMeetLoc] = useState('');
  const [meetSlots, setMeetSlots] = useState('4');
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < 5 ? [...prev, tag] : prev
    );
  }, []);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length >= 9) return;

    setUploading(true);
    try {
      // Upload one by one or Promise.all
      // For simplicity let's handle the first file, or iterate
      for (let i = 0; i < files.length; i++) {
        if (images.length + i >= 9) break;
        const file = files[i];
        const result = await uploadImage(file);
        setImages((prev) => [...prev, result]);
      }
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setUploading(false);
      // Reset input so same file can be selected again if needed (though unlikely immediately)
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [images.length]);

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) return;
    setSubmitted(true);

    const postData = {
      title,
      text: content,
      sport,
      tags: selectedTags,
      images, // Pass the uploaded images
      type,
    };

    if (type === 'meet') {
      await dataService.createMeet({
        ...postData,
        description: content,
        time: meetTime,
        loc: meetLoc,
        maxSlots: parseInt(meetSlots, 10) || 4,
      } as Partial<import('../../types').Meet>);
    } else {
      await dataService.createPost(postData as Partial<import('../../types').Post>);
    }

    setTimeout(() => {
      setSubmitted(false);
      setTitle('');
      setContent('');
      setImages([]);
      setSelectedTags([]);
      onClose();
    }, 1200);
  }, [
    content,
    title,
    type,
    sport,
    meetTime,
    meetLoc,
    meetSlots,
    selectedTags,
    images,
    onClose,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center" onClick={handleBackdropClick}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div ref={containerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="发布动态" className="relative w-full max-w-lg mx-4 max-h-[90vh] bg-surface border border-border rounded-2xl shadow-2xl overflow-y-auto outline-none">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-border bg-surface/95 backdrop-blur-sm z-10">
          <button onClick={onClose} className="text-textMuted hover:text-white transition cursor-pointer text-sm">
            取消
          </button>
          <h3 className="font-display font-bold text-white">发布动态</h3>
          <button
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition cursor-pointer ${
              content.trim()
                ? 'bg-lime text-[#09090A] hover:bg-[#d4ff1a]'
                : 'bg-surfaceMuted text-textSofter cursor-not-allowed'
            }`}
            onClick={handleSubmit}
            disabled={!content.trim()}
          >
            {submitted ? '发布中...' : '发布'}
          </button>
        </div>

        {submitted && (
          <div className="absolute inset-0 bg-surface/90 z-20 flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-3">✅</div>
              <div className="text-lg font-display font-bold text-lime">发布成功！</div>
            </div>
          </div>
        )}

        <div className="p-5 space-y-5">
          {/* Type selector */}
          <div className="flex gap-2">
            <button
              className={`flex-1 py-2.5 rounded-xl text-sm font-display font-semibold transition cursor-pointer ${
                type === 'log'
                  ? 'bg-lime/15 text-lime border border-lime/30'
                  : 'bg-surfaceMuted text-textMuted border border-border hover:text-white'
              }`}
              onClick={() => setType('log')}
            >
              📸 健身日记
            </button>
            <button
              className={`flex-1 py-2.5 rounded-xl text-sm font-display font-semibold transition cursor-pointer ${
                type === 'meet'
                  ? 'bg-lime/15 text-lime border border-lime/30'
                  : 'bg-surfaceMuted text-textMuted border border-border hover:text-white'
              }`}
              onClick={() => setType('meet')}
            >
              📍 发起约练
            </button>
          </div>

          {/* Content */}
          <input
            type="text"
            placeholder={type === 'log' ? '添加标题会有更多赞哦~' : '约练活动名称'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-surfaceMuted border border-border rounded-xl px-4 py-3 text-sm text-lime font-bold placeholder:text-textSofter outline-none focus:border-lime/30 transition shadow-sm"
            maxLength={30}
          />

          <textarea
            placeholder={type === 'log' ? '分享你的健身故事...' : '描述一下你的约练计划...'}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-32 bg-surfaceMuted border border-border rounded-xl px-4 py-3 text-sm text-white placeholder:text-textSofter outline-none focus:border-lime/30 resize-none transition"
            maxLength={500}
          />
          <div className="text-right text-[11px] text-textSofter -mt-3">
            {content.length}/500
          </div>

          {/* Image Upload */}
          <div>
            <div className="text-[11px] text-textSofter font-mono mb-2">📷 添加图片 ({images.length}/9)</div>
            <div className="flex flex-wrap gap-2">
              <input
                 type="file"
                 ref={fileInputRef}
                 className="hidden"
                 accept="image/*"
                 multiple
                 onChange={handleImageUpload}
              />
              {images.map((imgObj, i) => (
                <div
                  key={i}
                  className="w-16 h-16 rounded-lg bg-surfaceMuted border border-border flex items-center justify-center text-2xl relative group overflow-hidden"
                >
                  <img src={imgObj.url} alt="uploaded" className="w-full h-full object-cover" />
                  <button
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer"
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {images.length < 9 && (
                <button
                  className="w-16 h-16 rounded-lg border border-dashed border-border hover:border-lime/30 flex items-center justify-center text-textSofter hover:text-lime transition cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <span className="text-xs">...</span> : <span className="text-xl">+</span>}
                </button>
              )}
            </div>
          </div>

          {/* Sport Category */}
          <div>
            <div className="text-[11px] text-textSofter font-mono mb-2">🏷️ 运动类型</div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                <button
                  key={cat.id}
                  className={`px-3 py-1.5 rounded-full text-xs font-display font-semibold transition cursor-pointer ${
                    sport === cat.id
                      ? 'bg-lime/15 text-lime border border-lime/30'
                      : 'bg-surfaceMuted text-textMuted border border-border hover:text-white'
                  }`}
                  onClick={() => setSport(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <div className="text-[11px] text-textSofter font-mono mb-2">🏷️ 添加标签 (最多5个)</div>
            <div className="flex flex-wrap gap-2">
              {SPORTS_TAGS.map((tag) => (
                <button
                  key={tag}
                  className={`px-3 py-1 rounded-full text-xs font-mono transition cursor-pointer ${
                    selectedTags.includes(tag)
                      ? 'bg-lime/15 text-lime border border-lime/30'
                      : 'bg-surfaceMuted text-textMuted border border-border hover:text-white'
                  }`}
                  onClick={() => toggleTag(tag)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>

          {/* Meet-specific fields */}
          {type === 'meet' && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="text-[11px] text-textSofter font-mono mb-1">📍 约练信息</div>
              <input
                type="text"
                placeholder="约练时间，如：今晚 19:30"
                value={meetTime}
                onChange={(e) => setMeetTime(e.target.value)}
                className="w-full bg-surfaceMuted border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-textSofter outline-none focus:border-lime/30"
              />
              <input
                type="text"
                placeholder="约练地点"
                value={meetLoc}
                onChange={(e) => setMeetLoc(e.target.value)}
                className="w-full bg-surfaceMuted border border-border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-textSofter outline-none focus:border-lime/30"
              />
              <div className="flex items-center gap-3">
                <span className="text-xs text-textMuted">最多人数</span>
                <input
                  type="number"
                  value={meetSlots}
                  onChange={(e) => setMeetSlots(e.target.value)}
                  min="1"
                  max="20"
                  className="w-20 bg-surfaceMuted border border-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-lime/30 text-center"
                />
                <span className="text-xs text-textSofter">人</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
