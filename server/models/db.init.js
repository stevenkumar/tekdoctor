const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');
const logger = require('../utils/logger');

// ─── Information Schema & DDL Helper Functions ──────────────────────────────

/**
 * Checks whether a given table exists in the current database.
 */
const checkTableExists = async (connection, tableName) => {
  const [rows] = await connection.query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [tableName]
  );
  return rows.length > 0;
};

/**
 * Checks whether a specific column exists in a given table.
 */
const checkColumnExists = async (connection, tableName, columnName) => {
  const [rows] = await connection.query(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [tableName, columnName]
  );
  return rows.length > 0;
};

/**
 * Checks whether a specific index exists on a given table.
 */
const checkIndexExists = async (connection, tableName, indexName) => {
  const [rows] = await connection.query(
    'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    [tableName, indexName]
  );
  return rows.length > 0;
};

/**
 * Idempotently adds a column to a table only if it does not already exist.
 */
const addColumnSafe = async (connection, tableName, columnDef, columnName) => {
  const exists = await checkColumnExists(connection, tableName, columnName);
  if (!exists) {
    await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`);
    console.log(`[Schema] Added column '${columnName}' to table '${tableName}'.`);
    return true;
  }
  return false;
};

/**
 * Idempotently adds an index to a table only if it does not already exist.
 */
const addIndexSafe = async (connection, tableName, indexName, columns, isUnique = false) => {
  const exists = await checkIndexExists(connection, tableName, indexName);
  if (!exists) {
    const uniqueKw = isUnique ? 'UNIQUE ' : '';
    await connection.query(`CREATE ${uniqueKw}INDEX ${indexName} ON ${tableName} (${columns})`);
    console.log(`[Schema] Created index '${indexName}' on table '${tableName}'.`);
    return true;
  }
  return false;
};

// ─── Base Tables Definition (Full Finalized Schema) ──────────────────────────

const createBaseTables = async (connection) => {
  // 1. Users Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NULL,
      role ENUM('customer', 'technician', 'admin', 'company') DEFAULT 'customer',
      google_id VARCHAR(255) UNIQUE NULL,
      auth_provider VARCHAR(50) DEFAULT 'local',
      avatar_url VARCHAR(500) NULL,
      token_version INT DEFAULT 1,
      technician_id VARCHAR(50) UNIQUE NULL,
      is_active BOOLEAN DEFAULT TRUE,
      phone VARCHAR(30) NULL,
      company_id VARCHAR(50) UNIQUE NULL,
      deactivated_at TIMESTAMP NULL,
      deactivated_by INT NULL,
      deactivation_reason TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_email (email),
      INDEX idx_users_google (google_id),
      INDEX idx_users_role (role),
      INDEX idx_users_active (is_active),
      UNIQUE INDEX idx_users_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 2. Company Profiles Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS company_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      company_id VARCHAR(50) UNIQUE NULL,
      company_name VARCHAR(150) NOT NULL,
      company_logo VARCHAR(500) NULL,
      contact_person VARCHAR(100) NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      address TEXT NOT NULL,
      gst_number VARCHAR(15) NULL,
      website_url VARCHAR(255) NULL,
      social_facebook VARCHAR(255) NULL,
      social_instagram VARCHAR(255) NULL,
      social_twitter VARCHAR(255) NULL,
      social_linkedin VARCHAR(255) NULL,
      company_type VARCHAR(50) DEFAULT 'Business',
      notes TEXT NULL,
      amc_status VARCHAR(50) DEFAULT 'Inactive',
      assigned_technician_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_technician_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 3. Company Branches Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS company_branches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      address TEXT NOT NULL,
      phone VARCHAR(20) NULL,
      is_active BOOLEAN DEFAULT TRUE,
      status VARCHAR(20) DEFAULT 'active',
      deactivated_at TIMESTAMP NULL,
      deactivated_by INT NULL,
      deactivation_reason TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_cb_company (company_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 4. Company Employees Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS company_employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      branch_id INT NULL,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(30) NULL,
      department VARCHAR(100) NULL,
      designation VARCHAR(100) NULL,
      is_active BOOLEAN DEFAULT TRUE,
      status VARCHAR(20) DEFAULT 'active',
      deactivated_at TIMESTAMP NULL,
      deactivated_by INT NULL,
      deactivation_reason TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES company_branches(id) ON DELETE SET NULL,
      UNIQUE INDEX idx_emp_company_email (company_id, email),
      INDEX idx_ce_company (company_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 5. Company Devices Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS company_devices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      branch_id INT NULL,
      employee_id INT NULL,
      device_category VARCHAR(50) NOT NULL,
      brand VARCHAR(50) NOT NULL,
      model_number VARCHAR(100) NOT NULL,
      serial_number VARCHAR(100) NOT NULL,
      asset_id VARCHAR(100) NOT NULL,
      purchase_date DATE NULL,
      warranty_expiry DATE NULL,
      notes TEXT NULL,
      is_amc TINYINT(1) DEFAULT 0,
      amc_tag VARCHAR(50) DEFAULT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      status VARCHAR(20) DEFAULT 'active',
      deactivated_at TIMESTAMP NULL,
      deactivated_by INT NULL,
      deactivation_reason TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES company_branches(id) ON DELETE SET NULL,
      FOREIGN KEY (employee_id) REFERENCES company_employees(id) ON DELETE SET NULL,
      INDEX idx_cd_company (company_id),
      INDEX idx_cd_serial (serial_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 6. Service Requests Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS service_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      customer_name VARCHAR(100) NOT NULL,
      mobile VARCHAR(30) NOT NULL,
      email VARCHAR(255) NULL,
      address TEXT NULL,
      city VARCHAR(100) NOT NULL,
      state VARCHAR(50) NULL,
      zip_code VARCHAR(20) NULL,
      device_category VARCHAR(50) NOT NULL,
      custom_device_category VARCHAR(100) NULL,
      brand VARCHAR(50) NOT NULL,
      custom_brand VARCHAR(50) NULL,
      model_number VARCHAR(100) NULL,
      device_age VARCHAR(50) NULL,
      serial_number VARCHAR(100) NULL,
      device_configuration TEXT NULL,
      problem_type VARCHAR(100) NOT NULL,
      custom_problem_type VARCHAR(150) NULL,
      problem_description TEXT NOT NULL,
      service_type VARCHAR(50) DEFAULT 'Bring to Service Center',
      custom_service_type VARCHAR(150) NULL,
      priority VARCHAR(20) DEFAULT 'Standard',
      preferred_contact_method VARCHAR(100) DEFAULT 'WhatsApp',
      image_path VARCHAR(500) NULL,
      screenshot_path VARCHAR(500) NULL,
      status ENUM('pending', 'in_progress', 'completed', 'delivered', 'cancelled') DEFAULT 'pending',
      assigned_technician_id INT NULL,
      pending_technician_id INT NULL,
      company_id INT NULL,
      employee_id INT NULL,
      device_id INT NULL,
      estimated_completion_date DATE NULL,
      repair_notes TEXT NULL,
      repair_cost DECIMAL(10,2) DEFAULT 0.00,
      sla_deadline TIMESTAMP NULL,
      ticket_number VARCHAR(50) UNIQUE NULL,
      customer_repair_description TEXT NULL,
      feedback_rating TINYINT NULL,
      feedback_comment TEXT NULL,
      feedback_date TIMESTAMP NULL,
      is_active BOOLEAN DEFAULT TRUE,
      deactivated_at TIMESTAMP NULL,
      deactivated_by INT NULL,
      deactivation_reason TEXT NULL,
      payment_status ENUM('unpaid', 'pending', 'pending_verification', 'paid', 'failed', 'refunded', 'rejected') DEFAULT 'unpaid',
      collection_status ENUM('pending_collection', 'collected', 'not_applicable') DEFAULT 'not_applicable',
      payment_id VARCHAR(100) NULL,
      payment_order_id VARCHAR(100) NULL,
      payment_method VARCHAR(50) NULL,
      paid_at TIMESTAMP NULL,
      diagnosis TEXT NULL,
      identified_issues TEXT NULL,
      required_work TEXT NULL,
      required_parts TEXT NULL,
      estimated_cost DECIMAL(10,2) DEFAULT 0.00,
      additional_charges DECIMAL(10,2) DEFAULT 0.00,
      inspection_notes TEXT NULL,
      device_condition TEXT NULL,
      inspected_at TIMESTAMP NULL,
      estimate_submitted_at TIMESTAMP NULL,
      customer_approval_status VARCHAR(50) DEFAULT 'none',
      approved_at TIMESTAMP NULL,
      approved_by INT NULL,
      approval_notes TEXT NULL,
      rejected_at TIMESTAMP NULL,
      rejection_reason TEXT NULL,
      hold_start_date TIMESTAMP NULL,
      hold_end_date TIMESTAMP NULL,
      hold_reason TEXT NULL,
      hold_notes TEXT NULL,
      cancellation_reason TEXT NULL,
      cancelled_at TIMESTAMP NULL,
      cancelled_by INT NULL,
      amount_updated_by_admin BOOLEAN DEFAULT FALSE,
      admin_updated_amount DECIMAL(10,2) NULL,
      amount_updated_at TIMESTAMP NULL,
      reapproval_requested_at TIMESTAMP NULL,
      reapproval_notes TEXT NULL,
      submission_id VARCHAR(100) UNIQUE NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_technician_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (pending_technician_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (employee_id) REFERENCES company_employees(id) ON DELETE SET NULL,
      FOREIGN KEY (device_id) REFERENCES company_devices(id) ON DELETE SET NULL,
      INDEX idx_sr_status (status),
      INDEX idx_sr_tech (assigned_technician_id),
      INDEX idx_sr_company (company_id),
      INDEX idx_sr_created (created_at),
      INDEX idx_sr_user (user_id),
      INDEX idx_sr_ticket (ticket_number),
      INDEX idx_sr_approval_status (customer_approval_status),
      INDEX idx_sr_hold_end (hold_end_date),
      INDEX idx_sr_payment_status (payment_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 7. Repair Form Drafts Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS repair_form_drafts (
      draft_id VARCHAR(100) PRIMARY KEY,
      form_data JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 8. Contacts Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      subject VARCHAR(255) NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_contacts_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 9. Invoices Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id VARCHAR(50) PRIMARY KEY,
      user_id INT NULL,
      client_name VARCHAR(100) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      subtotal DECIMAL(12,2) NULL DEFAULT 0.00,
      tax_amount DECIMAL(12,2) NULL DEFAULT 0.00,
      cgst_amount DECIMAL(12,2) NULL DEFAULT 0.00,
      sgst_amount DECIMAL(12,2) NULL DEFAULT 0.00,
      igst_amount DECIMAL(12,2) NULL DEFAULT 0.00,
      original_estimate DECIMAL(12,2) NULL DEFAULT 0.00,
      is_interstate BOOLEAN DEFAULT FALSE,
      finalized_at TIMESTAMP NULL,
      finalized_by INT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
      invoice_date DATETIME NOT NULL,
      due_date DATETIME NOT NULL,
      status VARCHAR(20) DEFAULT 'Draft',
      notes TEXT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      deactivated_at TIMESTAMP NULL,
      deactivated_by INT NULL,
      deactivation_reason TEXT NULL,
      payment_id VARCHAR(100) NULL,
      payment_order_id VARCHAR(100) NULL,
      payment_method VARCHAR(50) NULL,
      ticket_id INT NULL,
      paid_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_inv_user (user_id),
      INDEX idx_inv_status (status),
      INDEX idx_inv_payment_id (payment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 10. Invoice Line Items Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id VARCHAR(50) NOT NULL,
      description VARCHAR(255) NOT NULL,
      hsn_sac VARCHAR(20) DEFAULT '9987',
      quantity INT NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      total DECIMAL(12,2) NOT NULL,
      tax_rate DECIMAL(5,2) DEFAULT 18.00,
      tax_amount DECIMAL(12,2) DEFAULT 0.00,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 11. Notifications Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      ticket_id INT NULL,
      sender_id INT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (ticket_id) REFERENCES service_requests(id) ON DELETE SET NULL,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_notif_user_read (user_id, is_read),
      INDEX idx_notif_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 12. Messages Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      repair_request_id INT NULL,
      sender_id INT NOT NULL,
      receiver_id INT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (repair_request_id) REFERENCES service_requests(id) ON DELETE SET NULL,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 13. Quotations Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS quotations (
      id VARCHAR(20) PRIMARY KEY,
      company_id INT NOT NULL,
      request_id INT NULL,
      title VARCHAR(100) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      status VARCHAR(20) DEFAULT 'Pending',
      items JSON NOT NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE SET NULL,
      INDEX idx_quot_company (company_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 14. Testimonials Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS testimonials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      rating INT NOT NULL,
      comment TEXT NOT NULL,
      is_approved BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_testim_approved (is_approved)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 15. Technician Work Logs Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS technician_work_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      repair_request_id INT NOT NULL,
      technician_id INT NOT NULL,
      repair_stage VARCHAR(50) NOT NULL,
      action_performed TEXT NOT NULL,
      parts_replaced VARCHAR(255) NULL,
      time_spent VARCHAR(50) NULL,
      notes TEXT NULL,
      media_path VARCHAR(500) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (repair_request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
      FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 16. Task Transfers Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS task_transfers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      repair_request_id INT NOT NULL,
      from_technician_id INT NULL,
      to_technician_id INT NOT NULL,
      initiated_by_user_id INT NOT NULL,
      reason TEXT NULL,
      status ENUM('pending', 'accepted', 'rejected', 'cancelled') DEFAULT 'pending',
      response_notes TEXT NULL,
      transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      responded_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (repair_request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
      FOREIGN KEY (from_technician_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (to_technician_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (initiated_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_tt_request (repair_request_id),
      INDEX idx_tt_from (from_technician_id),
      INDEX idx_tt_to (to_technician_id),
      INDEX idx_tt_status (status),
      INDEX idx_tt_transferred_at (transferred_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 17. Payments Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      payment_id VARCHAR(100) UNIQUE NULL,
      order_id VARCHAR(100) NOT NULL,
      ticket_id INT NULL,
      invoice_id VARCHAR(50) NULL,
      user_id INT NULL,
      company_id INT NULL,
      amount DECIMAL(12,2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
      payment_method VARCHAR(50) DEFAULT 'card',
      status ENUM('created', 'processing', 'pending_verification', 'paid', 'failed', 'cancelled', 'refunded', 'rejected') DEFAULT 'created',
      gateway VARCHAR(50) DEFAULT 'razorpay',
      gateway_response JSON NULL,
      error_message TEXT NULL,
      collection_status ENUM('pending_collection', 'collected', 'not_applicable') DEFAULT 'not_applicable',
      collected_by INT NULL,
      collected_at TIMESTAMP NULL,
      verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
      verified_by INT NULL,
      verified_at TIMESTAMP NULL,
      reference_note TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES service_requests(id) ON DELETE SET NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (collected_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_pmt_order (order_id),
      INDEX idx_pmt_status (status),
      INDEX idx_pmt_ticket (ticket_id),
      INDEX idx_pmt_invoice (invoice_id),
      INDEX idx_pmt_user (user_id),
      INDEX idx_pmt_verification_status (verification_status),
      INDEX idx_pmt_collection_status (collection_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 18. Activity Logs Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      category VARCHAR(50) DEFAULT NULL,
      action VARCHAR(100) NOT NULL,
      target_type VARCHAR(50) NULL,
      target_id INT NULL,
      details JSON NULL,
      ip_address VARCHAR(45) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_logs_action (action),
      INDEX idx_logs_created (created_at),
      INDEX idx_logs_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 19. Site Settings Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      setting_key VARCHAR(100) UNIQUE NOT NULL,
      setting_value TEXT NULL,
      setting_group VARCHAR(50) DEFAULT 'general',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_settings_key (setting_key),
      INDEX idx_settings_group (setting_group)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 20. Homepage Content Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS homepage_content (
      id INT AUTO_INCREMENT PRIMARY KEY,
      section VARCHAR(50) NOT NULL,
      content JSON NOT NULL,
      sort_order INT DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_homepage_section (section)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 21. App Sequences Table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS app_sequences (
      sequence_name VARCHAR(100) PRIMARY KEY,
      current_val INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
};

// ─── Default Repair Protocol Homepage Content ────────────────────────────────

const getDefaultRepairProtocol = () => JSON.stringify({
  badge: 'Standard Operating Procedure',
  title: 'Repair Protocol',
  highlight_word: 'Protocol',
  description: 'Our repair process is designed to be transparent, efficient, and customer-focused. Whether you need assistance with a smartphone, laptop, desktop computer, television, printer, home appliance, or any other electronic device, we follow a structured repair protocol to ensure the highest quality service.',
  steps: [
    { icon: 'FileText', title: 'Service Request Submission', description: 'Customers begin by submitting a repair request through our online form. Basic details such as contact information, device type, brand, model number, and a description of the issue help our technicians understand the problem before inspection.' },
    { icon: 'Search', title: 'Initial Assessment', description: 'Once the request is received, our support team reviews the information and contacts the customer if additional details are required. The device is then scheduled for inspection, either through a service center visit, pickup service, or on-site technician visit where applicable.' },
    { icon: 'Microscope', title: 'Device Inspection & Diagnosis', description: 'Our technicians perform a thorough diagnostic assessment to identify the root cause of the problem. Hardware, software, connectivity, power, performance, and component-related issues are carefully examined.' },
    { icon: 'Calculator', title: 'Repair Estimate & Approval', description: 'After diagnosis, a repair estimate is prepared. This includes the identified issue, recommended solution, estimated repair cost, required replacement parts (if any), and expected completion time. Repair work begins only after customer approval.' },
    { icon: 'Wrench', title: 'Professional Repair Process', description: 'Certified technicians use industry-standard tools and procedures to repair the device. Genuine or high-quality compatible replacement parts are used whenever required. All repairs are performed according to manufacturer-recommended practices whenever possible.' },
    { icon: 'ShieldCheck', title: 'Quality Testing', description: 'Before delivery, every repaired device undergoes comprehensive testing to verify functionality, performance, and safety. Multiple quality checks ensure that the reported issue has been resolved successfully.' },
    { icon: 'Bell', title: 'Customer Notification', description: 'Once the repair is completed and verified, the customer is notified through their preferred communication method, such as phone call, email, or WhatsApp.' },
    { icon: 'Truck', title: 'Device Delivery or Collection', description: 'Customers can collect their repaired device from the service location or receive it through the agreed delivery method. The device is returned in working condition along with repair details.' },
    { icon: 'LifeBuoy', title: 'Post-Repair Support', description: 'Our commitment does not end after the repair. Customers can contact our support team for assistance, service-related questions, or warranty-related inquiries according to the applicable service terms.' }
  ],
  standards_title: 'Our Service Standards',
  standards_description: 'We strive to provide reliable, affordable, and efficient repair solutions that help extend the life of your electronic devices while ensuring complete customer satisfaction.',
  standards: [
    'Transparent repair process',
    'Professional diagnostics',
    'Experienced technicians',
    'Quality replacement parts',
    'Timely service updates',
    'Thorough quality testing',
    'Customer-focused support'
  ],
  cta_text: 'Proceed to Booking',
  cta_link: '/repair'
});

// ─── Default Site Settings & Homepage Seeding ────────────────────────────────

const seedDefaultDataIfEmpty = async (connection) => {
  // 1. Seed Admin Account if missing
  const targetAdminEmail = config.initialAdmin?.email || (!config.isProduction ? 'admin@tekdoctor.in' : '');
  const targetAdminPassword = config.initialAdmin?.password || (!config.isProduction ? 'Admin@123' : '');

  if (targetAdminEmail && targetAdminPassword) {
    const [existingTarget] = await connection.query('SELECT * FROM users WHERE email = ? LIMIT 1', [targetAdminEmail]);

    if (existingTarget.length === 0) {
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(targetAdminPassword, salt);
      await connection.query(`
        INSERT INTO users (name, email, password, role)
        VALUES (?, ?, ?, 'admin')
      `, ['TekDoctor Admin', targetAdminEmail, hashedPassword]);
      console.log(`[Seed] Created initial admin account: ${targetAdminEmail}`);
    } else {
      const currentPass = existingTarget[0].password || '';
      const isValidBcrypt = currentPass.startsWith('$2a$') || currentPass.startsWith('$2b$') || currentPass.startsWith('$2y$');
      if (!isValidBcrypt) {
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(targetAdminPassword, salt);
        await connection.query('UPDATE users SET password = ?, role = "admin" WHERE id = ?', [hashedPassword, existingTarget[0].id]);
        console.log(`[Seed] Repaired unhashed password for admin: ${targetAdminEmail}`);
      }
    }
  }

  // 2. Seed Default Site Settings
  const defaultCatalogItems = JSON.stringify([
    { name: 'Diagnostic Assessment', description: 'Complete device hardware and component diagnostic assessment', hsn_sac: '9987', unit_price: 350, tax_rate: 18 },
    { name: 'Display Screen Replacement', description: 'Display panel assembly replacement with touch calibration', hsn_sac: '9987', unit_price: 2500, tax_rate: 18 },
    { name: 'Battery Replacement Service', description: 'Battery pack replacement with power delivery testing', hsn_sac: '9987', unit_price: 1500, tax_rate: 18 },
    { name: 'Motherboard Chip-Level Repair', description: 'Micro-soldering, SMD component replacement, short-circuit recovery', hsn_sac: '9987', unit_price: 3000, tax_rate: 18 },
    { name: 'Charging Port & Connector Repair', description: 'Dock connector / USB charging port repair and pin alignment', hsn_sac: '9987', unit_price: 1200, tax_rate: 18 },
    { name: 'OS & Software Troubleshooting', description: 'System restore, driver installation, and performance optimization', hsn_sac: '9987', unit_price: 800, tax_rate: 18 }
  ]);

  const billingDefaults = [
    ['invoice_prefix', 'inv', 'billing'],
    ['default_gst_rate', '18.00', 'billing'],
    ['invoice_gst_enabled', 'true', 'billing'],
    ['gstin', '27AAAAA0000A1Z5', 'company'],
    ['invoice_default_items', defaultCatalogItems, 'billing']
  ];

  const [settingsCount] = await connection.query('SELECT COUNT(*) as cnt FROM site_settings');
  if (settingsCount[0].cnt === 0) {
    const defaults = [
      ['company_name', 'The Tek Doctor', 'company'],
      ['company_email', 'info@tekdoctor.in', 'company'],
      ['company_phone', '+91 9136868902', 'company'],
      ['company_alternate_phone', '', 'company'],
      ['company_address', 'Mumbai, Maharashtra, India', 'company'],
      ['logo_url', '', 'company'],
      ['theme_primary_color', '#00e5ff', 'theme'],
      ['theme_secondary_color', '#1a1a1a', 'theme'],
      ['favicon_url', '', 'branding'],
      ['tekunik_image_url', '', 'branding'],
      ['facebook_url', '', 'social'],
      ['twitter_url', '', 'social'],
      ['instagram_url', '', 'social'],
      ['linkedin_url', '', 'social'],
      ['google_maps_link', '', 'integrations'],
      ['google_sheet_url', '', 'integrations'],
      ['maintenance_mode', 'false', 'system'],
      ['meta_title', '', 'seo'],
      ['meta_description', '', 'seo'],
      ['meta_keywords', '', 'seo'],
      ['smtp_host', 'smtp.gmail.com', 'email'],
      ['smtp_port', '587', 'email'],
      ['smtp_user', '', 'email'],
      ['smtp_password', '', 'email'],
      ['from_email', 'noreply@tekdoctor.in', 'email'],
      ['from_name', 'The Tek Doctor', 'email'],
      ...billingDefaults
    ];
    for (const [key, value, group] of defaults) {
      await connection.query(
        'INSERT IGNORE INTO site_settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?)',
        [key, value, group]
      );
    }
    console.log('[Seed] Default site settings seeded.');
  } else {
    // Ensure essential billing settings exist in existing databases
    for (const [key, value, group] of billingDefaults) {
      await connection.query(
        'INSERT IGNORE INTO site_settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?)',
        [key, value, group]
      );
    }
  }

  // 3. Seed Default Homepage Content if empty
  const [contentCount] = await connection.query('SELECT COUNT(*) as cnt FROM homepage_content');
  if (contentCount[0].cnt === 0) {
    const defaultRepairProtocol = getDefaultRepairProtocol();
    const sections = [
      ['hero', JSON.stringify({ title: 'Expert Device Repair', subtitle: 'Fast, Reliable, Professional', cta_text: 'Book a Repair', cta_link: '/repair' }), 1],
      ['about', JSON.stringify({ title: 'About Us', description: 'We are a professional device repair company committed to quality service.' }), 2],
      ['services', JSON.stringify({ title: 'Our Services', items: [{ name: 'Phone Repair', icon: 'smartphone' }, { name: 'Laptop Repair', icon: 'laptop' }, { name: 'Tablet Repair', icon: 'tablet' }] }), 3],
      ['faq', JSON.stringify({ title: 'Frequently Asked Questions', items: [{ question: 'How long does repair take?', answer: 'Most repairs are completed within 24-48 hours.' }] }), 4],
      ['testimonials', JSON.stringify({ title: 'Customer Reviews', items: [{ name: 'Customer', review: 'Excellent service!', rating: 5 }] }), 5],
      ['footer', JSON.stringify({ copyright: '© 2026 The Tek Doctor. All rights reserved.', tagline: 'Your trusted device repair partner.' }), 6],
      ['repair_protocol', defaultRepairProtocol, 7],
    ];
    for (const [section, content, order] of sections) {
      await connection.query(
        'INSERT INTO homepage_content (section, content, sort_order) VALUES (?, ?, ?)',
        [section, content, order]
      );
    }
    console.log('[Seed] Default homepage content seeded.');
  }
};

// ─── Versioned Migration Definitions ─────────────────────────────────────────

const MIGRATIONS = [
  {
    version: '2026_01_core_schema',
    name: 'Core Schema Baseline (21 Tables)',
    isSatisfied: async (connection) => {
      const coreTables = [
        'users', 'service_requests', 'repair_form_drafts', 'contacts', 'invoices',
        'invoice_line_items', 'notifications', 'company_profiles', 'company_branches',
        'company_employees', 'company_devices', 'messages', 'quotations', 'testimonials',
        'technician_work_logs', 'task_transfers', 'payments', 'activity_logs',
        'site_settings', 'homepage_content', 'app_sequences'
      ];
      const [rows] = await connection.query(
        'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)',
        [coreTables]
      );
      return rows.length === coreTables.length;
    },
    apply: async (connection) => {
      await createBaseTables(connection);
    }
  },
  {
    version: '2026_02_user_auth_extensions',
    name: 'User & Auth Extensions',
    isSatisfied: async (connection) => {
      const [cols] = await connection.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "users" AND COLUMN_NAME IN ("token_version", "google_id", "technician_id", "phone", "company_id")',
      );
      return cols.length === 5;
    },
    apply: async (connection) => {
      await addColumnSafe(connection, 'users', 'technician_id VARCHAR(50) UNIQUE NULL', 'technician_id');
      await addColumnSafe(connection, 'users', 'is_active BOOLEAN DEFAULT TRUE', 'is_active');
      await addColumnSafe(connection, 'users', 'phone VARCHAR(30) NULL', 'phone');
      await addColumnSafe(connection, 'users', 'token_version INT DEFAULT 1', 'token_version');
      await addColumnSafe(connection, 'users', 'google_id VARCHAR(255) UNIQUE NULL', 'google_id');
      await addColumnSafe(connection, 'users', "auth_provider VARCHAR(50) DEFAULT 'local'", 'auth_provider');
      await addColumnSafe(connection, 'users', 'avatar_url VARCHAR(500) NULL', 'avatar_url');
      await addColumnSafe(connection, 'users', 'company_id VARCHAR(50) UNIQUE NULL', 'company_id');
      await addColumnSafe(connection, 'users', 'deactivated_at TIMESTAMP NULL', 'deactivated_at');
      await addColumnSafe(connection, 'users', 'deactivated_by INT NULL', 'deactivated_by');
      await addColumnSafe(connection, 'users', 'deactivation_reason TEXT NULL', 'deactivation_reason');
      await addIndexSafe(connection, 'users', 'idx_users_role', 'role');
      await addIndexSafe(connection, 'users', 'idx_users_active', 'is_active');
      await addIndexSafe(connection, 'users', 'idx_users_phone', 'phone', true);
    }
  },
  {
    version: '2026_03_b2b_and_tracking',
    name: 'B2B Corporate & Asset Tracking',
    isSatisfied: async (connection) => {
      const [cpCols] = await connection.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "company_profiles" AND COLUMN_NAME = "company_id"'
      );
      const [srCols] = await connection.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "service_requests" AND COLUMN_NAME = "company_id"'
      );
      const [cdCols] = await connection.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "company_devices" AND COLUMN_NAME = "is_amc"'
      );
      return cpCols.length > 0 && srCols.length > 0 && cdCols.length > 0;
    },
    apply: async (connection) => {
      await addColumnSafe(connection, 'company_profiles', "company_type VARCHAR(50) DEFAULT 'Business'", 'company_type');
      await addColumnSafe(connection, 'company_profiles', 'notes TEXT NULL', 'notes');
      await addColumnSafe(connection, 'company_profiles', "amc_status VARCHAR(50) DEFAULT 'Inactive'", 'amc_status');
      await addColumnSafe(connection, 'company_profiles', 'assigned_technician_id INT NULL', 'assigned_technician_id');
      await addColumnSafe(connection, 'company_profiles', 'company_id VARCHAR(50) UNIQUE NULL', 'company_id');

      await addColumnSafe(connection, 'company_branches', 'is_active BOOLEAN DEFAULT TRUE', 'is_active');
      await addColumnSafe(connection, 'company_branches', "status VARCHAR(20) DEFAULT 'active'", 'status');
      await addColumnSafe(connection, 'company_branches', 'deactivated_at TIMESTAMP NULL', 'deactivated_at');
      await addColumnSafe(connection, 'company_branches', 'deactivated_by INT NULL', 'deactivated_by');
      await addColumnSafe(connection, 'company_branches', 'deactivation_reason TEXT NULL', 'deactivation_reason');
      await addIndexSafe(connection, 'company_branches', 'idx_cb_company', 'company_id');

      await addColumnSafe(connection, 'company_employees', 'is_active BOOLEAN DEFAULT TRUE', 'is_active');
      await addColumnSafe(connection, 'company_employees', "status VARCHAR(20) DEFAULT 'active'", 'status');
      await addColumnSafe(connection, 'company_employees', 'deactivated_at TIMESTAMP NULL', 'deactivated_at');
      await addColumnSafe(connection, 'company_employees', 'deactivated_by INT NULL', 'deactivated_by');
      await addColumnSafe(connection, 'company_employees', 'deactivation_reason TEXT NULL', 'deactivation_reason');
      await addIndexSafe(connection, 'company_employees', 'idx_ce_company', 'company_id');

      await addColumnSafe(connection, 'company_devices', 'is_amc TINYINT(1) DEFAULT 0', 'is_amc');
      await addColumnSafe(connection, 'company_devices', 'amc_tag VARCHAR(50) DEFAULT NULL', 'amc_tag');
      await addColumnSafe(connection, 'company_devices', 'is_active BOOLEAN DEFAULT TRUE', 'is_active');
      await addColumnSafe(connection, 'company_devices', "status VARCHAR(20) DEFAULT 'active'", 'status');
      await addColumnSafe(connection, 'company_devices', 'deactivated_at TIMESTAMP NULL', 'deactivated_at');
      await addColumnSafe(connection, 'company_devices', 'deactivated_by INT NULL', 'deactivated_by');
      await addColumnSafe(connection, 'company_devices', 'deactivation_reason TEXT NULL', 'deactivation_reason');
      await addIndexSafe(connection, 'company_devices', 'idx_cd_company', 'company_id');
      await addIndexSafe(connection, 'company_devices', 'idx_cd_serial', 'serial_number');

      await addColumnSafe(connection, 'service_requests', 'company_id INT NULL', 'company_id');
      await addColumnSafe(connection, 'service_requests', 'employee_id INT NULL', 'employee_id');
      await addColumnSafe(connection, 'service_requests', 'device_id INT NULL', 'device_id');
      await addColumnSafe(connection, 'service_requests', 'estimated_completion_date DATE NULL', 'estimated_completion_date');
      await addColumnSafe(connection, 'service_requests', 'repair_notes TEXT NULL', 'repair_notes');
      await addColumnSafe(connection, 'service_requests', 'repair_cost DECIMAL(10,2) DEFAULT 0.00', 'repair_cost');
      await addColumnSafe(connection, 'service_requests', 'sla_deadline TIMESTAMP NULL', 'sla_deadline');
      await addColumnSafe(connection, 'service_requests', 'ticket_number VARCHAR(50) UNIQUE NULL', 'ticket_number');
      await addColumnSafe(connection, 'service_requests', 'customer_repair_description TEXT NULL', 'customer_repair_description');
      await addColumnSafe(connection, 'service_requests', 'submission_id VARCHAR(100) UNIQUE NULL', 'submission_id');
      await addColumnSafe(connection, 'service_requests', 'feedback_rating TINYINT NULL', 'feedback_rating');
      await addColumnSafe(connection, 'service_requests', 'feedback_comment TEXT NULL', 'feedback_comment');
      await addColumnSafe(connection, 'service_requests', 'feedback_date TIMESTAMP NULL', 'feedback_date');
      await addColumnSafe(connection, 'service_requests', 'is_active BOOLEAN DEFAULT TRUE', 'is_active');
      await addColumnSafe(connection, 'service_requests', 'deactivated_at TIMESTAMP NULL', 'deactivated_at');
      await addColumnSafe(connection, 'service_requests', 'deactivated_by INT NULL', 'deactivated_by');
      await addColumnSafe(connection, 'service_requests', 'deactivation_reason TEXT NULL', 'deactivation_reason');
    }
  },
  {
    version: '2026_04_diagnosis_approval_hold',
    name: 'Diagnosis, Estimation, Customer Approval & Hold Workflows',
    isSatisfied: async (connection) => {
      const [cols] = await connection.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "service_requests" AND COLUMN_NAME IN ("diagnosis", "customer_approval_status", "hold_end_date", "estimated_cost")',
      );
      return cols.length === 4;
    },
    apply: async (connection) => {
      await addColumnSafe(connection, 'service_requests', 'diagnosis TEXT NULL', 'diagnosis');
      await addColumnSafe(connection, 'service_requests', 'identified_issues TEXT NULL', 'identified_issues');
      await addColumnSafe(connection, 'service_requests', 'required_work TEXT NULL', 'required_work');
      await addColumnSafe(connection, 'service_requests', 'required_parts TEXT NULL', 'required_parts');
      await addColumnSafe(connection, 'service_requests', 'estimated_cost DECIMAL(10,2) DEFAULT 0.00', 'estimated_cost');
      await addColumnSafe(connection, 'service_requests', 'additional_charges DECIMAL(10,2) DEFAULT 0.00', 'additional_charges');
      await addColumnSafe(connection, 'service_requests', 'inspection_notes TEXT NULL', 'inspection_notes');
      await addColumnSafe(connection, 'service_requests', 'device_condition TEXT NULL', 'device_condition');
      await addColumnSafe(connection, 'service_requests', 'inspected_at TIMESTAMP NULL', 'inspected_at');
      await addColumnSafe(connection, 'service_requests', 'estimate_submitted_at TIMESTAMP NULL', 'estimate_submitted_at');
      await addColumnSafe(connection, 'service_requests', "customer_approval_status VARCHAR(50) DEFAULT 'none'", 'customer_approval_status');
      await addColumnSafe(connection, 'service_requests', 'approved_at TIMESTAMP NULL', 'approved_at');
      await addColumnSafe(connection, 'service_requests', 'approved_by INT NULL', 'approved_by');
      await addColumnSafe(connection, 'service_requests', 'approval_notes TEXT NULL', 'approval_notes');
      await addColumnSafe(connection, 'service_requests', 'rejected_at TIMESTAMP NULL', 'rejected_at');
      await addColumnSafe(connection, 'service_requests', 'rejection_reason TEXT NULL', 'rejection_reason');
      await addColumnSafe(connection, 'service_requests', 'hold_start_date TIMESTAMP NULL', 'hold_start_date');
      await addColumnSafe(connection, 'service_requests', 'hold_end_date TIMESTAMP NULL', 'hold_end_date');
      await addColumnSafe(connection, 'service_requests', 'hold_reason TEXT NULL', 'hold_reason');
      await addColumnSafe(connection, 'service_requests', 'hold_notes TEXT NULL', 'hold_notes');
      await addColumnSafe(connection, 'service_requests', 'cancellation_reason TEXT NULL', 'cancellation_reason');
      await addColumnSafe(connection, 'service_requests', 'cancelled_at TIMESTAMP NULL', 'cancelled_at');
      await addColumnSafe(connection, 'service_requests', 'cancelled_by INT NULL', 'cancelled_by');
      await addColumnSafe(connection, 'service_requests', 'amount_updated_by_admin BOOLEAN DEFAULT FALSE', 'amount_updated_by_admin');
      await addColumnSafe(connection, 'service_requests', 'admin_updated_amount DECIMAL(10,2) NULL', 'admin_updated_amount');
      await addColumnSafe(connection, 'service_requests', 'amount_updated_at TIMESTAMP NULL', 'amount_updated_at');
      await addColumnSafe(connection, 'service_requests', 'reapproval_requested_at TIMESTAMP NULL', 'reapproval_requested_at');
      await addColumnSafe(connection, 'service_requests', 'reapproval_notes TEXT NULL', 'reapproval_notes');

      await addIndexSafe(connection, 'service_requests', 'idx_sr_approval_status', 'customer_approval_status');
      await addIndexSafe(connection, 'service_requests', 'idx_sr_hold_end', 'hold_end_date');
    }
  },
  {
    version: '2026_05_payment_reconciliation',
    name: 'Multi-Gateway & Offline Payment Reconciliation',
    isSatisfied: async (connection) => {
      const [pmtCols] = await connection.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "payments" AND COLUMN_NAME IN ("verification_status", "collection_status")'
      );
      const [srCols] = await connection.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "service_requests" AND COLUMN_NAME = "collection_status"'
      );
      return pmtCols.length === 2 && srCols.length > 0;
    },
    apply: async (connection) => {
      await addColumnSafe(connection, 'payments', "collection_status ENUM('pending_collection', 'collected', 'not_applicable') DEFAULT 'not_applicable'", 'collection_status');
      await addColumnSafe(connection, 'payments', 'collected_by INT NULL', 'collected_by');
      await addColumnSafe(connection, 'payments', 'collected_at TIMESTAMP NULL', 'collected_at');
      await addColumnSafe(connection, 'payments', "verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending'", 'verification_status');
      await addColumnSafe(connection, 'payments', 'verified_by INT NULL', 'verified_by');
      await addColumnSafe(connection, 'payments', 'verified_at TIMESTAMP NULL', 'verified_at');
      await addColumnSafe(connection, 'payments', 'reference_note TEXT NULL', 'reference_note');
      await addIndexSafe(connection, 'payments', 'idx_pmt_verification_status', 'verification_status');
      await addIndexSafe(connection, 'payments', 'idx_pmt_collection_status', 'collection_status');

      await addColumnSafe(connection, 'service_requests', "collection_status ENUM('pending_collection', 'collected', 'not_applicable') DEFAULT 'not_applicable'", 'collection_status');
      await addColumnSafe(connection, 'service_requests', 'payment_id VARCHAR(100) NULL', 'payment_id');
      await addColumnSafe(connection, 'service_requests', 'payment_order_id VARCHAR(100) NULL', 'payment_order_id');
      await addColumnSafe(connection, 'service_requests', 'payment_method VARCHAR(50) NULL', 'payment_method');
      await addColumnSafe(connection, 'service_requests', 'paid_at TIMESTAMP NULL', 'paid_at');
      await addIndexSafe(connection, 'service_requests', 'idx_sr_payment_status', 'payment_status');

      await addColumnSafe(connection, 'invoices', 'payment_id VARCHAR(100) NULL', 'payment_id');
      await addColumnSafe(connection, 'invoices', 'payment_order_id VARCHAR(100) NULL', 'payment_order_id');
      await addColumnSafe(connection, 'invoices', 'payment_method VARCHAR(50) NULL', 'payment_method');
      await addColumnSafe(connection, 'invoices', 'ticket_id INT NULL', 'ticket_id');
      await addColumnSafe(connection, 'invoices', 'paid_at TIMESTAMP NULL', 'paid_at');
      await addIndexSafe(connection, 'invoices', 'idx_inv_payment_id', 'payment_id');
    }
  },
  {
    version: '2026_06_account_sequences_tickets',
    name: 'Per-Account Sequences & Ticket Numbering',
    isSatisfied: async (connection) => {
      const tableExists = await checkTableExists(connection, 'app_sequences');
      if (!tableExists) return false;
      const [cols] = await connection.query(
        'SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "app_sequences" AND COLUMN_NAME = "sequence_name"'
      );
      return cols.length > 0 && cols[0].CHARACTER_MAXIMUM_LENGTH >= 100;
    },
    apply: async (connection) => {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS app_sequences (
          sequence_name VARCHAR(100) PRIMARY KEY,
          current_val INT NOT NULL DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
      `);
      await connection.query('ALTER TABLE app_sequences MODIFY COLUMN sequence_name VARCHAR(100) NOT NULL');

      // Backfill company IDs if any exist unassigned
      const [companiesWithoutId] = await connection.query(`
        SELECT cp.id, cp.user_id 
        FROM company_profiles cp 
        WHERE cp.company_id IS NULL OR cp.company_id NOT LIKE 'CMP-%'
        ORDER BY cp.id ASC
      `);
      if (companiesWithoutId.length > 0) {
        let nextCompNum = 1;
        const [existingCompIds] = await connection.query(`
          SELECT company_id FROM company_profiles 
          WHERE company_id LIKE 'CMP-%' 
          ORDER BY CAST(SUBSTRING(company_id, 5) AS UNSIGNED) DESC LIMIT 1
        `);
        if (existingCompIds.length > 0 && existingCompIds[0].company_id) {
          const lastNum = parseInt(existingCompIds[0].company_id.substring(4), 10);
          if (!isNaN(lastNum)) nextCompNum = lastNum + 1;
        }

        for (const comp of companiesWithoutId) {
          const assignedId = `CMP-${String(nextCompNum).padStart(3, '0')}`;
          await connection.query('UPDATE company_profiles SET company_id = ? WHERE id = ?', [assignedId, comp.id]);
          if (comp.user_id) {
            await connection.query('UPDATE users SET company_id = ? WHERE id = ?', [assignedId, comp.user_id]);
          }
          nextCompNum++;
        }
      }

      // Check unmigrated tickets
      const [unmigrated] = await connection.query(`
        SELECT id FROM service_requests 
        WHERE ticket_number IS NULL OR ticket_number NOT REGEXP '^(TD|TD-C|TD-AMC-C)[0-9]+-[0-9]{2,}$' 
        LIMIT 1
      `);
      if (unmigrated.length > 0) {
        const { migrate } = require('../scripts/migrate-per-account-ticket-ids');
        await migrate();
      }
    }
  },
  {
    version: '2026_07_settings_and_protocol',
    name: 'Settings Normalization & Repair Protocol Content',
    isSatisfied: async (connection) => {
      const [setRows] = await connection.query(
        'SELECT id FROM site_settings WHERE setting_key = "tekunik_image_url" LIMIT 1'
      );
      const [protRows] = await connection.query(
        'SELECT id FROM homepage_content WHERE section = "repair_protocol" LIMIT 1'
      );
      return setRows.length > 0 && protRows.length > 0;
    },
    apply: async (connection) => {
      // Ensure branding key exists
      await connection.query(
        'INSERT IGNORE INTO site_settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?)',
        ['tekunik_image_url', '', 'branding']
      );

      // Ensure repair_protocol homepage section exists
      const [protocolSection] = await connection.query('SELECT id FROM homepage_content WHERE section = "repair_protocol" LIMIT 1');
      if (protocolSection.length === 0) {
        await connection.query(
          'INSERT INTO homepage_content (section, content, sort_order) VALUES (?, ?, ?)',
          ['repair_protocol', getDefaultRepairProtocol(), 7]
        );
      }
    }
  },
  {
    version: '2026_08_bcrypt_password_security',
    name: 'Plaintext Password Security Upgrade',
    isSatisfied: async (connection) => {
      const [rows] = await connection.query(
        "SELECT COUNT(*) as unhashed_count FROM users WHERE password IS NOT NULL AND password != '' AND password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%' AND password NOT LIKE '$2y$%'"
      );
      return rows[0].unhashed_count === 0;
    },
    apply: async (connection) => {
      const [legacyUsers] = await connection.query(
        "SELECT id, email, password FROM users WHERE password IS NOT NULL AND password != '' AND password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%' AND password NOT LIKE '$2y$%'"
      );
      if (legacyUsers.length > 0) {
        for (const legacyUser of legacyUsers) {
          const salt = await bcrypt.genSalt(12);
          const hashedPassword = await bcrypt.hash(legacyUser.password, salt);
          await connection.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, legacyUser.id]);
          console.log(`[Security] Upgraded unhashed password to bcrypt hash for user ${legacyUser.email} (ID: ${legacyUser.id}).`);
        }
      }
    }
  },
  {
    version: '2026_09_invoice_item_gst_and_draft_lifecycle',
    name: 'Invoice Item-Level GST, Custom Numbering & Draft Lifecycle',
    isSatisfied: async (connection) => {
      const hasSubtotal = await checkColumnExists(connection, 'invoices', 'subtotal');
      const hasHsn = await checkColumnExists(connection, 'invoice_line_items', 'hsn_sac');
      const hasOrigEst = await checkColumnExists(connection, 'invoices', 'original_estimate');
      return Boolean(hasSubtotal && hasHsn && hasOrigEst);
    },
    apply: async (connection) => {
      // Modify invoices.id, invoice_line_items.invoice_id, and payments.invoice_id to VARCHAR(50)
      try {
        await connection.query('ALTER TABLE invoices MODIFY COLUMN id VARCHAR(50) NOT NULL');
        await connection.query('ALTER TABLE invoice_line_items MODIFY COLUMN invoice_id VARCHAR(50) NOT NULL');
        await connection.query('ALTER TABLE invoices MODIFY COLUMN user_id INT NULL');

        const [pmtCols] = await connection.query(
          "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'invoice_id'"
        );
        if (pmtCols.length > 0 && pmtCols[0].COLUMN_TYPE !== 'varchar(50)') {
          try {
            await connection.query('ALTER TABLE payments DROP FOREIGN KEY payments_ibfk_2');
          } catch (_) {}
          await connection.query('ALTER TABLE payments MODIFY COLUMN invoice_id VARCHAR(50) NULL');
          try {
            await connection.query('ALTER TABLE payments ADD CONSTRAINT payments_ibfk_2 FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL');
          } catch (_) {}
        }
      } catch (err) {
        console.warn('[Migration 2026_09] Column length modify notice: ' + err.message);
      }

      // Add columns to invoices table
      await addColumnSafe(connection, 'invoices', 'subtotal DECIMAL(12,2) NULL DEFAULT 0.00', 'subtotal');
      await addColumnSafe(connection, 'invoices', 'tax_amount DECIMAL(12,2) NULL DEFAULT 0.00', 'tax_amount');
      await addColumnSafe(connection, 'invoices', 'cgst_amount DECIMAL(12,2) NULL DEFAULT 0.00', 'cgst_amount');
      await addColumnSafe(connection, 'invoices', 'sgst_amount DECIMAL(12,2) NULL DEFAULT 0.00', 'sgst_amount');
      await addColumnSafe(connection, 'invoices', 'igst_amount DECIMAL(12,2) NULL DEFAULT 0.00', 'igst_amount');
      await addColumnSafe(connection, 'invoices', 'original_estimate DECIMAL(12,2) NULL DEFAULT 0.00', 'original_estimate');
      await addColumnSafe(connection, 'invoices', 'is_interstate BOOLEAN DEFAULT FALSE', 'is_interstate');
      await addColumnSafe(connection, 'invoices', 'finalized_at TIMESTAMP NULL', 'finalized_at');
      await addColumnSafe(connection, 'invoices', 'finalized_by INT NULL', 'finalized_by');

      // Add columns to invoice_line_items table
      await addColumnSafe(connection, 'invoice_line_items', "hsn_sac VARCHAR(20) DEFAULT '9987'", 'hsn_sac');
      await addColumnSafe(connection, 'invoice_line_items', 'tax_rate DECIMAL(5,2) DEFAULT 18.00', 'tax_rate');
      await addColumnSafe(connection, 'invoice_line_items', 'tax_amount DECIMAL(12,2) DEFAULT 0.00', 'tax_amount');

      // Backfill existing invoices
      await connection.query(`
        UPDATE invoices
        SET subtotal = amount
        WHERE (subtotal IS NULL OR subtotal = 0.00) AND amount > 0
      `);

      // Backfill existing invoice_line_items
      await connection.query(`
        UPDATE invoice_line_items
        SET hsn_sac = COALESCE(hsn_sac, '9987'),
            tax_rate = COALESCE(tax_rate, 18.00),
            tax_amount = ROUND(total * (COALESCE(tax_rate, 18.00) / 100), 2)
        WHERE tax_amount IS NULL OR tax_amount = 0.00
      `);
    }
  }
];

// ─── Migration Runner & Database Initializer ──────────────────────────────────

const initDatabase = async () => {
  let connection;
  let lockAcquired = false;

  try {
    // 1. Ensure required uploads and log directories exist
    const dirs = [
      config.paths.uploadsRoot,
      config.paths.logo,
      config.paths.favicon,
      config.paths.users,
      config.paths.companies,
      config.paths.technicians,
      config.paths.repairs,
      config.paths.deviceImages,
      config.paths.screenshots,
      config.paths.videos,
      config.logging.directory
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // 2. Acquire dedicated DB connection from pool
    connection = await pool.getConnection();

    // 3. Acquire MySQL Advisory Lock to guarantee concurrency safety (10s timeout)
    const [lockRows] = await connection.query("SELECT GET_LOCK('tekdoctor_db_init_lock', 10) as lock_acquired");
    if (!lockRows[0] || lockRows[0].lock_acquired !== 1) {
      throw new Error('[DB Lock] Could not acquire migration lock within 10 seconds. Another instance is currently initializing the database.');
    }
    lockAcquired = true;

    // 4. Ensure schema_migrations table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 5. Fetch applied migrations from schema_migrations
    const [appliedRows] = await connection.query('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(appliedRows.map(r => r.version));

    // 6. Check if this is a completely fresh database
    const [existingTableRows] = await connection.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME != 'schema_migrations'"
    );
    const isFreshDatabase = existingTableRows.length === 0;

    if (isFreshDatabase) {
      console.log('[Init] Fresh database detected. Creating complete finalized schema...');
      await createBaseTables(connection);
      await seedDefaultDataIfEmpty(connection);

      // Record all migrations as applied for fresh database
      for (const m of MIGRATIONS) {
        await connection.query(
          'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
          [m.version, m.name]
        );
      }
      console.log('[Init] Fresh database initialized with full schema and all migrations marked applied.');
    } else {
      // 7. Existing/partial database: first guarantee every base table exists.
      //    createBaseTables is fully idempotent (CREATE TABLE IF NOT EXISTS), so
      //    this self-heals a database missing one or more tables.
      await createBaseTables(connection);

      // 8. Evaluate each migration sequentially
      let pendingCount = 0;
      let baselinedCount = 0;
      let appliedCount = 0;

      for (const m of MIGRATIONS) {
        if (appliedVersions.has(m.version)) {
          // Already recorded and applied previously
          continue;
        }

        // Verify if the migration is already satisfied in the current database schema
        const satisfied = await m.isSatisfied(connection);

        if (satisfied) {
          // Safe baselining: Schema already has required tables/columns/records
          await connection.query(
            'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
            [m.version, m.name]
          );
          baselinedCount++;
          console.log(`[Migration] Baselined '${m.version}' (${m.name}) — verified existing schema.`);
        } else {
          // Partially behind: Apply only this missing migration
          console.log(`[Migration] Executing missing migration '${m.version}' (${m.name})...`);
          pendingCount++;

          await m.apply(connection);

          // Strict post-apply re-verification
          const verifiedAfterApply = await m.isSatisfied(connection);
          if (!verifiedAfterApply) {
            throw new Error(`[Migration Failure] Migration '${m.version}' (${m.name}) did not satisfy post-apply verification.`);
          }

          await connection.query(
            'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
            [m.version, m.name]
          );
          appliedCount++;
          console.log(`[Migration] Successfully applied and verified '${m.version}' (${m.name}).`);
        }
      }

      // Safe seed check for existing DB (only fills empty tables, never overwrites)
      await seedDefaultDataIfEmpty(connection);

      if (appliedCount > 0 || baselinedCount > 0) {
        console.log(`[Init] Database verification completed: ${appliedCount} applied, ${baselinedCount} baselined, ${appliedVersions.size} previously recorded.`);
      }
    }

  } catch (error) {
    console.error('[Database Init Error]:', error.message);
    throw error;
  } finally {
    if (connection) {
      if (lockAcquired) {
        try {
          await connection.query("SELECT RELEASE_LOCK('tekdoctor_db_init_lock')");
        } catch (lockErr) {
          console.error('[DB Lock Release Error]:', lockErr.message);
        }
      }
      connection.release();
    }
  }
};

module.exports = initDatabase;
