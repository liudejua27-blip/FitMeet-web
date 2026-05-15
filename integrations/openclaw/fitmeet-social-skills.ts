/**
 * FitMeet social-skills adapter for OpenClaw and compatible agents.
 *
 * This file is intentionally dependency-free so it can be copied into
 * OpenClaw, a worker process, or a custom agent runtime.
 */

export type FitMeetSocialRequestType =
  | 'fitness_partner'
  | 'offline_friend'
  | 'dog_walking'
  | 'bar_friend'
  | 'travel_partner'
  | 'photo_partner'
  | string;

export type FitMeetRiskLevel = 'low' | 'medium' | 'high';

export interface FitMeetSocialSkillsConfig {
  baseUrl: string;
  agentToken?: string;
  fetchImpl?: typeof fetch;
}

export interface FitMeetErrorPayload {
  statusCode?: number;
  code?: string;
  message?: string | string[];
  error?: {
    code?: string;
    message?: string | string[];
    retryable?: boolean;
  };
}

export interface FitMeetUserProfile {
  id: number;
  name: string;
  avatar: string;
  color: string;
  email?: string;
  phone?: string;
  city?: string;
  verified?: boolean;
}

export interface FitMeetAuthResult {
  access_token: string;
  refresh_token?: string;
  user: FitMeetUserProfile;
}

export interface RegisterUserInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginUserInput {
  email: string;
  password: string;
}

export interface PersonalAgentTokenResult {
  agentConnectionId: number;
  agentToken: string;
  permissionLevel: string;
  grantedActions: string[];
  mode: 'authorized';
  message: string;
}

export interface CreateSocialRequestInput {
  requestType: FitMeetSocialRequestType;
  title?: string;
  description: string;
  city?: string;
  loc?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  timePreference?: string;
  visibility?: 'matched_users_only' | 'private' | 'public';
  verifiedOnly?: boolean;
  interests?: string[];
  limit?: number;
}

export interface CandidateProfile {
  id: number;
  name: string;
  avatar: string;
  color: string;
  age: number;
  city: string;
  bio: string;
  verified: boolean;
  interestTags: string[];
}

export interface SocialCandidate {
  profile: CandidateProfile;
  score: number;
  reasonTags: string[];
  reasonText: string;
  nextAction: 'draft_invitation';
}

export interface SocialRequest {
  id: number | string;
  requestType: string;
  title: string;
  description: string;
  city: string;
  loc: string;
  radiusKm: number;
  timePreference: string;
  riskLevel: FitMeetRiskLevel;
  requiresUserConfirmation: boolean;
  matchedCount: number;
  status: 'searching' | 'matched' | 'closed' | 'cancelled';
}

export interface PublicSocialIntent extends SocialRequest {
  id: string;
  mode: 'public' | string;
  lat?: number | null;
  lng?: number | null;
  filters?: Record<string, unknown>;
  candidateUserIds?: number[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PublicSocialIntentSearchInput {
  page?: number;
  limit?: number;
  q?: string;
  city?: string;
  requestType?: FitMeetSocialRequestType;
  status?: 'searching' | 'matched' | 'closed' | 'cancelled';
}

export interface PublicSocialIntentSearchResult {
  data: PublicSocialIntent[];
  metadata: {
    total: number;
    page: number;
    lastPage: number;
    filters?: Record<string, unknown>;
  };
}

export interface CreateSocialRequestResult {
  request: SocialRequest;
  candidates: SocialCandidate[];
  matchedBy?: 'fitmeet_matching_engine' | string;
  handoff?: {
    openClawNextStep: string;
    ownerDecisionEndpoint?: string;
    allowedDecisions?: string[];
    allowedConnectionActions?: string[];
  };
}

export type SubmitSocialIntentInput = CreateSocialRequestInput;
export type SubmitSocialIntentResult = CreateSocialRequestResult;

export interface CandidateDecisionInput {
  candidateUserId: number;
  decision: 'approve' | 'reject';
  connectionAction?: 'none' | 'send_intro' | 'request_contact_exchange';
  ownerConfirmed: true;
  note?: string;
}

export type CandidateDecisionResult =
  | {
      status: 'candidate_rejected' | 'candidate_approved';
      requestId: number;
      candidateUserId: number;
      nextStep?: string;
    }
  | {
      status: 'intro_sent';
      requestId: number;
      candidateUserId: number;
      source: 'fitmeet_connection_orchestrator';
      riskScore: number;
      conversationId: string;
      message: unknown;
    }
  | {
      status: 'contact_exchange_requested';
      requestId: number;
      candidateUserId: number;
      contact: unknown;
    };

export interface DraftMessageInput {
  recipientUserId?: number;
  context?: string;
  tone?: 'warm' | 'direct' | 'playful' | 'intellectual' | string;
}

export interface DraftMessageResult {
  draft: {
    content: string;
    hashtags?: string[];
  };
  riskScore: number;
}

export interface SendMessageInput {
  recipientUserId: number;
  text: string;
  approvalRequestId?: number;
}

export interface SendMessageResult {
  status: 'sent' | 'pending_approval';
  approvalRequestId?: number;
  source?: 'ai_delegate';
  riskScore?: number;
  conversationId?: string;
  message?: unknown;
}

export interface AgentInboxResult {
  agentProfileId?: number | null;
  agentConnectionId?: number | null;
  agentName?: string | null;
  conversations: unknown[];
  events?: unknown[];
}

export interface AgentInboxMessagesResult {
  agentProfileId?: number | null;
  agentConnectionId?: number | null;
  agentName?: string | null;
  conversationId: string;
  messages: unknown[];
}

export class FitMeetSocialSkills {
  private readonly baseUrl: string;
  private readonly agentToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: FitMeetSocialSkillsConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.agentToken = config.agentToken;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  getManifest() {
    return this.request('GET', '/agent/skills/manifest');
  }

  getOpenApi() {
    if (this.agentToken) {
      return this.request('GET', '/agent/skills/openapi.json');
    }
    return this.request('GET', '/public/social-skills/openapi.json');
  }

  registerUser(input: RegisterUserInput): Promise<FitMeetAuthResult> {
    return this.request('POST', '/auth/register', {
      email: input.email.trim().toLowerCase(),
      password: input.password,
      name: input.name.trim(),
    });
  }

  loginUser(input: LoginUserInput): Promise<FitMeetAuthResult> {
    return this.request('POST', '/auth/login', {
      email: input.email.trim().toLowerCase(),
      password: input.password,
    });
  }

  getAuthenticatedProfile(accessToken: string): Promise<FitMeetUserProfile> {
    return this.requestWithBearer('GET', '/auth/profile', accessToken);
  }

  createPersonalAgentToken(accessToken: string): Promise<PersonalAgentTokenResult> {
    return this.requestWithBearer('POST', '/agents/personal-token', accessToken);
  }

  readOwnerPreferences() {
    return this.request('GET', '/agent/profile/preferences');
  }

  getMySocialProfile() {
    this.assertAuthorized('getMySocialProfile');
    return this.request('GET', '/agent/owner/social-profile');
  }

  updateMySocialProfile(input: Record<string, unknown>) {
    this.assertAuthorized('updateMySocialProfile');
    return this.request('PATCH', '/agent/owner/social-profile', input);
  }

  generateProfileQuestions() {
    this.assertAuthorized('generateProfileQuestions');
    return this.request('GET', '/agent/owner/social-profile/questions');
  }

  saveProfileAnswer(input: { key: string; answer: string }) {
    this.assertAuthorized('saveProfileAnswer');
    return this.request('POST', '/agent/owner/social-profile/answers', input);
  }

  getProfileCompletion() {
    this.assertAuthorized('getProfileCompletion');
    return this.request('GET', '/agent/owner/social-profile/completion');
  }

  submitSocialIntent(input: SubmitSocialIntentInput): Promise<SubmitSocialIntentResult> {
    if (!this.agentToken) {
      return this.request('POST', '/public/social-intents', input);
    }
    return this.request('POST', '/agent/social-requests', input);
  }

  createSocialRequest(input: CreateSocialRequestInput): Promise<CreateSocialRequestResult> {
    return this.submitSocialIntent(input);
  }

  listPublicSocialIntents(
    input: PublicSocialIntentSearchInput = {},
  ): Promise<PublicSocialIntentSearchResult> {
    return this.request('GET', `/public/social-intents${this.toQueryString(input)}`);
  }

  searchPublicSocialIntents(
    input: PublicSocialIntentSearchInput = {},
  ): Promise<PublicSocialIntentSearchResult> {
    return this.listPublicSocialIntents(input);
  }

  getPublicSocialIntent(publicIntentId: string): Promise<PublicSocialIntent> {
    return this.request('GET', `/public/social-intents/${encodeURIComponent(publicIntentId)}`);
  }

  getPublicSocialIntentMatches(publicIntentId: string): Promise<CreateSocialRequestResult> {
    return this.request(
      'GET',
      `/public/social-intents/${encodeURIComponent(publicIntentId)}/matches`,
    );
  }

  getMatchResults(socialRequestId: number | string): Promise<CreateSocialRequestResult> {
    if (!this.agentToken && String(socialRequestId).startsWith('public_')) {
      return this.getPublicSocialIntentMatches(String(socialRequestId));
    }
    this.assertAuthorized('getMatchResults');
    return this.request('GET', `/agent/social-requests/${socialRequestId}/matches`);
  }

  getMatches(socialRequestId: number | string): Promise<CreateSocialRequestResult> {
    return this.getMatchResults(socialRequestId);
  }

  confirmCandidateDecision(
    socialRequestId: number,
    input: CandidateDecisionInput,
  ): Promise<CandidateDecisionResult> {
    this.assertAuthorized('confirmCandidateDecision');
    return this.request('POST', `/agent/social-requests/${socialRequestId}/candidates/decision`, input);
  }

  decideCandidate(
    socialRequestId: number,
    input: CandidateDecisionInput,
  ): Promise<CandidateDecisionResult> {
    return this.confirmCandidateDecision(socialRequestId, input);
  }

  /**
   * Legacy utility. For OpenClaw product flows, prefer submitSocialIntent()
   * so FitMeet owns matching, ranking, safety, and result handoff.
   */
  searchNearbyPeople(input: CreateSocialRequestInput): Promise<{ candidates: SocialCandidate[] }> {
    this.assertAuthorized('searchNearbyPeople');
    return this.request('POST', '/agent/nearby/search', input);
  }

  draftPrivateMessage(input: DraftMessageInput): Promise<DraftMessageResult> {
    this.assertAuthorized('draftPrivateMessage');
    return this.request('POST', '/agent/messages/draft', {
      type: 'message',
      ...input,
    });
  }

  sendPrivateMessage(input: SendMessageInput): Promise<SendMessageResult> {
    this.assertAuthorized('sendPrivateMessage');
    return this.request('POST', '/agent/messages/send', input);
  }

  getAgentInbox(input: { limit?: number; unreadOnly?: boolean } = {}): Promise<AgentInboxResult> {
    this.assertAuthorized('getAgentInbox');
    return this.request('GET', `/agent/inbox/conversations${this.toQueryString(input)}`);
  }

  getAgentInboxMessages(input: {
    conversationId: string;
    limit?: number;
  }): Promise<AgentInboxMessagesResult> {
    this.assertAuthorized('getAgentInboxMessages');
    return this.request(
      'GET',
      `/agent/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages${this.toQueryString({ limit: input.limit })}`,
    );
  }

  replyAgentInbox(input: { conversationId: string; content: string }) {
    this.assertAuthorized('replyAgentInbox');
    return this.request(
      'POST',
      `/agent/inbox/conversations/${encodeURIComponent(input.conversationId)}/reply`,
      { content: input.content },
    );
  }

  searchAgents(input: { q?: string; type?: string; limit?: number } = {}) {
    this.assertAuthorized('searchAgents');
    return this.request('GET', `/agent/a2a/search${this.toQueryString(input)}`);
  }

  sendAgentMessage(input: { agentId: number; content: string; fromAgentId?: number }) {
    this.assertAuthorized('sendAgentMessage');
    return this.request(
      'POST',
      `/agent/a2a/agents/${encodeURIComponent(String(input.agentId))}/message`,
      {
        content: input.content,
        ...(input.fromAgentId ? { fromAgentId: input.fromAgentId } : {}),
      },
    );
  }

  requestContactExchange(input: { targetUserId: number; note?: string }) {
    this.assertAuthorized('requestContactExchange');
    return this.request('POST', '/agent/contact/request', input);
  }

  readActivityLog() {
    this.assertAuthorized('readActivityLog');
    return this.request('GET', '/agent/activity');
  }

  getAgentPermissions() {
    this.assertAuthorized('getAgentPermissions');
    return this.request('GET', '/agent/owner/permissions');
  }

  updateAgentPermissions(input: Record<string, unknown>) {
    this.assertAuthorized('updateAgentPermissions');
    return this.request('PATCH', '/agent/owner/permissions', input);
  }

  runAiSocialAutopilotOnce() {
    this.assertAuthorized('runAiSocialAutopilotOnce');
    return this.request('POST', '/agent/autopilot/run-once');
  }

  getPendingApprovals() {
    this.assertAuthorized('getPendingApprovals');
    return this.request('GET', '/agent/owner/pending-approvals');
  }

  approveAction(approvalId: number) {
    this.assertAuthorized('approveAction');
    return this.request('POST', `/agent/owner/approvals/${approvalId}/approve`);
  }

  rejectAction(approvalId: number) {
    this.assertAuthorized('rejectAction');
    return this.request('POST', `/agent/owner/approvals/${approvalId}/reject`);
  }

  private assertAuthorized(action: string) {
    if (!this.agentToken) {
      throw new FitMeetSocialSkillsError(
        `${action} requires FITMEET_AGENT_TOKEN. Public mode only supports submitSocialIntent.`,
        401,
        { mode: 'public' },
      );
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.agentToken ? { Authorization: `Bearer ${this.agentToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    return this.parseResponse<T>(response);
  }

  private async requestWithBearer<T>(
    method: string,
    path: string,
    accessToken: string,
    body?: unknown,
  ): Promise<T> {
    if (!accessToken?.trim()) {
      throw new FitMeetSocialSkillsError('A user access token is required.', 401, {
        auth: 'bearer',
      });
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    return this.parseResponse<T>(response);
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    const data = text ? this.safeJson(text) : undefined;

    if (!response.ok) {
      const message =
        data?.message ||
        data?.error?.message ||
        `FitMeet social-skills request failed with ${response.status}`;
      throw new FitMeetSocialSkillsError(message, response.status, data);
    }

    return data as T;
  }

  private safeJson(text: string) {
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }

  private toQueryString(input: PublicSocialIntentSearchInput) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined && value !== null && value !== '') {
        search.set(key, String(value));
      }
    }
    const qs = search.toString();
    return qs ? `?${qs}` : '';
  }
}

export class FitMeetSocialSkillsError extends Error {
  public readonly code?: string;
  public readonly retryable?: boolean;

  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = 'FitMeetSocialSkillsError';
    const typed = payload as FitMeetErrorPayload | undefined;
    this.code = typed?.code ?? typed?.error?.code;
    this.retryable = typed?.error?.retryable;
  }
}

export async function runDogWalkingExample() {
  const agentToken = process.env.FITMEET_AGENT_TOKEN || undefined;
  const fitmeet = new FitMeetSocialSkills({
    baseUrl: process.env.FITMEET_API_BASE_URL || 'https://www.ourfitmeet.cn/api',
    agentToken,
  });

  if (agentToken) {
    await fitmeet.readOwnerPreferences();
  }

  const task = await fitmeet.submitSocialIntent({
    requestType: 'dog_walking',
    description: 'My owner wants to find a verified nearby dog-walking partner tonight.',
    city: 'Shanghai',
    radiusKm: 3,
    timePreference: 'today_evening',
    verifiedOnly: true,
    interests: ['pet', 'dog'],
    limit: 5,
  });

  const candidate = task.candidates[0];
  if (!candidate || !agentToken || typeof task.request.id !== 'number') return task;

  // OpenClaw should show FitMeet's result to the owner first. After the owner
  // explicitly agrees, FitMeet executes the bounded platform action.
  return fitmeet.confirmCandidateDecision(task.request.id, {
    candidateUserId: candidate.profile.id,
    decision: 'approve',
    connectionAction: 'send_intro',
    ownerConfirmed: true,
  });
}
