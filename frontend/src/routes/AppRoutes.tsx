import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { NotFoundPage } from '../pages/NotFoundPage';

const PlatformPage = lazy(() =>
  import('../pages/PlatformPage').then((m) => ({ default: m.PlatformPage })),
);
const AgentWorkspacePage = lazy(() =>
  import('../pages/AgentWorkspacePage').then((m) => ({ default: m.AgentWorkspacePage })),
);
const AgentPersonalInfoPage = lazy(() =>
  import('../pages/AgentPersonalInfoPage').then((m) => ({ default: m.AgentPersonalInfoPage })),
);
const DiscoverPage = lazy(() =>
  import('../pages/DiscoverPage').then((m) => ({ default: m.DiscoverPage })),
);
const PublicIntentDetailPage = lazy(() =>
  import('../pages/PublicIntentDetailPage').then((m) => ({
    default: m.PublicIntentDetailPage,
  })),
);
const MessagesPage = lazy(() =>
  import('../pages/MessagesPage').then((m) => ({ default: m.MessagesPage })),
);
const UserProfilePage = lazy(() =>
  import('../pages/UserProfilePage').then((m) => ({ default: m.UserProfilePage })),
);
const LegalPage = lazy(() => import('../pages/LegalPage').then((m) => ({ default: m.LegalPage })));
const SafetyAdminPage = lazy(() =>
  import('../pages/SafetyAdminPage').then((m) => ({ default: m.SafetyAdminPage })),
);
const AdminWaitlistPage = lazy(() =>
  import('../pages/AdminWaitlistPage').then((m) => ({ default: m.AdminWaitlistPage })),
);
const AgentL5AdminPage = lazy(() =>
  import('../pages/AgentL5AdminPage').then((m) => ({ default: m.AgentL5AdminPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('../pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const LoginPage = lazy(() => import('../pages/LoginPage').then((m) => ({ default: m.LoginPage })));

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

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<PlatformPage page="home" />} />
        <Route path="/features" element={<PlatformPage page="features" />} />
        <Route path="/safety" element={<PlatformPage page="safety" />} />
        <Route path="/about" element={<PlatformPage page="about" />} />
        <Route path="/download" element={<PlatformPage page="download" />} />
        <Route path="/demo" element={<PlatformPage page="demo" />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/agent" element={<AgentWorkspacePage view="home" />} />
        <Route path="/agent/chat" element={<AgentWorkspacePage view="chat" />} />
        <Route path="/agent/chat/:taskId" element={<AgentWorkspacePage view="chat" />} />
        <Route
          path="/agent/profile"
          element={
            <ProtectedRoute>
              <AgentPersonalInfoPage />
            </ProtectedRoute>
          }
        />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/public-intent/:id" element={<PublicIntentDetailPage />} />
        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <MessagesPage />
            </ProtectedRoute>
          }
        />
        <Route path="/user/:id" element={<UserProfilePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/privacy" element={<LegalPage type="privacy" />} />
        <Route path="/terms" element={<LegalPage type="terms" />} />
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
