export type ComposerPrimaryActionMode =
  | 'cancel'
  | 'stop-dictation'
  | 'send-disabled'
  | 'send'
  | 'dictate';

export function composerPrimaryActionMode({
  isRunning,
  isDictating,
  isEmpty,
  uploadBlocked,
}: {
  isRunning: boolean;
  isDictating: boolean;
  isEmpty: boolean;
  uploadBlocked: boolean;
}): ComposerPrimaryActionMode {
  if (isRunning) return 'cancel';
  if (isDictating) return 'stop-dictation';
  if (uploadBlocked) return 'send-disabled';
  if (!isEmpty) return 'send';
  return 'dictate';
}
