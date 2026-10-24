import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import { SiteProvider } from './context/SiteContext';
import ScrollToTop from './component/ScrollToTop';
import TitleManager from './components/TitleManager';
import { Toaster } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

// Layouts & Route Guards (Eager for instant routing & auth evaluation)
import PublicLayout from './layouts/PublicLayout';
import AdminLayout from './layouts/AdminLayout';
import ProtectedAdminRoute from './components/ProtectedAdminRoute';
import ProtectedTechnicianRoute from './components/ProtectedTechnicianRoute';
import ProtectedCompanyRoute from './components/ProtectedCompanyRoute';
import CompanyLayout from './layouts/CompanyLayout';

// Public Pages: HomePage kept eager for instant first-paint on domain landing
import HomePage from './pages/home/page';

// Public Pages (Lazy Loaded)
const AboutPage = lazy(() => import('./pages/about/page'));
const SignIn = lazy(() => import('./pages/auth/signin/page'));
const SignUp = lazy(() => import('./pages/auth/signup/page'));
const ForgotPassword = lazy(() => import('./pages/auth/forgot-password/page'));
const ResetPassword = lazy(() => import('./pages/auth/reset-password/page'));
const BillingPage = lazy(() => import('./pages/billing/page'));
const PaymentPage = lazy(() => import('./pages/billing/pay/PaymentPage'));
const Contact = lazy(() => import('./pages/contact/page'));
const RepairBooking = lazy(() => import('./pages/repair/page'));
const ServiceTracker = lazy(() => import('./pages/repair/status/page'));
const FAQPage = lazy(() => import('./pages/faq/page'));
const ServicesPage = lazy(() => import('./pages/services/page'));
const ShopPage = lazy(() => import('./pages/shop/page'));
const ShopV2Page = lazy(() => import('./pages/shop/v2/page'));
const RepairProtocolPage = lazy(() => import('./pages/protocol/page'));
const ProfilePage = lazy(() => import('./pages/profile/page'));
const UserNotifications = lazy(() => import('./pages/notifications/UserNotifications'));

// Admin Pages (Lazy Loaded)
const DashboardOverview = lazy(() => import('./pages/admin/DashboardOverview'));
const RepairTickets = lazy(() => import('./pages/admin/RepairTickets'));
const TaskTransfers = lazy(() => import('./pages/admin/TaskTransfers'));
const TechnicianManagement = lazy(() => import('./pages/admin/TechnicianManagement'));
const CustomerManagement = lazy(() => import('./pages/admin/CustomerManagement'));
const CompanyManagementDashboard = lazy(() => import('./pages/admin/CompanyManagementDashboard'));
const NotificationCenter = lazy(() => import('./pages/admin/NotificationCenter'));
const ContactMessages = lazy(() => import('./pages/admin/ContactMessages'));
const WebsiteSettings = lazy(() => import('./pages/admin/WebsiteSettings'));
const ReviewsManagement = lazy(() => import('./pages/admin/ReviewsManagement'));
const EmailSettings = lazy(() => import('./pages/admin/EmailSettings'));
const ReportsAnalytics = lazy(() => import('./pages/admin/ReportsAnalytics'));
const ActivityLogs = lazy(() => import('./pages/admin/ActivityLogs'));
const AdminProfile = lazy(() => import('./pages/admin/AdminProfile'));

// Technician Page (Lazy Loaded)
const TechnicianDashboard = lazy(() => import('./pages/technician/TechnicianDashboard'));

// Company (B2B) Setup (Lazy Loaded)
const CompanyDashboard = lazy(() => import('./pages/company/CompanyDashboard'));
const CompanyBranches = lazy(() => import('./pages/company/CompanyBranches'));
const CompanyEmployees = lazy(() => import('./pages/company/CompanyEmployees'));
const CompanyDevices = lazy(() => import('./pages/company/CompanyDevices'));
const CompanyRepairs = lazy(() => import('./pages/company/CompanyRepairs'));
const CompanyProfile = lazy(() => import('./pages/company/CompanyProfile'));
const CompanyMessages = lazy(() => import('./pages/company/CompanyMessages'));
const CompanyActivityLogs = lazy(() => import('./pages/company/CompanyActivityLogs'));
const CompanyBilling = lazy(() => import('./pages/company/CompanyBilling'));

import { ROUTES } from './config/routes';
import { Skeleton } from './components/Skeleton';

// Instant Skeleton App Shell fallback for slow networks / lazy chunk hydration
const PageLoader = () => (
  <div className="min-h-screen bg-[#050505] text-white flex flex-col">
    {/* Nav Skeleton */}
    <div className="h-16 border-b border-zinc-900 px-6 flex items-center justify-between bg-[#0a0a0c]/80 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <Skeleton variant="rounded" width={34} height={34} />
        <Skeleton variant="text" width={110} height={18} />
      </div>
      <div className="hidden md:flex items-center gap-6">
        <Skeleton variant="text" width={60} height={12} />
        <Skeleton variant="text" width={70} height={12} />
        <Skeleton variant="text" width={80} height={12} />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton variant="rounded" width={90} height={32} />
      </div>
    </div>

    {/* Body Content Skeleton */}
    <div className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-8 animate-fadeIn">
      <div className="space-y-3 pt-4">
        <Skeleton variant="text" width="40%" height={32} />
        <Skeleton variant="text" width="65%" height={16} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-5 rounded-2xl bg-[#0c0c0e] border border-zinc-900 space-y-3">
            <Skeleton variant="text" width="50%" height={12} />
            <Skeleton variant="text" width="70%" height={24} />
            <Skeleton variant="text" width="40%" height={10} />
          </div>
        ))}
      </div>

      <div className="p-6 rounded-2xl bg-[#0c0c0e] border border-zinc-900 space-y-4">
        <Skeleton variant="text" width="30%" height={18} />
        <div className="space-y-3">
          <Skeleton variant="rounded" width="100%" height={44} />
          <Skeleton variant="rounded" width="100%" height={44} />
          <Skeleton variant="rounded" width="100%" height={44} />
        </div>
      </div>
    </div>
  </div>
);

function App() {
  return (
    <Router>
      <ScrollToTop />
      <AuthProvider>
        <SiteProvider>
          <TitleManager />
          <Toaster position="bottom-right" toastOptions={{ style: { background: '#18181b', color: '#fff', border: '1px solid #27272a' } }} />
          <Suspense fallback={<PageLoader />}>
            <Routes>

              {/* ── Admin Area ── */}
              <Route element={<ProtectedAdminRoute />}>
                <Route element={<AdminLayout />}>
                  <Route path={ROUTES.ADMIN} element={<Navigate to={ROUTES.ADMIN_DASHBOARD} replace />} />
                  <Route path={ROUTES.ADMIN_DASHBOARD} element={<DashboardOverview />} />
                  <Route path={ROUTES.ADMIN_TICKETS} element={<RepairTickets />} />
                  <Route path="/admin/repair-tickets" element={<RepairTickets />} />
                  <Route path={ROUTES.ADMIN_TRANSFERS} element={<TaskTransfers />} />
                  <Route path={ROUTES.ADMIN_TECHNICIANS} element={<TechnicianManagement />} />
                  <Route path={ROUTES.ADMIN_CUSTOMERS} element={<CustomerManagement />} />
                  <Route path={ROUTES.ADMIN_COMPANIES} element={<CompanyManagementDashboard />} />
                  <Route path={ROUTES.ADMIN_NOTIFICATIONS} element={<NotificationCenter />} />
                  <Route path={ROUTES.ADMIN_CONTACTS} element={<ContactMessages />} />
                  <Route path={ROUTES.ADMIN_WEBSITE_SETTINGS} element={<WebsiteSettings />} />
                  <Route path={ROUTES.ADMIN_REVIEWS} element={<ReviewsManagement />} />
                  <Route path={ROUTES.ADMIN_EMAIL_SETTINGS} element={<EmailSettings />} />
                  <Route path={ROUTES.ADMIN_REPORTS} element={<ReportsAnalytics />} />
                  <Route path={ROUTES.ADMIN_ACTIVITY_LOGS} element={<ActivityLogs />} />
                  <Route path={ROUTES.ADMIN_PROFILE} element={<AdminProfile />} />
                  <Route path={ROUTES.BILLING} element={<BillingPage />} />
                </Route>
              </Route>

              {/* ── Technician Area ── */}
              <Route element={<ProtectedTechnicianRoute />}>
                <Route element={<AdminLayout />}>
                  <Route path={ROUTES.TECHNICIAN_DASHBOARD} element={<TechnicianDashboard />} />
                  <Route path={ROUTES.TECHNICIAN_ASSIGNED_TICKETS} element={<TechnicianDashboard />} />
                  <Route path={ROUTES.TECHNICIAN_TRANSFERS} element={<TechnicianDashboard />} />
                  <Route path={ROUTES.TECHNICIAN_DIAGNOSIS} element={<TechnicianDashboard />} />
                  <Route path={ROUTES.TECHNICIAN_IN_PROGRESS} element={<TechnicianDashboard />} />
                  <Route path={ROUTES.TECHNICIAN_COMPLETED} element={<TechnicianDashboard />} />
                  <Route path={ROUTES.TECHNICIAN_DELIVERED} element={<TechnicianDashboard />} />
                  <Route path={ROUTES.TECHNICIAN_NOTIFICATIONS} element={<TechnicianDashboard />} />
                  <Route path={ROUTES.TECHNICIAN_PROFILE} element={<AdminProfile />} />
                  <Route path="/technician/my-tasks" element={<Navigate to={ROUTES.TECHNICIAN_ASSIGNED_TICKETS} replace />} />
                  <Route path="/technician/tasks" element={<Navigate to={ROUTES.TECHNICIAN_ASSIGNED_TICKETS} replace />} />
                  <Route path="/technician/tickets" element={<Navigate to={ROUTES.TECHNICIAN_ASSIGNED_TICKETS} replace />} />
                  <Route path="/technician/task-transfers" element={<Navigate to={ROUTES.TECHNICIAN_TRANSFERS} replace />} />
                </Route>
              </Route>

              {/* ── Company (B2B) Area ── */}
              <Route element={<ProtectedCompanyRoute />}>
                <Route element={<CompanyLayout />}>
                  <Route path="/company" element={<Navigate to={ROUTES.COMPANY_DASHBOARD} replace />} />
                  <Route path={ROUTES.COMPANY_DASHBOARD} element={<CompanyDashboard />} />
                  <Route path={ROUTES.COMPANY_BRANCHES} element={<CompanyBranches />} />
                  <Route path={ROUTES.COMPANY_EMPLOYEES} element={<CompanyEmployees />} />
                  <Route path={ROUTES.COMPANY_DEVICES} element={<CompanyDevices />} />
                  <Route path={ROUTES.COMPANY_REPAIRS} element={<CompanyRepairs />} />
                  <Route path={ROUTES.COMPANY_PROFILE} element={<CompanyProfile />} />
                  <Route path={ROUTES.COMPANY_MESSAGES} element={<CompanyMessages />} />
                  <Route path={ROUTES.COMPANY_BILLING} element={<CompanyBilling />} />
                  <Route path={ROUTES.COMPANY_ACTIVITY_LOGS} element={<CompanyActivityLogs />} />
                </Route>
              </Route>

              {/* ── Public Area ── */}
              <Route element={<PublicLayout />}>
                <Route path={ROUTES.HOME} element={<HomePage />} />
                <Route path={ROUTES.ABOUT} element={<AboutPage />} />
                <Route path={ROUTES.SIGN_IN} element={<SignIn />} />
                <Route path={ROUTES.SIGN_UP} element={<SignUp />} />
                <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPassword />} />
                <Route path={ROUTES.RESET_PASSWORD} element={<ResetPassword />} />
                <Route path={ROUTES.BILLING_PAY} element={<PaymentPage />} />
                <Route path="/billing/pay/:invoiceId" element={<PaymentPage />} />
                <Route path={ROUTES.CONTACT} element={<Contact />} />
                <Route path={ROUTES.REPAIR} element={<RepairBooking />} />
                <Route path={ROUTES.FAQ} element={<FAQPage />} />
                <Route path={ROUTES.REPAIR_STATUS} element={<ServiceTracker />} />
                <Route path={ROUTES.SERVICES} element={<ServicesPage />} />
                <Route path={ROUTES.SHOP} element={<ShopPage />} />
                <Route path={ROUTES.SHOP_V2} element={<ShopV2Page />} />
                <Route path={ROUTES.PROTOCOL} element={<RepairProtocolPage />} />
                <Route path={ROUTES.PROFILE} element={<ProfilePage />} />
                <Route path={ROUTES.NOTIFICATIONS} element={<UserNotifications />} />

                {/* Fallback */}
                <Route path="*" element={<HomePage />} />
              </Route>

            </Routes>
          </Suspense>
        </SiteProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
