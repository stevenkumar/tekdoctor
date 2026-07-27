const mysql = require('mysql2/promise');
const http = require('http');

console.log('Running direct check via node for manual inspection...');

function fetchWithHttp(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, json: () => JSON.parse(data) });
                } catch (e) {
                    reject(new Error('Failed to parse JSON response: ' + data));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function runCheck() {
    const dbConfig = {
        host: 'localhost', user: 'root', password: '', database: 'tekdoctor_db', multipleStatements: true
    };

    let connection;
    try {
        console.log('Connecting to Test DB...');
        connection = await mysql.createConnection(dbConfig);

        // Find an admin user
        const [admins] = await connection.query('SELECT * FROM users WHERE role = "admin" LIMIT 1');
        if (!admins.length) throw new Error('No admin found.');

        const jwt = require('jsonwebtoken');
        const adminToken = jwt.sign({ id: admins[0].id, role: 'admin' }, process.env.JWT_SECRET || 'secretkey');

        console.log('Admin token generated.');

        // Fetch repair requests
        const res = await fetchWithHttp('http://localhost:5000/api/repair-request', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        const json = await res.json();

        if (!json.success) throw new Error('Failed to fetch requests.');

        let foundRepeats = 0;
        console.log(`Analyzing ${json.data.length} repair requests for repeat diagnostics...`);

        for (const req of json.data) {
            if (req.repeatCount > 1) {
                foundRepeats++;
                console.log(`\n🚨 Found Repeat Failure Warning -> ID #${req.id} (${req.customerName})`);
                console.log(`- Seen ${req.repeatCount} times.`);
                console.log(`- Device: ${req.brand}`);
                console.log(`- Latest Status: ${req.status}`);
                console.log(`- History Size: ${req.repairHistory?.length}`);
            }
        }

        if (foundRepeats === 0) {
            console.log('No repeat repairs found in the database. API parsing is intact, but data is fresh.');
        }

        // Verify company devices
        console.log('\nAnalyzing company devices for AMC structure...');
        const [devices] = await connection.query('SELECT * FROM company_devices WHERE is_amc = 1 LIMIT 5');
        if (devices.length > 0) {
            console.log(`Found ${devices.length} AMC flagged devices.`);
            devices.forEach(d => console.log(`- ID ${d.id}: AMC Tag [${d.amc_tag}]`));
        } else {
            console.log('No AMC devices registered yet.');
        }

        console.log('\n✅ Verification Complete: AMC Schema & Repeat Controller Logic is online.');

    } catch (e) {
        console.error('Error during verification:', e.message);
    } finally {
        if (connection) await connection.end();
    }
}

runCheck();
