const assert = require('assert');
const BASE_URL = 'http://localhost:5000/api';

// Native fetch helper to enforce Connection: close and prevent UV handle exit crash on Windows
async function fetchClose(url, options = {}) {
    const headers = {
        ...(options.headers || {}),
        'Connection': 'close'
    };
    return fetch(url, { ...options, headers });
}

async function testBillingFlow() {
    console.log('--- STARTING AUTOMATED B2B BILLING & INVOICING API FLOW TESTS ---');
    let token = null;

    try {
        // 1. Log in as B2B Company
        const loginRes = await fetchClose(`${BASE_URL}/auth/signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'company@test.com',
                password: 'password123'
            })
        });

        if (loginRes.status !== 200) {
            const errTxt = await loginRes.text();
            console.error(`[FAIL] Login status: ${loginRes.status}, Body: ${errTxt}`);
        }
        assert.strictEqual(loginRes.status, 200, 'Login should succeed with 200 OK');
        const loginJson = await loginRes.json();
        assert.ok(loginJson.success, 'Login response should have success status');
        token = loginJson.data.token;
        console.log('[PASS] Logged in as company@test.com successfully.');

        // 2. Fetch Quotations
        const quotesRes = await fetchClose(`${BASE_URL}/billing/quotations`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        assert.strictEqual(quotesRes.status, 200, 'Get quotations should return 200 OK');
        const quotesJson = await quotesRes.json();
        assert.ok(Array.isArray(quotesJson.data), 'Quotations data should be an array');

        const pendingQuote = quotesJson.data.find(q => q.id === 'qt-101');
        assert.ok(pendingQuote, 'Should find demo pending quotation qt-101');
        assert.strictEqual(pendingQuote.status, 'Pending', 'Quotation qt-101 status should be Pending');
        console.log('[PASS] Quotations retrieved and pending qt-101 verified.');

        // 3. Approve Quotation qt-101
        console.log('Approving quotation qt-101...');
        const respondRes = await fetchClose(`${BASE_URL}/billing/quotations/qt-101/respond`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ status: 'Approved' })
        });

        assert.strictEqual(respondRes.status, 200, 'Respond to quotation should return 200 OK');
        const respondJson = await respondRes.json();
        assert.ok(respondJson.success, 'Respond response should denote success');
        const generatedInvoiceId = respondJson.data.invoiceId;
        assert.ok(generatedInvoiceId, 'Response should contain auto-generated invoice ID');
        console.log(`[PASS] Approved quotation qt-101. Auto-generated Invoice ID: ${generatedInvoiceId}`);

        // 4. Fetch Invoices to check if auto-generated invoice is present
        const invoicesRes = await fetchClose(`${BASE_URL}/billing/invoices`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        assert.strictEqual(invoicesRes.status, 200, 'Get invoices should return 200 OK');
        const invoicesJson = await invoicesRes.json();

        const invoiceList = Array.isArray(invoicesJson.data) ? invoicesJson.data : invoicesJson;
        const generatedInvoice = invoiceList.find(i => i.id === generatedInvoiceId);
        assert.ok(generatedInvoice, 'Should find the newly generated invoice in invoice list');
        assert.strictEqual(generatedInvoice.status, 'Unpaid', 'New invoice should be Unpaid');
        assert.strictEqual(parseFloat(generatedInvoice.amount), 84999.00, 'New invoice amount should match approved quotation');
        console.log('[PASS] Auto-generated invoice retrieved and verified in listing.');

        // 5. Pay the original invoice inv-101 (amount 14500)
        console.log('Paying invoice inv-101 via simulator...');
        const payRes = await fetchClose(`${BASE_URL}/billing/pay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                invoiceId: 'inv-101',
                paymentMethod: 'Credit Card',
                cardNumber: '4111222233334444',
                expiry: '12/29',
                cvc: '123'
            })
        });
        assert.strictEqual(payRes.status, 200, 'Pay invoice should return 200 OK');
        const payJson = await payRes.json();
        assert.ok(payJson.success, 'Pay operation should succeed');
        console.log('[PASS] Payment simulation succeeded for inv-101.');

        // 6. Check that inv-101 is now marked as Paid
        const checkInvoicesRes = await fetchClose(`${BASE_URL}/billing/invoices`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const checkInvoicesJson = await checkInvoicesRes.json();
        const checkInvoiceList = Array.isArray(checkInvoicesJson.data) ? checkInvoicesJson.data : checkInvoicesJson;
        const paidInvoice = checkInvoiceList.find(i => i.id === 'inv-101');
        assert.strictEqual(paidInvoice.status, 'Paid', 'Invoice inv-101 status should now be Paid');
        console.log('[PASS] Verified status update of invoice inv-101 is Paid.');

        // 7. Check B2B Security logs to verify actions are recorded
        const logsRes = await fetchClose(`${BASE_URL}/company/activity-logs`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        assert.strictEqual(logsRes.status, 200, 'Get activity logs should return 200 OK');
        const logsJson = await logsRes.json();
        const logs = logsJson.data.data || logsJson.data || logsJson;

        const approveLog = logs.find(l => l.action === 'approve_quotation');
        assert.ok(approveLog, 'Should locate quotation approval event in security logs');
        assert.ok(approveLog.details.includes('qt-101'), 'Log details should mention quotation ID');
        console.log('[PASS] B2B Security Logs successfully registered corporate action.');

        console.log('\n🌟 ALL CORPORATE BILLING & INVOICING API FLOW TESTS PASSED!');
        // Delay exit to ensure keep-alives clean up naturally
        setTimeout(() => {
            process.exit(0);
        }, 150);
    } catch (error) {
        console.error('\n🚨 TEST DIAGNOSTIC FAILURE:', error.message);
        setTimeout(() => {
            process.exit(1);
        }, 150);
    }
}

testBillingFlow();
