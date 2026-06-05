import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { RealtimeProvider } from './components/RealtimeProvider';
import { LoginModal } from './components/auth/LoginModal';
import { InterfaceMotion } from './components/motion/InterfaceMotion';
import { AppRoutes } from './routes/AppRoutes';
import { useAuthStore, useNotificationStore, useSocialStore } from './stores';

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
            <InterfaceMotion />
            <AppRoutes />
            <LoginModal />
          </Layout>
        </RealtimeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
