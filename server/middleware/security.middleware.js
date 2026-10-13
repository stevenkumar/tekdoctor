const fs = require('fs');
const path = require('path');
const { formatResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * 1. Prototype Pollution Prevention Middleware
 * Recursively inspects incoming request objects (body, query, params)
 * and rejects any payload attempting to modify Object prototypes.
 */
const checkPrototypePollution = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    
    // Check direct keys
    if (Object.prototype.hasOwnProperty.call(obj, '__proto__') ||
        Object.prototype.hasOwnProperty.call(obj, 'constructor') ||
        Object.prototype.hasOwnProperty.call(obj, 'prototype')) {
        return true;
    }

    for (const key of Object.keys(obj)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            return true;
        }
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            if (checkPrototypePollution(obj[key])) {
                return true;
            }
        }
    }
    return false;
};

const preventPrototypePollution = (req, res, next) => {
    if (checkPrototypePollution(req.body) || checkPrototypePollution(req.query) || checkPrototypePollution(req.params)) {
        logger.warn(`Prototype pollution attempt detected and blocked from IP: ${req.ip}`);
        return res.status(400).json(formatResponse(false, 'Malicious payload detected (prototype pollution attempt).'));
    }
    next();
};

/**
 * 2. Text & Input Sanitizer Helper
 * Strips script tags, iframe, javascript: URLs, and control characters
 * while safely preserving legitimate user text, newlines, and unicode.
 */
const sanitizeText = (val) => {
    if (typeof val !== 'string') return val;
    return val
        // Strip null bytes and control characters (except common whitespace \t, \n, \r)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Strip script tags
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        // Strip iframe tags
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        // Strip javascript: pseudoprotocol
        .replace(/javascript:[^"'\s]*/gi, '')
        // Strip onerror/onload/onclick event handlers
        .replace(/\bon\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .trim();
};

const sanitizeRequestPayload = (req, res, next) => {
    const sanitizeRecursive = (target) => {
        if (!target || typeof target !== 'object') return;
        for (const key of Object.keys(target)) {
            if (typeof target[key] === 'string') {
                target[key] = sanitizeText(target[key]);
            } else if (typeof target[key] === 'object' && target[key] !== null) {
                sanitizeRecursive(target[key]);
            }
        }
    };

    if (req.body && typeof req.body === 'object') {
        sanitizeRecursive(req.body);
    }
    if (req.query && typeof req.query === 'object') {
        sanitizeRecursive(req.query);
    }

    next();
};

/**
 * 3. Protected Fields Guard (Mass Assignment Prevention)
 * Strips sensitive fields that normal clients must not override.
 */
const stripProtectedFields = (fieldsToProtect = ['role', 'is_active', 'token_version', 'payment_status', 'customer_approval_status', 'user_id', 'company_id']) => {
    return (req, res, next) => {
        // Only enforce for non-admin users or unauthenticated routes
        if (!req.user || req.user.role !== 'admin') {
            if (req.body && typeof req.body === 'object') {
                for (const field of fieldsToProtect) {
                    if (field in req.body) {
                        delete req.body[field];
                    }
                }
            }
        }
        next();
    };
};

/**
 * 4. Magic Byte File Signature Verification Middleware
 * Validates the first few bytes of uploaded files on disk to confirm
 * their binary signatures match allowed image or document formats.
 * Prevents executable/script disguises (.php/.exe named .png).
 */
const MAGIC_SIGNATURES = {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    png: (buf) => buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47,
    // JPEG/JPG: FF D8 FF
    jpeg: (buf) => buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF,
    // WEBP: 'RIFF' .... 'WEBP'
    webp: (buf) => buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
                   buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50,
    // PDF: '%PDF' (25 50 44 46)
    pdf: (buf) => buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46
};

const verifyFileSignature = (filePath) => {
    if (!fs.existsSync(filePath)) return true;
    
    // Read first 16 bytes
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.png') return MAGIC_SIGNATURES.png(buffer);
    if (ext === '.jpg' || ext === '.jpeg') return MAGIC_SIGNATURES.jpeg(buffer);
    if (ext === '.webp') return MAGIC_SIGNATURES.webp(buffer);
    if (ext === '.pdf') return MAGIC_SIGNATURES.pdf(buffer);

    // For CSV and plain text, verify no binary control bytes (NUL, etc.)
    if (ext === '.csv' || ext === '.txt') {
        for (let i = 0; i < buffer.length; i++) {
            if (buffer[i] === 0x00) return false; // Contains null byte
        }
        return true;
    }

    // For any other extension (including disguised .php/.exe named .png), reject.
    // Only the whitelisted formats above are accepted for uploads.
    return false;
};

const verifyUploadSignatures = (req, res, next) => {
    const filesToVerify = [];

    if (req.file) {
        filesToVerify.push(req.file);
    }
    if (req.files) {
        if (Array.isArray(req.files)) {
            filesToVerify.push(...req.files);
        } else if (typeof req.files === 'object') {
            for (const key of Object.keys(req.files)) {
                if (Array.isArray(req.files[key])) {
                    filesToVerify.push(...req.files[key]);
                }
            }
        }
    }

    for (const file of filesToVerify) {
        if (file && file.path) {
            const isValid = verifyFileSignature(file.path);
            if (!isValid) {
                // Delete the malicious or corrupted file immediately
                try {
                    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
                } catch (err) {
                    logger.error(`Failed to clean up rejected file: ${err.message}`);
                }
                logger.warn(`Rejected file with mismatched binary signature: ${file.originalname} (${file.mimetype})`);
                return res.status(400).json(formatResponse(false, `Invalid or corrupted file content: ${file.originalname}. The file signature does not match its declared type.`));
            }
        }
    }

    next();
};

module.exports = {
    preventPrototypePollution,
    sanitizeRequestPayload,
    sanitizeText,
    stripProtectedFields,
    verifyUploadSignatures
};
