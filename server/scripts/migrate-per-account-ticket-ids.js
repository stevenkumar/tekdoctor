/**
 * Migration Script: Per-Account Sequential Ticket ID System
 * 
 * Migrates all existing service_requests to the format:
 * PERMANENT_ACCOUNT_ID + "-" + 2-digit account-specific serial
 * 
 * - Customer: TD-001-01, TD-001-02, TD-170-01...
 * - Company: TD-C001-01, TD-C001-02, TD-C146-01...
 * - AMC Company: TD-AMC-C001-01, TD-AMC-C001-02...
 * 
 * Updates:
 * - service_requests (ticket_number, user_id, company_id)
 * - app_sequences (tkt:PERMANENT_ACCOUNT_ID)
 * - notifications (title, message text references)
 * - activity_logs (details JSON text references)
 */

const { pool } = require('../config/db.config');

async function migrate() {
  const connection = await pool.getConnection();
  try {
    console.log('--- Starting Per-Account Ticket ID Migration ---');
    await connection.beginTransaction();

    // 0. Ensure app_sequences can hold account sequence names up to 100 chars
    try {
      await connection.query('ALTER TABLE app_sequences MODIFY COLUMN sequence_name VARCHAR(100) NOT NULL');
      console.log('Updated app_sequences.sequence_name to VARCHAR(100).');
    } catch (e) {
      // Table or column might already be configured
    }

    // 1. Fetch company profiles for AMC detection
    const [compProfiles] = await connection.query(
      'SELECT user_id, amc_status, company_type FROM company_profiles'
    );
    const amcMap = new Map();
    for (const cp of compProfiles) {
      const isAmc = (cp.amc_status || '').toLowerCase() === 'active' || (cp.company_type || '').toUpperCase() === 'AMC';
      amcMap.set(Number(cp.user_id), isAmc);
    }

    // 2. Fetch all tickets ordered chronologically
    const [tickets] = await connection.query(`
      SELECT sr.id, sr.ticket_number, sr.user_id, sr.company_id, sr.customer_name, sr.email, sr.created_at,
             u.role as user_role
      FROM service_requests sr
      LEFT JOIN users u ON sr.user_id = u.id
      ORDER BY sr.created_at ASC, sr.id ASC
    `);

    console.log(`Found ${tickets.length} total tickets to evaluate and migrate.`);

    // 3. Group tickets by authoritative permanent account ID
    const accountTickets = new Map();
    for (const t of tickets) {
      let permanentAccountId;
      let targetCompanyId = null;
      let targetUserId = t.user_id ? Number(t.user_id) : null;

      // Determine if company ticket
      const compId = t.company_id ? Number(t.company_id) : (t.user_role === 'company' ? Number(t.user_id) : null);
      if (compId) {
        targetCompanyId = compId;
        if (!targetUserId) targetUserId = compId;
        const isAmc = amcMap.get(compId) || false;
        const paddedCompId = String(compId).padStart(3, '0');
        permanentAccountId = isAmc ? `TD-AMC-C${paddedCompId}` : `TD-C${paddedCompId}`;
      } else {
        const custId = targetUserId || 1;
        const paddedCustId = String(custId).padStart(3, '0');
        permanentAccountId = `TD-${paddedCustId}`;
      }

      if (!accountTickets.has(permanentAccountId)) {
        accountTickets.set(permanentAccountId, []);
      }
      accountTickets.get(permanentAccountId).push({
        ...t,
        permanentAccountId,
        targetCompanyId,
        targetUserId
      });
    }

    console.log(`Grouped into ${accountTickets.size} independent account sequence streams.`);

    const migrations = [];
    const sequenceLevels = new Map();

    // 4. Calculate deterministic new ticket numbers per account
    for (const [accountId, tList] of accountTickets.entries()) {
      tList.forEach((t, idx) => {
        const serial = String(idx + 1).padStart(2, '0');
        const newTicketNumber = `${accountId}-${serial}`;
        migrations.push({
          id: t.id,
          oldTicketNumber: t.ticket_number,
          newTicketNumber,
          accountId,
          targetCompanyId: t.targetCompanyId,
          targetUserId: t.targetUserId,
          customerName: t.customer_name
        });
      });
      sequenceLevels.set(accountId, tList.length);
    }

    // 5. Update service_requests records
    // Temporarily clear old ticket numbers or update directly if distinct
    // We update each record with its new ID, also fixing any missing company_id or user_id
    for (const m of migrations) {
      await connection.query(`
        UPDATE service_requests
        SET ticket_number = ?,
            company_id = COALESCE(company_id, ?),
            user_id = COALESCE(user_id, ?)
        WHERE id = ?
      `, [m.newTicketNumber, m.targetCompanyId, m.targetUserId, m.id]);
    }

    // 6. Update app_sequences table with current sequence level for each account
    for (const [accountId, maxSerial] of sequenceLevels.entries()) {
      const seqName = `tkt:${accountId}`;
      await connection.query(`
        INSERT INTO app_sequences (sequence_name, current_val)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE current_val = GREATEST(current_val, ?)
      `, [seqName, maxSerial, maxSerial]);
    }

    // 7. Update text references in notifications and activity_logs
    let notifsUpdated = 0;
    let logsUpdated = 0;

    for (const m of migrations) {
      if (m.oldTicketNumber && m.oldTicketNumber !== m.newTicketNumber) {
        // Update notifications
        const [notifResult] = await connection.query(`
          UPDATE notifications
          SET title = REPLACE(title, ?, ?),
              message = REPLACE(message, ?, ?)
          WHERE (title LIKE ? OR message LIKE ?)
        `, [
          m.oldTicketNumber, m.newTicketNumber,
          m.oldTicketNumber, m.newTicketNumber,
          `%${m.oldTicketNumber}%`, `%${m.oldTicketNumber}%`
        ]);
        notifsUpdated += notifResult.affectedRows;

        // Update activity_logs
        const [logResult] = await connection.query(`
          UPDATE activity_logs
          SET details = REPLACE(details, ?, ?)
          WHERE details LIKE ?
        `, [
          m.oldTicketNumber, m.newTicketNumber,
          `%${m.oldTicketNumber}%`
        ]);
        logsUpdated += logResult.affectedRows;
      }
    }

    // 8. Verify uniqueness and completeness
    const [verifyDupes] = await connection.query(`
      SELECT ticket_number, COUNT(*) as cnt
      FROM service_requests
      GROUP BY ticket_number
      HAVING cnt > 1
    `);

    if (verifyDupes.length > 0) {
      throw new Error(`CRITICAL: Duplicate ticket numbers detected post-migration: ${JSON.stringify(verifyDupes)}`);
    }

    await connection.commit();
    console.log('--- Migration Transaction Committed Successfully ---');
    console.log(`Migrated ${migrations.length} tickets across ${sequenceLevels.size} accounts.`);
    console.log(`Updated references: ${notifsUpdated} notifications, ${logsUpdated} activity log entries.`);

    console.log('\nMigration Sample:');
    migrations.forEach(m => {
      console.log(`  [ID ${m.id}] ${m.oldTicketNumber} -> ${m.newTicketNumber} (${m.accountId} | ${m.customerName || 'N/A'})`);
    });

    return {
      success: true,
      totalMigrated: migrations.length,
      accounts: sequenceLevels.size,
      migrations
    };

  } catch (error) {
    await connection.rollback();
    console.error('Migration failed and rolled back:', error);
    throw error;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Migration completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration script error:', err);
      process.exit(1);
    });
}

module.exports = { migrate };
