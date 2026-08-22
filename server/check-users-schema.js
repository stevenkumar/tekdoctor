require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkSchema() {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'tekdoctor_db',
        });

        const [rows] = await pool.query('DESCRIBE users;');
        console.log(rows);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
checkSchema();
