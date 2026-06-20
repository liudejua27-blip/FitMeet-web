import type {
  AttachmentAdapter,
  PendingAttachment,
  ThreadUserMessagePart,
} from '@assistant-ui/react';

import { uploadProgressStore } from '../assistant-ui/upload-progress-store';

const uploadedAttachmentContent = new Map<
  string,
  {
    type: PendingAttachment['type'];
    content: ThreadUserMessagePart[];
  }
>();
const uploadInFlight = new Map<string, Promise<void>>();

export const fitMeetAttachmentAdapter: AttachmentAdapter = {
  accept: 'image/*,video/*',
  async add({ file }) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      throw new Error('当前聊天仅支持图片和视频附件。');
    }
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `fitmeet-upload-${crypto.randomUUID()}`
        : `fitmeet-upload-${Date.now()}`;
    uploadProgressStore.set(id, { status: 'queued', percent: 0 });
    uploadProgressStore.registerRetry(id, () => startFitMeetAttachmentUpload(id, file));
    void startFitMeetAttachmentUpload(id, file);
    return {
      id,
      type: file.type.startsWith('image/') ? 'image' : 'file',
      name: file.name,
      contentType: file.type,
      file,
      status: { type: 'requires-action', reason: 'composer-send' },
    } satisfies PendingAttachment;
  },
  async remove(attachment) {
    forgetFitMeetAttachment(attachment.id);
  },
  async send(attachment) {
    const file = attachment.file;
    if (!file) throw new Error('附件文件不可用，请重新添加。');
    return completeFitMeetAttachment(attachment);
  },
};

function startFitMeetAttachmentUpload(id: string, file: File) {
  const existing = uploadInFlight.get(id);
  if (existing) return existing;
  uploadProgressStore.set(id, { status: 'uploading', percent: 0 });
  const uploadPromise = (async () => {
    try {
      const uploadApi = await import('../../api/uploadApi');
      if (file.type.startsWith('image/')) {
        const uploaded = await uploadApi.uploadImageWithProgress(file, {
          onProgress: (progress) =>
            uploadProgressStore.set(id, {
              status: 'uploading',
              percent: progress.percent,
            }),
        });
        uploadedAttachmentContent.set(id, {
          type: 'image',
          content: [
            {
              type: 'image',
              image: uploaded.url,
              filename: file.name,
            },
          ],
        });
        uploadProgressStore.set(id, { status: 'uploaded', percent: 100 });
        return;
      }
      if (file.type.startsWith('video/')) {
        const uploaded = await uploadApi.uploadVideoWithProgress(file, {
          onProgress: (progress) =>
            uploadProgressStore.set(id, {
              status: 'uploading',
              percent: progress.percent,
            }),
        });
        uploadedAttachmentContent.set(id, {
          type: 'file',
          content: [
            {
              type: 'file',
              data: uploaded.url,
              filename: file.name,
              mimeType: file.type,
            },
          ],
        });
        uploadProgressStore.set(id, { status: 'uploaded', percent: 100 });
        return;
      }
      throw new Error('当前聊天仅支持图片和视频附件。');
    } catch (error) {
      uploadedAttachmentContent.delete(id);
      uploadProgressStore.set(id, {
        status: 'failed',
        percent: null,
        error: error instanceof Error ? error.message : '上传失败',
      });
    } finally {
      uploadInFlight.delete(id);
    }
  })();
  uploadInFlight.set(id, uploadPromise);
  return uploadPromise;
}

async function completeFitMeetAttachment(attachment: PendingAttachment) {
  const uploaded = uploadedAttachmentContent.get(attachment.id);
  if (uploaded) {
    return {
      ...attachment,
      type: uploaded.type,
      status: { type: 'complete' as const },
      content: uploaded.content,
    };
  }

  const inFlight = uploadInFlight.get(attachment.id);
  if (inFlight) await inFlight;

  const afterUpload = uploadedAttachmentContent.get(attachment.id);
  if (afterUpload) {
    return {
      ...attachment,
      type: afterUpload.type,
      status: { type: 'complete' as const },
      content: afterUpload.content,
    };
  }

  const snapshot = uploadProgressStore.get(attachment.id);
  throw new Error(snapshot.error ?? '附件还没有上传完成。');
}

function forgetFitMeetAttachment(id: string) {
  uploadedAttachmentContent.delete(id);
  uploadInFlight.delete(id);
  uploadProgressStore.remove(id);
}
