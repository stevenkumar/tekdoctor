import { Navigate, Outlet } from 'react-router-dom';
import Navbar from '../component/Navbar';
import Footer from '../component/Footer';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../config/routes';
import FeedbackWidget from '../components/FeedbackWidget';
import { useSiteContext } from '../context/SiteContext';
import { Wrench } from 'lucide-react';

/**
 * PublicLayout — wraps all customer-facing pages with
 * the standard Navbar and Footer.
 *
 * If an admin is logged in and somehow lands on a public page,
 * they are immediately redirected to the admin dashboard.
 */
export default function PublicLayout() {
  const { isAuthenticated, hasRole } = useAuth();
  const { flattenedSettings } = useSiteContext();

  // Admin and Technician should never see the public website while logged in
  if (isAuthenticated) {
    if (hasRole('admin')) {
      return <Navigate to={ROUTES.ADMIN_DASHBOARD} replace />;
    }
    if (hasRole('technician')) {
      return <Navigate to={ROUTES.TECHNICIAN_DASHBOARD} replace />;
    }
    if (hasRole('company')) {
      return <Navigate to={ROUTES.COMPANY_DASHBOARD} replace />;
    }
  }

  // Handle Maintenance Mode
  if (flattenedSettings.maintenance_mode === 'true') {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4">
        <div className="relative max-w-md w-full bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-8 backdrop-blur-md text-center shadow-2xl overflow-hidden">
          {/* Glassmorphic Glow */}
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-neon-cyan/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-neon-cyan/10 rounded-full blur-3xl" />

          <div className="w-16 h-16 bg-neon-cyan/10 border border-neon-cyan/30 rounded-full flex items-center justify-center mx-auto mb-6 text-neon-cyan animate-pulse">
            <Wrench size={32} />
          </div>

          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-3">Under Maintenance</h1>
          <p className="text-sm text-zinc-400 leading-relaxed mb-6">
            {flattenedSettings.company_name || 'TekDoctor'} is currently undergoing scheduled maintenance to improve our services. We will be back online shortly. Thank you for your patience!
          </p>

          <div className="text-[11px] text-zinc-600 font-mono tracking-wide uppercase border-t border-zinc-900 pt-4">
            System Administrators?{" "}
            <a href={ROUTES.SIGN_IN} className="text-neon-cyan hover:underline transition-all hover:text-white">
              Log In Here
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-white">
      <Navbar />
      <main className="flex-grow">
        <Outlet />
      </main>
      <Footer />
      <FeedbackWidget />
    </div>
  );
}

