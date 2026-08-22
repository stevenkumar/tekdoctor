const { pool } = require('./config/db.config');
const fs = require('fs');

async function test() {
    try {
        const [rows] = await pool.query("SELECT * FROM site_settings");
        fs.writeFileSync('db-output.json', JSON.stringify(rows, null, 2));
        console.log('Done writing db-output.json');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

test();
