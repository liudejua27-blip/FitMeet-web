import { AuiIf, ComposerPrimitive, useAuiState } from '@assistant-ui/react';
import {
  ArrowUp,
  LogIn,
  Mic,
  Plus,
  Square,
  X,
} from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '../../lib/utils';
import { ChatGPTAttachment } from './attachment';
import {
  composerPrimaryActionMode,
  type ComposerPrimaryActionMode,
} from './composer-action-mode';
import { TooltipIconButton } from './tooltip-icon-button';
import { type UploadProgressSummary, useUploadProgressSummary } from './upload-progress-store';

type ChatGPTComposerProps = {
  requiresAuth?: boolean;
  onLogin?: () => void;
};

type ComposerSurfaceState =
  | 'auth-required'
  | 'upload-blocked'
  | 'generating'
  | 'dictating'
  | 'ready'
  | 'empty';

function composerSurfaceState({
  primaryAction,
  requiresAuth,
  uploadBlocked,
}: {
  primaryAction: ComposerPrimaryActionMode | 'login';
  requiresAuth?: boolean;
  uploadBlocked: boolean;
}): ComposerSurfaceState {
  if (requiresAuth || primaryAction === 'login') return 'auth-required';
  if (primaryAction === 'cancel') return 'generating';
  if (primaryAction === 'stop-dictation') return 'dictating';
  if (uploadBlocked) return 'upload-blocked';
  if (primaryAction === 'send') return 'ready';
  return 'empty';
}

export function ChatGPTComposer({ requiresAuth, onLogin }: ChatGPTComposerProps) {
  const attachments = useAuiState((state) => state.composer.attachments);
  const attachmentIds = useMemo(
    () => attachments.map((attachment) => attachment.id),
    [attachments],
  );
  const uploadSummary = useUploadProgressSummary(attachmentIds);
  const hasAttachmentGate = uploadSummary.status !== 'idle';
  const uploadStatusId = hasAttachmentGate ? 'assistant-ui-upload-status' : undefined;
  const primaryAction = useAuiState((state) =>
    requiresAuth
      ? 'login'
      : composerPrimaryActionMode({
          isRunning: state.thread.isRunning,
          isDictating: state.composer.dictation != null,
          isEmpty: state.composer.isEmpty,
          uploadBlocked: uploadSummary.blocked,
        }),
  );
  const surfaceState = composerSurfaceState({
    primaryAction,
    requiresAuth,
    uploadBlocked: uploadSummary.blocked,
  });
  const isBusy =
    surfaceState === 'generating' ||
    surfaceState === 'dictating' ||
    uploadSummary.status === 'uploading';

  return (
    <ComposerPrimitive.Root
      className="group/composer mx-auto flex w-full max-w-3xl flex-col rounded-[28px] border border-[#e5e5e5] bg-white px-2 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] duration-150 hover:border-[#dcdcdc] focus-within:border-[#d0d0d0] focus-within:shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
      data-testid="assistant-ui-composer"
      data-ui-model="assistant-ui-chatgpt-composer"
      data-visual-density="compact"
      data-toolbar-model="minimal"
      data-permission-entry="none"
      data-attachment-model="message-part"
      data-border-tone="subtle"
      data-focus-ring="subtle"
      data-keyboard-safe-area="enabled"
      data-upload-gate={hasAttachmentGate ? uploadSummary.status : 'idle'}
      data-upload-count={uploadSummary.totalCount}
      data-upload-uploading={uploadSummary.uploadingCount}
      data-upload-failed={uploadSummary.failedCount}
      data-upload-blocked={uploadSummary.blocked ? 'true' : 'false'}
      data-primary-action={primaryAction}
      data-composer-state={surfaceState}
      data-auth-state={requiresAuth ? 'signed-out' : 'signed-in'}
      aria-label="消息输入"
      aria-busy={isBusy ? 'true' : undefined}
    >
      <ComposerPrimitive.AttachmentDropzone
        disabled={requiresAuth}
        className="relative rounded-[22px] transition-colors data-[dragging=true]:bg-black/[0.025]"
        data-testid="assistant-ui-attachment-dropzone"
        data-dropzone-state={requiresAuth ? 'disabled' : 'ready'}
        aria-label="拖放图片或视频到这里"
      >
        <ComposerQuotePreview />
        <AuiIf condition={(state) => state.composer.attachments.length > 0}>
          <div className="flex flex-row flex-wrap gap-2 px-1 pb-2 pt-0.5">
            <ComposerPrimitive.Attachments components={{ Attachment: ChatGPTAttachment }} />
          </div>
        </AuiIf>
        <ComposerPrimitive.Input
          rows={1}
          autoFocus={!requiresAuth}
          placeholder={requiresAuth ? '登录后继续' : '询问任何问题'}
          aria-describedby={uploadStatusId}
          data-testid="assistant-ui-composer-input"
          data-input-model="single-composer"
          className="max-h-40 min-h-9 w-full resize-none bg-transparent px-3 pt-2 text-base leading-6 text-[#0d0d0d] outline-none placeholder:text-[#8e8e8e]"
        />
        <ComposerDictationPreview />
        <div
          className="flex items-center justify-between gap-2 px-1 pt-1"
          data-testid="assistant-ui-composer-toolbar"
          data-toolbar-model="minimal"
          data-permission-entry="none"
        >
          <div
            className="flex min-w-0 items-center gap-1"
            data-testid="assistant-ui-composer-secondary-actions"
            data-action-group="attachments"
          >
            <ComposerPrimitive.AddAttachment asChild>
              <TooltipIconButton
                tooltip={requiresAuth ? '登录后添加图片或视频' : '添加图片或视频'}
                className="size-9 rounded-full text-[#5d5d5d] hover:bg-black/[0.05]"
                disabled={requiresAuth}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </TooltipIconButton>
            </ComposerPrimitive.AddAttachment>
            <ComposerUploadStatus summary={uploadSummary} />
          </div>
          <ComposerPrimaryAction
            uploadSummary={uploadSummary}
            requiresAuth={requiresAuth}
            onLogin={onLogin}
          />
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
}

function ComposerQuotePreview() {
  return (
    <ComposerPrimitive.Quote
      className="mb-2 flex items-start gap-2 rounded-2xl bg-black/[0.035] px-3 py-2 text-sm text-[#52525b] ring-1 ring-black/[0.04]"
      data-testid="assistant-ui-composer-quote"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#8a8f98]">
          引用
        </p>
        <ComposerPrimitive.QuoteText className="mt-0.5 block max-h-12 overflow-hidden text-ellipsis text-xs leading-5 text-[#52525b]" />
      </div>
      <ComposerPrimitive.QuoteDismiss asChild>
        <button
          type="button"
          className="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[#71717a] transition-colors hover:bg-black/[0.06] hover:text-[#18181b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
          aria-label="取消引用"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </ComposerPrimitive.QuoteDismiss>
    </ComposerPrimitive.Quote>
  );
}

function ComposerDictationPreview() {
  return (
    <ComposerPrimitive.DictationTranscript
      className="mx-3 mt-1 block truncate rounded-xl bg-black/[0.035] px-3 py-1.5 text-xs leading-5 text-[#52525b] ring-1 ring-black/[0.04]"
      role="status"
      aria-live="polite"
      data-testid="assistant-ui-dictation-transcript"
    />
  );
}

function ComposerUploadStatus({ summary }: { summary: UploadProgressSummary }) {
  if (!summary.message) return null;
  return (
    <div
      id="assistant-ui-upload-status"
      className="min-w-0 flex-1 px-1"
      data-testid="assistant-ui-upload-gate"
      data-upload-status={summary.status}
      role="status"
      aria-live="polite"
    >
      <p
        className={cn(
          'truncate text-[11px] leading-5',
          summary.status === 'failed' ? 'text-red-600' : 'text-[#71717a]',
        )}
      >
        {summary.status === 'failed' ? `${summary.message}` : `${summary.message}`}
      </p>
      {summary.status === 'uploading' && summary.percent !== null ? (
        <span
          className="mt-0.5 block h-0.5 max-w-24 rounded-full bg-black/[0.08]"
          aria-hidden="true"
        >
          <span
            className="block h-full rounded-full bg-[#0d0d0d] transition-[width] duration-150"
            style={{ width: `${Math.min(100, Math.max(0, summary.percent))}%` }}
          />
        </span>
      ) : null}
    </div>
  );
}

function ComposerPrimaryAction({
  uploadSummary,
  requiresAuth,
  onLogin,
}: {
  uploadSummary: UploadProgressSummary;
  requiresAuth?: boolean;
  onLogin?: () => void;
}) {
  if (requiresAuth) {
    return <ComposerLoginButton onLogin={onLogin} />;
  }
  return (
    <div
      className="flex min-w-8 items-center justify-end gap-1"
      data-testid="assistant-ui-composer-primary-actions"
      data-action-group="primary"
      data-action-model="send-cancel-dictate"
    >
      <AuiIf condition={(state) => state.thread.isRunning}>
        <ComposerCancelButton />
      </AuiIf>
      <AuiIf condition={(state) => !state.thread.isRunning && state.composer.dictation != null}>
        <ComposerStopDictationButton />
      </AuiIf>
      <AuiIf
        condition={(state) =>
          composerPrimaryActionMode({
            isRunning: state.thread.isRunning,
            isDictating: state.composer.dictation != null,
            isEmpty: state.composer.isEmpty,
            uploadBlocked: uploadSummary.blocked,
          }) === 'send-disabled'
        }
      >
        <ComposerSendButton disabled uploadStatus={uploadSummary.status} />
      </AuiIf>
      <AuiIf
        condition={(state) =>
          composerPrimaryActionMode({
            isRunning: state.thread.isRunning,
            isDictating: state.composer.dictation != null,
            isEmpty: state.composer.isEmpty,
            uploadBlocked: uploadSummary.blocked,
          }) === 'send'
        }
      >
        <ComposerSendButton disabled={uploadSummary.blocked} uploadStatus={uploadSummary.status} />
      </AuiIf>
      <AuiIf
        condition={(state) =>
          composerPrimaryActionMode({
            isRunning: state.thread.isRunning,
            isDictating: state.composer.dictation != null,
            isEmpty: state.composer.isEmpty,
            uploadBlocked: uploadSummary.blocked,
          }) === 'dictate'
        }
      >
        <ComposerDictateButton />
      </AuiIf>
    </div>
  );
}

function ComposerLoginButton({ onLogin }: { onLogin?: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex size-9 items-center justify-center rounded-full bg-[#0d0d0d] text-white transition-[opacity,transform] hover:bg-[#0d0d0d] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 disabled:opacity-40"
      aria-label="登录后继续"
      title="登录后继续"
      onClick={onLogin}
    >
      <LogIn className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function ComposerSendButton({
  disabled,
  uploadStatus,
}: {
  disabled?: boolean;
  uploadStatus: UploadProgressSummary['status'];
}) {
  const disabledReason =
    uploadStatus === 'failed'
      ? '附件上传失败，请先在附件上重试'
      : uploadStatus === 'uploading'
        ? '附件上传中，完成后再发送'
        : '发送';
  return (
    <ComposerPrimitive.Send asChild>
      <button
        type="submit"
        className="inline-flex size-9 items-center justify-center rounded-full bg-[#0d0d0d] text-white transition-[opacity,transform] hover:bg-[#0d0d0d] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 disabled:opacity-30"
        aria-label={disabled ? disabledReason : '发送'}
        title={disabled ? disabledReason : '发送'}
        disabled={disabled}
      >
        <ArrowUp className="size-5" aria-hidden="true" />
      </button>
    </ComposerPrimitive.Send>
  );
}

function ComposerCancelButton() {
  return (
    <ComposerPrimitive.Cancel asChild>
      <button
        type="button"
        className="inline-flex size-9 items-center justify-center rounded-full bg-[#0d0d0d] text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
        aria-label="停止生成"
      >
        <Square className="h-2 w-2 fill-current" aria-hidden="true" />
      </button>
    </ComposerPrimitive.Cancel>
  );
}

function ComposerStopDictationButton() {
  return (
    <ComposerPrimitive.StopDictation asChild>
      <button
        type="button"
        className="inline-flex size-9 items-center justify-center rounded-full bg-[#0d0d0d] text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
        aria-label="停止听写"
      >
        <Square className="h-2 w-2 animate-pulse fill-current" aria-hidden="true" />
      </button>
    </ComposerPrimitive.StopDictation>
  );
}

function ComposerDictateButton() {
  return (
    <ComposerPrimitive.Dictate asChild>
      <TooltipIconButton
        tooltip="开始语音输入"
        className="size-9 rounded-full bg-transparent text-[#5d5d5d] shadow-none transition-[background-color,color,transform] hover:bg-black/[0.05] hover:text-[#0d0d0d] active:scale-95 focus-visible:ring-black/15 disabled:bg-transparent disabled:text-[#b5b5b5]"
        data-testid="assistant-ui-dictate-button"
      >
        <Mic className="size-4" aria-hidden="true" />
      </TooltipIconButton>
    </ComposerPrimitive.Dictate>
  );
}
