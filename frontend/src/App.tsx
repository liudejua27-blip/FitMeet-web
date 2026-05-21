import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RealtimeProvider } from './components/RealtimeProvider';
import { LoginModal } from './components/auth/LoginModal';
import { NotFoundPage } from './pages/NotFoundPage';
import { useAuthStore, useNotificationStore, useSocialStore } from './stores';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const FitMeetHallPage = lazy(() =>
  import('./pages/FitMeetHallPage').then((m) => ({ default: m.FitMeetHallPage })),
);
const DiscoverPage = lazy(() =>
  import('./pages/DiscoverPage').then((m) => ({ default: m.DiscoverPage })),
);
const MeetPage = lazy(() => import('./pages/MeetPage').then((m) => ({ default: m.MeetPage })));
const CoachPage = lazy(() => import('./pages/CoachPage').then((m) => ({ default: m.CoachPage })));
const AiProfileBuilderPage = lazy(() =>
  import('./pages/AiProfileBuilderPage').then((m) => ({ default: m.AiProfileBuilderPage })),
);
const AiSocialRequestPage = lazy(() =>
  import('./pages/AiSocialRequestPage').then((m) => ({ default: m.AiSocialRequestPage })),
);
const SocialSkillsDeveloperPage = lazy(() =>
  import('./pages/SocialSkillsDeveloperPage').then((m) => ({ default: m.SocialSkillsDeveloperPage })),
);
const AgentHubPage = lazy(() =>
  import('./pages/AgentHubPage').then((m) => ({ default: m.AgentHubPage })),
);
const AgentControlCenterPage = lazy(() =>
  import('./pages/AgentControlCenterPage').then((m) => ({
    default: m.AgentControlCenterPage,
  })),
);
const AgentInboxPage = lazy(() =>
  import('./pages/AgentInboxPage').then((m) => ({ default: m.AgentInboxPage })),
);
const SocialAgentConsolePage = lazy(() =>
  import('./pages/SocialAgentConsolePage').then((m) => ({ default: m.SocialAgentConsolePage })),
);
const MatchConfirmationsPage = lazy(() =>
  import('./pages/MatchConfirmationsPage').then((m) => ({
    default: m.MatchConfirmationsPage,
  })),
);
const AgentConnectPage = lazy(() =>
  import('./pages/AgentConnectPage').then((m) => ({ default: m.AgentConnectPage })),
);
const AgentActivityPage = lazy(() =>
  import('./pages/AgentActivityPage').then((m) => ({ default: m.AgentActivityPage })),
);
const ActivityPage = lazy(() =>
  import('./pages/ActivityPage').then((m) => ({ default: m.ActivityPage })),
);
const SocialRequestNewPage = lazy(() =>
  import('./pages/SocialRequestNewPage').then((m) => ({ default: m.SocialRequestNewPage })),
);
const SocialRequestAiPage = lazy(() =>
  import('./pages/SocialRequestAiPage').then((m) => ({ default: m.SocialRequestAiPage })),
);
const SocialRequestDetailPage = lazy(() =>
  import('./pages/SocialRequestDetailPage').then((m) => ({ default: m.SocialRequestDetailPage })),
);
const DemoAgentSocialLoopPage = lazy(() =>
  import('./pages/DemoAgentSocialLoopPage').then((m) => ({ default: m.DemoAgentSocialLoopPage })),
);
const DemoInvestorPage = lazy(() =>
  import('./pages/DemoInvestorPage').then((m) => ({ default: m.DemoInvestorPage })),
);
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const SearchPage = lazy(() =>
  import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })),
);
const MessagesPage = lazy(() =>
  import('./pages/MessagesPage').then((m) => ({ default: m.MessagesPage })),
);
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const UserProfilePage = lazy(() =>
  import('./pages/UserProfilePage').then((m) => ({ default: m.UserProfilePage })),
);
const TopicPage = lazy(() => import('./pages/TopicPage').then((m) => ({ default: m.TopicPage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.LegalPage })));
const SafetyAdminPage = lazy(() =>
  import('./pages/SafetyAdminPage').then((m) => ({ default: m.SafetyAdminPage })),
);
const GeoLandingPage = lazy(() =>
  import('./pages/GeoLandingPage').then((m) => ({ default: m.GeoLandingPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const PetPage = lazy(() => import('./pages/PetPage').then((m) => ({ default: m.PetPage })));
const AiRealmPage = lazy(() =>
  import('./pages/AiRealmPage').then((m) => ({ default: m.AiRealmPage })),
);
const CitiesPage = lazy(() =>
  import('./pages/CitiesPage').then((m) => ({ default: m.CitiesPage })),
);
const SportsPage = lazy(() =>
  import('./pages/SportsPage').then((m) => ({ default: m.SportsPage })),
);
const SafetyPage = lazy(() =>
  import('./pages/SafetyPage').then((m) => ({ default: m.SafetyPage })),
);
const AboutPage = lazy(() =>
  import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })),
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
        正在同步 Agent 宇宙
      </div>
    </div>
  );
}

function App() {
  const { restoreSession, isLoggedIn } = useAuthStore();
  const { syncFromServer } = useSocialStore();
  const { loadNotifications } = useNotificationStore();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (isLoggedIn) {
      syncFromServer();
      loadNotifications();
    }
  }, [isLoggedIn, syncFromServer, loadNotifications]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <RealtimeProvider>
          <Layout>
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/hall" element={<FitMeetHallPage />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/meet" element={<MeetPage />} />
              <Route path="/human" element={<Navigate to="/hall" replace />} />
              <Route path="/coach" element={<CoachPage />} />
              <Route path="/pet" element={<PetPage />} />
              <Route path="/ai" element={<AiRealmPage />} />
              <Route path="/ai-match" element={<Navigate to="/social-agent" replace />} />
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
              <Route
                path="/agent-token"
                element={
                  <ProtectedRoute>
                    <AgentHubPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/agent-hub"
                element={
                  <ProtectedRoute>
                    <AgentHubPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/agent-connect/*" element={<AgentConnectPage />} />
              <Route
                path="/agent-control"
                element={
                  <ProtectedRoute>
                    <AgentControlCenterPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/social-agent"
                element={
                  <ProtectedRoute>
                    <SocialAgentConsolePage />
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
              <Route path="/demo/agent-social-loop" element={<DemoAgentSocialLoopPage />} />
              <Route path="/demo/investor" element={<DemoInvestorPage />} />
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
              <Route path="/about" element={<AboutPage />} />
              <Route path="/safety" element={<SafetyPage />} />
              <Route path="/ai-hosting" element={<Navigate to="/social-agent" replace />} />
              <Route path="/developers/social-skills" element={<SocialSkillsDeveloperPage />} />
              <Route path="/press" element={<GeoLandingPage />} />
              <Route
                path="/admin/safety"
                element={
                  <ProtectedRoute>
                    <SafetyAdminPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          <LoginModal />
          </Layout>
        </RealtimeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
