const { pool } = require('./config/db.config');
const http = require('http');
const fs = require('fs');

async function verify() {
    try {
        const validFile = '179e4046_Screenshot_2026_03_26_144510.png';
        const logoUrl = `/uploads/${validFile}`;
        const faviconUrl = `/uploads/${validFile}`;

        await pool.query(
            "INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES ('logo_url', ?, 'company') ON DUPLICATE KEY UPDATE setting_value = ?, setting_group = 'company'",
            [logoUrl, logoUrl]
        );
        await pool.query(
            "INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES ('favicon_url', ?, 'branding') ON DUPLICATE KEY UPDATE setting_value = ?, setting_group = 'branding'",
            [faviconUrl, faviconUrl]
        );

        http.get('http://localhost:5000/api/public/site-data', (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    const settings = response.data.settings;
                    const logo = settings.company.logo_url;
                    const favicon = settings.branding.favicon_url;

                    if (logo === logoUrl && favicon === faviconUrl) {
                        fs.writeFileSync('verification-output.txt', 'VERIFICATION SUCCESSFUL: Logo and favicon URL values correctly persist in database and propagate through the public API.');
                        process.exit(0);
                    } else {
                        fs.writeFileSync('verification-output.txt', 'VERIFICATION FAILED: Mismatch in settings values in API response.');
                        process.exit(1);
                    }
                } catch (err) {
                    fs.writeFileSync('verification-output.txt', 'VERIFICATION FAILED: Error parsing response: ' + err.message);
                    process.exit(1);
                }
            });
        }).on('error', (err) => {
            fs.writeFileSync('verification-output.txt', 'VERIFICATION FAILED: Request error: ' + err.message);
            process.exit(1);
        });
    } catch (e) {
        fs.writeFileSync('verification-output.txt', 'VERIFICATION FAILED: DB error: ' + e.message);
        process.exit(1);
    }
}

verify();
