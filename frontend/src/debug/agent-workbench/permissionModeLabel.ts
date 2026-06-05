import type { SocialAgentPermissionMode } from '../../api/socialAgentDebugApi';

export function permissionModeLabel(value: SocialAgentPermissionMode) {
  if (value === 'open') return 'Open Mode';
  if (value === 'limited_auto') return 'Limited Auto Mode';
  return 'Assisted Mode';
}
