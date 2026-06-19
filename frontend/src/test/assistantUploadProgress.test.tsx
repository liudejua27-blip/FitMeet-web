import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  uploadProgressStore,
  useUploadProgressSummary,
} from '../components/assistant-ui/upload-progress-store';
import { composerPrimaryActionMode } from '../components/assistant-ui/composer-action-mode';

function UploadSummaryProbe({ ids }: { ids: string[] }) {
  const summary = useUploadProgressSummary(ids);
  return (
    <div>
      <p data-testid="upload-status">{summary.status}</p>
      <p data-testid="upload-message">{summary.message ?? 'idle'}</p>
      <p data-testid="upload-percent">{summary.percent ?? 'none'}</p>
      <p data-testid="upload-total-count">{summary.totalCount}</p>
      <p data-testid="upload-uploading-count">{summary.uploadingCount}</p>
      <p data-testid="upload-failed-count">{summary.failedCount}</p>
      <button type="button" disabled={summary.blocked}>
        Send
      </button>
    </div>
  );
}

describe('assistant upload progress summary', () => {
  it('blocks sending while an attachment is uploading', () => {
    uploadProgressStore.set('uploading-image', { status: 'uploading', percent: 42 });

    render(<UploadSummaryProbe ids={['uploading-image']} />);

    expect(screen.getByTestId('upload-status')).toHaveTextContent('uploading');
    expect(screen.getByTestId('upload-message')).toHaveTextContent('附件上传中 42%');
    expect(screen.getByTestId('upload-percent')).toHaveTextContent('42');
    expect(screen.getByTestId('upload-total-count')).toHaveTextContent('1');
    expect(screen.getByTestId('upload-uploading-count')).toHaveTextContent('1');
    expect(screen.getByTestId('upload-failed-count')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('blocks sending after an attachment upload failed', () => {
    uploadProgressStore.set('failed-video', { status: 'failed', percent: null });

    render(<UploadSummaryProbe ids={['failed-video']} />);

    expect(screen.getByTestId('upload-status')).toHaveTextContent('failed');
    expect(screen.getByTestId('upload-message')).toHaveTextContent(
      '有 1 个附件上传失败，可在附件上重试',
    );
    expect(screen.getByTestId('upload-percent')).toHaveTextContent('none');
    expect(screen.getByTestId('upload-total-count')).toHaveTextContent('1');
    expect(screen.getByTestId('upload-uploading-count')).toHaveTextContent('0');
    expect(screen.getByTestId('upload-failed-count')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('lets a failed attachment move back to the queued retry state', () => {
    uploadProgressStore.set('retry-image', { status: 'failed', percent: null });

    render(<UploadSummaryProbe ids={['retry-image']} />);

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    act(() => {
      uploadProgressStore.retry('retry-image');
    });

    expect(screen.getByTestId('upload-status')).toHaveTextContent('idle');
    expect(screen.getByTestId('upload-message')).toHaveTextContent('idle');
    expect(screen.getByTestId('upload-total-count')).toHaveTextContent('1');
    expect(screen.getByTestId('upload-uploading-count')).toHaveTextContent('0');
    expect(screen.getByTestId('upload-failed-count')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
  });

  it('runs a registered retry handler and keeps sending blocked while retrying', () => {
    let retryCount = 0;
    uploadProgressStore.set('retry-with-handler', { status: 'failed', percent: null });
    uploadProgressStore.registerRetry('retry-with-handler', () => {
      retryCount += 1;
    });

    render(<UploadSummaryProbe ids={['retry-with-handler']} />);

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    act(() => {
      uploadProgressStore.retry('retry-with-handler');
    });

    expect(retryCount).toBe(1);
    expect(screen.getByTestId('upload-status')).toHaveTextContent('uploading');
    expect(screen.getByTestId('upload-message')).toHaveTextContent('附件上传中 0%');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('clears removed attachment state so stale failures do not block the composer', () => {
    uploadProgressStore.set('removed-image', { status: 'failed', percent: null });

    render(<UploadSummaryProbe ids={['removed-image']} />);

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    act(() => {
      uploadProgressStore.remove('removed-image');
    });

    expect(screen.getByTestId('upload-status')).toHaveTextContent('idle');
    expect(screen.getByTestId('upload-message')).toHaveTextContent('idle');
    expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
  });

  it('keeps queued and uploaded attachments sendable', () => {
    uploadProgressStore.set('queued-image', { status: 'queued', percent: 0 });
    uploadProgressStore.set('uploaded-video', { status: 'uploaded', percent: 100 });

    render(<UploadSummaryProbe ids={['queued-image', 'uploaded-video']} />);

    expect(screen.getByTestId('upload-status')).toHaveTextContent('idle');
    expect(screen.getByTestId('upload-message')).toHaveTextContent('idle');
    expect(screen.getByTestId('upload-percent')).toHaveTextContent('none');
    expect(screen.getByTestId('upload-total-count')).toHaveTextContent('2');
    expect(screen.getByTestId('upload-uploading-count')).toHaveTextContent('0');
    expect(screen.getByTestId('upload-failed-count')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
  });

  it('averages multiple uploading attachment percentages', () => {
    uploadProgressStore.set('uploading-image-a', { status: 'uploading', percent: 20 });
    uploadProgressStore.set('uploading-image-b', { status: 'retrying', percent: 60 });

    render(<UploadSummaryProbe ids={['uploading-image-a', 'uploading-image-b']} />);

    expect(screen.getByTestId('upload-status')).toHaveTextContent('uploading');
    expect(screen.getByTestId('upload-message')).toHaveTextContent('2 个附件上传中 · 40%');
    expect(screen.getByTestId('upload-percent')).toHaveTextContent('40');
    expect(screen.getByTestId('upload-total-count')).toHaveTextContent('2');
    expect(screen.getByTestId('upload-uploading-count')).toHaveTextContent('2');
    expect(screen.getByTestId('upload-failed-count')).toHaveTextContent('0');
  });

  it('keeps the composer primary action on the blocked send state while uploads are unresolved', () => {
    expect(
      composerPrimaryActionMode({
        isRunning: false,
        isDictating: false,
        isEmpty: true,
        uploadBlocked: true,
      }),
    ).toBe('send-disabled');
    expect(
      composerPrimaryActionMode({
        isRunning: false,
        isDictating: false,
        isEmpty: false,
        uploadBlocked: true,
      }),
    ).toBe('send-disabled');
    expect(
      composerPrimaryActionMode({
        isRunning: true,
        isDictating: false,
        isEmpty: true,
        uploadBlocked: true,
      }),
    ).toBe('cancel');
    expect(
      composerPrimaryActionMode({
        isRunning: false,
        isDictating: true,
        isEmpty: true,
        uploadBlocked: true,
      }),
    ).toBe('stop-dictation');
  });
});
