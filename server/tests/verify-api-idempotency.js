const { pool } = require('../config/db.config');

const API_BASE = (process.env.TEST_API_BASE || 'http://127.0.0.1:5000') + '/api';

async function testIdempotencyAndApi() {
  console.log('--- Testing API Idempotency & Authoritative Ticket Number ---');

  // Allocate an isolated mobile and email guaranteed not to collide with real accounts
  let testMobile = '';
  let testEmail = '';
  while (true) {
    const randDigits = Math.floor(10000000 + Math.random() * 90000000);
    const candidateMobile = `98${randDigits}`;
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE phone = ? OR phone = ?',
      [candidateMobile, `+91${candidateMobile}`]
    );
    if (existing.length === 0) {
      testMobile = candidateMobile;
      testEmail = `test_idem_${Date.now()}_${randDigits}@tekdoctor-test.in`;
      break;
    }
  }

  const submissionKey = `test-sub-${Date.now()}`;
  const payload = {
    customerName: 'Test Idempotency User',
    mobile: testMobile,
    email: testEmail,
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
  let createdUserId = null;

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

    // Capture created user_id from the database
    if (firstTicketId) {
      const [ticketRows] = await pool.query('SELECT user_id FROM service_requests WHERE id = ?', [firstTicketId]);
      createdUserId = ticketRows[0]?.user_id;
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
    console.log('--- API Idempotency & Public Tracking Tests Passed! ---');
  } catch (err) {
    console.error('Test error:', err.response?.data || err.message);
    process.exitCode = 1;
  } finally {
    // 4. Clean up test records (ticket, user, and sequence) ensuring no state leaks
    try {
      if (firstTicketId) {
        await pool.query('DELETE FROM service_requests WHERE id = ?', [firstTicketId]);
        console.log(`Cleaned up test ticket ID ${firstTicketId}.`);
      }
      if (firstTicketNumber) {
        const accId = firstTicketNumber.substring(0, firstTicketNumber.lastIndexOf('-'));
        const seqName = `tkt:${accId}`;
        await pool.query('DELETE FROM app_sequences WHERE sequence_name = ?', [seqName]);
        console.log(`Cleaned up fixture sequence ${seqName}.`);
      }
      if (createdUserId) {
        await pool.query('DELETE FROM users WHERE id = ?', [createdUserId]);
        console.log(`Cleaned up test user ${createdUserId}.`);
      }
    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr.message);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    process.exit(process.exitCode || 0);
  }
}

testIdempotencyAndApi();
