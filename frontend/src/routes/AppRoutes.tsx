import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { NotFoundPage } from '../pages/NotFoundPage';
import { navigateToDiscoverWithScrollReset } from '../lib/scrollNavigation';

const PlatformPage = lazy(() =>
  import('../pages/PlatformPage').then((m) => ({ default: m.PlatformPage })),
);
const AgentWorkspacePage = lazy(() =>
  import('../pages/AgentWorkspacePage').then((m) => ({ default: m.AgentWorkspacePage })),
);
const DiscoverPage = lazy(() =>
  import('../pages/DiscoverPage').then((m) => ({ default: m.DiscoverPage })),
);
const CoachPage = lazy(() =>
  import('../pages/CoachPage').then((m) => ({ default: m.CoachPage })),
);
const AiProfileBuilderPage = lazy(() =>
  import('../pages/AiProfileBuilderPage').then((m) => ({ default: m.AiProfileBuilderPage })),
);
const AiSocialRequestPage = lazy(() =>
  import('../pages/AiSocialRequestPage').then((m) => ({ default: m.AiSocialRequestPage })),
);
const SocialSkillsDeveloperPage = lazy(() =>
  import('../pages/SocialSkillsDeveloperPage').then((m) => ({
    default: m.SocialSkillsDeveloperPage,
  })),
);
const AgentHubPage = lazy(() =>
  import('../pages/AgentHubPage').then((m) => ({ default: m.AgentHubPage })),
);
const AgentControlCenterPage = lazy(() =>
  import('../pages/AgentControlCenterPage').then((m) => ({
    default: m.AgentControlCenterPage,
  })),
);
const AgentInboxPage = lazy(() =>
  import('../pages/AgentInboxPage').then((m) => ({ default: m.AgentInboxPage })),
);
const LifeGraphPage = lazy(() =>
  import('../pages/LifeGraphPage').then((m) => ({ default: m.LifeGraphPage })),
);
const MatchConfirmationsPage = lazy(() =>
  import('../pages/MatchConfirmationsPage').then((m) => ({
    default: m.MatchConfirmationsPage,
  })),
);
const AgentConnectPage = lazy(() =>
  import('../pages/AgentConnectPage').then((m) => ({ default: m.AgentConnectPage })),
);
const AgentActivityPage = lazy(() =>
  import('../pages/AgentActivityPage').then((m) => ({ default: m.AgentActivityPage })),
);
const ActivityPage = lazy(() =>
  import('../pages/ActivityPage').then((m) => ({ default: m.ActivityPage })),
);
const MeetDetailPage = lazy(() =>
  import('../pages/MeetDetailPage').then((m) => ({ default: m.MeetDetailPage })),
);
const SocialRequestNewPage = lazy(() =>
  import('../pages/SocialRequestNewPage').then((m) => ({ default: m.SocialRequestNewPage })),
);
const SocialRequestAiPage = lazy(() =>
  import('../pages/SocialRequestAiPage').then((m) => ({ default: m.SocialRequestAiPage })),
);
const SocialRequestDetailPage = lazy(() =>
  import('../pages/SocialRequestDetailPage').then((m) => ({ default: m.SocialRequestDetailPage })),
);
const PublicIntentDetailPage = lazy(() =>
  import('../pages/PublicIntentDetailPage').then((m) => ({
    default: m.PublicIntentDetailPage,
  })),
);
const ProfilePage = lazy(() =>
  import('../pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const SearchPage = lazy(() =>
  import('../pages/SearchPage').then((m) => ({ default: m.SearchPage })),
);
const MessagesPage = lazy(() =>
  import('../pages/MessagesPage').then((m) => ({ default: m.MessagesPage })),
);
const NotificationsPage = lazy(() =>
  import('../pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const UserProfilePage = lazy(() =>
  import('../pages/UserProfilePage').then((m) => ({ default: m.UserProfilePage })),
);
const TopicPage = lazy(() =>
  import('../pages/TopicPage').then((m) => ({ default: m.TopicPage })),
);
const LegalPage = lazy(() =>
  import('../pages/LegalPage').then((m) => ({ default: m.LegalPage })),
);
const SafetyAdminPage = lazy(() =>
  import('../pages/SafetyAdminPage').then((m) => ({ default: m.SafetyAdminPage })),
);
const AdminWaitlistPage = lazy(() =>
  import('../pages/AdminWaitlistPage').then((m) => ({ default: m.AdminWaitlistPage })),
);
const AgentL5AdminPage = lazy(() =>
  import('../pages/AgentL5AdminPage').then((m) => ({ default: m.AgentL5AdminPage })),
);
const GeoLandingPage = lazy(() =>
  import('../pages/GeoLandingPage').then((m) => ({ default: m.GeoLandingPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('../pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const LoginPage = lazy(() => import('../pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const PetPage = lazy(() => import('../pages/PetPage').then((m) => ({ default: m.PetPage })));
const AiRealmPage = lazy(() =>
  import('../pages/AiRealmPage').then((m) => ({ default: m.AiRealmPage })),
);
const CitiesPage = lazy(() =>
  import('../pages/CitiesPage').then((m) => ({ default: m.CitiesPage })),
);
const SportsPage = lazy(() =>
  import('../pages/SportsPage').then((m) => ({ default: m.SportsPage })),
);

function PageLoader() {
  return (
    <div
      className="flex min-h-[46vh] items-center justify-center bg-[#0b0c0d] px-4"
      role="status"
      aria-label="正在进入 FitMeet"
    >
      <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-[#f6efe5]">
        <span className="h-2.5 w-2.5 rounded-full bg-[#18b98f]" />
        正在进入 FitMeet
      </div>
    </div>
  );
}

function DiscoverAliasRoute() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    navigateToDiscoverWithScrollReset(navigate, {
      search: location.search,
      replace: true,
    });
  }, [navigate, location.search]);

  return null;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<PlatformPage page="home" />} />
        <Route path="/features" element={<PlatformPage page="features" />} />
        <Route path="/ecosystem" element={<Navigate to="/features" replace />} />
        <Route path="/developers" element={<PlatformPage page="developers" />} />
        <Route path="/safety" element={<PlatformPage page="safety" />} />
        <Route path="/about" element={<PlatformPage page="about" />} />
        <Route path="/contact" element={<PlatformPage page="contact" />} />
        <Route path="/download" element={<PlatformPage page="download" />} />
        <Route path="/download-app" element={<Navigate to="/download" replace />} />
        <Route path="/download-app/" element={<Navigate to="/download" replace />} />
        <Route path="/app" element={<Navigate to="/download" replace />} />
        <Route path="/demo" element={<PlatformPage page="demo" />} />
        <Route path="/life-graph" element={<PlatformPage page="lifeGraph" />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/legacy-home" element={<Navigate to="/" replace />} />
        <Route path="/agent" element={<AgentWorkspacePage view="home" />} />
        <Route path="/agent/chat" element={<AgentWorkspacePage view="chat" />} />
        <Route path="/agent/chat/:taskId" element={<AgentWorkspacePage view="chat" />} />
        <Route path="/agent/settings" element={<AgentWorkspacePage view="settings" />} />
        <Route path="/agent/projects" element={<AgentWorkspacePage view="projects" />} />
        <Route path="/agent/history" element={<AgentWorkspacePage view="history" />} />
        <Route path="/hall" element={<DiscoverAliasRoute />} />
        <Route path="/nearby" element={<DiscoverAliasRoute />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/meet" element={<DiscoverAliasRoute />} />
        <Route path="/human" element={<DiscoverAliasRoute />} />
        <Route path="/coach" element={<CoachPage />} />
        <Route path="/pet" element={<PetPage />} />
        <Route path="/ai" element={<AiRealmPage />} />
        <Route path="/social-hall" element={<DiscoverAliasRoute />} />
        <Route path="/ai-match" element={<Navigate to="/agent" replace />} />
        <Route
          path="/ai-profile"
          element={
            <ProtectedRoute>
              <AiProfileBuilderPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ai-social"
          element={
            <ProtectedRoute>
              <AiSocialRequestPage />
            </ProtectedRoute>
          }
        />
        <Route path="/agent-token" element={<Navigate to="/agent" replace />} />
        <Route
          path="/agent-hub"
          element={
            <ProtectedRoute>
              <AgentHubPage />
            </ProtectedRoute>
          }
        />
        <Route path="/agent-connect" element={<AgentConnectPage />} />
        <Route path="/agent-connect/permissions" element={<Navigate to="/agent/settings" replace />} />
        <Route path="/agent-connect/preferences" element={<Navigate to="/ai-profile" replace />} />
        <Route path="/agent-connect/activity" element={<Navigate to="/agent" replace />} />
        <Route path="/agent-connect/social-hall" element={<DiscoverAliasRoute />} />
        <Route path="/agent-connect/*" element={<Navigate to="/agent-connect" replace />} />
        <Route path="/agent-control" element={<Navigate to="/agent/settings" replace />} />
        <Route path="/social-agent" element={<Navigate to="/agent" replace />} />
        <Route
          path="/profile/life-graph"
          element={
            <ProtectedRoute>
              <LifeGraphPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agent-inbox"
          element={
            <ProtectedRoute>
              <AgentInboxPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/match-confirmations"
          element={
            <ProtectedRoute>
              <MatchConfirmationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agent-activity"
          element={
            <ProtectedRoute>
              <AgentActivityPage />
            </ProtectedRoute>
          }
        />
        <Route path="/activity/:id" element={<ActivityPage />} />
        <Route path="/meet/:id" element={<MeetDetailPage />} />
        <Route path="/public-intent/:id" element={<PublicIntentDetailPage />} />
        <Route
          path="/social-request/new"
          element={
            <ProtectedRoute>
              <SocialRequestNewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/social-request/ai"
          element={
            <ProtectedRoute>
              <SocialRequestAiPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/social-request/:id"
          element={
            <ProtectedRoute>
              <SocialRequestDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agent/approvals"
          element={
            <ProtectedRoute>
              <AgentControlCenterPage />
            </ProtectedRoute>
          }
        />
        <Route path="/internal/demo/*" element={<Navigate to="/" replace />} />
        <Route path="/demo/*" element={<Navigate to="/demo" replace />} />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route path="/search" element={<SearchPage />} />
        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <MessagesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/user/:id" element={<UserProfilePage />} />
        <Route path="/topic/:tag" element={<TopicPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/privacy" element={<LegalPage type="privacy" />} />
        <Route path="/terms" element={<LegalPage type="terms" />} />
        <Route path="/community" element={<LegalPage type="community" />} />
        <Route path="/city" element={<GeoLandingPage />} />
        <Route path="/city/:slug" element={<GeoLandingPage />} />
        <Route path="/cities" element={<CitiesPage />} />
        <Route path="/sports" element={<SportsPage />} />
        <Route path="/sports/:slug" element={<GeoLandingPage />} />
        <Route path="/guides/:slug" element={<GeoLandingPage />} />
        <Route path="/ai-hosting" element={<Navigate to="/agent" replace />} />
        <Route path="/developers/social-skills" element={<SocialSkillsDeveloperPage />} />
        <Route path="/waitlist" element={<Navigate to="/download" replace />} />
        <Route path="/press" element={<GeoLandingPage />} />
        <Route
          path="/admin/safety"
          element={
            <ProtectedRoute>
              <SafetyAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/waitlist"
          element={
            <ProtectedRoute>
              <AdminWaitlistPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/agent-l5"
          element={
            <ProtectedRoute>
              <AgentL5AdminPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
