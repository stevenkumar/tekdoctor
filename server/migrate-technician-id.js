require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrateTechnicianId() {
    let connection;
    try {
        console.log('Connecting to DB...');
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'tekdoctor_db',
        });

        connection = await pool.getConnection();

        // 1. Add column if it doesn't exist
        console.log('Checking for technician_id column...');
        const [columns] = await connection.query('SHOW COLUMNS FROM users LIKE "technician_id"');
        if (columns.length === 0) {
            console.log('Adding technician_id column...');
            await connection.query('ALTER TABLE users ADD COLUMN technician_id VARCHAR(50) UNIQUE NULL;');
        }

        // 2. Fetch existing technicians ordered by created_at
        console.log('Fetching existing technicians...');
        const [technicians] = await connection.query('SELECT id, technician_id FROM users WHERE role = "technician" ORDER BY created_at ASC');

        // 3. Assign IDs to those who don't have it
        let nextNum = 1;
        for (const tech of technicians) {
            if (!tech.technician_id) {
                const techId = `TD-TECH-${String(nextNum).padStart(3, '0')}`;
                console.log(`Assigning ${techId} to user ID ${tech.id}`);
                await connection.query('UPDATE users SET technician_id = ? WHERE id = ?', [techId, tech.id]);
                nextNum++;
            } else {
                // Determine nextnum from existing ids to continue correctly if some already have them
                const numStr = tech.technician_id.replace('TD-TECH-', '');
                const num = parseInt(numStr, 10);
                if (!isNaN(num) && num >= nextNum) {
                    nextNum = num + 1;
                }
            }
        }

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    } finally {
        if (connection) connection.release();
    }
}
migrateTechnicianId();
