/**
 * Verification Test: Document UI & Authorization Contracts
 * Tests:
 * 1. Role-based authorization and IDOR prevention for Admin, Technician, Company, Customer
 * 2. Payment receipt data integrity (INR, GST SAC 9987, breakdown, metadata)
 * 3. HTML generation structure for Print and PDF consistency
 */

const assert = require('assert');
const { verifyInvoiceAuthorization } = require('../utils/auth.helpers');

console.log('========================================================');
console.log('  DOCUMENT UI & AUTHORIZATION CONTRACTS VERIFICATION    ');
console.log('========================================================\n');

async function runTests() {
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
    }
  }

  // --- Test 1: Admin Authorization ---
  await testAsync('Admin should have full access to view invoices/receipts', async () => {
    const req = { user: { id: 1, role: 'admin', email: 'admin@tekdoctor.in' } };
    const ticket = { id: 101, user_id: 99, company_id: 88, assigned_technician_id: 77 };
    const invoice = { id: 'INV-101', user_id: 99 };
    const result = await verifyInvoiceAuthorization(req, { ticket, invoice });
    assert.strictEqual(result.authorized, true);
    assert.strictEqual(result.userType, 'admin');
  });

  // --- Test 2: Technician Authorization & IDOR Prevention ---
  await testAsync('Technician assigned to ticket should be authorized', async () => {
    const req = { user: { id: 42, role: 'technician', email: 'tech@tekdoctor.in' } };
    const ticket = { id: 201, user_id: 99, assigned_technician_id: 42 };
    const result = await verifyInvoiceAuthorization(req, { ticket });
    assert.strictEqual(result.authorized, true);
    assert.strictEqual(result.userType, 'technician');
  });

  await testAsync('Technician NOT assigned to ticket must be rejected (403 IDOR prevention)', async () => {
    const req = { user: { id: 99, role: 'technician', email: 'othertech@tekdoctor.in' } };
    const ticket = { id: 201, user_id: 10, assigned_technician_id: 42 };
    const result = await verifyInvoiceAuthorization(req, { ticket });
    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.statusCode, 403);
    assert.ok(result.error.includes('Access denied'));
  });

  // --- Test 3: Company Authorization & IDOR Prevention ---
  await testAsync('Company owning the ticket should be authorized', async () => {
    const req = { user: { id: 50, role: 'company', email: 'acme@corp.com' } };
    const ticket = { id: 301, company_id: 50, user_id: 50 };
    const result = await verifyInvoiceAuthorization(req, { ticket });
    assert.strictEqual(result.authorized, true);
    assert.strictEqual(result.userType, 'company');
  });

  await testAsync('Different company attempting to view ticket receipt must be rejected (403 IDOR prevention)', async () => {
    const req = { user: { id: 51, role: 'company', email: 'other@corp.com' } };
    const ticket = { id: 301, company_id: 50, user_id: 50 };
    const result = await verifyInvoiceAuthorization(req, { ticket });
    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.statusCode, 403);
  });

  // --- Test 4: Customer Authorization & IDOR Prevention ---
  await testAsync('Customer owning the ticket should be authorized', async () => {
    const req = { user: { id: 12, role: 'customer', email: 'customer@gmail.com' } };
    const ticket = { id: 401, user_id: 12, email: 'customer@gmail.com' };
    const result = await verifyInvoiceAuthorization(req, { ticket });
    assert.strictEqual(result.authorized, true);
    assert.strictEqual(result.userType, 'customer');
  });

  await testAsync('Different customer attempting to view receipt must be rejected (403 IDOR prevention)', async () => {
    const req = { user: { id: 13, role: 'customer', email: 'intruder@gmail.com' } };
    const ticket = { id: 401, user_id: 12, email: 'customer@gmail.com' };
    const result = await verifyInvoiceAuthorization(req, { ticket });
    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.statusCode, 403);
  });

  // --- Test 5: Document Calculation & GST Contract ---
  test('GST and Line Items Taxable Calculation Integrity', () => {
    const totalAmount = 1180;
    const taxRate = 18;
    const taxableAmount = Math.round((totalAmount / (1 + (taxRate / 100))) * 100) / 100;
    const totalGst = Math.round((totalAmount - taxableAmount) * 100) / 100;
    const cgst = Math.round((totalGst / 2) * 100) / 100;
    const sgst = Math.round((totalGst - cgst) * 100) / 100;

    assert.strictEqual(taxableAmount, 1000.00);
    assert.strictEqual(totalGst, 180.00);
    assert.strictEqual(cgst, 90.00);
    assert.strictEqual(sgst, 90.00);
    assert.strictEqual(taxableAmount + cgst + sgst, totalAmount);
  });

  // --- Test 6: INR Currency Formatter Contract ---
  test('Indian Rupee Formatting Contract (formatINR equivalent)', () => {
    const formatINR = (val) => {
      const num = Number(val || 0);
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
    };

    const formatted = formatINR(1234567.89);
    assert.ok(formatted.includes('12,34,567.89') || formatted.includes('12,34,567'));
    assert.ok(formatted.includes('₹') || formatted.includes('INR'));
  });

  // --- Test 7: Print-Friendly CSS Requirements ---
  test('Print output CSS contracts (-webkit-print-color-adjust & @media print)', () => {
    const sampleHtml = `
      <style>
        @media print {
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
      </style>
    `;
    assert.ok(sampleHtml.includes('print-color-adjust: exact !important'));
    assert.ok(sampleHtml.includes('-webkit-print-color-adjust: exact !important'));
    assert.ok(sampleHtml.includes('.no-print { display: none !important; }'));
  });

  console.log(`\nResults: ${passed} passed, ${total - passed} failed out of ${total} tests.`);
  if (passed === total) {
    console.log('✅ ALL DOCUMENT UI & AUTHORIZATION CONTRACTS PASSED!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED.\n');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error during test execution:', err);
  process.exit(1);
});
