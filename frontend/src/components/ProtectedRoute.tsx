import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard — redirects unauthenticated users to "/" and opens the login modal.
 * Wrap any route element that requires authentication.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoggedIn, openLogin } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn) {
      openLogin();
      navigate('/', { replace: true });
    }
  }, [isLoggedIn, openLogin, navigate]);

  if (!isLoggedIn) {
    return null;
  }

  return <>{children}</>;
}
