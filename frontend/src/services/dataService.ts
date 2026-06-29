import * as api from '../api/client';
import type {
  Friend,
  Meet,
  MeetRecord,
  PublicSocialIntent,
  PublicSocialIntentMatches,
  UserProfile,
} from '../types';

export function getPublicSocialIntents(params?: {
  page?: number;
  limit?: number;
  q?: string;
  city?: string;
  requestType?: string;
  status?: string;
  publicIntentId?: string;
}): Promise<PublicSocialIntent[]> {
  return api.getPublicSocialIntents(params);
}

export function getPublicSocialIntent(id: string): Promise<PublicSocialIntent> {
  return api.getPublicSocialIntent(id);
}

export function getPublicSocialIntentMatches(id: string): Promise<PublicSocialIntentMatches> {
  return api.getPublicSocialIntentMatches(id);
}

export function getUser(id: number): Promise<UserProfile> {
  return api.getUser(id);
}

export function updateUserProfile(data: Partial<UserProfile>) {
  return api.updateProfile(data);
}

export function getFriends(): Promise<Friend[]> {
  return api.getFriends();
}

export function toggleFollow(userId: number) {
  return api.toggleFollow(userId);
}

export function getFollowedIds(): Promise<number[]> {
  return api.getFollowedIds();
}

export function getMeets(params?: {
  type?: string;
  city?: string;
  lat?: number;
  lng?: number;
}): Promise<Meet[]> {
  return api.getMeets(params);
}

export function joinMeet(id: number) {
  return api.joinMeet(id);
}

export function getMeetRecords(): Promise<MeetRecord[]> {
  return api.getMeetRecords();
}

export function getConversations() {
  return api.getConversations();
}

export function getMessages(conversationId: string) {
  return api.getMessages(conversationId);
}

export function sendMessage(conversationId: string, text: string) {
  return api.sendMessage(conversationId, text);
}

export function startPublicIntentConversation(publicIntentId: string, text: string) {
  return api.startPublicIntentConversation(publicIntentId, text);
}

export function getUnreadMessageCount() {
  return api.getUnreadMessageCount();
}

export const createReport = api.createReport;
export const blockUser = api.blockUser;
export const getBlockedUserIds = api.getBlockedUserIds;
export const createVerificationRequest = api.createVerificationRequest;
export const getMyVerificationRequests = api.getMyVerificationRequests;
export const getEmergencyContacts = api.getEmergencyContacts;
export const addEmergencyContact = api.addEmergencyContact;
export const deleteEmergencyContact = api.deleteEmergencyContact;
export const listSafetyReports = api.listSafetyReports;
export const updateSafetyReport = api.updateSafetyReport;
export const listVerificationRequests = api.listVerificationRequests;
export const updateVerificationRequest = api.updateVerificationRequest;
