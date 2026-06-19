import { useSyncExternalStore } from 'react';

export type UploadProgressSnapshot = {
  status: 'queued' | 'uploading' | 'uploaded' | 'failed' | 'retrying' | 'cancelled';
  percent: number | null;
  error?: string;
};

export type UploadProgressSummary = {
  status: 'idle' | 'uploading' | 'failed';
  blocked: boolean;
  message: string | null;
  percent: number | null;
  totalCount: number;
  uploadingCount: number;
  failedCount: number;
};

const values = new Map<string, UploadProgressSnapshot>();
const retryHandlers = new Map<string, () => void | Promise<void>>();
const listeners = new Set<() => void>();
const defaultUploadProgressSnapshot: UploadProgressSnapshot = { status: 'queued', percent: null };
let revision = 0;

export const uploadProgressStore = {
  set(id: string, snapshot: UploadProgressSnapshot) {
    values.set(id, snapshot);
    revision += 1;
    listeners.forEach((listener) => listener());
  },
  retry(id: string) {
    const handler = retryHandlers.get(id);
    if (handler) {
      values.set(id, { status: 'retrying', percent: 0 });
      revision += 1;
      listeners.forEach((listener) => listener());
      void handler();
      return;
    }
    values.set(id, { status: 'queued', percent: 0 });
    revision += 1;
    listeners.forEach((listener) => listener());
  },
  registerRetry(id: string, handler: () => void | Promise<void>) {
    retryHandlers.set(id, handler);
  },
  remove(id: string) {
    values.delete(id);
    retryHandlers.delete(id);
    revision += 1;
    listeners.forEach((listener) => listener());
  },
  clear() {
    values.clear();
    retryHandlers.clear();
    revision += 1;
    listeners.forEach((listener) => listener());
  },
  get(id: string) {
    return values.get(id) ?? defaultUploadProgressSnapshot;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useUploadProgress(id: string) {
  return useSyncExternalStore(
    uploadProgressStore.subscribe,
    () => uploadProgressStore.get(id),
    () => uploadProgressStore.get(id),
  );
}

export function useUploadProgressSummary(ids: string[]): UploadProgressSummary {
  useSyncExternalStore(
    uploadProgressStore.subscribe,
    () => revision,
    () => revision,
  );
  return summarizeUploads(ids);
}

function summarizeUploads(ids: string[]): UploadProgressSummary {
  if (ids.length === 0) {
    return {
      status: 'idle',
      blocked: false,
      message: null,
      percent: null,
      totalCount: 0,
      uploadingCount: 0,
      failedCount: 0,
    };
  }
  const snapshots = ids.map((id) => uploadProgressStore.get(id));
  const failedCount = snapshots.filter((snapshot) => snapshot.status === 'failed').length;
  const uploadingCount = snapshots.filter(
    (snapshot) => snapshot.status === 'uploading' || snapshot.status === 'retrying',
  ).length;
  if (failedCount > 0) {
    return {
      status: 'failed',
      blocked: true,
      message:
        failedCount === 1
          ? '有 1 个附件上传失败，可在附件上重试'
          : `${failedCount} 个附件上传失败，可在附件上重试`,
      percent: null,
      totalCount: ids.length,
      uploadingCount,
      failedCount,
    };
  }
  if (uploadingCount > 0) {
    const knownPercents = snapshots
      .filter((snapshot) => snapshot.status === 'uploading' || snapshot.status === 'retrying')
      .map((snapshot) => snapshot.percent)
      .filter((percent): percent is number => typeof percent === 'number' && Number.isFinite(percent));
    const percent =
      knownPercents.length > 0
        ? Math.round(knownPercents.reduce((sum, value) => sum + value, 0) / knownPercents.length)
        : null;
    return {
      status: 'uploading',
      blocked: true,
      message:
        uploadingCount === 1
          ? `附件上传中${percent !== null ? ` ${percent}%` : ''}`
          : `${uploadingCount} 个附件上传中${percent !== null ? ` · ${percent}%` : ''}`,
      percent,
      totalCount: ids.length,
      uploadingCount,
      failedCount,
    };
  }
  return {
    status: 'idle',
    blocked: false,
    message: null,
    percent: null,
    totalCount: ids.length,
    uploadingCount,
    failedCount,
  };
}
