-- ============================================================================
--  TekDoctor — MySQL schema + seed data
--  Generated from server/models/db.init.js (finalized schema + migrations)
-- ============================================================================
--  HOW TO IMPORT (phpMyAdmin):
--    1. Log in to cPanel -> phpMyAdmin.
--    2. In the left sidebar click your database: thetekdoctor_tekdoctorv1
--       (create it first if it does not exist).
--    3. Click the "Import" tab -> "Choose File" -> select this .sql file.
--    4. Click "Go".
--
--  NOTES
--    * Safe on a fresh/empty database. Everything uses CREATE TABLE IF NOT
--      EXISTS / INSERT IGNORE, so re-running will not error or wipe data.
--    * The app ALSO auto-creates this schema on startup; importing is optional
--      but useful when you want the DB ready before the app connects.
--    * Default admin login ->  admin@tekdoctor.com  /  Admin@123
--      (change the password immediately after first login).
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) UNIQUE NOT NULL,
  `password` VARCHAR(255) NULL,
  `role` ENUM('customer', 'technician', 'admin', 'company') DEFAULT 'customer',
  `google_id` VARCHAR(255) UNIQUE NULL,
  `auth_provider` VARCHAR(50) DEFAULT 'local',
  `avatar_url` VARCHAR(500) NULL,
  `token_version` INT DEFAULT 1,
  `technician_id` VARCHAR(50) UNIQUE NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `phone` VARCHAR(30) NULL,
  `company_id` VARCHAR(50) UNIQUE NULL,
  `deactivated_at` TIMESTAMP NULL,
  `deactivated_by` INT NULL,
  `deactivation_reason` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_email` (`email`),
  INDEX `idx_users_google` (`google_id`),
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_active` (`is_active`),
  UNIQUE INDEX `idx_users_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 2. company_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `company_profiles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL UNIQUE,
  `company_id` VARCHAR(50) UNIQUE NULL,
  `company_name` VARCHAR(150) NOT NULL,
  `company_logo` VARCHAR(500) NULL,
  `contact_person` VARCHAR(100) NOT NULL,
  `phone_number` VARCHAR(20) NOT NULL,
  `address` TEXT NOT NULL,
  `gst_number` VARCHAR(15) NULL,
  `website_url` VARCHAR(255) NULL,
  `social_facebook` VARCHAR(255) NULL,
  `social_instagram` VARCHAR(255) NULL,
  `social_twitter` VARCHAR(255) NULL,
  `social_linkedin` VARCHAR(255) NULL,
  `company_type` VARCHAR(50) DEFAULT 'Business',
  `notes` TEXT NULL,
  `amc_status` VARCHAR(50) DEFAULT 'Inactive',
  `assigned_technician_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`assigned_technician_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 3. company_branches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `company_branches` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `address` TEXT NOT NULL,
  `phone` VARCHAR(20) NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `status` VARCHAR(20) DEFAULT 'active',
  `deactivated_at` TIMESTAMP NULL,
  `deactivated_by` INT NULL,
  `deactivation_reason` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_cb_company` (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 4. company_employees
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `company_employees` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `branch_id` INT NULL,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `department` VARCHAR(100) NULL,
  `designation` VARCHAR(100) NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `status` VARCHAR(20) DEFAULT 'active',
  `deactivated_at` TIMESTAMP NULL,
  `deactivated_by` INT NULL,
  `deactivation_reason` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`branch_id`) REFERENCES `company_branches`(`id`) ON DELETE SET NULL,
  UNIQUE INDEX `idx_emp_company_email` (`company_id`, `email`),
  INDEX `idx_ce_company` (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 5. company_devices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `company_devices` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `branch_id` INT NULL,
  `employee_id` INT NULL,
  `device_category` VARCHAR(50) NOT NULL,
  `brand` VARCHAR(50) NOT NULL,
  `model_number` VARCHAR(100) NOT NULL,
  `serial_number` VARCHAR(100) NOT NULL,
  `asset_id` VARCHAR(100) NOT NULL,
  `purchase_date` DATE NULL,
  `warranty_expiry` DATE NULL,
  `notes` TEXT NULL,
  `is_amc` TINYINT(1) DEFAULT 0,
  `amc_tag` VARCHAR(50) DEFAULT NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `status` VARCHAR(20) DEFAULT 'active',
  `deactivated_at` TIMESTAMP NULL,
  `deactivated_by` INT NULL,
  `deactivation_reason` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`branch_id`) REFERENCES `company_branches`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`employee_id`) REFERENCES `company_employees`(`id`) ON DELETE SET NULL,
  INDEX `idx_cd_company` (`company_id`),
  INDEX `idx_cd_serial` (`serial_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 6. service_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `service_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `customer_name` VARCHAR(100) NOT NULL,
  `mobile` VARCHAR(30) NOT NULL,
  `email` VARCHAR(255) NULL,
  `address` TEXT NULL,
  `city` VARCHAR(100) NOT NULL,
  `state` VARCHAR(50) NULL,
  `zip_code` VARCHAR(20) NULL,
  `device_category` VARCHAR(50) NOT NULL,
  `custom_device_category` VARCHAR(100) NULL,
  `brand` VARCHAR(50) NOT NULL,
  `custom_brand` VARCHAR(50) NULL,
  `model_number` VARCHAR(100) NULL,
  `device_age` VARCHAR(50) NULL,
  `serial_number` VARCHAR(100) NULL,
  `device_configuration` TEXT NULL,
  `problem_type` VARCHAR(100) NOT NULL,
  `custom_problem_type` VARCHAR(150) NULL,
  `problem_description` TEXT NOT NULL,
  `service_type` VARCHAR(50) DEFAULT 'Bring to Service Center',
  `custom_service_type` VARCHAR(150) NULL,
  `priority` VARCHAR(20) DEFAULT 'Standard',
  `preferred_contact_method` VARCHAR(100) DEFAULT 'WhatsApp',
  `image_path` VARCHAR(500) NULL,
  `screenshot_path` VARCHAR(500) NULL,
  `status` ENUM('pending', 'in_progress', 'completed', 'delivered', 'cancelled') DEFAULT 'pending',
  `assigned_technician_id` INT NULL,
  `pending_technician_id` INT NULL,
  `company_id` INT NULL,
  `employee_id` INT NULL,
  `device_id` INT NULL,
  `estimated_completion_date` DATE NULL,
  `repair_notes` TEXT NULL,
  `repair_cost` DECIMAL(10,2) DEFAULT 0.00,
  `sla_deadline` TIMESTAMP NULL,
  `ticket_number` VARCHAR(50) UNIQUE NULL,
  `customer_repair_description` TEXT NULL,
  `feedback_rating` TINYINT NULL,
  `feedback_comment` TEXT NULL,
  `feedback_date` TIMESTAMP NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `deactivated_at` TIMESTAMP NULL,
  `deactivated_by` INT NULL,
  `deactivation_reason` TEXT NULL,
  `payment_status` ENUM('unpaid', 'pending', 'pending_verification', 'paid', 'failed', 'refunded', 'rejected') DEFAULT 'unpaid',
  `collection_status` ENUM('pending_collection', 'collected', 'not_applicable') DEFAULT 'not_applicable',
  `payment_id` VARCHAR(100) NULL,
  `payment_order_id` VARCHAR(100) NULL,
  `payment_method` VARCHAR(50) NULL,
  `paid_at` TIMESTAMP NULL,
  `diagnosis` TEXT NULL,
  `identified_issues` TEXT NULL,
  `required_work` TEXT NULL,
  `required_parts` TEXT NULL,
  `estimated_cost` DECIMAL(10,2) DEFAULT 0.00,
  `additional_charges` DECIMAL(10,2) DEFAULT 0.00,
  `inspection_notes` TEXT NULL,
  `device_condition` TEXT NULL,
  `inspected_at` TIMESTAMP NULL,
  `estimate_submitted_at` TIMESTAMP NULL,
  `customer_approval_status` VARCHAR(50) DEFAULT 'none',
  `approved_at` TIMESTAMP NULL,
  `approved_by` INT NULL,
  `approval_notes` TEXT NULL,
  `rejected_at` TIMESTAMP NULL,
  `rejection_reason` TEXT NULL,
  `hold_start_date` TIMESTAMP NULL,
  `hold_end_date` TIMESTAMP NULL,
  `hold_reason` TEXT NULL,
  `hold_notes` TEXT NULL,
  `cancellation_reason` TEXT NULL,
  `cancelled_at` TIMESTAMP NULL,
  `cancelled_by` INT NULL,
  `amount_updated_by_admin` BOOLEAN DEFAULT FALSE,
  `admin_updated_amount` DECIMAL(10,2) NULL,
  `amount_updated_at` TIMESTAMP NULL,
  `reapproval_requested_at` TIMESTAMP NULL,
  `reapproval_notes` TEXT NULL,
  `submission_id` VARCHAR(100) UNIQUE NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`assigned_technician_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`pending_technician_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`company_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`employee_id`) REFERENCES `company_employees`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`device_id`) REFERENCES `company_devices`(`id`) ON DELETE SET NULL,
  INDEX `idx_sr_status` (`status`),
  INDEX `idx_sr_tech` (`assigned_technician_id`),
  INDEX `idx_sr_company` (`company_id`),
  INDEX `idx_sr_created` (`created_at`),
  INDEX `idx_sr_user` (`user_id`),
  INDEX `idx_sr_ticket` (`ticket_number`),
  INDEX `idx_sr_approval_status` (`customer_approval_status`),
  INDEX `idx_sr_hold_end` (`hold_end_date`),
  INDEX `idx_sr_payment_status` (`payment_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 7. repair_form_drafts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `repair_form_drafts` (
  `draft_id` VARCHAR(100) PRIMARY KEY,
  `form_data` JSON NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 8. contacts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `contacts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `subject` VARCHAR(255) NULL,
  `message` TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_contacts_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 9. invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` VARCHAR(50) PRIMARY KEY,
  `user_id` INT NULL,
  `client_name` VARCHAR(100) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `subtotal` DECIMAL(12,2) NULL DEFAULT 0.00,
  `tax_amount` DECIMAL(12,2) NULL DEFAULT 0.00,
  `cgst_amount` DECIMAL(12,2) NULL DEFAULT 0.00,
  `sgst_amount` DECIMAL(12,2) NULL DEFAULT 0.00,
  `igst_amount` DECIMAL(12,2) NULL DEFAULT 0.00,
  `original_estimate` DECIMAL(12,2) NULL DEFAULT 0.00,
  `is_interstate` BOOLEAN DEFAULT FALSE,
  `finalized_at` TIMESTAMP NULL,
  `finalized_by` INT NULL,
  `currency` VARCHAR(10) DEFAULT 'INR',
  `invoice_date` DATETIME NOT NULL,
  `due_date` DATETIME NOT NULL,
  `status` VARCHAR(20) DEFAULT 'Draft',
  `notes` TEXT NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `deactivated_at` TIMESTAMP NULL,
  `deactivated_by` INT NULL,
  `deactivation_reason` TEXT NULL,
  `payment_id` VARCHAR(100) NULL,
  `payment_order_id` VARCHAR(100) NULL,
  `payment_method` VARCHAR(50) NULL,
  `ticket_id` INT NULL,
  `paid_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_inv_user` (`user_id`),
  INDEX `idx_inv_status` (`status`),
  INDEX `idx_inv_payment_id` (`payment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 10. invoice_line_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoice_line_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoice_id` VARCHAR(50) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `hsn_sac` VARCHAR(20) DEFAULT '9987',
  `quantity` INT NOT NULL,
  `unit_price` DECIMAL(10,2) NOT NULL,
  `total` DECIMAL(12,2) NOT NULL,
  `tax_rate` DECIMAL(5,2) DEFAULT 18.00,
  `tax_amount` DECIMAL(12,2) DEFAULT 0.00,
  FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 11. notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `ticket_id` INT NULL,
  `sender_id` INT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `is_read` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`ticket_id`) REFERENCES `service_requests`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_notif_user_read` (`user_id`, `is_read`),
  INDEX `idx_notif_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 12. messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `repair_request_id` INT NULL,
  `sender_id` INT NOT NULL,
  `receiver_id` INT NOT NULL,
  `message` TEXT NOT NULL,
  `is_read` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`repair_request_id`) REFERENCES `service_requests`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`receiver_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 13. quotations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `quotations` (
  `id` VARCHAR(20) PRIMARY KEY,
  `company_id` INT NOT NULL,
  `request_id` INT NULL,
  `title` VARCHAR(100) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `status` VARCHAR(20) DEFAULT 'Pending',
  `items` JSON NOT NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`request_id`) REFERENCES `service_requests`(`id`) ON DELETE SET NULL,
  INDEX `idx_quot_company` (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 14. testimonials
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `testimonials` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `rating` INT NOT NULL,
  `comment` TEXT NOT NULL,
  `is_approved` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_testim_approved` (`is_approved`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 15. technician_work_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `technician_work_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `repair_request_id` INT NOT NULL,
  `technician_id` INT NOT NULL,
  `repair_stage` VARCHAR(50) NOT NULL,
  `action_performed` TEXT NOT NULL,
  `parts_replaced` VARCHAR(255) NULL,
  `time_spent` VARCHAR(50) NULL,
  `notes` TEXT NULL,
  `media_path` VARCHAR(500) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`repair_request_id`) REFERENCES `service_requests`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`technician_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 16. task_transfers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task_transfers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `repair_request_id` INT NOT NULL,
  `from_technician_id` INT NULL,
  `to_technician_id` INT NOT NULL,
  `initiated_by_user_id` INT NOT NULL,
  `reason` TEXT NULL,
  `status` ENUM('pending', 'accepted', 'rejected', 'cancelled') DEFAULT 'pending',
  `response_notes` TEXT NULL,
  `transferred_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `responded_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`repair_request_id`) REFERENCES `service_requests`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`from_technician_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`to_technician_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`initiated_by_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_tt_request` (`repair_request_id`),
  INDEX `idx_tt_from` (`from_technician_id`),
  INDEX `idx_tt_to` (`to_technician_id`),
  INDEX `idx_tt_status` (`status`),
  INDEX `idx_tt_transferred_at` (`transferred_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 17. payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `payment_id` VARCHAR(100) UNIQUE NULL,
  `order_id` VARCHAR(100) NOT NULL,
  `ticket_id` INT NULL,
  `invoice_id` VARCHAR(50) NULL,
  `user_id` INT NULL,
  `company_id` INT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `currency` VARCHAR(10) DEFAULT 'INR',
  `payment_method` VARCHAR(50) DEFAULT 'card',
  `status` ENUM('created', 'processing', 'pending_verification', 'paid', 'failed', 'cancelled', 'refunded', 'rejected') DEFAULT 'created',
  `gateway` VARCHAR(50) DEFAULT 'razorpay',
  `gateway_response` JSON NULL,
  `error_message` TEXT NULL,
  `collection_status` ENUM('pending_collection', 'collected', 'not_applicable') DEFAULT 'not_applicable',
  `collected_by` INT NULL,
  `collected_at` TIMESTAMP NULL,
  `verification_status` ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
  `verified_by` INT NULL,
  `verified_at` TIMESTAMP NULL,
  `reference_note` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`ticket_id`) REFERENCES `service_requests`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`company_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`collected_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_pmt_order` (`order_id`),
  INDEX `idx_pmt_status` (`status`),
  INDEX `idx_pmt_ticket` (`ticket_id`),
  INDEX `idx_pmt_invoice` (`invoice_id`),
  INDEX `idx_pmt_user` (`user_id`),
  INDEX `idx_pmt_verification_status` (`verification_status`),
  INDEX `idx_pmt_collection_status` (`collection_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 18. activity_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `category` VARCHAR(50) DEFAULT NULL,
  `action` VARCHAR(100) NOT NULL,
  `target_type` VARCHAR(50) NULL,
  `target_id` INT NULL,
  `details` JSON NULL,
  `ip_address` VARCHAR(45) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_logs_action` (`action`),
  INDEX `idx_logs_created` (`created_at`),
  INDEX `idx_logs_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 19. site_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `site_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `setting_key` VARCHAR(100) UNIQUE NOT NULL,
  `setting_value` TEXT NULL,
  `setting_group` VARCHAR(50) DEFAULT 'general',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_settings_key` (`setting_key`),
  INDEX `idx_settings_group` (`setting_group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 20. homepage_content
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `homepage_content` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `section` VARCHAR(50) NOT NULL,
  `content` JSON NOT NULL,
  `sort_order` INT DEFAULT 0,
  `is_active` BOOLEAN DEFAULT TRUE,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_homepage_section` (`section`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 21. app_sequences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `app_sequences` (
  `sequence_name` VARCHAR(100) PRIMARY KEY,
  `current_val` INT NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 22. schema_migrations (internal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `version` VARCHAR(100) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `applied_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
--  SEED DATA
-- ===========================================================================

-- ── Default admin account ──────────────────────────────────────────────────
-- login: admin@tekdoctor.com   password: Admin@123   (CHANGE THIS AFTER LOGIN)
INSERT IGNORE INTO `users` (`name`, `email`, `password`, `role`, `is_active`, `auth_provider`, `token_version`)
VALUES ('TekDoctor Admin', 'admin@tekdoctor.com', '$2b$12$/ex33CvED1VjVOJziSqb6O2V4UamvQeYCKpN1a7gQCT9o7sMGrP0C', 'admin', TRUE, 'local', 1);

-- ── Site settings defaults ─────────────────────────────────────────────────
INSERT IGNORE INTO `site_settings` (`setting_key`, `setting_value`, `setting_group`) VALUES
('company_name', 'The Tek Doctor', 'company'),
('company_email', 'info@tekdoctor.in', 'company'),
('company_phone', '+91 9136868902', 'company'),
('company_alternate_phone', '', 'company'),
('company_address', 'Mumbai, Maharashtra, India', 'company'),
('logo_url', '', 'company'),
('theme_primary_color', '#00e5ff', 'theme'),
('theme_secondary_color', '#1a1a1a', 'theme'),
('favicon_url', '', 'branding'),
('tekunik_image_url', '', 'branding'),
('facebook_url', '', 'social'),
('twitter_url', '', 'social'),
('instagram_url', '', 'social'),
('linkedin_url', '', 'social'),
('google_maps_link', '', 'integrations'),
('google_sheet_url', '', 'integrations'),
('maintenance_mode', 'false', 'system'),
('meta_title', '', 'seo'),
('meta_description', '', 'seo'),
('meta_keywords', '', 'seo'),
('smtp_host', 'smtp.gmail.com', 'email'),
('smtp_port', '587', 'email'),
('smtp_user', '', 'email'),
('smtp_password', '', 'email'),
('from_email', 'noreply@tekdoctor.in', 'email'),
('from_name', 'The Tek Doctor', 'email'),
('invoice_prefix', 'inv', 'billing'),
('default_gst_rate', '18.00', 'billing'),
('invoice_gst_enabled', 'true', 'billing'),
('gstin', '27AAAAA0000A1Z5', 'company'),
('invoice_default_items', '[{"name":"Diagnostic Assessment","description":"Complete device hardware and component diagnostic assessment","hsn_sac":"9987","unit_price":350,"tax_rate":18},{"name":"Display Screen Replacement","description":"Display panel assembly replacement with touch calibration","hsn_sac":"9987","unit_price":2500,"tax_rate":18},{"name":"Battery Replacement Service","description":"Battery pack replacement with power delivery testing","hsn_sac":"9987","unit_price":1500,"tax_rate":18},{"name":"Motherboard Chip-Level Repair","description":"Micro-soldering, SMD component replacement, short-circuit recovery","hsn_sac":"9987","unit_price":3000,"tax_rate":18},{"name":"Charging Port & Connector Repair","description":"Dock connector / USB charging port repair and pin alignment","hsn_sac":"9987","unit_price":1200,"tax_rate":18},{"name":"OS & Software Troubleshooting","description":"System restore, driver installation, and performance optimization","hsn_sac":"9987","unit_price":800,"tax_rate":18}]', 'billing');

-- ── Homepage content defaults (only inserted if the section is missing) ─────
INSERT INTO `homepage_content` (`section`, `content`, `sort_order`)
SELECT 'hero', '{"title":"Expert Device Repair","subtitle":"Fast, Reliable, Professional","cta_text":"Book a Repair","cta_link":"/repair"}', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `homepage_content` WHERE `section` = 'hero');

INSERT INTO `homepage_content` (`section`, `content`, `sort_order`)
SELECT 'about', '{"title":"About Us","description":"We are a professional device repair company committed to quality service."}', 2 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `homepage_content` WHERE `section` = 'about');

INSERT INTO `homepage_content` (`section`, `content`, `sort_order`)
SELECT 'services', '{"title":"Our Services","items":[{"name":"Phone Repair","icon":"smartphone"},{"name":"Laptop Repair","icon":"laptop"},{"name":"Tablet Repair","icon":"tablet"}]}', 3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `homepage_content` WHERE `section` = 'services');

INSERT INTO `homepage_content` (`section`, `content`, `sort_order`)
SELECT 'faq', '{"title":"Frequently Asked Questions","items":[{"question":"How long does repair take?","answer":"Most repairs are completed within 24-48 hours."}]}', 4 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `homepage_content` WHERE `section` = 'faq');

INSERT INTO `homepage_content` (`section`, `content`, `sort_order`)
SELECT 'testimonials', '{"title":"Customer Reviews","items":[{"name":"Customer","review":"Excellent service!","rating":5}]}', 5 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `homepage_content` WHERE `section` = 'testimonials');

INSERT INTO `homepage_content` (`section`, `content`, `sort_order`)
SELECT 'footer', '{"copyright":"\u00a9 2026 The Tek Doctor. All rights reserved.","tagline":"Your trusted device repair partner."}', 6 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `homepage_content` WHERE `section` = 'footer');

INSERT INTO `homepage_content` (`section`, `content`, `sort_order`)
SELECT 'repair_protocol', '{"badge":"Standard Operating Procedure","title":"Repair Protocol","highlight_word":"Protocol","description":"Our repair process is designed to be transparent, efficient, and customer-focused. Whether you need assistance with a smartphone, laptop, desktop computer, television, printer, home appliance, or any other electronic device, we follow a structured repair protocol to ensure the highest quality service.","steps":[{"icon":"FileText","title":"Service Request Submission","description":"Customers begin by submitting a repair request through our online form. Basic details such as contact information, device type, brand, model number, and a description of the issue help our technicians understand the problem before inspection."},{"icon":"Search","title":"Initial Assessment","description":"Once the request is received, our support team reviews the information and contacts the customer if additional details are required. The device is then scheduled for inspection, either through a service center visit, pickup service, or on-site technician visit where applicable."},{"icon":"Microscope","title":"Device Inspection & Diagnosis","description":"Our technicians perform a thorough diagnostic assessment to identify the root cause of the problem. Hardware, software, connectivity, power, performance, and component-related issues are carefully examined."},{"icon":"Calculator","title":"Repair Estimate & Approval","description":"After diagnosis, a repair estimate is prepared. This includes the identified issue, recommended solution, estimated repair cost, required replacement parts (if any), and expected completion time. Repair work begins only after customer approval."},{"icon":"Wrench","title":"Professional Repair Process","description":"Certified technicians use industry-standard tools and procedures to repair the device. Genuine or high-quality compatible replacement parts are used whenever required. All repairs are performed according to manufacturer-recommended practices whenever possible."},{"icon":"ShieldCheck","title":"Quality Testing","description":"Before delivery, every repaired device undergoes comprehensive testing to verify functionality, performance, and safety. Multiple quality checks ensure that the reported issue has been resolved successfully."},{"icon":"Bell","title":"Customer Notification","description":"Once the repair is completed and verified, the customer is notified through their preferred communication method, such as phone call, email, or WhatsApp."},{"icon":"Truck","title":"Device Delivery or Collection","description":"Customers can collect their repaired device from the service location or receive it through the agreed delivery method. The device is returned in working condition along with repair details."},{"icon":"LifeBuoy","title":"Post-Repair Support","description":"Our commitment does not end after the repair. Customers can contact our support team for assistance, service-related questions, or warranty-related inquiries according to the applicable service terms."}],"standards_title":"Our Service Standards","standards_description":"We strive to provide reliable, affordable, and efficient repair solutions that help extend the life of your electronic devices while ensuring complete customer satisfaction.","standards":["Transparent repair process","Professional diagnostics","Experienced technicians","Quality replacement parts","Timely service updates","Thorough quality testing","Customer-focused support"],"cta_text":"Proceed to Booking","cta_link":"/repair"}', 7 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `homepage_content` WHERE `section` = 'repair_protocol');

-- ── Mark all migrations as applied (so the app does not re-run them) ────────
INSERT IGNORE INTO `schema_migrations` (`version`, `name`) VALUES
('2026_01_core_schema', 'Core Schema Baseline (21 Tables)'),
('2026_02_user_auth_extensions', 'User & Auth Extensions'),
('2026_03_b2b_and_tracking', 'B2B Corporate & Asset Tracking'),
('2026_04_diagnosis_approval_hold', 'Diagnosis, Estimation, Customer Approval & Hold Workflows'),
('2026_05_payment_reconciliation', 'Multi-Gateway & Offline Payment Reconciliation'),
('2026_06_account_sequences_tickets', 'Per-Account Sequences & Ticket Numbering'),
('2026_07_settings_and_protocol', 'Settings Normalization & Repair Protocol Content'),
('2026_08_bcrypt_password_security', 'Plaintext Password Security Upgrade'),
('2026_09_invoice_item_gst_and_draft_lifecycle', 'Invoice Item-Level GST, Custom Numbering & Draft Lifecycle');

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
--  Done. 21 app tables + schema_migrations created and seeded.
-- ============================================================================
