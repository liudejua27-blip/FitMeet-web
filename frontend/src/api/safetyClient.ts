import { request } from './baseClient';

export type SafetyReport = {
  id: number;
  reporterId: number;
  targetType: 'user' | 'post' | 'meet' | 'comment';
  targetId: number;
  reason: string;
  description: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'rejected';
  adminNote: string;
  createdAt: string;
};

export type VerificationRequest = {
  id: number;
  userId: number;
  type: 'real_name' | 'coach';
  realName: string;
  idNumberMasked: string;
  certName: string;
  certImageUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  adminNote: string;
  createdAt: string;
};

export type EmergencyContact = {
  id: number;
  name: string;
  phone: string;
  relation: string;
};

export function createReport(data: {
  targetType: SafetyReport['targetType'];
  targetId: number;
  reason: string;
  description?: string;
}) {
  return request<SafetyReport>('/safety/reports', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function blockUser(userId: number) {
  return request<{ blocked: boolean }>(`/safety/blocks/${userId}`, {
    method: 'POST',
  });
}

export function getBlockedUserIds() {
  return request<number[]>('/safety/blocks/ids');
}

export function createVerificationRequest(data: {
  type: VerificationRequest['type'];
  realName?: string;
  idNumberMasked?: string;
  certName?: string;
  certImageUrl?: string;
}) {
  return request<VerificationRequest>('/safety/verifications', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getMyVerificationRequests() {
  return request<VerificationRequest[]>('/safety/verifications/me');
}

export function getEmergencyContacts() {
  return request<EmergencyContact[]>('/safety/emergency-contacts');
}

export function addEmergencyContact(data: { name: string; phone: string; relation: string }) {
  return request<EmergencyContact>('/safety/emergency-contacts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteEmergencyContact(id: number) {
  return request<{ deleted: boolean }>(`/safety/emergency-contacts/${id}`, {
    method: 'DELETE',
  });
}

export function listSafetyReports() {
  return request<SafetyReport[]>('/safety/admin/reports');
}

export function updateSafetyReport(
  id: number,
  data: { status: SafetyReport['status']; adminNote?: string },
) {
  return request<SafetyReport>(`/safety/admin/reports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function listVerificationRequests() {
  return request<VerificationRequest[]>('/safety/admin/verifications');
}

export function updateVerificationRequest(
  id: number,
  data: { status: VerificationRequest['status']; adminNote?: string },
) {
  return request<VerificationRequest>(`/safety/admin/verifications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
