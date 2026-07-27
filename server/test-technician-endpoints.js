require('dotenv').config();
const mysql = require('mysql2/promise');

async function testEndpoints() {
    let connection;
    try {
        console.log('--- Testing Database for Technicians ---');
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'tekdoctor_db',
        });
        connection = await pool.getConnection();

        const [users] = await connection.query('SELECT technician_id, name, email FROM users WHERE role="technician"');
        console.log('Technicians returned:');
        console.log(users);

        if (users.length > 0) {
            console.log(`\n--- Simulating DB fetch for TechnicianWorkload Endpoint (ID: 3) ---`);
            const [queryRows] = await connection.query('SELECT id, technician_id, name, email, phone, is_active FROM users WHERE id = 3 AND role = "technician" LIMIT 1');
            console.log(queryRows);
        }

        process.exit(0);
    } catch (e) {
        console.error('Test failed:', e);
        process.exit(1);
    } finally {
        if (connection) connection.release();
    }
}
testEndpoints();
