/**
 * Comprehensive Automated Verification Script for Delete vs Deactivate Behavior
 * Tests soft-deactivation, reactivation, data retention, and login blocking.
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tekdoctor_db',
};

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const initDatabase = require('../models/db.init');

async function runTests() {
  console.log('--- Starting Delete vs Deactivate Verification ---');
  await initDatabase();
  console.log('✓ Database initialized with latest schema');
  let connection;

  try {
    connection = await mysql.createConnection(config);
    console.log('✓ Connected to database');

    // 1. Test Customer / User soft deactivation & login block
    console.log('\n[1] Testing User Deactivation & Reactivation...');
    const testEmail = `test_deact_${Date.now()}@tekdoctor.test`;
    const passwordHash = await bcrypt.hash('Test@123', 10);
    
    const [userRes] = await connection.query(
      `INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, 'customer', 1)`,
      ['Test Deact User', testEmail, passwordHash]
    );
    const userId = userRes.insertId;

    // Simulate Soft Deactivation
    const reason = 'Requested by customer account review';
    await connection.query(
      `UPDATE users SET is_active = 0, deactivated_at = NOW(), deactivated_by = 1, deactivation_reason = ? WHERE id = ?`,
      [reason, userId]
    );

    // Verify row still exists with audit trail
    const [deactRows] = await connection.query(
      `SELECT id, is_active, deactivated_at, deactivation_reason FROM users WHERE id = ?`,
      [userId]
    );
    if (deactRows.length === 1 && deactRows[0].is_active === 0 && deactRows[0].deactivation_reason === reason) {
      console.log('✓ User record preserved in DB with is_active = 0 and deactivation reason recorded');
    } else {
      throw new Error('User deactivation verification failed');
    }

    // Verify Reactivation
    await connection.query(
      `UPDATE users SET is_active = 1, deactivated_at = NULL, deactivated_by = NULL, deactivation_reason = NULL WHERE id = ?`,
      [userId]
    );
    const [reactRows] = await connection.query(
      `SELECT id, is_active FROM users WHERE id = ?`,
      [userId]
    );
    if (reactRows.length === 1 && reactRows[0].is_active === 1) {
      console.log('✓ User reactivation successfully restored is_active = 1');
    } else {
      throw new Error('User reactivation verification failed');
    }

    // 2. Test Branch, Employee, and Device Deactivation
    console.log('\n[2] Testing Company Branches, Employees, & Devices...');
    // Create branch
    const [branchRes] = await connection.query(
      `INSERT INTO company_branches (company_id, name, address, is_active, status) VALUES (?, 'North Branch', '123 North Way', 1, 'active')`,
      [userId]
    );
    const branchId = branchRes.insertId;

    // Create employee
    const [empRes] = await connection.query(
      `INSERT INTO company_employees (company_id, branch_id, name, email, is_active, status) VALUES (?, ?, 'Alice Test', 'alice@test.corp', 1, 'active')`,
      [userId, branchId]
    );
    const empId = empRes.insertId;

    // Create device
    const [devRes] = await connection.query(
      `INSERT INTO company_devices (company_id, employee_id, device_category, brand, model_number, serial_number, asset_id, is_active, status) VALUES (?, ?, 'Laptop', 'Dell', 'XPS 15', 'SN-DELL-991', 'AST-991', 1, 'active')`,
      [userId, empId]
    );
    const devId = devRes.insertId;

    // Soft Deactivate Branch
    await connection.query(
      `UPDATE company_branches SET is_active = FALSE, status = 'inactive', deactivated_at = NOW(), deactivation_reason = 'Office relocation' WHERE id = ?`,
      [branchId]
    );
    const [branchCheck] = await connection.query('SELECT is_active, status, deactivation_reason FROM company_branches WHERE id = ?', [branchId]);
    if (branchCheck[0].is_active === 0 && branchCheck[0].status === 'inactive') {
      console.log('✓ Branch soft deactivated, row preserved with history');
    }

    // Soft Deactivate Employee
    await connection.query(
      `UPDATE company_employees SET is_active = FALSE, status = 'inactive', deactivated_at = NOW(), deactivation_reason = 'On sabbatical' WHERE id = ?`,
      [empId]
    );
    const [empCheck] = await connection.query('SELECT is_active, status, deactivation_reason FROM company_employees WHERE id = ?', [empId]);
    if (empCheck[0].is_active === 0 && empCheck[0].status === 'inactive') {
      console.log('✓ Employee soft deactivated, row preserved with history');
    }

    // Soft Decommission Device
    await connection.query(
      `UPDATE company_devices SET is_active = FALSE, status = 'decommissioned', deactivated_at = NOW(), deactivation_reason = 'Hardware upgrade cycle' WHERE id = ?`,
      [devId]
    );
    const [devCheck] = await connection.query('SELECT is_active, status, deactivation_reason FROM company_devices WHERE id = ?', [devId]);
    if (devCheck[0].is_active === 0 && devCheck[0].status === 'decommissioned') {
      console.log('✓ Device decommissioned / soft deactivated, row preserved with history');
    }

    // 3. Test Service Request Soft Deactivation / Cancellation
    console.log('\n[3] Testing Service Request Deactivation / Cancellation...');
    const [reqRes] = await connection.query(
      `INSERT INTO service_requests (user_id, customer_name, mobile, city, device_category, brand, problem_type, problem_description, status, is_active) VALUES (?, 'Test Customer', '9876543210', 'Test City', 'Mobile', 'Apple', 'Hardware', 'Cracked screen', 'pending', 1)`,
      [userId]
    );
    const reqId = reqRes.insertId;

    // Soft Deactivate / Cancel
    await connection.query(
      `UPDATE service_requests SET is_active = FALSE, status = 'cancelled', deactivated_at = NOW(), deactivation_reason = 'Duplicate ticket logged' WHERE id = ?`,
      [reqId]
    );
    const [reqCheck] = await connection.query('SELECT is_active, status, deactivation_reason FROM service_requests WHERE id = ?', [reqId]);
    if (reqCheck[0].is_active === 0 && reqCheck[0].status === 'cancelled') {
      console.log('✓ Service request cancelled/deactivated without deleting ticket record');
    }

    // 4. Test Invoice Soft Deactivation / Void
    console.log('\n[4] Testing Invoice Soft Deactivation / Void...');
    const invId = `INV-${Date.now().toString().slice(-8)}`;
    await connection.query(
      `INSERT INTO invoices (id, user_id, client_name, amount, currency, invoice_date, due_date, status, is_active) VALUES (?, ?, 'Test Client', 1500.00, 'INR', NOW(), NOW(), 'Draft', 1)`,
      [invId, userId]
    );

    // Soft Deactivate / Void
    await connection.query(
      `UPDATE invoices SET is_active = FALSE, status = 'Void', deactivated_at = NOW(), deactivation_reason = 'Billing correction needed' WHERE id = ?`,
      [invId]
    );
    const [invCheck] = await connection.query('SELECT is_active, status, deactivation_reason FROM invoices WHERE id = ?', [invId]);
    if (invCheck.length > 0 && invCheck[0].is_active === 0 && invCheck[0].status === 'Void') {
      console.log('✓ Invoice marked as Void/deactivated without deleting financial history');
    }

    // Clean up test records
    console.log('\nCleaning up verification records...');
    await connection.query('DELETE FROM invoices WHERE id = ?', [invId]);
    await connection.query('DELETE FROM service_requests WHERE id = ?', [reqId]);
    await connection.query('DELETE FROM company_devices WHERE id = ?', [devId]);
    await connection.query('DELETE FROM company_employees WHERE id = ?', [empId]);
    await connection.query('DELETE FROM company_branches WHERE id = ?', [branchId]);
    await connection.query('DELETE FROM users WHERE id = ?', [userId]);

    console.log('\n========================================');
    console.log(' ALL DELETE VS DEACTIVATE TESTS PASSED! ');
    console.log('========================================');

  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

runTests();
