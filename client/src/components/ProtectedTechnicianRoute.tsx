import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../config/routes';
import { authApi } from '../services/api';
import { Loader2 } from 'lucide-react';

/**
 * ProtectedTechnicianRoute — guards all technician-only routes.
 * Authoritatively verifies the JWT against /api/auth/me on mount
 * instead of purely relying on potentially modified localStorage state.
 *
 * Rules:
 *  - Not authenticated / missing token → redirect to /auth/signin
 *  - Authenticated as Admin → redirect to /admin/dashboard (strict isolation)
 *  - Authenticated as Company → redirect to /company/dashboard
 *  - Authenticated, not technician / inactive → redirect to / (home)
 *  - Valid Active Technician → render nested routes via <Outlet />
 */
export default function ProtectedTechnicianRoute() {
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
            const userData = (res.data as any)?.data;
            if (res.ok && userData && userData.role === 'technician' && userData.is_active !== 0) {
                setIsVerified(true);
            } else {
                setIsVerified(false);
                logout();
            }
        }).catch(() => {
            if (!isMounted) return;
            setIsVerified(false);
            logout();
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
                    <span>Verifying technician authorization...</span>
                </div>
            </div>
        );
    }

    // Strict Isolation & Role Verification
    if (!isVerified || !hasRole('technician')) {
        if (hasRole('admin')) return <Navigate to={ROUTES.ADMIN_DASHBOARD} replace />;
        if (hasRole('company')) return <Navigate to={ROUTES.COMPANY_DASHBOARD} replace />;
        return <Navigate to={ROUTES.HOME} replace />;
    }

    return <Outlet />;
}
