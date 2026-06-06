import { request } from './baseClient';
import { fitMeetCoreEndpoints } from './fitmeetCoreContract';

export interface ApiConversation {
  id: string;
  userId: number;
  username: string;
  avatar: string;
  color: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
}

export interface ApiMessage {
  id: string;
  text: string;
  time: string;
  isMine: boolean;
  source?: 'user' | 'ai_delegate';
  card?: {
    type: 'fitmeet_contact_card';
    userId: number;
    name: string;
    profileUrl: string;
    sports: string[];
    city: string;
  } | null;
}

export interface StartConversationResponse {
  conversationId: string;
  targetUserId?: number;
  preexisting?: boolean;
}

export function getConversations(): Promise<ApiConversation[]> {
  return request<ApiConversation[]>(fitMeetCoreEndpoints.messages.getConversations);
}

export function getMessages(conversationId: string): Promise<ApiMessage[]> {
  return request<ApiMessage[]>(
    fitMeetCoreEndpoints.messages.getConversationMessages(conversationId),
  );
}

export function sendMessage(conversationId: string, text: string): Promise<ApiMessage> {
  return request<ApiMessage>(
    fitMeetCoreEndpoints.messages.sendConversationMessage(conversationId),
    {
      method: 'POST',
      body: JSON.stringify({ text }),
    },
  );
}

export function startConversation(otherUserId: number): Promise<StartConversationResponse> {
  return request<StartConversationResponse>(fitMeetCoreEndpoints.messages.startConversation, {
    method: 'POST',
    body: JSON.stringify({ otherUserId }),
  });
}

export function startPublicIntentConversation(
  publicIntentId: string,
  text: string,
): Promise<StartConversationResponse> {
  return request<StartConversationResponse>(
    fitMeetCoreEndpoints.messages.startPublicIntentConversation(publicIntentId),
    {
      method: 'POST',
      body: JSON.stringify({ text }),
    },
  );
}

export function getUnreadMessageCount(): Promise<{ unreadCount: number }> {
  return request(fitMeetCoreEndpoints.messages.getUnreadCount);
}
