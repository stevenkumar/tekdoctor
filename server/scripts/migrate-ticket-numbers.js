const { pool } = require('../config/db.config');

async function migrateTicketNumbers() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('Starting ticket migration...');

        // Fetch all distinct user IDs who have service requests (or guest requests which are handled similarly)
        const [users] = await connection.query('SELECT DISTINCT user_id FROM service_requests');

        for (const { user_id } of users) {
            // Fetch all requests for this user sorted by ID to maintain R001, R002 order
            let query = 'SELECT id, user_id FROM service_requests WHERE user_id IS NULL ORDER BY created_at ASC';
            let params = [];
            if (user_id) {
                query = 'SELECT id, user_id FROM service_requests WHERE user_id = ? ORDER BY created_at ASC';
                params = [user_id];
            }

            const [requests] = await connection.query(query, params);

            let counter = 1;
            for (const req of requests) {
                let userRole = 'customer';
                if (req.user_id) {
                    const [userInfo] = await connection.query('SELECT role FROM users WHERE id = ? LIMIT 1', [req.user_id]);
                    if (userInfo.length > 0) userRole = userInfo[0].role;
                }

                let ticketPrefix = userRole === 'company' ? 'TD-C' : 'TD-';
                let customerIdStr = req.user_id
                    ? `${ticketPrefix}${String(req.user_id).padStart(3, '0')}`
                    : `${ticketPrefix}GUEST-${req.id}`; // using request ID as guest suffix for historical fallback

                let newTicketNumber = `${customerIdStr}-R${String(counter).padStart(3, '0')}`;

                await connection.query('UPDATE service_requests SET ticket_number = ? WHERE id = ?', [newTicketNumber, req.id]);
                console.log(`Updated Request ID: ${req.id} -> ${newTicketNumber}`);
                counter++;
            }
        }

        console.log('✅ Ticket migration completed successfully!');
    } catch (error) {
        console.error('Migration Failed:', error);
    } finally {
        if (connection) connection.release();
        process.exit(0);
    }
}

migrateTicketNumbers();
