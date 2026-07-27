const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function seed() {
    const pool = mysql.createPool({
        host: '127.0.0.1',
        user: 'root',
        password: '',
        database: 'tekdoctor_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    const pw = await bcrypt.hash('Tech@123', 12);
    await pool.query('INSERT INTO users (name, email, password, role) SELECT "Tech 1", "tech1@tekdoctor.in", ?, "technician" WHERE NOT EXISTS (SELECT email FROM users WHERE email="tech1@tekdoctor.in")', [pw]);
    await pool.query('INSERT INTO users (name, email, password, role) SELECT "Tech 2", "tech2@tekdoctor.in", ?, "technician" WHERE NOT EXISTS (SELECT email FROM users WHERE email="tech2@tekdoctor.in")', [pw]);

    const [techs] = await pool.query('SELECT id, name, email FROM users WHERE role="technician"');
    console.log('Technicians:', techs);
    process.exit(0);
}
seed();
