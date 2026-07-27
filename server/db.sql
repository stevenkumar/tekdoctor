-- ======================================================================
-- TekDoctor Database Schema and Initial Seed Script
-- Target Database: MySQL / MariaDB
-- 
-- Description:
-- This script creates the database 'tekdoctor_db' (if it does not exist)
-- and defines the required relational tables:
-- 1. users: user profile records, roles, and hashed credentials.
-- 2. service_requests: device repair inquiry submissions and technician assignments.
-- 3. contacts: website contact forms submissions.
-- 4. invoices: billing invoices metadata.
-- 5. invoice_line_items: list of items/charges associated with invoices.
-- ======================================================================

-- 1. Database Initialization
-- CREATE DATABASE IF NOT EXISTS `tekdoctor_db` 
-- CREATE DATABASE IF NOT EXISTS `vibgyorventures_tekdoctorv1` 
-- CHARACTER SET utf8mb4 
-- COLLATE utf8mb4_unicode_ci;

USE `vibgyorventures_tekdoctorv1`;
-- USE `tekdoctor_db`;

-- 2. Create Users Table
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) UNIQUE NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('customer', 'technician', 'admin', 'company') DEFAULT 'customer',
  `technician_id` VARCHAR(50) UNIQUE NULL,
  `token_version` INT DEFAULT 1,
  `phone` VARCHAR(20) NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create Service Requests Table
CREATE TABLE IF NOT EXISTS `service_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `customer_name` VARCHAR(100) NOT NULL,
  `mobile` VARCHAR(15) NOT NULL,
  `email` VARCHAR(255) NULL,
  `city` VARCHAR(100) NOT NULL,
  `device_category` VARCHAR(50) NOT NULL,
  `brand` VARCHAR(50) NOT NULL,
  `custom_brand` VARCHAR(50) NULL,
  `model_number` VARCHAR(100) NULL,
  `device_age` VARCHAR(50) NULL,
  `serial_number` VARCHAR(100) NULL,
  `device_configuration` TEXT NULL,
  `problem_type` VARCHAR(100) NOT NULL,
  `problem_description` TEXT NOT NULL,
  `service_type` VARCHAR(50) NOT NULL,
  `priority` VARCHAR(20) NOT NULL,
  `preferred_contact_method` VARCHAR(20) NOT NULL,
  `image_path` VARCHAR(500) NULL,
  `screenshot_path` VARCHAR(500) NULL,
  `status` ENUM('pending', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
  `assigned_technician_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`assigned_technician_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create Contacts Table
CREATE TABLE IF NOT EXISTS `contacts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(15) NOT NULL,
  `message` TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Create Invoices Table
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` VARCHAR(20) PRIMARY KEY,
  `user_id` INT NOT NULL,
  `client_name` VARCHAR(100) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `currency` VARCHAR(10) DEFAULT 'INR',
  `invoice_date` DATETIME NOT NULL,
  `due_date` DATETIME NOT NULL,
  `status` VARCHAR(20) DEFAULT 'Draft',
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Create Invoice Line Items Table
CREATE TABLE IF NOT EXISTS `invoice_line_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoice_id` VARCHAR(20) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `quantity` INT NOT NULL,
  `unit_price` DECIMAL(10,2) NOT NULL,
  `total` DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Create Notifications Table
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
  FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Seed Initial Default Admin User
-- Credentials: 
--   Email: admin@tekdoctor.in
--   Password: Admin@123 (bcrypt hash below)
INSERT INTO `users` (`name`, `email`, `password`, `role`)
SELECT 'TekDoctor Admin', 'admin@tekdoctor.in', '$2a$12$N9qo8uLOtvHY14Q9WPqOJu9y7cM37X3vJzB41N/2rJgM1p.Z49XqO', 'admin'
FROM dual
WHERE NOT EXISTS (
  SELECT 1 FROM `users` WHERE `role` = 'admin' LIMIT 1
);
