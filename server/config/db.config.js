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
    // 1. First ensure the database itself exists by creating a temporary connection without database name
    try {
      const tempConn = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password
      });
      await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await tempConn.end();
    } catch (createErr) {
      // Ignored: On cPanel or shared hosting, users do not have CREATE DATABASE privileges. Assuming DB already exists via cPanel UI.
    }

    // 2. Now verify the pool connection (which uses the database name)
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
