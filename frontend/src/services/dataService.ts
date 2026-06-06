import * as api from '../api/client';
import type {
  Category,
  Coach,
  Club,
  ClubMember,
  Comment,
  Friend,
  Meet,
  MeetRecord,
  Post,
  UserProfile,
  SocialCandidate,
  SocialRequest,
} from '../types';
import type { FeedPage, FeedQueryParams } from '../api/feedClient';

export function register(data: { email: string; password: string; name: string }) {
  return api.register(data);
}

export function login(data: { email: string; password: string }) {
  return api.login(data);
}

export function getProfile() {
  return api.getProfile();
}

export type CreateSocialRequestInput = api.CreateSocialRequestInput;

export function getSocialRequests(): Promise<SocialRequest[]> {
  return api.getSocialRequests();
}

export function createSocialRequest(data: CreateSocialRequestInput): Promise<{
  request: SocialRequest;
  candidates: SocialCandidate[];
}> {
  return api.createSocialRequest(data);
}

export function getFeedPage(params?: FeedQueryParams): Promise<FeedPage> {
  return api.getFeedPage(params);
}

export function getFeed(params?: FeedQueryParams): Promise<Post[]> {
  return api.getFeed(params);
}

export function getPublicSocialIntents(params?: {
  page?: number;
  limit?: number;
  q?: string;
  city?: string;
  requestType?: string;
  status?: string;
}) {
  return api.getPublicSocialIntents(params);
}

export function createPost(data: Partial<Post>): Promise<Post> {
  return api.createPost(data);
}

export function likePost(id: number) {
  return api.likePost(id);
}

export function savePost(id: number) {
  return api.savePost(id);
}

export function getPostInteractions() {
  return api.getPostInteractions();
}

export function getComments(postId: number): Promise<Comment[]> {
  return api.getComments(postId);
}

export function addComment(postId: number, text: string) {
  return api.addComment(postId, text);
}

export function likeComment(commentId: number) {
  return api.likeComment(commentId);
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
  clubId?: number;
  lat?: number;
  lng?: number;
}): Promise<Meet[]> {
  return api.getMeets(params);
}

export function createMeet(data: Partial<Meet>) {
  return api.createMeet(data);
}

export function joinMeet(id: number) {
  return api.joinMeet(id);
}

export function confirmMeetParticipant(meetId: number, participantId: number) {
  return api.confirmMeetParticipant(meetId, participantId);
}

export function cancelMeet(id: number) {
  return api.cancelMeet(id);
}

export function createTripShare(id: number) {
  return api.createTripShare(id);
}

export function getTripShare(token: string) {
  return api.getTripShare(token);
}

export function createMeetActivity(meetId: number) {
  return api.createMeetActivity(meetId);
}

export function getMeetRecords(): Promise<MeetRecord[]> {
  return api.getMeetRecords();
}

export function getClubs(params?: {
  city?: string;
  sportType?: string;
  q?: string;
  mine?: boolean;
}): Promise<Club[]> {
  return api.getClubs(params);
}

export function createClub(data: api.CreateClubInput): Promise<Club> {
  return api.createClub(data);
}

export function getClub(id: number): Promise<Club> {
  return api.getClub(id);
}

export function updateClub(id: number, data: api.UpdateClubInput): Promise<Club> {
  return api.updateClub(id, data);
}

export function joinClub(id: number): Promise<ClubMember> {
  return api.joinClub(id);
}

export function approveClubMember(clubId: number, memberId: number): Promise<ClubMember> {
  return api.approveClubMember(clubId, memberId);
}

export function rejectClubMember(clubId: number, memberId: number): Promise<ClubMember> {
  return api.rejectClubMember(clubId, memberId);
}

export function removeClubMember(clubId: number, memberId: number) {
  return api.removeClubMember(clubId, memberId);
}

export function getClubMeets(id: number, params?: { lat?: number; lng?: number }): Promise<Meet[]> {
  return api.getClubMeets(id, params);
}

export function getCoaches(params?: { specialty?: string }): Promise<Coach[]> {
  return api.getCoaches(params);
}

export function getCoachDetail(id: number) {
  return api.getCoachDetail(id);
}

export function addCoachReview(
  coachId: number,
  data: { rating: number; text: string; tags?: string[] },
) {
  return api.addCoachReview(coachId, data);
}

export function getCategories(): Promise<Category[]> {
  return api.getCategories();
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

export function startConversation(otherUserId: number) {
  return api.startConversation(otherUserId);
}

export function startPublicIntentConversation(publicIntentId: string, text: string) {
  return api.startPublicIntentConversation(publicIntentId, text);
}

export function getUnreadMessageCount() {
  return api.getUnreadMessageCount();
}

export function getNotifications() {
  return api.getNotifications();
}

export function getUnreadNotificationCount() {
  return api.getUnreadNotificationCount();
}

export function markNotificationAsRead(id: string) {
  return api.markNotificationAsRead(id);
}

export function markAllNotificationsRead() {
  return api.markAllNotificationsRead();
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
