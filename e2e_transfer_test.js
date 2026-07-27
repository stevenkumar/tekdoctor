const testFlow = async () => {
    try {
        const adminCreds = { email: 'admin@tekdoctor.in', password: 'Admin@123' };
        const tech1Creds = { email: 'tech1@tekdoctor.in', password: 'Tech@123' };
        const tech2Creds = { email: 'tech2@tekdoctor.in', password: 'Tech@123' };

        const baseUrl = 'http://localhost:5000/api';

        // Helper to login
        const login = async (creds) => {
            const r = await fetch(baseUrl + '/auth/signin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(creds)
            });
            const d = await r.json();
            if (!d.success) console.log('Login failed for', creds.email, d);
            return { token: d.data?.token, user: d.data?.user };
        };

        console.log('Logging in...');
        const adminAuth = await login(adminCreds);
        const tech1Auth = await login(tech1Creds);
        const tech2Auth = await login(tech2Creds);

        console.log(`Tech 1 ID: ${tech1Auth.user.id}`);
        console.log(`Tech 2 ID: ${tech2Auth.user.id}`);

        // Admin gets first pending/unassigned ticket or any ticket
        const getTickets = await fetch(baseUrl + '/admin/repair-requests', {
            headers: { 'Authorization': `Bearer ${adminAuth.token}` }
        });
        const ticketsData = await getTickets.json();
        let targetTicket = ticketsData.data.find(t => t.status !== 'completed' && t.status !== 'delivered');

        if (!targetTicket) {
            console.log('No tickets available to test. Exiting.');
            return;
        }

        console.log(`Found Ticket ID: ${targetTicket.id} (status: ${targetTicket.status})`);

        // Admin assigns to Tech 1
        console.log('Admin assigning ticket to Tech 1...');
        const assignRes = await fetch(`${baseUrl}/repair-request/${targetTicket.id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminAuth.token}`
            },
            body: JSON.stringify({ assignedTechnicianId: tech1Auth.user.id }) // wait, the UI sends assignedTechnicianId to updateRequestStatus
        });
        console.log('Assign Res:', await assignRes.json());

        // Tech 1 gets tickets
        console.log('Tech 1 fetching their tickets...');
        const tech1TicketsRes = await fetch(`${baseUrl}/technicians/my-tasks`, {
            headers: { 'Authorization': `Bearer ${tech1Auth.token}` }
        });
        const tech1Data = await tech1TicketsRes.json();
        const tech1Task = tech1Data.data.find(t => t.id === targetTicket.id);
        console.log(`Tech 1 Task found with pendingTechnicianId: ${tech1Task?.pending_technician_id}`);

        // Tech 1 Accepts Assignment
        console.log('Tech 1 accepting assignment...');
        const acceptRes = await fetch(`${baseUrl}/repair-request/${targetTicket.id}/accept`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tech1Auth.token}` }
        });
        console.log('Accept Res:', await acceptRes.json());

        // Tech 1 Transfers Assignment to Tech 2
        console.log('Tech 1 transferring to Tech 2...');
        const transferRes = await fetch(`${baseUrl}/repair-request/${targetTicket.id}/transfer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tech1Auth.token}`
            },
            body: JSON.stringify({ targetTechnicianId: tech2Auth.user.id, reason: 'E2E Testing' })
        });
        console.log('Transfer Res:', await transferRes.json());

        // Tech 2 gets tickets
        console.log('Tech 2 fetching their tickets...');
        const tech2TicketsRes = await fetch(`${baseUrl}/technicians/my-tasks`, {
            headers: { 'Authorization': `Bearer ${tech2Auth.token}` }
        });
        const tech2Data = await tech2TicketsRes.json();
        const tech2Task = tech2Data.data.find(t => t.id === targetTicket.id);
        console.log(`Tech 2 Task found with pendingTechnicianId: ${tech2Task?.pending_technician_id}`);

    } catch (e) {
        console.log("ERROR OCCURRED:");
        console.log(e.message);
        console.log(e.stack);
    }
};

testFlow();
