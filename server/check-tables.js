const { pool } = require('./config/db.config');
const initDatabase = require('./models/db.init');

async function check() {
    try {
        console.log('Running initDatabase to ensure migrations run...');
        await initDatabase();

        console.log('Querying columns for company_profiles...');
        const [columns] = await pool.query("DESCRIBE company_profiles");
        console.log('Columns in company_profiles:');
        console.table(columns);
        process.exit(0);
    } catch (e) {
        console.error('Error during check:', e);
        process.exit(1);
    }
}

check();
