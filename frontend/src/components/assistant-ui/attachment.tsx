import { AttachmentPrimitive, useAui, useAuiState } from '@assistant-ui/react';
import { CheckCircle2, FileVideo, ImageIcon, Loader2, RotateCcw, X, XCircle } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { cn } from '../../lib/utils';
import { uploadProgressStore, useUploadProgress } from './upload-progress-store';

export function ChatGPTAttachment() {
  const aui = useAui();
  const id = useAuiState((state) => state.attachment.id);
  const name = useAuiState((state) => state.attachment.name);
  const contentType = useAuiState((state) => state.attachment.contentType);
  const file = useAuiState((state) => state.attachment.file);
  const content = useAuiState((state) => state.attachment.content);
  const snapshot = useUploadProgress(id);
  const isComposer = aui.attachment.source === 'composer';
  const effectiveSnapshot =
    !isComposer && snapshot.status === 'queued'
      ? ({ status: 'uploaded', percent: 100 } as const)
      : snapshot;
  const isVideo = contentType?.startsWith('video/');
  const isImage = contentType?.startsWith('image/');
  const localPreviewUrl = useMemo(() => {
    if (!file || (!isImage && !isVideo) || typeof URL === 'undefined') {
      return null;
    }
    return URL.createObjectURL(file);
  }, [file, isImage, isVideo]);
  const remotePreviewUrl = useMemo(() => previewUrlFromContent(content), [content]);
  const previewUrl = localPreviewUrl ?? remotePreviewUrl;
  const progress =
    effectiveSnapshot.status === 'uploading' && effectiveSnapshot.percent !== null
      ? Math.min(100, Math.max(0, Math.round(effectiveSnapshot.percent)))
      : null;
  const failed = effectiveSnapshot.status === 'failed';

  useEffect(() => {
    if (!localPreviewUrl || typeof URL === 'undefined') return undefined;
    return () => {
      URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  return (
    <AttachmentPrimitive.Root
      className={cn(
        'group/attachment relative overflow-hidden rounded-2xl border bg-[#f7f7f8] text-sm transition-colors',
        previewUrl && isImage
          ? 'max-w-36 p-1.5'
          : 'flex max-w-[280px] items-center gap-2 px-2.5 py-2',
        failed ? 'border-red-200 bg-red-50/70' : 'border-black/[0.06]',
      )}
      data-testid="assistant-ui-attachment"
    >
      {previewUrl && isImage ? (
        <div className="relative">
          <img
            src={previewUrl}
            alt={name ? `${name} 预览` : '图片附件预览'}
            className="h-28 w-28 rounded-xl object-cover"
          />
          <AttachmentStatusOverlay
            failed={failed}
            progress={progress}
            status={effectiveSnapshot.status}
          />
        </div>
      ) : (
        <>
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#52525b]',
              failed ? 'bg-white text-red-600' : isVideo ? 'bg-[#18181b] text-white' : 'bg-white',
            )}
          >
            {isImage ? (
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
            ) : isVideo ? (
              <FileVideo className="h-4 w-4" aria-hidden="true" />
            ) : (
              <XCircle className="h-4 w-4" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-[#18181b]">{name}</p>
            <div className="mt-1 flex items-center gap-1.5">
              <StatusGlyph status={effectiveSnapshot.status} />
              <p className={cn('text-[11px]', failed ? 'text-red-600' : 'text-[#71717a]')}>
                {progress !== null
                  ? `上传中 ${progress}%`
                  : uploadStatusText(effectiveSnapshot.status, isComposer)}
              </p>
            </div>
            {isVideo ? (
              <p className="mt-0.5 truncate text-[10px] text-[#8a8f98]">视频附件</p>
            ) : null}
          </div>
        </>
      )}
      {progress !== null ? (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black/[0.06]">
          <span
            className="block h-full bg-[#0d0d0d] transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </span>
      ) : null}
      {failed && isComposer ? (
        <button
          type="button"
          className={cn(
            'rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-red-600 ring-1 ring-red-100 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200',
            previewUrl && isImage ? 'absolute bottom-2 left-2' : 'mr-5',
          )}
          aria-label={`重试上传附件 ${name}`}
          onClick={() => uploadProgressStore.retry(id)}
        >
          重试
        </button>
      ) : failed ? (
        <span
          className={cn(
            'rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-red-600 ring-1 ring-red-100',
            previewUrl && isImage ? 'absolute bottom-2 left-2' : 'mr-5',
          )}
        >
          上传失败
        </span>
      ) : null}
      {isComposer ? (
        <AttachmentPrimitive.Remove asChild>
          <button
            type="button"
            className={cn(
              'absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-[#71717a] shadow-sm ring-1 ring-black/[0.06] transition-opacity hover:text-[#18181b] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15',
              failed ? 'opacity-100 text-red-600 hover:text-red-700' : 'opacity-0 group-hover/attachment:opacity-100',
            )}
            aria-label={
              failed
                ? `移除失败附件 ${name}`
                : `移除附件 ${name}`
            }
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </AttachmentPrimitive.Remove>
      ) : null}
    </AttachmentPrimitive.Root>
  );
}

function AttachmentStatusOverlay({
  failed,
  progress,
  status,
}: {
  failed: boolean;
  progress: number | null;
  status: ReturnType<typeof useUploadProgress>['status'];
}) {
  if (!failed && progress === null) return null;
  return (
    <div className="absolute inset-x-1.5 bottom-1.5 rounded-lg bg-black/55 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
      <span className="inline-flex items-center gap-1.5">
        <StatusGlyph status={status} />
        {failed ? '上传失败' : `上传中 ${progress}%`}
      </span>
    </div>
  );
}

function StatusGlyph({ status }: { status: ReturnType<typeof useUploadProgress>['status'] }) {
  if (status === 'uploading' || status === 'retrying') {
    return <Loader2 className="h-3 w-3 animate-spin text-[#71717a]" aria-hidden="true" />;
  }
  if (status === 'uploaded') {
    return <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden="true" />;
  }
  if (status === 'failed') {
    return <RotateCcw className="h-3 w-3 text-red-600" aria-hidden="true" />;
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-[#a1a1aa]" aria-hidden="true" />;
}

function uploadStatusText(status: ReturnType<typeof useUploadProgress>['status'], isComposer: boolean) {
  switch (status) {
    case 'queued':
      return isComposer ? '等待发送时上传' : '已附加';
    case 'uploading':
      return '上传中';
    case 'uploaded':
      return isComposer ? '已上传' : '已附加';
    case 'failed':
      return '上传失败';
    case 'retrying':
      return '重试中';
    case 'cancelled':
      return '已取消';
    default:
      return '等待中';
  }
}

function previewUrlFromContent(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    if (!isRecord(part)) continue;
    const image = typeof part.image === 'string' ? part.image : '';
    if (image) return image;
    const data = typeof part.data === 'string' ? part.data : '';
    const mimeType = typeof part.mimeType === 'string' ? part.mimeType : '';
    if (data && mimeType.startsWith('image/')) return data;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
