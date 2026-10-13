const logger = require('./logger');
const { logActivity } = require('./activity.logger');
const { sendAdminNotification, sendCustomerNotification } = require('./email.utils');

/**
 * Process all tickets whose hold period has expired without customer approval.
 * Transitions them to 'cancelled' with status 'auto_cancelled' and dispatches notifications.
 */
const processHoldExpirations = async (pool) => {
  let connection;
  try {
    connection = await pool.getConnection();

    // Find all expired on-hold requests
    const [expiredTickets] = await connection.query(`
      SELECT id, ticket_number, customer_name, email, mobile, user_id, 
             assigned_technician_id, brand, model_number, 
             hold_start_date, hold_end_date, hold_reason, estimated_cost
      FROM service_requests
      WHERE customer_approval_status IN ('on_hold', 'rejected')
        AND hold_end_date IS NOT NULL
        AND hold_end_date <= NOW()
        AND is_active = 1
        AND status != 'cancelled'
    `);

    if (expiredTickets.length === 0) {
      return 0;
    }

    logger.info(`Found ${expiredTickets.length} expired on-hold tickets to auto-cancel.`);

    for (const ticket of expiredTickets) {
      const cancellationReason = 'Cancelled — Customer Approval Not Received (Hold period expired)';
      
      // Update ticket status
      await connection.query(`
        UPDATE service_requests
        SET status = 'cancelled',
            customer_approval_status = 'auto_cancelled',
            cancellation_reason = ?,
            cancelled_at = NOW(),
            cancelled_by = NULL
        WHERE id = ?
      `, [cancellationReason, ticket.id]);

      const ticketNum = ticket.ticket_number || `#${ticket.id}`;
      const deviceStr = `${ticket.brand} ${ticket.model_number || ''}`.trim();

      // 1. In-App Notification to Customer
      if (ticket.user_id) {
        try {
          await connection.query(`
            INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
            VALUES (?, ?, ?, ?, NULL)
          `, [
            ticket.user_id,
            `Repair Request Cancelled [${ticketNum}]`,
            `Your repair request for ${deviceStr} was automatically cancelled because the estimate was not approved within the hold deadline.`,
            ticket.id
          ]);
        } catch (notifErr) {
          logger.warn(`Failed to create customer auto-cancel notification for ticket ${ticket.id}: ${notifErr.message}`);
        }
      }

      // 2. Email Notification to Customer
      if (ticket.email) {
        try {
          const emailSubject = `TekDoctor - Repair Ticket Cancelled [${ticketNum}]`;
          const emailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; color: #333;">
              <h3 style="color: #ef4444;">Repair Request Cancelled</h3>
              <p>Dear ${ticket.customer_name},</p>
              <p>Your repair service ticket <strong>${ticketNum}</strong> for <strong>${deviceStr}</strong> has been automatically cancelled because estimate approval was not received within the hold deadline.</p>
              <p>If you still wish to repair this device in the future, please submit a new service request or contact our support team.</p>
              <p>Best regards,<br/>The TekDoctor Team</p>
            </div>
          `;
          sendCustomerNotification(ticket.email, emailSubject, emailHtml).catch(e => logger.warn(`Auto-cancel customer email error: ${e.message}`));
        } catch (emailErr) { }
      }

      // 3. In-App Notification to Assigned Technician
      if (ticket.assigned_technician_id) {
        try {
          await connection.query(`
            INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
            VALUES (?, ?, ?, ?, NULL)
          `, [
            ticket.assigned_technician_id,
            `Ticket Auto-Cancelled [${ticketNum}]`,
            `Ticket ${ticketNum} (${ticket.customer_name}) has been automatically cancelled after the customer estimate approval hold period expired.`,
            ticket.id
          ]);
        } catch (notifErr) {
          logger.warn(`Failed to create technician auto-cancel notification for ticket ${ticket.id}: ${notifErr.message}`);
        }
      }

      // 4. In-App Notification to All Admins
      try {
        const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin'");
        for (const admin of admins) {
          await connection.query(`
            INSERT INTO notifications (user_id, title, message, ticket_id, sender_id)
            VALUES (?, ?, ?, ?, NULL)
          `, [
            admin.id,
            `Ticket Auto-Cancelled [${ticketNum}]`,
            `Ticket ${ticketNum} (${ticket.customer_name} - ${deviceStr}) was automatically cancelled. Hold deadline expired without customer approval.`,
            ticket.id
          ]);
        }
      } catch (notifErr) {
        logger.warn(`Failed to notify admins of auto-cancellation for ticket ${ticket.id}: ${notifErr.message}`);
      }

      // 5. Activity Log
      try {
        await logActivity(
          null,
          'repair',
          'auto_cancel_hold_expired',
          'service_requests',
          ticket.id,
          {
            ticketNumber: ticketNum,
            customerName: ticket.customer_name,
            holdEndDate: ticket.hold_end_date,
            cancellationReason
          },
          'system'
        );
      } catch (actErr) { }

      logger.info(`Ticket ${ticketNum} (ID: ${ticket.id}) auto-cancelled due to hold expiration.`);
    }

    return expiredTickets.length;

  } catch (error) {
    logger.error(`Error processing hold expirations: ${error.message}`);
    return 0;
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Start the recurring hold scheduler
 */
const startHoldScheduler = (pool, intervalMs = 60000) => {
  // Run once on startup
  processHoldExpirations(pool).catch(err => {
    logger.error(`Startup hold check error: ${err.message}`);
  });

  // Schedule recurring checks
  const intervalId = setInterval(() => {
    processHoldExpirations(pool).catch(err => {
      logger.error(`Periodic hold check error: ${err.message}`);
    });
  }, intervalMs);

  return intervalId;
};

module.exports = {
  processHoldExpirations,
  startHoldScheduler
};
