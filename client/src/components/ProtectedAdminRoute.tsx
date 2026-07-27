import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../config/routes';

/**
 * ProtectedAdminRoute — guards all admin-only routes.
 *
 * Rules:
 *  - Not authenticated  → redirect to /auth/signin
 *  - Authenticated, not admin → redirect to / (home)
 *  - Admin → render nested routes via <Outlet />
 */
export default function ProtectedAdminRoute() {
    const { isAuthenticated, hasRole } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to={ROUTES.SIGN_IN} replace />;
    }

    if (!hasRole('admin')) {
        return <Navigate to={ROUTES.HOME} replace />;
    }

    return <Outlet />;
}
