const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * ── Formula Injection Protection ──────────────────────────────────────────
 * Distinguishes legitimate business data (negative numbers, international phone
 * numbers, serial codes, ordinary text) from active spreadsheet formula payloads
 * (=, @, +, -, \t, \r combined with commands or calculation expressions).
 */

function isNumericString(val) {
    if (val === null || val === undefined) return false;
    if (typeof val === 'number') return !isNaN(val);
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    if (!trimmed) return false;
    return /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed);
}

function isPhoneNumberString(val) {
    if (val === null || val === undefined || typeof val !== 'string') return false;
    const trimmed = val.trim();
    if (!/^\+\d[\d\s\-().]{6,}$/.test(trimmed)) {
        return false;
    }
    const digits = trimmed.match(/\d/g);
    return Boolean(digits && digits.length >= 7 && digits.length <= 16);
}

function isFormulaPayload(val) {
    if (val === null || val === undefined) return false;
    const str = String(val);
    if (!str) return false;

    // Tab, Carriage Return, or Newline at start (CSV injection trick to hide formula starter)
    if (/^[\t\r\n]/.test(str)) {
        return true;
    }

    const trimmed = str.trim();
    if (!trimmed) return false;

    // Pure numeric values (e.g. -45.2, +50, -100) and phone numbers (e.g. +919876543210) are safe
    if (isNumericString(trimmed) || isPhoneNumberString(trimmed)) {
        return false;
    }

    // Formulas always start with '='
    if (trimmed.startsWith('=')) {
        return true;
    }

    // Formulas starting with '@' followed by function/command name
    if (/^@[a-zA-Z_]/.test(trimmed)) {
        return true;
    }

    // Starts with '+' or '-' and contains commands, functions, or arithmetic expressions
    if (/^[+-]/.test(trimmed)) {
        // DDE command syntax: contains pipe '|'
        if (trimmed.includes('|')) return true;

        // Command/shell execution keywords
        if (/(?:cmd|powershell|calc|bash|exec|sh|mshta|certutil|rundll32|wscript|cscript)/i.test(trimmed)) {
            return true;
        }

        // Spreadsheet functions: e.g. +SUM(, -AVERAGE(, +HYPERLINK(
        if (/^[+-]\s*[a-zA-Z_][a-zA-Z0-9._]*\s*\(/i.test(trimmed)) {
            return true;
        }

        // Expression evaluation: e.g. +1+2, -5*3, +10/2
        if (/^[+-]\s*\d+[\s]*[+\-*\/^%]\s*[\d(]/i.test(trimmed)) {
            return true;
        }

        // Suspicious protocol triggers: +http://, -file://
        if (/^[+-]\s*(?:https?|ftp|file|javascript):/i.test(trimmed)) {
            return true;
        }
    }

    return false;
}

function shouldUnwrapExportEscape(str) {
    if (!str || typeof str !== 'string' || !str.startsWith("'") || str.length <= 1) {
        return false;
    }
    const unquoted = str.substring(1);
    const trimmed = unquoted.trim();

    // 1. Escaped tab, carriage return, or newline
    if (/^[\t\r\n]/.test(unquoted)) {
        return true;
    }

    // 2. Escaped formula starter (= or @)
    if (/^[=@]/.test(trimmed)) {
        return true;
    }

    // 3. Escaped active formula payload
    if (isFormulaPayload(unquoted) || isFormulaPayload(trimmed)) {
        return true;
    }

    // 4. Escaped text starting with + or - that was escaped for Excel protection
    // (e.g. "'- Screen flickering", "'+ Priority ticket")
    if (/^[+-]/.test(trimmed) && !isNumericString(trimmed) && !isPhoneNumberString(trimmed)) {
        return true;
    }

    // 5. Also support older exports or user entries where ' was prepended to signed numbers/phones
    if (/^[+-]/.test(trimmed) && (isNumericString(trimmed) || isPhoneNumberString(trimmed))) {
        return true;
    }

    return false;
}

function disarmFormula(val) {
    if (val === null || val === undefined) return '';
    let str = String(val);

    // Strip leading single quote ONLY if it was used as an export safety escape.
    // Legitimate user apostrophes (e.g. "'Tis the season", "'Hello World'", "'John's device'") are preserved.
    if (shouldUnwrapExportEscape(str)) {
        str = str.substring(1);
    }

    // Disarm only active formula payloads (leave valid negative numbers, phone numbers, ordinary text intact)
    if (isFormulaPayload(str)) {
        str = str.replace(/^[\t\r\n\s]+/, '');
        str = str.replace(/^[=+\-@]+/, '');
    }

    return str.trim();
}

function escapeForExport(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (!str) return '';

    // Tab, Carriage Return, or Newline at start (CSV injection trick)
    if (/^[\t\r\n]/.test(str)) {
        return "'" + str;
    }

    const trimmed = str.trim();

    // Legitimate numbers (e.g. -45.2, 100, 0.05) are safe in spreadsheets and should NOT be quoted
    if (isNumericString(trimmed)) {
        return str;
    }

    // Legitimate phone numbers (e.g. +919876543210, +1 (555) 234-5678) are safe and should NOT be quoted
    if (isPhoneNumberString(trimmed)) {
        return str;
    }

    // Active formula payloads or text starting with '=' or '@'
    if (isFormulaPayload(trimmed) || /^[=@]/.test(trimmed)) {
        return "'" + str;
    }

    // Any text starting with '+' or '-' that is not a pure number or phone number
    // Prepending single quote prevents spreadsheet software from evaluating it as a formula or showing #NAME?
    if (/^[+-]/.test(trimmed)) {
        return "'" + str;
    }

    return str;
}

/**
 * ── RFC 4180 CSV Parser ───────────────────────────────────────────────────
 */
function parseCsv(csvString) {
    if (!csvString || typeof csvString !== 'string') return { headers: [], data: [], rawRows: [] };

    // Strip UTF-8 BOM if present
    const cleanStr = csvString.charCodeAt(0) === 0xFEFF ? csvString.slice(1) : csvString;
    const str = cleanStr.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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
                currentCell += '"';
                i += 2;
                continue;
            } else if (char === '"') {
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

    // Normalize header keys: lowercase, trim, replace spaces/hyphens with underscores
    const rawHeaders = rows[0];
    const headers = rawHeaders.map(h => normalizeHeaderKey(h));
    const data = [];

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const item = {};
        headers.forEach((header, idx) => {
            if (header) {
                const cellVal = row[idx] !== undefined ? row[idx] : '';
                item[header] = disarmFormula(cellVal);
            }
        });
        data.push(item);
    }

    return { headers, rawHeaders, data, rawRows: rows };
}

/**
 * ── Excel (.xlsx) Parser via ExcelJS ──────────────────────────────────────
 */
async function parseExcel(filePathOrBuffer) {
    const workbook = new ExcelJS.Workbook();
    if (Buffer.isBuffer(filePathOrBuffer)) {
        await workbook.xlsx.load(filePathOrBuffer);
    } else {
        await workbook.xlsx.readFile(filePathOrBuffer);
    }

    // Pick the first worksheet
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        return { headers: [], rawHeaders: [], data: [], rawRows: [] };
    }

    const rawRows = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
        const rowVals = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            // ExcelJS 1-based index
            let val = cell.text !== undefined ? cell.text : cell.value;
            if (val === null || val === undefined) {
                val = '';
            } else if (typeof val === 'object') {
                if (val instanceof Date) {
                    val = formatDateSafe(val);
                } else if (val.result !== undefined) {
                    val = String(val.result);
                } else if (val.richText) {
                    val = val.richText.map(t => t.text).join('');
                } else {
                    val = String(val);
                }
            } else {
                val = String(val);
            }
            rowVals[colNumber - 1] = val.trim();
        });
        if (rowVals.some(v => v && v.length > 0)) {
            rawRows.push(rowVals);
        }
    });

    if (rawRows.length === 0) {
        return { headers: [], rawHeaders: [], data: [], rawRows: [] };
    }

    const rawHeaders = rawRows[0];
    const headers = rawHeaders.map(h => normalizeHeaderKey(h));
    const data = [];

    for (let r = 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        const item = {};
        headers.forEach((header, idx) => {
            if (header) {
                const cellVal = row[idx] !== undefined ? row[idx] : '';
                item[header] = disarmFormula(cellVal);
            }
        });
        data.push(item);
    }

    return { headers, rawHeaders, data, rawRows };
}

/**
 * Normalizes header string to clean canonical key
 */
function normalizeHeaderKey(header) {
    if (!header || typeof header !== 'string') return '';
    return header
        .trim()
        .toLowerCase()
        .replace(/[\s\-_.]+/g, '_')
        .replace(/[^\w]/g, '');
}

/**
 * ── Unified Spreadsheet Parser (detects CSV vs XLSX) ─────────────────────
 */
async function parseSpreadsheet(filePathOrBuffer, originalFilename = '') {
    const filename = originalFilename || (typeof filePathOrBuffer === 'string' ? filePathOrBuffer : '');
    const ext = path.extname(filename).toLowerCase();

    if (ext === '.xls') {
        const err = new Error('Legacy Excel 97-2003 (.xls) files are not supported. Please save or export your spreadsheet as an Excel Workbook (.xlsx) or CSV (.csv).');
        err.statusCode = 400;
        throw err;
    }

    if (ext === '.xlsx') {
        return await parseExcel(filePathOrBuffer);
    }

    if (Buffer.isBuffer(filePathOrBuffer)) {
        return parseCsv(filePathOrBuffer.toString('utf-8'));
    }

    if (typeof filePathOrBuffer === 'string') {
        if (filePathOrBuffer.includes('\n') || filePathOrBuffer.includes('\r') || filePathOrBuffer.startsWith('\uFEFF')) {
            return parseCsv(filePathOrBuffer);
        }
        if (fs.existsSync(filePathOrBuffer)) {
            const content = fs.readFileSync(filePathOrBuffer, 'utf-8');
            return parseCsv(content);
        }
        return parseCsv(filePathOrBuffer);
    }

    return { headers: [], rawHeaders: [], data: [], rawRows: [] };
}

/**
 * ── CSV Generator ─────────────────────────────────────────────────────────
 */
function escapeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    let str = escapeForExport(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
}

function generateCsv(headers, rows) {
    const headerLine = headers.map(h => escapeCsvCell(h.label || h.header || h.key || h)).join(',');
    const dataLines = rows.map(row => {
        return headers.map(h => {
            const key = typeof h === 'object' ? h.key : h;
            return escapeCsvCell(row[key]);
        }).join(',');
    });
    // Prepend UTF-8 BOM so Excel opens CSV without character encoding glitches
    return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

/**
 * ── Excel (.xlsx) Generator via ExcelJS ───────────────────────────────────
 */
async function generateExcel({ sheetName = 'Data', columns = [], rows = [], instructions = null }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TekDoctor';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(sheetName, {
        views: [{ state: 'frozen', ySplit: 1 }]
    });

    // Setup columns with width
    worksheet.columns = columns.map(col => ({
        header: col.label || col.header || col.key,
        key: col.key,
        width: col.width || Math.max(16, (col.label || col.key).length + 4)
    }));

    // Style Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' } // Slate-800
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
    headerRow.height = 26;

    // Add data rows
    rows.forEach(row => {
        const rowData = {};
        columns.forEach(col => {
            let val = row[col.key];
            if (val === null || val === undefined) {
                rowData[col.key] = '';
            } else {
                rowData[col.key] = escapeForExport(val);
            }
        });
        const addedRow = worksheet.addRow(rowData);
        addedRow.alignment = { vertical: 'middle', horizontal: 'left' };
        
        // Ensure string/identifier columns retain text format (prevent leading zero drop)
        columns.forEach((col, idx) => {
            const cell = addedRow.getCell(idx + 1);
            if (col.isText || typeof row[col.key] === 'string') {
                cell.numFmt = '@';
            }
        });
    });

    // Add optional Instructions worksheet
    if (instructions && Array.isArray(instructions.fields)) {
        const instSheet = workbook.addWorksheet('Instructions');
        instSheet.columns = [
            { header: 'Column Name', key: 'name', width: 22 },
            { header: 'Required / Optional', key: 'required', width: 20 },
            { header: 'Accepted Values & Constraints', key: 'rules', width: 45 },
            { header: 'Example', key: 'example', width: 28 }
        ];

        const instHeader = instSheet.getRow(1);
        instHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        instHeader.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF2563EB' } // Blue-600
        };
        instHeader.height = 24;

        instructions.fields.forEach(f => {
            instSheet.addRow({
                name: f.name,
                required: f.required ? 'MANDATORY (Required)' : 'Optional',
                rules: f.rules || '',
                example: f.example || ''
            });
        });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
}

/**
 * ── Unified Spreadsheet Generator ─────────────────────────────────────────
 */
async function generateSpreadsheet({ format = 'csv', sheetName = 'Data', columns = [], rows = [], instructions = null }) {
    if (format === 'xlsx') {
        const buffer = await generateExcel({ sheetName, columns, rows, instructions });
        return {
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            extension: 'xlsx',
            data: buffer
        };
    } else {
        const csvString = generateCsv(columns, rows);
        return {
            contentType: 'text/csv; charset=utf-8',
            extension: 'csv',
            data: csvString
        };
    }
}

/**
 * Helper: Safely parses dates from spreadsheets (supports YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, Date obj)
 */
function parseDateSafe(val) {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val.getTime())) {
        return val.toISOString().split('T')[0];
    }
    const str = String(val).trim();
    if (!str) return null;

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return str;
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const matchDmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (matchDmy) {
        const day = matchDmy[1].padStart(2, '0');
        const month = matchDmy[2].padStart(2, '0');
        const year = matchDmy[3];
        const iso = `${year}-${month}-${day}`;
        const d = new Date(iso);
        if (!isNaN(d.getTime())) return iso;
    }

    // Try generic Date parsing
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }
    return null;
}

function formatDateSafe(val) {
    if (!val) return '';
    try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0];
        }
    } catch (_) {}
    return String(val);
}

module.exports = {
    isNumericString,
    isPhoneNumberString,
    isFormulaPayload,
    shouldUnwrapExportEscape,
    disarmFormula,
    escapeForExport,
    parseCsv,
    parseExcel,
    parseSpreadsheet,
    escapeCsvCell,
    generateCsv,
    generateExcel,
    generateSpreadsheet,
    normalizeHeaderKey,
    parseDateSafe,
    formatDateSafe
};
