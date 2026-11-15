import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../config/routes';
import { authApi } from '../services/api';
import { Loader2 } from 'lucide-react';

/**
 * ProtectedAdminRoute — guards all admin-only routes.
 * Authoritatively verifies the JWT against /api/auth/me on mount
 * instead of purely relying on potentially modified localStorage state.
 */
export default function ProtectedAdminRoute() {
    const { isAuthenticated, hasRole, token, logout } = useAuth();
    const [isValidating, setIsValidating] = useState<boolean>(true);
    const [isVerified, setIsVerified] = useState<boolean>(false);

    useEffect(() => {
        let isMounted = true;

        if (!token) {
            setIsValidating(false);
            return;
        }

        authApi.getMe(token).then((res) => {
            if (!isMounted) return;
            if (res.ok && res.data && (res.data as any).data?.role === 'admin') {
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

    if (!isAuthenticated || !token) {
        return <Navigate to={ROUTES.SIGN_IN} replace />;
    }

    if (isValidating) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-white">
                <div className="flex items-center gap-3 text-xs font-mono text-neon-cyan">
                    <Loader2 size={18} className="animate-spin" />
                    <span>Verifying administrative authorization...</span>
                </div>
            </div>
        );
    }

    if (!isVerified || !hasRole('admin')) {
        if (hasRole('company')) return <Navigate to={ROUTES.COMPANY_DASHBOARD} replace />;
        if (hasRole('technician')) return <Navigate to={ROUTES.TECHNICIAN_DASHBOARD} replace />;
        return <Navigate to={ROUTES.HOME} replace />;
    }

    return <Outlet />;
}
