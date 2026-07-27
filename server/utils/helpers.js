const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Generates the next sequential invoice ID (e.g. inv-001, inv-002, ...)
 * @param {Object} connection - MySQL database connection/pool
 * @returns {Promise<string>} Next invoice ID
 */
const generateInvoiceId = async (connection) => {
  try {
    const [rows] = await connection.query(`
      SELECT id FROM invoices 
      WHERE id LIKE 'inv-%' 
      ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED) DESC 
      LIMIT 1
    `);

    if (rows.length === 0) {
      return 'inv-001';
    }

    const lastId = rows[0].id;
    const lastNum = parseInt(lastId.substring(4), 10);
    const nextNum = lastNum + 1;

    // Left pad with zeros (e.g. inv-001, inv-010, inv-100)
    const paddedNum = String(nextNum).padStart(3, '0');
    return `inv-${paddedNum}`;
  } catch (error) {
    // Fallback to random identifier if SQL fails
    return `inv-${uuidv4().substring(0, 8)}`;
  }
};

/**
 * Generates the next sequential quotation ID (e.g. qt-001, qt-002, ...)
 * @param {Object} connection - MySQL database connection/pool
 * @returns {Promise<string>} Next quotation ID
 */
const generateQuotationId = async (connection) => {
  try {
    const [rows] = await connection.query(`
      SELECT id FROM quotations 
      WHERE id LIKE 'qt-%' 
      ORDER BY CAST(SUBSTRING(id, 4) AS UNSIGNED) DESC 
      LIMIT 1
    `);

    if (rows.length === 0) {
      return 'qt-001';
    }

    const lastId = rows[0].id;
    const lastNum = parseInt(lastId.substring(3), 10);
    const nextNum = lastNum + 1;

    // Left pad with zeros (e.g. qt-001, qt-010, qt-100)
    const paddedNum = String(nextNum).padStart(3, '0');
    return `qt-${paddedNum}`;
  } catch (error) {
    // Fallback to random identifier if SQL fails
    return `qt-${uuidv4().substring(0, 8)}`;
  }
};

/**
 * Sanitizes a filename to make it safe for storage and cross-platform compatible.
 * Prefixing with UUID to prevent naming collisions.
 * @param {string} originalName - Original filename
 * @returns {string} Sanitized filename
 */
const sanitizeFilename = (originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, ext)
    .replace(/[^a-zA-Z0-9]/g, '_') // Replace non-alphanumeric with underscores
    .substring(0, 50);             // Cap length

  const uniqueId = uuidv4().substring(0, 8);
  return `${uniqueId}_${baseName}${ext}`;
};

/**
 * Generates the next sequential technician ID
 * @param {Object} connection - MySQL database connection
 * @returns {Promise<string>} Next technician ID (TD-TECH-XXX)
 */
const generateTechnicianId = async (connection) => {
  try {
    const [rows] = await connection.query(`
      SELECT technician_id FROM users 
      WHERE role = 'technician' AND technician_id LIKE 'TD-TECH-%'
      ORDER BY CAST(SUBSTRING(technician_id, 9) AS UNSIGNED) DESC LIMIT 1
    `);

    let nextNum = 1;
    if (rows.length > 0 && rows[0].technician_id) {
      const lastId = rows[0].technician_id.substring(8);
      nextNum = parseInt(lastId, 10) + 1;
    }

    return `TD-TECH-${String(nextNum).padStart(3, '0')}`;
  } catch (error) {
    return `TD-TECH-${uuidv4().substring(0, 6)}`;
  }
};

/**
 * Generates the next sequential ticket number
 * @param {Object} connection - MySQL database connection
 * @param {string} type - 'Individual', 'Company', or 'AMC'
 * @returns {Promise<string>} Next ticket number
 */
const generateTicketNumber = async (connection, type) => {
  let prefix = 'TD-';
  let regex = '^TD-[0-9]+$';

  if (type === 'AMC') {
    prefix = 'TD-AMC';
    regex = '^TD-AMC[0-9]+$';
  } else if (type === 'Company') {
    prefix = 'TD-C';
    regex = '^TD-C[0-9]+$';
  }

  try {
    const [rows] = await connection.query(`
      SELECT ticket_number FROM service_requests 
      WHERE ticket_number REGEXP ?
      ORDER BY CAST(SUBSTRING(ticket_number, ?) AS UNSIGNED) DESC LIMIT 1
    `, [regex, prefix.length + 1]);

    let nextNum = 1;
    if (rows.length > 0 && rows[0].ticket_number) {
      const lastId = rows[0].ticket_number.substring(prefix.length);
      nextNum = parseInt(lastId, 10) + 1;
    }

    return `${prefix}${String(nextNum).padStart(3, '0')} `;
  } catch (error) {
    return `${prefix}${uuidv4().substring(0, 6)} `;
  }
};


/**
 * Standard API Response Formatter
 * @param {boolean} success - Whether request succeeded
 * @param {string} message - User-friendly status message
 * @param {Object} [data] - Optional response payload
 * @returns {Object} Standard response object
 */
const formatResponse = (success, message, data = null) => {
  const response = {
    success,
    message
  };
  if (data !== null) {
    response.data = data;
  }
  return response;
};

module.exports = {
  generateInvoiceId,
  generateQuotationId,
  sanitizeFilename,
  generateTechnicianId,
  generateTicketNumber,
  formatResponse
};
