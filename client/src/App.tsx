import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SiteProvider } from './context/SiteContext';
import ScrollToTop from './component/ScrollToTop';
import TitleManager from './components/TitleManager';
import { Toaster } from 'react-hot-toast';

// Layouts
import PublicLayout from './layouts/PublicLayout';
import AdminLayout from './layouts/AdminLayout';
import ProtectedAdminRoute from './components/ProtectedAdminRoute';
import ProtectedTechnicianRoute from './components/ProtectedTechnicianRoute';

// Public Pages
import HomePage from './pages/home/page';
import AboutPage from './pages/about/page';
import SignIn from './pages/auth/signin/page';
import SignUp from './pages/auth/signup/page';
import BillingPage from './pages/billing/page';
import PaymentPage from './pages/billing/pay/PaymentPage';
import Contact from './pages/contact/page';
import RepairBooking from './pages/repair/page';
import ServiceTracker from './pages/repair/status/page';
import FAQPage from './pages/faq/page';
import ServicesPage from './pages/services/page';
import ShopPage from './pages/shop/page';
import ShopV2Page from './pages/shop/v2/page';
import RepairProtocolPage from './pages/protocol/page';
import ProfilePage from './pages/profile/page';

// Admin Pages
import DashboardOverview from './pages/admin/DashboardOverview';
import RepairTickets from './pages/admin/RepairTickets';
import TechnicianManagement from './pages/admin/TechnicianManagement';
import CustomerManagement from './pages/admin/CustomerManagement';
import NotificationCenter from './pages/admin/NotificationCenter';
import ContactMessages from './pages/admin/ContactMessages';
import WebsiteSettings from './pages/admin/WebsiteSettings';
import ReviewsManagement from './pages/admin/ReviewsManagement';
import EmailSettings from './pages/admin/EmailSettings';
import ReportsAnalytics from './pages/admin/ReportsAnalytics';
import ActivityLogs from './pages/admin/ActivityLogs';
import AdminProfile from './pages/admin/AdminProfile';

// Technician Page
import TechnicianDashboard from './pages/technician/TechnicianDashboard';

// Company (B2B) Setup
import ProtectedCompanyRoute from './components/ProtectedCompanyRoute';
import CompanyLayout from './layouts/CompanyLayout';
import CompanyDashboard from './pages/company/CompanyDashboard';
import CompanyBranches from './pages/company/CompanyBranches';
import CompanyEmployees from './pages/company/CompanyEmployees';
import CompanyDevices from './pages/company/CompanyDevices';
import CompanyRepairs from './pages/company/CompanyRepairs';
import CompanyProfile from './pages/company/CompanyProfile';
import CompanyMessages from './pages/company/CompanyMessages';
import CompanyActivityLogs from './pages/company/CompanyActivityLogs';
import CompanyBilling from './pages/company/CompanyBilling';

import { ROUTES } from './config/routes';

function App() {
  return (
    <Router>
      <ScrollToTop />
      <AuthProvider>
        <SiteProvider>
          <TitleManager />
          <Toaster position="bottom-right" toastOptions={{ style: { background: '#18181b', color: '#fff', border: '1px solid #27272a' } }} />
          <Routes>

            {/* ── Admin Area ── */}
            <Route element={<ProtectedAdminRoute />}>
              <Route element={<AdminLayout />}>
                <Route path={ROUTES.ADMIN} element={<Navigate to={ROUTES.ADMIN_DASHBOARD} replace />} />
                <Route path={ROUTES.ADMIN_DASHBOARD} element={<DashboardOverview />} />
                <Route path={ROUTES.ADMIN_TICKETS} element={<RepairTickets />} />
                <Route path={ROUTES.ADMIN_TECHNICIANS} element={<TechnicianManagement />} />
                <Route path={ROUTES.ADMIN_CUSTOMERS} element={<CustomerManagement />} />
                <Route path={ROUTES.ADMIN_NOTIFICATIONS} element={<NotificationCenter />} />
                <Route path={ROUTES.ADMIN_CONTACTS} element={<ContactMessages />} />
                <Route path={ROUTES.ADMIN_WEBSITE_SETTINGS} element={<WebsiteSettings />} />
                <Route path={ROUTES.ADMIN_REVIEWS} element={<ReviewsManagement />} />
                <Route path={ROUTES.ADMIN_EMAIL_SETTINGS} element={<EmailSettings />} />
                <Route path={ROUTES.ADMIN_REPORTS} element={<ReportsAnalytics />} />
                <Route path={ROUTES.ADMIN_ACTIVITY_LOGS} element={<ActivityLogs />} />
                <Route path={ROUTES.ADMIN_PROFILE} element={<AdminProfile />} />
              </Route>
            </Route>

            {/* ── Technician Area ── */}
            <Route element={<ProtectedTechnicianRoute />}>
              <Route element={<AdminLayout />}>
                <Route path={ROUTES.TECHNICIAN_DASHBOARD} element={<TechnicianDashboard />} />
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
              <Route path={ROUTES.BILLING} element={<BillingPage />} />
              <Route path={ROUTES.BILLING_PAY} element={<PaymentPage />} />
              <Route path={ROUTES.CONTACT} element={<Contact />} />
              <Route path={ROUTES.REPAIR} element={<RepairBooking />} />
              <Route path={ROUTES.FAQ} element={<FAQPage />} />
              <Route path={ROUTES.REPAIR_STATUS} element={<ServiceTracker />} />
              <Route path={ROUTES.SERVICES} element={<ServicesPage />} />
              <Route path={ROUTES.SHOP} element={<ShopPage />} />
              <Route path={ROUTES.SHOP_V2} element={<ShopV2Page />} />
              <Route path={ROUTES.PROTOCOL} element={<RepairProtocolPage />} />
              <Route path={ROUTES.PROFILE} element={<ProfilePage />} />

              {/* Fallback */}
              <Route path="*" element={<HomePage />} />
            </Route>

          </Routes>
        </SiteProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
