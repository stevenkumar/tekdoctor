import { Outlet, Navigate } from 'react-router-dom';
import { Suspense } from 'react';
import Navbar from '../component/Navbar';
import Footer from '../component/Footer';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../config/routes';
import { SkeletonPublicPage } from '../components/Skeleton';

/**
 * AuthLayout — standalone layout for authentication routes
 * (/auth/signin, /auth/signup, /auth/forgot-password, /auth/reset-password).
 *
 * Distinct from PublicLayout:
 * 1. Exempt from maintenance mode lockout (enabling administrators to sign in and toggle maintenance off).
 * 2. If already authenticated, redirects users to their appropriate dashboards.
 */
export default function AuthLayout() {
  const { isAuthenticated, hasRole } = useAuth();

  if (isAuthenticated) {
    if (hasRole('admin')) return <Navigate to={ROUTES.ADMIN_DASHBOARD} replace />;
    if (hasRole('technician')) return <Navigate to={ROUTES.TECHNICIAN_DASHBOARD} replace />;
    if (hasRole('company')) return <Navigate to={ROUTES.COMPANY_DASHBOARD} replace />;
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-white">
      <Navbar />
      <main className="flex-grow">
        <Suspense fallback={<SkeletonPublicPage />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
