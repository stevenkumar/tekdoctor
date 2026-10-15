/**
 * TekDoctor — Unified Test Runner
 * 
 * Sequentially executes all verification test suites in server/tests/
 * with deterministic ordering, execution timings, detailed failure reporting,
 * and standard process exit codes (0 = all pass, 1 = any failure).
 */

const { spawn } = require('child_process');
const path = require('path');

// Ordered list of verification suites
const testSuites = [
  // 1. Core Security & Authentication Boundaries
  'verify-phase1-security-fixes.js',
  'verify-session-invalidation-isolation.js',
  'verify-phase2-database-safety.js',
  'verify-phase3-security-fixes.js',
  'verify-phase5-security-fixes.js',
  'verify-recaptcha-flows.js',
  'verify-technician-isolation.js',
  'verify-settings-security.js',
  'verify-stage2-dynamic-config.js',

  // 2. Ticket & Operational Lifecycle
  'verify-ticket-system.js',
  'verify-guest-onboarding.js',
  'verify-estimate-sync.js',
  'verify-api-idempotency.js',
  'verify-repair-budget-input.js',

  // 3. Billing, Payment & Authorization Matrix
  'verify-billing-sync.js',
  'verify-billing-lifecycle.js',
  'verify-invoice-authorization.js',
  'verify-invoice-rename-safety.js',
  'verify-release-safeguards.js',
  'verify-offline-payments.js',
  'verify-payment-switching.js',
  'verify-payment-live-synchronization.js',
  'verify-payment-rejection-notifications.js',
  'verify-post-audit-billing-fixes.js',
  'verify-webhook-and-invoice-config.js',

  // 4. Technician & UI System Contracts
  'verify-technician-universal-search.js',
  'verify-technician-refresh-preservation.js',
  'verify-document-ui-contracts.js',
  'verify-notification-modal-ui.js',

  // 5. Phase 8B-1 Runtime Optimizations (Admin Polling, Bounded Notifications, Hold Scheduler)
  'verify-phase8b1-optimizations.js'
];

function runSuite(suiteFile) {
  return new Promise((resolve) => {
    const suitePath = path.resolve(__dirname, suiteFile);
    const startTime = Date.now();

    console.log(`\n================================================================`);
    console.log(`RUNNING SUITE: ${suiteFile}`);
    console.log(`================================================================`);

    const child = spawn(process.execPath, [suitePath], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' },
      stdio: 'inherit'
    });

    child.on('error', (err) => {
      const duration = Date.now() - startTime;
      console.error(`Failed to launch test suite [${suiteFile}]:`, err.message);
      resolve({ suiteFile, success: false, exitCode: 1, duration, error: err.message });
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      const success = code === 0;
      if (success) {
        console.log(`✓ SUITE PASSED: ${suiteFile} (${(duration / 1000).toFixed(2)}s)`);
      } else {
        console.error(`✗ SUITE FAILED: ${suiteFile} (Exit Code: ${code}, ${(duration / 1000).toFixed(2)}s)`);
      }
      resolve({ suiteFile, success, exitCode: code, duration });
    });
  });
}

async function runAll() {
  const runnerStartTime = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║               TEKDOCTOR UNIFIED TEST RUNNER                  ║');
  console.log(`║               Total Suites to Execute: ${testSuites.length.toString().padEnd(21)} ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const results = [];

  for (const suite of testSuites) {
    const result = await runSuite(suite);
    results.push(result);
  }

  const totalDuration = ((Date.now() - runnerStartTime) / 1000).toFixed(2);
  const passedSuites = results.filter(r => r.success);
  const failedSuites = results.filter(r => !r.success);

  console.log('\n\n================================================================');
  console.log('                      TEST EXECUTION SUMMARY                    ');
  console.log('================================================================');
  console.log('Suite Name                                     Status    Time   ');
  console.log('--------------------------------------------- --------- --------');

  for (const r of results) {
    const paddedName = r.suiteFile.padEnd(45);
    const statusStr = r.success ? '  PASS   ' : '  FAIL   ';
    const timeStr = `${(r.duration / 1000).toFixed(2)}s`.padStart(8);
    console.log(`${paddedName} ${statusStr} ${timeStr}`);
  }

  console.log('--------------------------------------------- --------- --------');
  console.log(`Total Suites: ${results.length} | Passed: ${passedSuites.length} | Failed: ${failedSuites.length} | Time: ${totalDuration}s`);
  console.log('================================================================');

  if (failedSuites.length > 0) {
    console.error('\nFAILED SUITES:');
    failedSuites.forEach(f => {
      console.error(`  - ${f.suiteFile} (exit code: ${f.exitCode}${f.error ? `, error: ${f.error}` : ''})`);
    });
    console.error('\nOne or more test suites failed. Exiting with non-zero code.');
    process.exit(1);
  } else {
    console.log('\nAll test suites passed successfully! Ready for production deployment.\n');
    process.exit(0);
  }
}

runAll();
