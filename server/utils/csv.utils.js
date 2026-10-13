/**
 * RFC 4180 compliant CSV Parser and Safe CSV Generator
 * Handles quoted fields, multiline cells, commas inside quotes,
 * and formula injection sanitization.
 */

function parseCsv(csvString) {
    if (!csvString || typeof csvString !== 'string') return { headers: [], data: [], rawRows: [] };
    
    // Normalize newlines
    const str = csvString.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    let i = 0;

    while (i < str.length) {
        const char = str[i];
        const nextChar = str[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                // Escaped quote
                currentCell += '"';
                i += 2;
                continue;
            } else if (char === '"') {
                // Closing quote
                inQuotes = false;
                i++;
                continue;
            } else {
                currentCell += char;
                i++;
                continue;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
                i++;
                continue;
            } else if (char === ',') {
                currentRow.push(currentCell.trim());
                currentCell = '';
                i++;
                continue;
            } else if (char === '\n') {
                currentRow.push(currentCell.trim());
                // Only push non-empty rows
                if (currentRow.some(c => c.length > 0)) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentCell = '';
                i++;
                continue;
            } else {
                currentCell += char;
                i++;
                continue;
            }
        }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c.length > 0)) {
            rows.push(currentRow);
        }
    }

    if (rows.length === 0) return { headers: [], data: [], rawRows: [] };

    const headers = rows[0].map(h => h.toLowerCase().trim().replace(/[\s_-]+/g, '_'));
    const data = [];

    const sanitizeCell = (val) => {
        if (!val || typeof val !== 'string') return '';
        let str = val.trim();
        // Disarm spreadsheet formula injection (=, +, -, @, tab, return)
        if (/^[=+\-@\t\r]/.test(str)) {
            str = str.replace(/^[=+\-@\t\r]+/, '');
        }
        return str;
    };

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const item = {};
        headers.forEach((header, idx) => {
            item[header] = row[idx] !== undefined ? sanitizeCell(row[idx]) : '';
        });
        data.push(item);
    }

    return { headers, data, rawRows: rows };
}

/**
 * Escapes a cell for CSV export and sanitizes against CSV formula injection
 */
function escapeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    
    // Prevent CSV Formula Injection (=, +, -, @, \t, \r)
    if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
    }

    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
}

function generateCsv(headers, rows) {
    const headerLine = headers.map(h => escapeCsvCell(h.label || h.key || h)).join(',');
    const dataLines = rows.map(row => {
        return headers.map(h => {
            const key = typeof h === 'object' ? h.key : h;
            return escapeCsvCell(row[key]);
        }).join(',');
    });
    return [headerLine, ...dataLines].join('\r\n');
}

module.exports = {
    parseCsv,
    escapeCsvCell,
    generateCsv
};
