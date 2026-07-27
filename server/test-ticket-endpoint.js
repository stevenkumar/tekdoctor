require('dotenv').config();
const mysql = require('mysql2/promise');

async function testSingleTicket() {
    let connection;
    try {
        console.log('--- Testing Database for Repair Ticket ID Endpoint ---');
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'tekdoctor_db',
        });
        connection = await pool.getConnection();

        console.log(`\n--- Simulating GET /api/repair-request/:id ---`);
        const [rows] = await connection.query('SELECT * FROM service_requests ORDER BY id DESC LIMIT 1');

        if (rows.length > 0) {
            console.log(`Successfully fetched latest ticket (ID: ${rows[0].id})`);
            console.log(rows[0]);
        } else {
            console.log("No tickets found in DB to fetch.");
        }

        process.exit(0);
    } catch (e) {
        console.error('Test failed:', e);
        process.exit(1);
    } finally {
        if (connection) connection.release();
    }
}
testSingleTicket();
