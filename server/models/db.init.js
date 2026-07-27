const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db.config');
const config = require('../config/app.config');

const initDatabase = async () => {
  let connection;
  try {
    // 1. Create upload and log directories if they don't exist
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
        console.log(`Created directory: ${dir}`);
      }
    });

    // 2. Get connection
    connection = await pool.getConnection();
    console.log('Database connection secured for initialization.');

    // 3. Create Users Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('customer', 'technician', 'admin', 'company') DEFAULT 'customer',
        token_version INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Table "users" checked/created.');

    // 4. Create Service Requests Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS service_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        customer_name VARCHAR(100) NOT NULL,
        mobile VARCHAR(15) NOT NULL,
        email VARCHAR(255) NULL,
        address TEXT NULL,
        city VARCHAR(100) NOT NULL,
        state VARCHAR(50) NULL,
        zip_code VARCHAR(20) NULL,
        device_category VARCHAR(50) NOT NULL,
        brand VARCHAR(50) NOT NULL,
        custom_brand VARCHAR(50) NULL,
        model_number VARCHAR(100) NULL,
        device_age VARCHAR(50) NULL,
        serial_number VARCHAR(100) NULL,
        device_configuration TEXT NULL,
        problem_type VARCHAR(100) NOT NULL,
        problem_description TEXT NOT NULL,
        service_type VARCHAR(50) DEFAULT 'Bring to Service Center',
        priority VARCHAR(20) DEFAULT 'Standard',
        preferred_contact_method VARCHAR(100) DEFAULT 'WhatsApp',
        image_path VARCHAR(500) NULL,
        screenshot_path VARCHAR(500) NULL,
        status ENUM('pending', 'in_progress', 'completed', 'delivered', 'cancelled') DEFAULT 'pending',
        assigned_technician_id INT NULL,
        pending_technician_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_technician_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (pending_technician_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Retroactively add columns to an existing table
    try {
      await connection.query('ALTER TABLE service_requests ADD COLUMN address TEXT NULL AFTER email');
      await connection.query('ALTER TABLE service_requests ADD COLUMN state VARCHAR(50) NULL AFTER city');
      await connection.query('ALTER TABLE service_requests ADD COLUMN zip_code VARCHAR(20) NULL AFTER state');
      console.log('Added Address, State, ZIP missing fields to existing service_requests table.');
    } catch (e) {
      // Duplicate column names ignored.
    }

    // Retroactively update status enum values to include 'delivered'
    try {
      await connection.query("ALTER TABLE service_requests MODIFY COLUMN status ENUM('pending', 'in_progress', 'completed', 'delivered', 'cancelled') DEFAULT 'pending'");
      console.log("Updated status enum in service_requests table to include 'delivered'.");
    } catch (e) {
      console.error("Failed to alter status enum: ", e.message);
    }
    console.log('Table "service_requests" checked/created.');

    // 4.1 Create Repair Form Drafts Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS repair_form_drafts (
        draft_id VARCHAR(100) PRIMARY KEY,
        form_data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Table "repair_form_drafts" checked/created.');

    // 5. Create Contacts Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(15) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Table "contacts" checked/created.');

    // 6. Create Invoices Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id VARCHAR(20) PRIMARY KEY,
        user_id INT NOT NULL,
        client_name VARCHAR(100) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        invoice_date DATETIME NOT NULL,
        due_date DATETIME NOT NULL,
        status VARCHAR(20) DEFAULT 'Draft',
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Table "invoices" checked/created.');

    // 7. Create Invoice Line Items Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS invoice_line_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_id VARCHAR(20) NOT NULL,
        description VARCHAR(255) NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total DECIMAL(12,2) NOT NULL,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Table "invoice_line_items" checked/created.');

    // 7.1. Create Notifications Table (consolidated from standalone migration helper)
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
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Table "notifications" checked/created.');

    try {
      await connection.query('ALTER TABLE notifications ADD COLUMN ticket_id INT NULL');
      await connection.query('ALTER TABLE notifications ADD FOREIGN KEY (ticket_id) REFERENCES service_requests(id) ON DELETE SET NULL');
      console.log('Added ticket_id column and foreign key to notifications.');
    } catch (e) { }

    try {
      await connection.query('ALTER TABLE notifications ADD COLUMN sender_id INT NULL');
      await connection.query('ALTER TABLE notifications ADD FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL');
      console.log('Added sender_id column and foreign key to notifications.');
    } catch (e) { }

    // 7.2. Create Company Profiles Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS company_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Table "company_profiles" checked/created.');

    // 7.3. Create Company Branches Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS company_branches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        address TEXT NOT NULL,
        phone VARCHAR(20) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Table "company_branches" checked/created.');

    // 7.4. Create Company Employees Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS company_employees (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        branch_id INT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NULL,
        department VARCHAR(100) NULL,
        designation VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES company_branches(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Table "company_employees" checked/created.');

    // 7.5. Create Company Devices Table
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (branch_id) REFERENCES company_branches(id) ON DELETE SET NULL,
        FOREIGN KEY (employee_id) REFERENCES company_employees(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Table "company_devices" checked/created.');

    // 7.6. Create messages Table
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
    console.log('Table "messages" checked/created.');

    // 7.7. Create quotations Table
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
        FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Table "quotations" checked/created.');

    // 7.8. Create testimonials Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS testimonials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        rating INT NOT NULL,
        comment TEXT NOT NULL,
        is_approved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Table "testimonials" checked/created.');

    // 8. Add technician_id, is_active, token_version, and phone columns to users table if not present
    try {
      await connection.query(`ALTER TABLE users ADD COLUMN technician_id VARCHAR(50) UNIQUE NULL`);
      console.log('Added "technician_id" column to users table.');
    } catch (e) { /* column already exists */ }
    try {
      await connection.query(`ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE`);
      console.log('Added "is_active" column to users table.');
    } catch (e) { /* column already exists */ }
    try {
      await connection.query(`ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL`);
      console.log('Added "phone" column to users table.');
    } catch (e) { /* column already exists */ }
    try {
      await connection.query(`ALTER TABLE users ADD COLUMN token_version INT DEFAULT 1`);
      console.log('Added "token_version" column to users table.');
    } catch (e) { /* column already exists */ }

    // Add B2B client tracking columns to company_profiles
    try {
      await connection.query(`ALTER TABLE company_profiles ADD COLUMN company_type VARCHAR(50) DEFAULT 'Business'`);
      console.log('Added "company_type" column to company_profiles table.');
    } catch (e) { }
    try {
      await connection.query(`ALTER TABLE company_profiles ADD COLUMN notes TEXT NULL`);
      console.log('Added "notes" column to company_profiles table.');
    } catch (e) { }
    try {
      await connection.query(`ALTER TABLE company_profiles ADD COLUMN amc_status VARCHAR(50) DEFAULT 'Inactive'`);
      console.log('Added "amc_status" column to company_profiles table.');
    } catch (e) { }
    try {
      await connection.query(`ALTER TABLE company_profiles ADD COLUMN assigned_technician_id INT NULL`);
      try {
        await connection.query(`ALTER TABLE company_profiles ADD CONSTRAINT fk_company_assigned_tech FOREIGN KEY (assigned_technician_id) REFERENCES users(id) ON DELETE SET NULL`);
      } catch (err) { }
      console.log('Added "assigned_technician_id" column to company_profiles table.');
    } catch (e) { }

    // 8.1. Alter service_requests table to add B2B-specific tracking attributes
    try {
      await connection.query(`ALTER TABLE service_requests ADD COLUMN company_id INT NULL`);
      await connection.query(`ALTER TABLE service_requests ADD FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE SET NULL`);
      console.log('Added company_id to service_requests.');
    } catch (e) { }

    try {
      await connection.query(`ALTER TABLE service_requests ADD COLUMN employee_id INT NULL`);
      await connection.query(`ALTER TABLE service_requests ADD FOREIGN KEY (employee_id) REFERENCES company_employees(id) ON DELETE SET NULL`);
      console.log('Added employee_id to service_requests.');
    } catch (e) { }

    try {
      await connection.query(`ALTER TABLE service_requests ADD COLUMN device_id INT NULL`);
      await connection.query(`ALTER TABLE service_requests ADD FOREIGN KEY (device_id) REFERENCES company_devices(id) ON DELETE SET NULL`);
      console.log('Added device_id to service_requests.');
    } catch (e) { }

    try {
      await connection.query(`ALTER TABLE service_requests ADD COLUMN serial_number VARCHAR(100) NULL`);
      console.log('Added serial_number to service_requests.');
    } catch (e) { }

    try {
      await connection.query(`ALTER TABLE service_requests ADD COLUMN device_configuration TEXT NULL`);
      console.log('Added device_configuration to service_requests.');
    } catch (e) { }

    try {
      await connection.query(`ALTER TABLE service_requests ADD COLUMN pending_technician_id INT NULL`);
      try {
        await connection.query(`ALTER TABLE service_requests ADD FOREIGN KEY (pending_technician_id) REFERENCES users(id) ON DELETE SET NULL`);
      } catch (err) { }
      console.log('Added pending_technician_id to service_requests.');
    } catch (e) { }

    try {
      await connection.query(`ALTER TABLE service_requests ADD COLUMN estimated_completion_date DATE NULL`);
      console.log('Added estimated_completion_date to service_requests.');
    } catch (e) { }

    try {
      await connection.query('ALTER TABLE company_devices ADD COLUMN is_amc TINYINT(1) DEFAULT 0');
      console.log('Added column is_amc to company_devices.');
    } catch (e) { }

    try {
      await connection.query('ALTER TABLE company_devices ADD COLUMN amc_tag VARCHAR(50) DEFAULT NULL');
      console.log('Added column amc_tag to company_devices.');
    } catch (e) { }

    try {
      await connection.query(`ALTER TABLE service_requests ADD COLUMN repair_notes TEXT NULL`);
      console.log('Added repair_notes to service_requests.');
    } catch (e) { }

    try {
      await connection.query(`ALTER TABLE service_requests ADD COLUMN repair_cost DECIMAL(10,2) DEFAULT 0.00`);
      console.log('Added repair_cost to service_requests.');
    } catch (e) { }

    try {
      await connection.query(`ALTER TABLE service_requests ADD COLUMN sla_deadline TIMESTAMP NULL`);
      console.log('Added sla_deadline to service_requests.');
    } catch (e) { }

    try {
      await connection.query(`ALTER TABLE service_requests ADD COLUMN ticket_number VARCHAR(50) UNIQUE NULL`);
      console.log('Added ticket_number to service_requests.');
    } catch (e) { }

    try {
      await connection.query(`ALTER TABLE service_requests ADD COLUMN customer_repair_description TEXT NULL`);
      console.log('Added customer_repair_description to service_requests.');
    } catch (e) { }

    try {
      await connection.query(`ALTER TABLE service_requests ADD COLUMN feedback_rating TINYINT NULL`);
      await connection.query(`ALTER TABLE service_requests ADD COLUMN feedback_comment TEXT NULL`);
      await connection.query(`ALTER TABLE service_requests ADD COLUMN feedback_date TIMESTAMP NULL`);
      console.log('Added customer feedback columns to service_requests.');
    } catch (e) { }

    // Create Technician Work Logs Table
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
    console.log('Table "technician_work_logs" checked/created.');

    // 9. Create Activity Logs Table
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
    console.log('Table "activity_logs" checked/created.');

    try {
      await connection.query('ALTER TABLE activity_logs ADD COLUMN category VARCHAR(50) DEFAULT NULL');
      await connection.query('CREATE INDEX idx_logs_category ON activity_logs (category)');
      console.log('Added category column and idx_logs_category index to activity_logs.');
    } catch (e) { }

    // 10. Create Site Settings Table
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
    console.log('Table "site_settings" checked/created.');

    // 11. Create Homepage Content Table
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
    console.log('Table "homepage_content" checked/created.');

    // 12. Seed Default Admin User if none exists
    const [adminRows] = await connection.query('SELECT * FROM users WHERE role = "admin" LIMIT 1');
    if (adminRows.length === 0) {
      const defaultAdminEmail = 'admin@tekdoctor.in';
      const defaultAdminPass = 'Admin@123';
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(defaultAdminPass, salt);

      await connection.query(`
        INSERT INTO users (name, email, password, role)
        VALUES (?, ?, ?, ?)
      `, ['TekDoctor Admin', defaultAdminEmail, hashedPassword, 'admin']);

      console.log('--------------------------------------------------');
      console.log('Seeded Default Admin User:');
      console.log(`Email: ${defaultAdminEmail}`);
      console.log(`Password: ${defaultAdminPass}`);
      console.log('Please change this password after your first login!');
      console.log('--------------------------------------------------');
    }

    // 13. Seed Default Site Settings if empty
    const SETTING_KEY_GROUPS = {
      company_name: 'company',
      company_phone: 'company',
      company_email: 'company',
      company_address: 'company',
      logo_url: 'company',
      theme_primary_color: 'theme',
      theme_secondary_color: 'theme',
      favicon_url: 'branding',
      facebook_url: 'social',
      twitter_url: 'social',
      instagram_url: 'social',
      linkedin_url: 'social',
      google_maps_link: 'integrations',
      google_sheet_url: 'integrations',
      maintenance_mode: 'system',
      meta_title: 'seo',
      meta_description: 'seo',
      meta_keywords: 'seo',
      smtp_host: 'email',
      smtp_port: 'email',
      smtp_user: 'email',
      smtp_password: 'email',
      from_email: 'email',
      from_name: 'email',
      template_repair_ready: 'email',
      template_new_ticket: 'email',
      template_status_update: 'email'
    };

    // Run migration queries to update legacy and mismatched keys/groups
    try {
      await connection.query("UPDATE site_settings SET setting_key = 'company_email', setting_group = 'company' WHERE setting_key = 'contact_email'");
      await connection.query("UPDATE site_settings SET setting_key = 'company_phone', setting_group = 'company' WHERE setting_key = 'contact_phone'");
      await connection.query("UPDATE site_settings SET setting_key = 'facebook_url', setting_group = 'social' WHERE setting_key = 'social_facebook'");
      await connection.query("UPDATE site_settings SET setting_key = 'twitter_url', setting_group = 'social' WHERE setting_key = 'social_twitter'");
      await connection.query("UPDATE site_settings SET setting_key = 'instagram_url', setting_group = 'social' WHERE setting_key = 'social_instagram'");
      await connection.query("UPDATE site_settings SET setting_key = 'linkedin_url', setting_group = 'social' WHERE setting_key = 'social_linkedin'");
      await connection.query("UPDATE site_settings SET setting_key = 'smtp_password', setting_group = 'email' WHERE setting_key = 'smtp_pass'");
      await connection.query("UPDATE site_settings SET setting_key = 'from_email', setting_group = 'email' WHERE setting_key = 'smtp_from_name'");
    } catch (e) {
      console.log('Migration of legacy settings keys failed/already done:', e.message);
    }

    // Apply correct groups to any existing site settings keys
    for (const [key, group] of Object.entries(SETTING_KEY_GROUPS)) {
      try {
        await connection.query(
          "UPDATE site_settings SET setting_group = ? WHERE setting_key = ?",
          [group, key]
        );
      } catch (err) {
        // ignore errors (e.g. if row doesn't exist)
      }
    }

    const [settingsCount] = await connection.query('SELECT COUNT(*) as cnt FROM site_settings');
    if (settingsCount[0].cnt === 0) {
      const defaults = [
        ['company_name', 'The Tek Doctor', 'company'],
        ['company_email', 'info@tekdoctor.in', 'company'],
        ['company_phone', '+91 9876543210', 'company'],
        ['company_address', 'Mumbai, Maharashtra, India', 'company'],
        ['logo_url', '', 'company'],
        ['theme_primary_color', '#00e5ff', 'theme'],
        ['theme_secondary_color', '#1a1a1a', 'theme'],
        ['favicon_url', '', 'branding'],
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
      ];
      for (const [key, value, group] of defaults) {
        await connection.query(
          'INSERT IGNORE INTO site_settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?)',
          [key, value, group]
        );
      }
      console.log('Seeded default site settings.');
    }

    // 14. Seed Default Homepage Content if empty
    const [contentCount] = await connection.query('SELECT COUNT(*) as cnt FROM homepage_content');
    if (contentCount[0].cnt === 0) {
      const sections = [
        ['hero', JSON.stringify({ title: 'Expert Device Repair', subtitle: 'Fast, Reliable, Professional', cta_text: 'Book a Repair', cta_link: '/repair' }), 1],
        ['about', JSON.stringify({ title: 'About Us', description: 'We are a professional device repair company committed to quality service.' }), 2],
        ['services', JSON.stringify({ title: 'Our Services', items: [{ name: 'Phone Repair', icon: 'smartphone' }, { name: 'Laptop Repair', icon: 'laptop' }, { name: 'Tablet Repair', icon: 'tablet' }] }), 3],
        ['faq', JSON.stringify({ title: 'Frequently Asked Questions', items: [{ question: 'How long does repair take?', answer: 'Most repairs are completed within 24-48 hours.' }] }), 4],
        ['testimonials', JSON.stringify({ title: 'Customer Reviews', items: [{ name: 'Customer', review: 'Excellent service!', rating: 5 }] }), 5],
        ['footer', JSON.stringify({ copyright: '© 2026 The Tek Doctor. All rights reserved.', tagline: 'Your trusted device repair partner.' }), 6],
      ];
      for (const [section, content, order] of sections) {
        await connection.query(
          'INSERT INTO homepage_content (section, content, sort_order) VALUES (?, ?, ?)',
          [section, content, order]
        );
      }
      console.log('Seeded default homepage content.');
    }

  } catch (error) {
    console.error('Error during database initialization:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

module.exports = initDatabase;
