# FitMeet Client API Integration Matrix

Last updated: 2026-06-25

This matrix is the P0 source of truth for the Social Contact Loop V1 client
handoff. It verifies whether a user-visible feature is only documented, only
registered, or actually reachable from Web and iOS clients.

Status legend:

- `wired`: backend contract, backend controller/service, client endpoint, and at
  least one real caller exist.
- `partial`: contract exists but one side is missing a caller, recovery path, or
  current UI action wiring.
- `gap`: endpoint is called or expected by a client but missing from the formal
  backend contract or not safely usable in Release.
- `unsupported`: intentionally not part of the current production loop.

Hard failure rules:

- OpenAPI has an endpoint but no backend controller/service.
- Web registry has an endpoint but no page or store caller for the product
  flow.
- iOS endpoint exists but backend contract is missing.
- A Release client falls back to mock users, mock friends, mock applications, or
  fake conversation success.
- Client treats a failed application, friendship, message, or conversation
  provisioning request as success.
- Web and iOS use incompatible enum names for the same status.

## Critical P0 Gaps

1. Web does not yet expose the real application loop in pages. The registry
   includes public intent application endpoints, but `DiscoverPage` sends public
   intent cards to details/Agent instead of `POST /public/social-intents/{id}/applications`,
   and `MessagesPage` has no received-application card with accept/reject and
   provisioning states.
2. Web `messagesClient.startConversation()` still posts only `{ otherUserId }`.
   The backend contract now requires contextual start with `targetUserId`,
   `contextType`, `contextId`, and `Idempotency-Key`.
3. Web socket handling listens to `newMessage` only. It does not consume
   `conversation.ready`, so outbox-provisioned conversations cannot reliably
   move from `provisioning` to `ready` on Web.
4. The core backend/OpenAPI contract has no `/feed` endpoint. iOS now guards
   dynamic feed reads/writes in `DiscoveryRepository` so Release no longer
   depends on `/feed`; formal `public_posts` remains a later product API.
5. Cross-end staging proof is still missing. The A/B flow must demonstrate the
   same `publicIntentId`, `applicationId`, `meetId`, and `conversationId` across
   iOS, Web, PostgreSQL, Mongo, and realtime/outbox recovery.

## Matrix

| Endpoint | HTTP method | Backend controller | Backend service | OpenAPI operationId | Web registry | Web caller | iOS endpoint | iOS APIClient method | iOS caller | Auth requirement | Idempotency requirement | Current status | Missing work |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/auth/login` | POST | `AuthController.login` | `AuthService` | `login` | `auth.login` | `authClient` | `Auth.login` | login methods | `LoginView`/auth flow | Public | No | wired | None for Social Loop V1. |
| `/auth/refresh` | POST | `AuthController.refresh` | `AuthService` | `refreshToken` | `auth.refreshToken` | `authClient` | `Auth.refresh` | token refresh methods | app restore | Public refresh token | No | wired | Keep auth restore tests aligned with server behavior. |
| `/auth/profile` | GET | `AuthController.getProfile` | `AuthService` | `getAuthProfile` | `auth.getProfile` | auth store | `Auth.profile` | profile restore methods | `AppState`/root gate | Bearer | No | wired | None. |
| `/users/me/onboarding-status` | GET | `UsersController.getOnboardingStatus` | `OnboardingService` | `getOnboardingStatus` | `onboarding.status` | onboarding clients/tests | `Onboarding.status` | `getOnboardingStatus` | `RootView`/`AppState` | Bearer | No | wired | Staging must verify reinstall/Web login restores server status. |
| `/users/me/onboarding/complete` | POST | `UsersController.completeOnboarding` | `OnboardingService` | `completeOnboarding` | `onboarding.complete` | onboarding clients/tests | `Onboarding.complete` | `completeOnboarding` | onboarding completion flow | Bearer | Required | wired | Ensure iOS never uses local draft completion as source of truth. |
| `/users/me/profile-photos` | GET | `UsersController.listProfilePhotos` | `ProfilePhotoService` | `listProfilePhotos` | `onboarding.profilePhotos` | onboarding clients/tests | `Onboarding.profilePhotos` | `getProfilePhotos` | onboarding/photo restore | Bearer | No | wired | None. |
| `/users/me/profile-photos` | PUT | `UsersController.replaceProfilePhotos` | `ProfilePhotoService` | `replaceProfilePhotos` | `onboarding.profilePhotos` | onboarding clients/tests | `Onboarding.profilePhotos` | `replaceProfilePhotos` | onboarding/photo upload | Bearer | No | wired | Consider idempotency if retry can repeat the same replacement payload. |
| `/users/me/profile-photos/{photoId}` | DELETE | `UsersController.deleteProfilePhoto` | `ProfilePhotoService` | `deleteProfilePhoto` | `onboarding.deleteProfilePhoto` | onboarding clients/tests | `Onboarding.deleteProfilePhoto` | `deleteProfilePhoto` | photo management | Bearer | Naturally idempotent final state | wired | None. |
| `/uploads/image` | POST | `UploadsController.uploadImage` | `UploadsService` | `uploadImage` | `uploads.image` | upload clients | `Uploads.image` | `uploadImage` | onboarding/moment upload | Bearer | No | wired | Must remain multipart/form-data in OpenAPI and client tests. |
| `/users/me/social-profile` | GET/PUT | `UsersController.get/updateSocialProfile` | `SocialProfileService` | `getSocialProfile`/`updateSocialProfile` | `socialProfile.current` | profile clients | Not first-class in iOS registry | Not first-class | profile/onboarding via onboarding DTO | Bearer | No | partial | Decide whether iOS edits social profile through onboarding only or add typed methods. |
| `/social-agent/chat/messages/stream` | POST | `SocialAgentChatController.streamMessage` | social agent services | `streamChatMessage` | `socialAgentChat.messagesStream` | Agent workspace | `SocialAgentChat` stream/task endpoints | social agent methods | `AgentHomeView` | Bearer | No | wired | Agent side effects must continue using approval checkpoints and domain services. |
| `/social-agent/chat/tasks/{taskId}/publish-social-request` | POST | `SocialAgentChatController.publishOpportunityCard` | `SocialAgentDraftPublicationService` | `publishOpportunityCard` | `socialAgentChat.publishSocialRequest` | Agent tool actions | `SocialAgentChat.publishSocialRequest` equivalent task path | task publish methods | `AgentHomeView` | Bearer | Approval checkpoint | wired | Staging must verify created public intent ID matches Discover/Web. |
| `/social-agent/chat/tasks/{taskId}/send-message` | POST | `SocialAgentChatController.sendCandidateMessage` | agent contact services | `sendCandidateMessage` | `socialAgentChat.sendCandidateMessage` | Agent tool actions | `SocialAgentChat.sendCandidateMessage` | `sendCandidateMessage` | candidate detail/actions | Bearer | Approved opener should be idempotent | partial | Verify it reserves opener through `ContactPolicyService`; no direct Mongo write. |
| `/social-agent/chat/tasks/{taskId}/connect-candidate` | POST | `SocialAgentChatController.connectCandidate` | `ConnectionsService` through agent action | `connectCandidate` | `socialAgentChat.connectCandidate` | Agent tool actions | `SocialAgentChat.connectCandidate` | `connectCandidate` | candidate detail/actions | Bearer | Approved action should be idempotent | partial | Verify candidate ownership/approval checkpoint in integration tests. |
| `/public/social-intents` | GET | discover/public social intent controller | public intent services | `listPublicSocialIntents` | `discover.publicSocialIntents` | `DiscoverPage` via `getPublicSocialIntents` | `Feed.publicSocialIntents` | `getPublicSocialIntents` | `MomentsView` discover tab | Public read | No | wired | Staging must verify same records across Web/iOS. |
| `/public/social-intents/{id}` | GET | discover/public social intent controller | public intent services | `getPublicSocialIntent` | `discover.publicSocialIntent` | detail presenter/routes | `Feed.publicSocialIntent` | `getPublicSocialIntent` | detail/discover flows | Public read | No | wired | Ensure deleted/expired states render consistently. |
| `/public/social-intents/{id}/matches` | GET | discover/public social intent controller | matching service | `getPublicSocialIntentMatches` | `discover.publicSocialIntentMatches` | API client only | `Feed.publicSocialIntentMatches` | `getPublicSocialIntentMatches` | optional detail flows | Public/read or bearer-dependent | No | partial | Confirm whether public or auth-gated before exposing candidate details. |
| `/public/social-intents/{id}/applications` | POST | `PublicIntentApplicationsController.createApplication` | `PublicIntentApplicationsService.createApplication` | `createPublicIntentApplication` | `discover.publicSocialIntentApplications` | Registry only; `DiscoverPage` does not call it | `PublicIntentApplications.forIntent` | `createPublicIntentApplication` | `MomentsView` CTA | Bearer; onboarding ready | Required | partial | Wire Web CTA to application creation and service status; no fake local join success. |
| `/public/social-intents/{id}/applications` | GET | `PublicIntentApplicationsController.listForIntent` | `PublicIntentApplicationsService.listForIntent` | `listPublicIntentApplications` | `discover.publicSocialIntentApplications` | Registry only | `PublicIntentApplications.forIntent` | `listPublicIntentApplications` | limited/admin/detail use | Bearer owner | No | partial | Web owner/detail view must load real applicants. |
| `/users/me/public-intent-applications?role=owner|applicant` | GET | `PublicIntentApplicationsController.listMine` | `PublicIntentApplicationsService.listMine` | `listMyPublicIntentApplications` | `discover.myPublicIntentApplications` | Registry only | `PublicIntentApplications.mine` | `listMyPublicIntentApplications` | `MessagesView`, `MomentsView` restore | Bearer | No | partial | Web messages/profile must show owner/applicant application cards. |
| `/public-intent-applications/{id}/accept` | POST | `PublicIntentApplicationsController.acceptApplication` | `PublicIntentApplicationsService.acceptApplication` | `acceptPublicIntentApplication` | `discover.acceptPublicIntentApplication` | Registry only | `PublicIntentApplications.accept` | `acceptPublicIntentApplication` | `MessagesView` owner application card | Bearer owner | Required | partial | Web accept card, provisioning UI, realtime/short-poll recovery. |
| `/public-intent-applications/{id}/reject` | POST | `PublicIntentApplicationsController.rejectApplication` | `PublicIntentApplicationsService.rejectApplication` | `rejectPublicIntentApplication` | `discover.rejectPublicIntentApplication` | Registry only | `PublicIntentApplications.reject` | `rejectPublicIntentApplication` | `MessagesView` owner application card | Bearer owner | Required | partial | Web reject action and idempotency key persistence. |
| `/public-intent-applications/{id}/cancel` | POST | `PublicIntentApplicationsController.cancelApplication` | `PublicIntentApplicationsService.cancelApplication` | `cancelPublicIntentApplication` | `discover.cancelPublicIntentApplication` | Registry only | `PublicIntentApplications.cancel` | `cancelPublicIntentApplication` | `MomentsView` applicant CTA | Bearer applicant | Required | partial | Web applicant cancel state. |
| `/connections/requests` | POST | `ConnectionsController.createRequest` | `ConnectionsService.createRequest` | `createConnectionRequest` | `friends.createConnectionRequest` | Registry only/Agent tools | `Connections.requests` | `createConnectionRequest` | profile/candidate detail | Bearer; onboarding ready | Required | partial | Web profile button must use relationship state and idempotency key. |
| `/connections/requests?box=inbox|outbox&status=pending` | GET | `ConnectionsController.listRequests` | `ConnectionsService.listRequests` | `listConnectionRequests` | `friends.listConnectionRequests` | Registry only | `Connections.requests` | `listConnectionRequests` | future relationship/profile | Bearer | No | partial | Web messages/profile needs request inbox/outbox cards. |
| `/connections/requests/{id}/accept` | POST | `ConnectionsController.acceptRequest` | `ConnectionsService.acceptRequest` | `acceptConnectionRequest` | `friends.acceptConnectionRequest` | Registry only | `Connections.accept` | `acceptConnectionRequest` | profile/candidate detail | Bearer recipient | Required | partial | Web incoming friend request action. |
| `/connections/requests/{id}/reject` | POST | `ConnectionsController.rejectRequest` | `ConnectionsService.rejectRequest` | `rejectConnectionRequest` | `friends.rejectConnectionRequest` | Registry only | `Connections.reject` | `rejectConnectionRequest` | profile/candidate detail | Bearer recipient | Required | partial | Web incoming friend request action. |
| `/connections/requests/{id}/cancel` | POST | `ConnectionsController.cancelRequest` | `ConnectionsService.cancelRequest` | `cancelConnectionRequest` | `friends.cancelConnectionRequest` | Registry only | `Connections.cancel` | `cancelConnectionRequest` | profile/candidate detail | Bearer requester | Required | partial | Web outgoing request cancel state. |
| `/friends` | GET | `FriendsController.getFriends` | `ConnectionsService.listFriends` | `listFriends` | `friends.list` | `dataService.getFriends` | `Friends.root` | `getFriends` | `MessagesView`/profile friends | Bearer | No | wired | Confirm Web empty state never injects follow/mock fallback. |
| `/friends/{userId}` | DELETE | `FriendsController.deleteFriend` | `ConnectionsService.deleteFriend` | `deleteFriend` | `friends.deleteFriend` | Registry only | `Friends.delete` | `deleteFriend` | profile/friends management | Bearer | Naturally idempotent final state | partial | Web unfriend action and state refresh. |
| `/relationships/users/{userId}` | GET | `ConnectionsController.getRelationship` | `ConnectionsService.getRelationshipState` | `getRelationshipState` | `friends.relationshipState` | Registry only | `Relationships.user` | `getRelationshipState` | profile/candidate buttons/chat gate | Bearer | No | partial | Web profile must map buttons from server relationship state. |
| `/messages/start` | POST | `MessagesController.startConversation` | `MessagesService.startConversationWithPolicy` | `startConversation` | `messages.startConversation` | `messagesClient.startConversation` sends old `{ otherUserId }` | `Messages.startConversation` | contextual and legacy overloads | profile/candidate opener | Bearer; contact permission | Required | partial | Web must send `targetUserId`, `contextType`, `contextId`, `initialMessage`, and `Idempotency-Key`. |
| `/messages/conversations` | GET | `MessagesController.getConversations` | `MessagesService.getConversations` | `listConversations` | `messages.getConversations` | `messageStore.loadConversations` | `Messages.conversations` | `getConversations` | `MessagesView` | Bearer | No | wired | Add recovery after `conversation.ready` and app foreground on Web. |
| `/messages/conversations/{conversationId}` | GET | `MessagesController.getMessages` | `MessagesService.getMessages` | `listMessages` | `messages.getConversationMessages` | `messageStore.loadMessages` | `Messages.conversationMessages` | `getConversationMessages` | `MessagesView` | Bearer participant | No | wired | Ensure provisioning/closed errors are surfaced. |
| `/messages/conversations/{conversationId}/send` | POST | `MessagesController.sendMessage` | `MessagesService.sendMessage` | `sendMessage` | `messages.sendConversationMessage` | `messageStore.sendMessage` optimistic only | `Messages.sendConversationMessage` | `sendConversationMessage` | `MessagesView` chat | Bearer participant and contact permission | No | partial | Web must rollback/disable input on `CONTACT_NOT_ALLOWED`, `OPENER_ALREADY_SENT`, `USER_BLOCKED`, `CONVERSATION_PROVISIONING`, `SOCIAL_PROFILE_NOT_READY`. |
| `/messages/public-intents/{id}/start` | POST | `MessagesController.startPublicIntentConversation` | `MessagesService.startPublicIntentConversation` | `startPublicIntentConversation` | `messages.startPublicIntentConversation` | API only | No iOS endpoint | No iOS method | None | Bearer; permission already open | Compatibility only | partial | Do not use as unconditional Web chat path. Prefer contextual `/messages/start`. |
| Realtime `conversation.ready` | socket event | realtime gateway/outbox worker | `DomainOutboxWorkerService` and realtime service | Not OpenAPI | No registry | Web socket does not listen | `FitMeetRealtimeClient` | realtime event decoder | `MessagesView` recovery | Bearer socket token | `eventId` dedupe | partial | Web must handle event, dedupe, reload applications/relationships/conversations, stop polling. |
| `/meets` | GET/POST | `MeetsController` | `MeetsService` | `listMeets`/`createMeet` | `meets.listOrCreate` | `DiscoverPage` old meet list | Activity endpoints | existing activity/meet methods | discover/history | Bearer for create | TBD | wired | Accepted application-created meet should be source of truth for Social Loop. |
| `/meets/{id}/join` | POST | `MeetsController.joinMeet` | `MeetsService.joinMeet` | `joinMeet` | `meets.join` | `DiscoverPage.handleJoin` for old meets | Existing meet endpoint | join methods | legacy flows | Bearer | TBD | partial | Do not use this to simulate public intent application acceptance. |
| `/safety/reports` | POST | `SafetyController.createReport` | `SafetyService.report` | `createReport` | `safety.createReport` | safety clients | safety report endpoint | `reportSafety` | profile/feed/report actions | Bearer | No | wired | Public feed reporting must target supported entity types only. |
| `/safety/blocks/{id}` | POST/DELETE | `SafetyController.block/unblockUser` | `SafetyService` and contact policy | `blockUser`/`unblockUser` | `safety.blockUser`/`unblockUser` | safety/profile clients | safety endpoints | block/report methods | profile/chat safety | Bearer | Final-state idempotent | partial | Staging must prove block immediately closes existing conversation permission and unblock does not auto-restore. |
| `/safety/blocks/ids` | GET | `SafetyController.blockedIds` | `SafetyService` | `getBlockedUserIds` | `safety.blockedIds` | safety clients | safety endpoint | blocked IDs methods | safety/profile | Bearer | No | wired | None. |
| `/feed` | GET/POST | None in core backend contract | None in core backend contract | None | None | None | `Feed.posts` | `getFeed`/`createFeedPost` | `MomentsView` dynamic feed | Debug-only client use after iOS guard | No | unsupported | Formal `public_posts` API remains after Social Loop V1; Release returns empty/unavailable rather than calling `/feed`. |
| `/feed/{id}/like` | POST | None in core backend contract | None in core backend contract | None | None | None | `Feed.likePost` | `likeFeedPost` | `MomentsView` like | Debug-only client use after iOS guard | Should be idempotent when formalized | unsupported | Formal like endpoint should be part of `public_posts`; Release returns unavailable rather than fake success. |

## Required Next Execution Order

1. Fix client/backend contract drift before adding features:
   - Web contextual `/messages/start`.
   - Web public intent application CTA, owner inbox, accept/reject, and
     provisioning recovery.
   - Web `conversation.ready` socket handling plus bounded polling fallback.
   - Keep iOS `/feed` Release safety until formal `public_posts` exists.
2. Add cross-end staging script/tests for the A/B loop:
   - A and B onboarding ready.
   - A has active public intent.
   - B applies.
   - A accepts.
   - PostgreSQL application/meet/contact permission are committed.
   - Outbox creates or reuses one Mongo conversation.
   - Both clients see the same conversation.
   - A blocks B and B's next send returns `USER_BLOCKED`.
3. Only after this loop is green, implement formal `public_posts` and dynamic
   feed APIs.
