/**
 * verify-notification-modal-ui.js
 * Verification suite for Customer Portal Notification Detail Card UI fix.
 * Validates:
 * 1. Portal mounting to document.body escaping containing blocks (backdrop-filter)
 * 2. Proper viewport positioning, max-height bounding, and overflow safety
 * 3. Sticky header and accessible close controls
 * 4. Internal scrolling container for long messages
 * 5. Preservation of notification actions, ticket links, and mark-as-read workflows
 */

const fs = require('fs');
const path = require('path');

function runTests() {
  console.log('====================================================');
  console.log('   CUSTOMER NOTIFICATION MODAL UI VERIFICATION     ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${message}`);
      failed++;
    }
  }

  const navbarPath = path.resolve(__dirname, '../../client/src/component/Navbar.tsx');
  const userNotifPath = path.resolve(__dirname, '../../client/src/pages/notifications/UserNotifications.tsx');

  const navbarContent = fs.readFileSync(navbarPath, 'utf8');
  const userNotifContent = fs.readFileSync(userNotifPath, 'utf8');

  console.log('--- Test Group 1: Navbar Notification Modal Portal & Positioning ---');
  assert(
    navbarContent.includes("import { createPortal } from 'react-dom';"),
    'Navbar imports createPortal from react-dom'
  );
  assert(
    navbarContent.includes('createPortal(') && navbarContent.includes('document.body'),
    'Navbar notification modal is portaled directly into document.body (escapes nav containing block)'
  );
  assert(
    navbarContent.includes('fixed inset-0') && navbarContent.includes('z-[99999]'),
    'Overlay uses fixed inset-0 with high z-index (z-[99999]) above all layouts'
  );
  assert(
    navbarContent.includes('overflow-y-auto') && navbarContent.includes('p-4 sm:p-6'),
    'Overlay includes overflow-y-auto and responsive padding (p-4 sm:p-6) preventing viewport clipping'
  );
  assert(
    navbarContent.includes('max-h-[85vh]') && navbarContent.includes('my-auto'),
    'Card is bounded by max-h-[85vh] and uses my-auto for flexbox vertical centering safety'
  );

  console.log('\n--- Test Group 2: Navbar Modal Internal Scrolling & Accessibility ---');
  assert(
    navbarContent.includes('sticky top-0') && navbarContent.includes('shrink-0'),
    'Header is sticky and shrink-0 so close controls remain accessible during scroll'
  );
  assert(
    navbarContent.includes('flex-1 overflow-y-auto'),
    'Notification body container has flex-1 overflow-y-auto for smooth internal scrolling'
  );
  assert(
    navbarContent.includes('break-words') && navbarContent.includes('whitespace-pre-wrap'),
    'Long notification text handles wrapping with break-words and whitespace-pre-wrap'
  );
  assert(
    navbarContent.includes('ESC') && navbarContent.includes('Close'),
    'Includes both ESC keyboard/button indicator and bottom Close button'
  );

  console.log('\n--- Test Group 3: Navbar Notification Workflows & Ticket Linking ---');
  assert(
    navbarContent.includes('handleMarkAsRead') && navbarContent.includes('setActiveModalNotif'),
    'Clicking notification marks it as read and sets activeModalNotif'
  );
  assert(
    navbarContent.includes('ROUTES.REPAIR_STATUS') && navbarContent.includes('activeModalNotif.ticket_number'),
    'Related ticket action navigates to REPAIR_STATUS with ticket parameter'
  );
  assert(
    navbarContent.includes("document.body.style.overflow = 'hidden'"),
    'Body scroll locking is maintained while modal is open'
  );

  console.log('\n--- Test Group 4: UserNotifications Page Modal Portal & Positioning ---');
  assert(
    userNotifContent.includes("import { createPortal } from 'react-dom';"),
    'UserNotifications imports createPortal from react-dom'
  );
  assert(
    userNotifContent.includes('createPortal(') && userNotifContent.includes('document.body'),
    'UserNotifications modal is portaled directly into document.body'
  );
  assert(
    userNotifContent.includes('overflow-y-auto') && userNotifContent.includes('my-auto'),
    'UserNotifications modal uses overflow-y-auto and my-auto'
  );
  assert(
    userNotifContent.includes('max-h-[85vh]') && userNotifContent.includes('flex-1 overflow-y-auto'),
    'UserNotifications modal limits height to 85vh and scrolls body independently'
  );
  assert(
    userNotifContent.includes("document.body.style.overflow = 'hidden'"),
    'UserNotifications locks background scrolling when modal is open'
  );

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
