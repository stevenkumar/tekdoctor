import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../config/routes';

/**
 * ProtectedCompanyRoute — guards all company-only routes.
 *
 * Rules:
 *  - Not authenticated  → redirect to /auth/signin
 *  - Authenticated, not company → redirect to / (home)
 *  - Company → render nested B2B dashboard pages via <Outlet />
 */
export default function ProtectedCompanyRoute() {
    const { isAuthenticated, hasRole } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to={ROUTES.SIGN_IN} replace />;
    }

    if (!hasRole('company')) {
        return <Navigate to={ROUTES.HOME} replace />;
    }

    return <Outlet />;
}
