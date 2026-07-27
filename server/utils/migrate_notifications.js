const { pool } = require('../config/db.config');
const logger = require('./logger');

const runMigration = async () => {
    let connection;
    try {
        connection = await pool.getConnection();
        logger.info('Running notifications table migration...');
        const query = `
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
        await connection.query(query);
        logger.info('Successfully created notifications table.');
        process.exit(0);
    } catch (err) {
        logger.error('Migration failed: ' + err.message);
        process.exit(1);
    } finally {
        if (connection) connection.release();
    }
};

runMigration();
