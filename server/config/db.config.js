const mysql = require('mysql2/promise');
const config = require('./app.config');

// Create a connection pool to the MySQL database
const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: config.db.waitForConnections,
  connectionLimit: config.db.connectionLimit,
  queueLimit: config.db.queueLimit
});

// Test connection helper
const testConnection = async () => {
  try {
    // Local development may create an empty database. Production users must provision it first.
    if (!config.isProduction) {
      const tempConn = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password
      });
      await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await tempConn.end();
    }

    // Verify the pool connection (which uses the configured database name).
    const connection = await pool.getConnection();
    console.log('MySQL Database connection established successfully.');
    connection.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
};

module.exports = {
  pool,
  testConnection
};
