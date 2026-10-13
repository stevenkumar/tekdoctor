const { pool } = require('../config/db.config');

const API_BASE = (process.env.TEST_API_BASE || 'http://127.0.0.1:5000') + '/api';

async function testIdempotencyAndApi() {
  console.log('--- Testing API Idempotency & Authoritative Ticket Number ---');

  const submissionKey = `test-sub-${Date.now()}`;
  const payload = {
    customerName: 'Test Idempotency User',
    mobile: '9876543210',
    email: `idem_${Date.now()}@test.com`,
    city: 'Bengaluru',
    deviceCategory: 'Laptop',
    brand: 'Dell',
    modelNumber: 'XPS 15',
    problemType: 'Not powering on',
    problemDescription: 'Laptop completely dead, will not power on even when connected to charger.',
    clientSubmissionId: submissionKey
  };

  let firstTicketNumber = null;
  let firstTicketId = null;

  try {
    // 1. First submission
    const res1 = await fetch(`${API_BASE}/repair-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-recaptcha-token': 'test-token'
      },
      body: JSON.stringify(payload)
    });
    const data1 = await res1.json();
    console.log('First submission status:', res1.status, data1.success);
    firstTicketNumber = data1.data?.ticketNumber || data1.ticketNumber;
    firstTicketId = data1.data?.id;
    console.log(`Generated Ticket: ID ${firstTicketId}, Number: ${firstTicketNumber}`);

    if (!firstTicketNumber) {
      throw new Error(`Failed to obtain ticketNumber from first submission: ${JSON.stringify(data1)}`);
    }

    // 2. Duplicate submission with same submission_id
    const res2 = await fetch(`${API_BASE}/repair-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-recaptcha-token': 'test-token'
      },
      body: JSON.stringify(payload)
    });
    const data2 = await res2.json();
    console.log('Second submission status:', res2.status, 'isDuplicate:', data2.isDuplicate);
    const secondTicketNumber = data2.data?.ticketNumber || data2.ticketNumber;
    console.log(`Duplicate submission returned Ticket Number: ${secondTicketNumber}`);

    if (secondTicketNumber !== firstTicketNumber) {
      throw new Error(`Idempotency check failed: expected ${firstTicketNumber}, got ${secondTicketNumber}`);
    }
    console.log('✓ Idempotency verified: duplicate submission returned exact same authoritative ticket ID without consuming new serial.');

    // 3. Public tracking lookup
    const trackRes = await fetch(`${API_BASE}/repair-request/track/${firstTicketNumber}`);
    const trackData = await trackRes.json();
    console.log('Track lookup status:', trackRes.status, trackData.success);
    const trackedNumber = trackData.data?.ticketNumber;
    console.log(`Track endpoint returned: ${trackedNumber}`);

    if (trackedNumber !== firstTicketNumber) {
      throw new Error(`Authoritative ID mismatch in public tracking: expected ${firstTicketNumber}, got ${trackedNumber}`);
    }
    console.log('✓ Authoritative ticket ID verified across Public Tracking API.');

    // 4. Clean up test record
    if (firstTicketId) {
      await pool.query('DELETE FROM service_requests WHERE id = ?', [firstTicketId]);
      console.log(`Cleaned up test ticket ID ${firstTicketId}.`);
    }

    console.log('--- API Idempotency & Public Tracking Tests Passed! ---');
    await new Promise(resolve => setTimeout(resolve, 100));
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err.response?.data || err.message);
    if (firstTicketId) {
      await pool.query('DELETE FROM service_requests WHERE id = ?', [firstTicketId]).catch(() => {});
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    process.exit(1);
  }
}

testIdempotencyAndApi();
