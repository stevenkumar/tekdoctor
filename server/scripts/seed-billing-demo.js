const bcrypt = require('bcryptjs');
const { pool } = require('../config/db.config');

async function seed() {
    console.log('--- SEEDING DEMO B2B CORPORATE BILLING DATA ---');
    let connection;
    try {
        connection = await pool.getConnection();

        // Hash password
        const hashedPassword = bcrypt.hashSync('password123', 10);

        // 1. Insert or get user
        const [existing] = await connection.query('SELECT id FROM users WHERE email = ? LIMIT 1', ['company@test.com']);
        let userId;

        if (existing.length > 0) {
            userId = existing[0].id;
            console.log(`Found existing B2B company user with ID: ${userId}`);
        } else {
            const [res] = await connection.query(`
        INSERT INTO users (name, email, password, role, is_active)
        VALUES ('Test B2B Corporation', 'company@test.com', ?, 'company', 1)
      `, [hashedPassword]);
            userId = res.insertId;
            console.log(`Created B2B company user with ID: ${userId}`);
        }

        // 2. Insert company profile
        const [existingProfile] = await connection.query('SELECT user_id FROM company_profiles WHERE user_id = ? LIMIT 1', [userId]);
        if (existingProfile.length === 0) {
            await connection.query(`
        INSERT INTO company_profiles (user_id, company_name, contact_person, address)
        VALUES (?, 'Test B2B Corporation', 'Mark Spencer', 'Industrial Tech Park, Block C, Bangalore')
      `, [userId]);
            console.log('Created company profile.');
        }

        // 3. Clear old quotations/invoices for a clean demo
        await connection.query('DELETE FROM quotations WHERE company_id = ?', [userId]);
        await connection.query('DELETE FROM invoices WHERE user_id = ?', [userId]);

        // 4. Insert sample pending quotation
        const quoteItems = [
            { description: 'Industrial AC Unit (5 Ton)', quantity: 1, unitPrice: 75000, total: 75000 },
            { description: 'Copper Piping and Wiring Kit', quantity: 2, unitPrice: 2499, total: 4998 },
            { description: 'Installation and Commissioning Labor', quantity: 1, unitPrice: 5001, total: 5001 }
        ];

        await connection.query(`
      INSERT INTO quotations (id, company_id, title, amount, status, items, notes)
      VALUES ('qt-101', ?, 'Server Rack Room Air Conditioning Upgrade & Repair', 84999.00, 'Pending', ?, ?)
    `, [
            userId,
            JSON.stringify(quoteItems),
            'Includes standard 12-month onsite warranty. Net 30 payment terms will apply upon quote approval.'
        ]);
        console.log('Created demo Quotation: qt-101 (Pending)');

        // 5. Insert sample unpaid invoice
        await connection.query(`
      INSERT INTO invoices (id, user_id, client_name, amount, currency, invoice_date, due_date, status, notes)
      VALUES ('inv-101', ?, 'Test B2B Corporation', 14500.00, 'INR', '2026-07-01', '2026-08-01', 'Unpaid', 'Invoice for hardware upgrade services.')
    `, [userId]);

        await connection.query('DELETE FROM invoice_line_items WHERE invoice_id = ?', ['inv-101']);
        await connection.query(`
      INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total)
      VALUES 
        ('inv-101', 'RAM Upgrade (16GB DDR4)', 5, 2000.00, 10000.00),
        ('inv-101', 'Workstation Service Labor', 3, 1500.00, 4500.00)
    `);
        console.log('Created demo Invoice: inv-101 (Unpaid)');

        console.log('--- SEEDING COMPLETED SUCCESSFULLY ---');
    } catch (err) {
        console.error('Seeding error:', err);
    } finally {
        if (connection) connection.release();
        await pool.end();
    }
}

seed();
