const assert = require('assert');
const BASE_URL = 'http://localhost:5000/api';

async function testFilters() {
    console.log('=== TESTING REPAIR TICKETS FILTER & DATE FILTER ===');

    // 1. Admin Login
    const loginRes = await fetch(`${BASE_URL}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'admin@tekdoctor.in',
            password: 'Admin@123'
        })
    });
    assert.strictEqual(loginRes.status, 200, 'Admin login should succeed');
    const loginData = await loginRes.json();
    const token = loginData.data.token;
    console.log('✔ Admin authenticated successfully.');

    // 2. Fetch all tickets
    const allRes = await fetch(`${BASE_URL}/repair-request`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(allRes.status, 200, 'Fetch all tickets should return 200');
    const allData = await allRes.json();
    assert.ok(allData.data.data, 'Should have data.data array');
    assert.ok(allData.data.pagination, 'Should have data.pagination');
    assert.ok(allData.data.statusCounts, 'Should have data.statusCounts');
    console.log(`✔ All tickets fetched: ${allData.data.data.length} tickets, total: ${allData.data.pagination.total}`);
    console.log('✔ Status counts returned:', allData.data.statusCounts);

    // 3. Test Date Filter - Valid Wide Range
    const dateRes = await fetch(`${BASE_URL}/repair-request?startDate=2020-01-01&endDate=2030-12-31`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(dateRes.status, 200);
    const dateData = await dateRes.json();
    console.log(`✔ Date range (2020 to 2030) returned ${dateData.data.data.length} tickets.`);

    // 4. Test Date Filter - Future Empty Range (No records found)
    const futureDateRes = await fetch(`${BASE_URL}/repair-request?startDate=2099-01-01&endDate=2099-12-31`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(futureDateRes.status, 200);
    const futureData = await futureDateRes.json();
    assert.strictEqual(futureData.data.data.length, 0, 'Future date range should return 0 tickets');
    assert.strictEqual(futureData.data.pagination.total, 0, 'Future date pagination total should be 0');
    console.log('✔ Out of range dates correctly return 0 records ("No Records Found").');

    // 5. Test Search Filter
    if (allData.data.data.length > 0) {
        const firstTicket = allData.data.data[0];
        const searchSample = firstTicket.customerName ? firstTicket.customerName.slice(0, 4) : firstTicket.ticketNumber;
        const searchRes = await fetch(`${BASE_URL}/repair-request?search=${encodeURIComponent(searchSample)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        assert.strictEqual(searchRes.status, 200);
        const searchData = await searchRes.json();
        assert.ok(searchData.data.data.length > 0, 'Search should find matching records');
        console.log(`✔ Search for "${searchSample}" returned ${searchData.data.data.length} matching tickets.`);
    }

    // 6. Test Status Filter
    const statusRes = await fetch(`${BASE_URL}/repair-request?status=pending`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(statusRes.status, 200);
    const statusData = await statusRes.json();
    statusData.data.data.forEach(t => {
        assert.strictEqual(t.status.toLowerCase(), 'pending', 'All returned tickets should have pending status');
    });
    console.log(`✔ Status filter "pending" returned ${statusData.data.data.length} pending tickets.`);

    // 7. Test Technician Filter - Unassigned
    const unassignedRes = await fetch(`${BASE_URL}/repair-request?technicianId=unassigned`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(unassignedRes.status, 200);
    const unassignedData = await unassignedRes.json();
    unassignedData.data.data.forEach(t => {
        assert.ok(!t.assignedTechnicianId, 'Ticket should have no assigned technician');
    });
    console.log(`✔ Technician filter "unassigned" returned ${unassignedData.data.data.length} unassigned tickets.`);

    console.log('\n🎉 ALL FILTER & DATE FILTER BACKEND TESTS PASSED SUCCESSFULLY! 🎉\n');
}

testFilters().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
