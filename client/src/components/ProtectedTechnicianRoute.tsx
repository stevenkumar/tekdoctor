import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../config/routes';

/**
 * ProtectedTechnicianRoute — guards all technician-only routes.
 *
 * Rules:
 *  - Not authenticated  → redirect to /auth/signin
 *  - Authenticated, not technician → redirect to / (home)
 *  - Technician → render nested routes via <Outlet />
 */
export default function ProtectedTechnicianRoute() {
    const { isAuthenticated, hasRole } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to={ROUTES.SIGN_IN} replace />;
    }

    if (!hasRole('technician')) {
        return <Navigate to={ROUTES.HOME} replace />;
    }

    return <Outlet />;
}
