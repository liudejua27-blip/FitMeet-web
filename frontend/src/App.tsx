import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { NotFoundPage } from './pages/NotFoundPage';
import { useAuthStore, useSocialStore, useNotificationStore } from './stores';

// Lazy load all pages for code splitting
const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage').then(m => ({ default: m.DiscoverPage })));
const MeetPage = lazy(() => import('./pages/MeetPage').then(m => ({ default: m.MeetPage })));
const CoachPage = lazy(() => import('./pages/CoachPage').then(m => ({ default: m.CoachPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const MessagesPage = lazy(() => import('./pages/MessagesPage').then(m => ({ default: m.MessagesPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage').then(m => ({ default: m.UserProfilePage })));
const TopicPage = lazy(() => import('./pages/TopicPage').then(m => ({ default: m.TopicPage })));

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]" role="status" aria-label="加载中">
      <div className="w-8 h-8 border-2 border-lime border-t-transparent rounded-full animate-spin" />
      <span className="sr-only">页面加载中...</span>
    </div>
  );
}

function App() {
  const { restoreSession, isLoggedIn } = useAuthStore();
  const { syncFromServer } = useSocialStore();
  const { loadNotifications } = useNotificationStore();

  // Restore JWT session and sync server state on app start
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Sync social & notification data when logged in
  useEffect(() => {
    if (isLoggedIn) {
      syncFromServer();
      loadNotifications();
    }
  }, [isLoggedIn, syncFromServer, loadNotifications]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Layout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/meet" element={<MeetPage />} />
              <Route path="/coach" element={<CoachPage />} />
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
              <Route path="/user/:id" element={<UserProfilePage />} />
              <Route path="/topic/:tag" element={<TopicPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </Layout>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
