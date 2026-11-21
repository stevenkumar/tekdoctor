const assert = require('assert');
const { pool } = require('../config/db.config');
const initDatabase = require('../models/db.init');
const { getSetting, getBooleanSetting, getIntSetting } = require('../utils/settings');

// Helper to check table existence via information_schema
const checkTableExists = async (connection, tableName) => {
  const [rows] = await connection.query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [tableName]
  );
  return rows.length > 0;
};

// Helper to check index existence via information_schema
const checkIndexExists = async (connection, tableName, indexName) => {
  const [rows] = await connection.query(
    'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    [tableName, indexName]
  );
  return rows.length > 0;
};

const runSuite = async () => {
  console.log('====================================================');
  console.log('TEST SUITE: AMC Checkout Schema & Settings Utilities');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  const test = (desc, fn) => {
    try {
      fn();
      passed++;
      console.log(`  ✓ [PASS] ${desc}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ [FAIL] ${desc}: ${err.message}`);
    }
  };

  const testAsync = async (desc, fn) => {
    try {
      await fn();
      passed++;
      console.log(`  ✓ [PASS] ${desc}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ [FAIL] ${desc}: ${err.message}`);
    }
  };

  let connection;
  try {
    connection = await pool.getConnection();

    // 1. Run migration once
    console.log('[Step 1] Running initDatabase() - First execution (apply/baseline)');
    await initDatabase();
    console.log('  ✓ First initDatabase() succeeded without error.\n');

    // 2. Run migration a second time to verify idempotency
    console.log('[Step 2] Running initDatabase() - Second execution (idempotency check)');
    await initDatabase();
    console.log('  ✓ Second initDatabase() succeeded without error (idempotent).\n');

    // 3. Verify amc_checkouts table exists
    console.log('[Step 3] Verifying amc_checkouts table structure and indexes');
    const tableExists = await checkTableExists(connection, 'amc_checkouts');
    test('Table amc_checkouts exists in database', () => {
      assert.strictEqual(tableExists, true, 'amc_checkouts table must exist');
    });

    // 4. Verify indexes
    const emailIdx = await checkIndexExists(connection, 'amc_checkouts', 'idx_chk_email');
    test('Index idx_chk_email exists on amc_checkouts', () => {
      assert.strictEqual(emailIdx, true, 'idx_chk_email index must exist');
    });

    const statusIdx = await checkIndexExists(connection, 'amc_checkouts', 'idx_chk_status');
    test('Index idx_chk_status exists on amc_checkouts', () => {
      assert.strictEqual(statusIdx, true, 'idx_chk_status index must exist');
    });

    const expiresIdx = await checkIndexExists(connection, 'amc_checkouts', 'idx_chk_expires_at');
    test('Index idx_chk_expires_at exists on amc_checkouts', () => {
      assert.strictEqual(expiresIdx, true, 'idx_chk_expires_at index must exist');
    });

    // 5. Verify columns
    const [cols] = await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'amc_checkouts'
    `);
    const colMap = new Map(cols.map(c => [c.COLUMN_NAME, c]));

    test('All required columns exist with proper definitions', () => {
      assert(colMap.has('id'), 'Column id must exist');
      assert(colMap.has('checkout_token'), 'Column checkout_token must exist');
      assert(colMap.has('source'), 'Column source must exist');
      assert(colMap.has('company_user_id'), 'Column company_user_id must exist');
      assert(colMap.has('plan_id'), 'Column plan_id must exist');
      assert(colMap.has('plan_code'), 'Column plan_code must exist');
      assert(colMap.has('plan_name'), 'Column plan_name must exist');
      assert(colMap.has('device_capacity'), 'Column device_capacity must exist');
      assert(colMap.has('duration_months'), 'Column duration_months must exist');
      assert(colMap.has('price'), 'Column price must exist');
      assert(colMap.has('discount_amount'), 'Column discount_amount must exist');
      assert(colMap.has('tax_amount'), 'Column tax_amount must exist');
      assert(colMap.has('total_amount'), 'Column total_amount must exist');
      assert(colMap.has('currency'), 'Column currency must exist');
      assert(colMap.has('company_name'), 'Column company_name must exist');
      assert(colMap.has('contact_person'), 'Column contact_person must exist');
      assert(colMap.has('email'), 'Column email must exist');
      assert(colMap.has('phone'), 'Column phone must exist');
      assert(colMap.has('address'), 'Column address must exist');
      assert(colMap.has('state'), 'Column state must exist');
      assert(colMap.has('gst_number'), 'Column gst_number must exist');
      assert(colMap.has('password_hash'), 'Column password_hash must exist');
      assert(colMap.has('razorpay_order_id'), 'Column razorpay_order_id must exist');
      assert(colMap.has('razorpay_payment_id'), 'Column razorpay_payment_id must exist');
      assert(colMap.has('status'), 'Column status must exist');
      assert(colMap.has('provisioned_user_id'), 'Column provisioned_user_id must exist');
      assert(colMap.has('contract_id'), 'Column contract_id must exist');
      assert(colMap.has('error_message'), 'Column error_message must exist');
      assert(colMap.has('attempts'), 'Column attempts must exist');
      assert(colMap.has('expires_at'), 'Column expires_at must exist');
      assert(colMap.has('created_at'), 'Column created_at must exist');
      assert(colMap.has('updated_at'), 'Column updated_at must exist');
    });

    // 6. Verify seeded site_settings keys and default values
    console.log('\n[Step 4] Verifying site_settings keys and seeded defaults');
    const expectedSettings = {
      company_self_registration_enabled: 'true',
      amc_self_serve_enabled: 'true',
      amc_auto_approve_replacements: 'true',
      amc_replacement_max_swaps: '2',
      amc_checkout_expiry_minutes: '60'
    };

    for (const [key, expectedVal] of Object.entries(expectedSettings)) {
      const [rows] = await connection.query(
        'SELECT setting_value, setting_group FROM site_settings WHERE setting_key = ?',
        [key]
      );
      test(`Setting '${key}' exists with expected default '${expectedVal}' and group 'amc'`, () => {
        assert(rows.length > 0, `Setting ${key} must exist in site_settings`);
        assert.strictEqual(rows[0].setting_value, expectedVal, `${key} value must match`);
        assert.strictEqual(rows[0].setting_group, 'amc', `${key} group must be 'amc'`);
      });
    }

    // 7. Verify settings.js utility functions
    console.log('\n[Step 5] Verifying server/utils/settings.js helpers');
    await testAsync('getSetting returns default for a missing key', async () => {
      const val = await getSetting('missing_test_key_xyz_999', 'my_default_val', connection);
      assert.strictEqual(val, 'my_default_val');
    });

    await testAsync('getSetting returns string value for an existing key', async () => {
      const val = await getSetting('amc_checkout_expiry_minutes', 'default', connection);
      assert.strictEqual(val, '60');
    });

    await testAsync('getBooleanSetting returns fallback default for missing key', async () => {
      const valTrue = await getBooleanSetting('missing_bool_key', true, connection);
      const valFalse = await getBooleanSetting('missing_bool_key', false, connection);
      assert.strictEqual(valTrue, true);
      assert.strictEqual(valFalse, false);
    });

    await testAsync('getBooleanSetting parses boolean values correctly', async () => {
      const selfReg = await getBooleanSetting('company_self_registration_enabled', false, connection);
      assert.strictEqual(selfReg, true);

      const selfServe = await getBooleanSetting('amc_self_serve_enabled', false, connection);
      assert.strictEqual(selfServe, true);

      const autoApprove = await getBooleanSetting('amc_auto_approve_replacements', false, connection);
      assert.strictEqual(autoApprove, true);
    });

    await testAsync('getIntSetting returns fallback default for missing key or NaN', async () => {
      const missingInt = await getIntSetting('missing_int_key', 42, connection);
      assert.strictEqual(missingInt, 42);
    });

    await testAsync('getIntSetting parses integers correctly', async () => {
      const expiryMin = await getIntSetting('amc_checkout_expiry_minutes', 0, connection);
      assert.strictEqual(expiryMin, 60);

      const maxSwaps = await getIntSetting('amc_replacement_max_swaps', 0, connection);
      assert.strictEqual(maxSwaps, 2);
    });

    // Also test without passing connection explicitly (uses default conn = pool)
    await testAsync('Helpers work with default pool connection', async () => {
      const raw = await getSetting('amc_checkout_expiry_minutes');
      assert.strictEqual(raw, '60');

      const boolVal = await getBooleanSetting('amc_self_serve_enabled');
      assert.strictEqual(boolVal, true);

      const intVal = await getIntSetting('amc_checkout_expiry_minutes');
      assert.strictEqual(intVal, 60);
    });

  } catch (err) {
    console.error('[Error] Test suite encountered fatal error:', err);
    failed++;
  } finally {
    if (connection) connection.release();
    console.log('\n====================================================');
    console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
    console.log('====================================================');
    try {
      await pool.end();
    } catch (_) {}
    process.exit(failed > 0 ? 1 : 0);
  }
};

runSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
