/**
 * Centralized Route Definitions
 * All application routes defined here so they can be referenced from anywhere.
 */

export const ROUTES = {
  HOME: '/',
  ABOUT: '/about',
  SERVICES: '/services',
  CONTACT: '/contact',
  FAQ: '/faq',
  REPAIR: '/repair',
  REPAIR_STATUS: '/repair/status',
  SHOP: '/shop',
  SHOP_V2: '/shop/v2',
  PROTOCOL: '/protocol',
  PROFILE: '/profile',

  // Auth
  SIGN_IN: '/auth/signin',
  SIGN_UP: '/auth/signup',
  SIGNIN: '/auth/signin',
  SIGNUP: '/auth/signup',

  // Billing
  BILLING: '/billing',
  BILLING_PAY: '/billing/pay',

  // Admin  
  ADMIN: '/admin',
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_TICKETS: '/admin/tickets',
  ADMIN_TECHNICIANS: '/admin/technicians',
  ADMIN_CUSTOMERS: '/admin/customers',
  ADMIN_NOTIFICATIONS: '/admin/notifications',
  ADMIN_CONTACTS: '/admin/contacts',
  ADMIN_WEBSITE_SETTINGS: '/admin/website-settings',
  ADMIN_REVIEWS: '/admin/reviews',
  ADMIN_EMAIL_SETTINGS: '/admin/email-settings',
  ADMIN_REPORTS: '/admin/reports',
  ADMIN_ACTIVITY_LOGS: '/admin/activity-logs',
  ADMIN_PROFILE: '/admin/profile',

  // Technician
  TECHNICIAN_DASHBOARD: '/technician/dashboard',

  // Company
  COMPANY_DASHBOARD: '/company/dashboard',
  COMPANY_EMPLOYEES: '/company/employees',
  COMPANY_DEVICES: '/company/devices',
  COMPANY_REPAIRS: '/company/repairs',
  COMPANY_PROFILE: '/company/profile',
  COMPANY_MESSAGES: '/company/messages',
  COMPANY_BRANCHES: '/company/branches',
  COMPANY_ACTIVITY_LOGS: '/company/activity-logs',
  COMPANY_BILLING: '/company/billing',
} as const;
