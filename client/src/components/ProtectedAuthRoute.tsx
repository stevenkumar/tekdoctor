import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../config/routes';
import { authApi } from '../services/api';
import { Loader2 } from 'lucide-react';

/**
 * ProtectedAuthRoute — guards authenticated user routes (e.g. /profile, /notifications).
 * Authoritatively verifies the JWT against /api/auth/me on mount, preserves the attempted
 * URL in navigation state for post-login redirection, and displays a seamless loader during hydration.
 */
export default function ProtectedAuthRoute() {
  const { isAuthenticated, token, logout } = useAuth();
  const location = useLocation();
  const [isValidating, setIsValidating] = useState<boolean>(() => Boolean(token));
  const [isVerified, setIsVerified] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    if (!token) {
      setIsValidating(false);
      setIsVerified(false);
      return;
    }

    authApi.getMe(token).then((res) => {
      if (!isMounted) return;
      if (res.ok && res.data) {
        setIsVerified(true);
      } else {
        setIsVerified(false);
        logout();
      }
    }).catch(() => {
      if (!isMounted) return;
      setIsVerified(false);
    }).finally(() => {
      if (isMounted) setIsValidating(false);
    });

    return () => {
      isMounted = false;
    };
  }, [token, logout]);

  if (!isAuthenticated && !token) {
    return <Navigate to={ROUTES.SIGN_IN} state={{ from: location }} replace />;
  }

  if (isValidating) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-white font-sans">
        <div className="flex items-center gap-3 text-xs font-mono text-neon-cyan">
          <Loader2 size={18} className="animate-spin text-neon-cyan" />
          <span>Verifying authentication session...</span>
        </div>
      </div>
    );
  }

  if (!isVerified) {
    return <Navigate to={ROUTES.SIGN_IN} state={{ from: location }} replace />;
  }

  return <Outlet />;
}
