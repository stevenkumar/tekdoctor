const { pool } = require('./config/db.config');

async function migrate() {
    let conn;
    try {
        conn = await pool.getConnection();

        console.log("Updating all existing tickets to use permanent format...");
        await conn.query(`
            UPDATE service_requests sr
            JOIN users u ON sr.user_id = u.id
            SET sr.ticket_number = CASE 
                WHEN u.role = 'company' THEN CONCAT('TD-C', LPAD(u.id, 3, '0'))
                ELSE CONCAT('TD-', LPAD(u.id, 3, '0'))
            END
        `);
        console.log("Success! Normalization complete.");
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) conn.release();
        process.exit();
    }
}
migrate();
