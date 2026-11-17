/**
 * Standalone Unit Test Script for Indian GST Calculations
 * Verifies:
 * 1. Multi-item Intra-State invoice at 18% (9% CGST + 9% SGST) without discount
 * 2. Multi-item Intra-State invoice at 18% (9% CGST + 9% SGST) with discount
 * 3. Multi-item Inter-State invoice at 18% IGST with and without discount
 * 4. Slab rates (28% -> 14% CGST + 14% SGST or 28% IGST)
 * 5. Statutory rate preservation & zero-rate cleanliness
 */

const assert = require('assert');
const { calculateInvoiceTotals } = require('../server/controllers/billing.controller');

console.log('================================================================');
console.log('           INDIAN GST CALCULATION VERIFICATION SUITE            ');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] Test ${totalTests}: ${name}`);
    console.error(`       Error: ${err.message}`);
    console.error(err.stack);
  }
}

// Test 1: Multi-item Intra-State 18% without discount
runTest('Multi-item Intra-State 18% without discount', () => {
  const items = [
    { description: 'Screen Replacement', hsn_sac: '8473', quantity: 2, unit_price: 500, tax_rate: 18 },
    { description: 'Motherboard Diagnostic', hsn_sac: '9987', quantity: 1, unit_price: 600, tax_rate: 18 }
  ];

  const result = calculateInvoiceTotals(items, false, 18.0, 0.0, 'intra');

  assert.strictEqual(result.subtotal, 1600.00, 'Subtotal should be 1600.00');
  assert.strictEqual(result.discountAmount, 0.00, 'Discount should be 0.00');
  assert.strictEqual(result.taxableAmount, 1600.00, 'Taxable amount should be 1600.00');
  assert.strictEqual(result.taxAmount, 288.00, 'Total tax should be 288.00');
  assert.strictEqual(result.cgstRate, 9.00, 'CGST rate should be 9.00%');
  assert.strictEqual(result.sgstRate, 9.00, 'SGST rate should be 9.00%');
  assert.strictEqual(result.igstRate, 0.00, 'IGST rate should be 0.00%');
  assert.strictEqual(result.cgstAmount, 144.00, 'CGST amount should be 144.00');
  assert.strictEqual(result.sgstAmount, 144.00, 'SGST amount should be 144.00');
  assert.strictEqual(result.igstAmount, 0.00, 'IGST amount should be 0.00');
  assert.strictEqual(result.grandTotal, 1888.00, 'Grand total should be 1888.00');
  assert.strictEqual(result.isInterstate, false, 'isInterstate should be false');
  assert.strictEqual(result.gstType, 'intra', 'gstType should be intra');
});

// Test 2: Multi-item Intra-State 18% with discount (The exact case of TD-inv-002)
runTest('Multi-item Intra-State 18% with discount (TD-inv-002 scenario)', () => {
  const items = [
    { description: 'Screen Replacement', hsn_sac: '8473', quantity: 2, unit_price: 500, tax_rate: 18 },
    { description: 'Motherboard Diagnostic', hsn_sac: '9987', quantity: 1, unit_price: 600, tax_rate: 18 }
  ];

  // ₹200 discount on ₹1600 subtotal -> taxable amount is ₹1400
  const result = calculateInvoiceTotals(items, false, 18.0, 200.0, 'intra');

  assert.strictEqual(result.subtotal, 1600.00, 'Subtotal should remain gross 1600.00');
  assert.strictEqual(result.discountAmount, 200.00, 'Discount amount should be 200.00');
  assert.strictEqual(result.taxableAmount, 1400.00, 'Taxable amount should be 1400.00');
  assert.strictEqual(result.taxAmount, 252.00, 'Total tax should be 252.00 (18% of 1400)');
  assert.strictEqual(result.cgstRate, 9.00, 'CGST rate must remain exact statutory 9.00% (NEVER 5.63%)');
  assert.strictEqual(result.sgstRate, 9.00, 'SGST rate must remain exact statutory 9.00% (NEVER 5.63%)');
  assert.strictEqual(result.igstRate, 0.00, 'IGST rate should be 0.00%');
  assert.strictEqual(result.cgstAmount, 126.00, 'CGST amount should be 126.00');
  assert.strictEqual(result.sgstAmount, 126.00, 'SGST amount should be 126.00');
  assert.strictEqual(result.igstAmount, 0.00, 'IGST amount should be 0.00');
  assert.strictEqual(result.grandTotal, 1652.00, 'Grand total should be 1652.00 (1400 + 252)');
  assert.strictEqual(result.cgstAmount + result.sgstAmount, result.taxAmount, 'CGST + SGST must equal total tax');
  assert.strictEqual(result.taxableAmount + result.taxAmount, result.grandTotal, 'Taxable + tax must equal grand total');
});

// Test 3: Multi-item Inter-State 18% with discount
runTest('Multi-item Inter-State 18% with discount', () => {
  const items = [
    { description: 'Screen Replacement', hsn_sac: '8473', quantity: 2, unit_price: 500, tax_rate: 18 },
    { description: 'Motherboard Diagnostic', hsn_sac: '9987', quantity: 1, unit_price: 600, tax_rate: 18 }
  ];

  const result = calculateInvoiceTotals(items, true, 18.0, 200.0, 'inter');

  assert.strictEqual(result.subtotal, 1600.00, 'Subtotal should be 1600.00');
  assert.strictEqual(result.discountAmount, 200.00, 'Discount amount should be 200.00');
  assert.strictEqual(result.taxableAmount, 1400.00, 'Taxable amount should be 1400.00');
  assert.strictEqual(result.taxAmount, 252.00, 'Total tax should be 252.00');
  assert.strictEqual(result.cgstRate, 0.00, 'CGST rate should be 0.00% for inter-state');
  assert.strictEqual(result.sgstRate, 0.00, 'SGST rate should be 0.00% for inter-state');
  assert.strictEqual(result.igstRate, 18.00, 'IGST rate should be 18.00%');
  assert.strictEqual(result.cgstAmount, 0.00, 'CGST amount should be 0.00');
  assert.strictEqual(result.sgstAmount, 0.00, 'SGST amount should be 0.00');
  assert.strictEqual(result.igstAmount, 252.00, 'IGST amount should be 252.00');
  assert.strictEqual(result.grandTotal, 1652.00, 'Grand total should be 1652.00');
  assert.strictEqual(result.isInterstate, true, 'isInterstate should be true');
  assert.strictEqual(result.gstType, 'inter', 'gstType should be inter');
});

// Test 4: 28% GST Slab for Hardware Components
runTest('28% GST Slab (14% CGST + 14% SGST)', () => {
  const items = [
    { description: 'Graphics Card GPU Chip', hsn_sac: '8473', quantity: 1, unit_price: 10000, tax_rate: 28 }
  ];

  const resultIntra = calculateInvoiceTotals(items, false, 28.0, 1000.0, 'intra');
  assert.strictEqual(resultIntra.taxableAmount, 9000.00);
  assert.strictEqual(resultIntra.cgstRate, 14.00, 'CGST rate should be 14.00%');
  assert.strictEqual(resultIntra.sgstRate, 14.00, 'SGST rate should be 14.00%');
  assert.strictEqual(resultIntra.cgstAmount, 1260.00, 'CGST amount should be 1260.00');
  assert.strictEqual(resultIntra.sgstAmount, 1260.00, 'SGST amount should be 1260.00');
  assert.strictEqual(resultIntra.igstAmount, 0.00);
  assert.strictEqual(resultIntra.grandTotal, 11520.00);

  const resultInter = calculateInvoiceTotals(items, true, 28.0, 1000.0, 'inter');
  assert.strictEqual(resultInter.taxableAmount, 9000.00);
  assert.strictEqual(resultInter.cgstRate, 0.00);
  assert.strictEqual(resultInter.sgstRate, 0.00);
  assert.strictEqual(resultInter.igstRate, 28.00, 'IGST rate should be 28.00%');
  assert.strictEqual(resultInter.igstAmount, 2520.00);
  assert.strictEqual(resultInter.grandTotal, 11520.00);
});

// Test 5: Mixed line items with uniform invoice slab rate propagation
runTest('Uniform line item tax rate fallback to invoice default', () => {
  const items = [
    { description: 'Item without tax_rate', quantity: 1, unit_price: 1000 }
  ];

  const result = calculateInvoiceTotals(items, false, 18.0, 0.0, 'intra');
  assert.strictEqual(result.processedItems[0].tax_rate, 18.0, 'Should fall back to invoice tax_rate');
  assert.strictEqual(result.processedItems[0].tax_amount, 180.00);
  assert.strictEqual(result.cgstRate, 9.00);
  assert.strictEqual(result.sgstRate, 9.00);
});

// Test 6: Zero-tax exempt items
runTest('Zero tax exempt line items', () => {
  const items = [
    { description: 'Exempt Component', quantity: 1, unit_price: 500, tax_rate: 0 }
  ];

  const result = calculateInvoiceTotals(items, false, 0.0, 0.0, 'intra');
  assert.strictEqual(result.taxAmount, 0.00);
  assert.strictEqual(result.cgstAmount, 0.00);
  assert.strictEqual(result.sgstAmount, 0.00);
  assert.strictEqual(result.igstAmount, 0.00);
  assert.strictEqual(result.grandTotal, 500.00);
});

console.log('\n----------------------------------------------------------------');
console.log(`Results: ${passedTests}/${totalTests} tests passed.`);
console.log('================================================================');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('ALL GST CALCULATIONS VERIFIED SUCCESSFULLY.');
  process.exit(0);
}
