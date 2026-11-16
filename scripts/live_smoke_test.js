#!/usr/bin/env node
/**
 * ============================================================================
 * TekDoctor — Live Production Smoke Test & Security Verification Suite
 * ============================================================================
 * Non-destructive verification script testing frontend assets, security
 * boundaries, public APIs, and rate limiter sanity against production.
 *
 * Usage:
 *   node scripts/live_smoke_test.js [BASE_URL] [--allow-edge-403]
 * Default BASE_URL: https://thetekdoctor.com
 * ============================================================================
 */

const args = process.argv.slice(2);
const allowEdge403 = args.includes('--allow-edge-403') || process.env.ALLOW_EDGE_403 === 'true';
const urlArg = args.find(a => !a.startsWith('--'));
const BASE_URL = (urlArg || process.env.BASE_URL || 'https://thetekdoctor.com').replace(/\/+$/, '');

// Color helper for terminal output
const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    brightRed: '\x1b[91m',
    brightGreen: '\x1b[92m'
};

const results = [];

/**
 * Record a test result
 */
function recordResult({ category, name, endpoint, expectedStatus, actualStatus, latencyMs, passed, details }) {
    results.push({
        category,
        name,
        endpoint,
        expectedStatus,
        actualStatus,
        latencyMs: Math.round(latencyMs),
        passed,
        details
    });
}

/**
 * Execute a timed HTTP request
 */
async function timedFetch(url, options = {}) {
    const start = performance.now();
    try {
        const response = await fetch(url, options);
        const duration = performance.now() - start;
        return { response, duration, error: null };
    } catch (err) {
        const duration = performance.now() - start;
        return { response: null, duration, error: err };
    }
}

/**
 * 1. Frontend & Static Assets Tests
 */
async function testFrontendAndAssets() {
    console.log(`\n${colors.cyan}[1/4] Testing Frontend & Static Assets...${colors.reset}`);

    // 1.1 GET / -> HTTP 200, Cache-Control: no-cache / no-store
    let rootHtml = '';
    {
        const url = `${BASE_URL}/`;
        const { response, duration, error } = await timedFetch(url);

        if (error) {
            recordResult({
                category: 'Frontend & Static Assets',
                name: 'Root HTML Document (GET /)',
                endpoint: '/',
                expectedStatus: 200,
                actualStatus: 'ERR',
                latencyMs: duration,
                passed: false,
                details: `Network error: ${error.message}`
            });
        } else {
            const status = response.status;
            const cacheControl = (response.headers.get('cache-control') || '').toLowerCase();
            rootHtml = await response.text();

            const statusOk = status === 200;
            const cacheOk = cacheControl.includes('no-cache') || cacheControl.includes('no-store');
            const passed = statusOk && cacheOk;

            recordResult({
                category: 'Frontend & Static Assets',
                name: 'Root HTML Document (GET /)',
                endpoint: '/',
                expectedStatus: 200,
                actualStatus: status,
                latencyMs: duration,
                passed,
                details: `Cache-Control: "${cacheControl || 'none'}" (${cacheOk ? 'valid no-cache' : 'missing no-cache'})`
            });
        }
    }

    // 1.2 Extract and fetch /assets/*.js bundle -> HTTP 200, application/javascript
    {
        // Search for JS bundles in HTML <script src="...">
        const jsMatch = rootHtml.match(/src=["'](\/assets\/[^"']+\.js)["']/i) ||
                        rootHtml.match(/src=["']([^"']+\/assets\/[^"']+\.js)["']/i) ||
                        rootHtml.match(/src=["']([^"']+\.js)["']/i);

        if (!jsMatch) {
            recordResult({
                category: 'Frontend & Static Assets',
                name: 'Vite JS Bundle Integrity',
                endpoint: '/assets/*.js',
                expectedStatus: 200,
                actualStatus: 'N/A',
                latencyMs: 0,
                passed: false,
                details: 'Could not extract JS bundle script tag from root HTML'
            });
        } else {
            let scriptPath = jsMatch[1];
            let fullAssetUrl = scriptPath.startsWith('http')
                ? scriptPath
                : `${BASE_URL}${scriptPath.startsWith('/') ? '' : '/'}${scriptPath}`;

            const { response, duration, error } = await timedFetch(fullAssetUrl);

            if (error) {
                recordResult({
                    category: 'Frontend & Static Assets',
                    name: 'Vite JS Bundle Integrity',
                    endpoint: scriptPath,
                    expectedStatus: 200,
                    actualStatus: 'ERR',
                    latencyMs: duration,
                    passed: false,
                    details: `Fetch error: ${error.message}`
                });
            } else {
                const status = response.status;
                const contentType = (response.headers.get('content-type') || '').toLowerCase();
                const statusOk = status === 200;
                const typeOk = contentType.includes('javascript');
                const passed = statusOk && typeOk;

                recordResult({
                    category: 'Frontend & Static Assets',
                    name: 'Vite JS Bundle Integrity',
                    endpoint: scriptPath.length > 35 ? `...${scriptPath.slice(-32)}` : scriptPath,
                    expectedStatus: 200,
                    actualStatus: status,
                    latencyMs: duration,
                    passed,
                    details: `Content-Type: "${contentType}" (${typeOk ? 'valid JS' : 'invalid MIME'})`
                });
            }
        }
    }
}

/**
 * 2. Security Boundaries Tests (Must Block)
 */
async function testSecurityBoundaries() {
    console.log(`${colors.cyan}[2/4] Testing Security Boundaries (Must Block)...${colors.reset}`);

    // 2.1 GET /tekdoctor_db.sql -> must return 404
    {
        const url = `${BASE_URL}/tekdoctor_db.sql`;
        const { response, duration, error } = await timedFetch(url);
        const status = response ? response.status : 'ERR';
        const passed = status === 404;
        recordResult({
            category: 'Security Boundaries',
            name: 'Block Database Dump (/tekdoctor_db.sql)',
            endpoint: '/tekdoctor_db.sql',
            expectedStatus: 404,
            actualStatus: status,
            latencyMs: duration,
            passed,
            details: passed ? 'Correctly rejected (404)' : `Unexpected status: ${status}`
        });
    }

    // 2.2 GET /.env -> must return 404 (or blocked)
    {
        const url = `${BASE_URL}/.env`;
        const { response, duration, error } = await timedFetch(url);
        const status = response ? response.status : 'ERR';
        const allowEdge403 = process.argv.includes('--allow-edge-403') || process.env.ALLOW_EDGE_403 === 'true';
        const passed = status === 404 || (allowEdge403 && status === 403);
        recordResult({
            category: 'Security Boundaries',
            name: 'Block Environment Secrets (/.env)',
            endpoint: '/.env',
            expectedStatus: allowEdge403 ? '404/403' : 404,
            actualStatus: status,
            latencyMs: duration,
            passed,
            details: status === 404
                ? 'Correctly rejected (404)'
                : (status === 403
                    ? (allowEdge403
                        ? 'Passed: Blocked with HTTP 403 Forbidden by LiteSpeed edge firewall'
                        : 'Blocked with HTTP 403 Forbidden by LiteSpeed edge firewall (boundary secure, but returns 403 instead of 404)')
                    : `Unexpected status: ${status}`)
        });
    }

    // 2.3 GET /server.js -> must return 404
    {
        const url = `${BASE_URL}/server.js`;
        const { response, duration, error } = await timedFetch(url);
        const status = response ? response.status : 'ERR';
        const passed = status === 404;
        recordResult({
            category: 'Security Boundaries',
            name: 'Block Backend Source (/server.js)',
            endpoint: '/server.js',
            expectedStatus: 404,
            actualStatus: status,
            latencyMs: duration,
            passed,
            details: passed ? 'Correctly rejected (404)' : `Unexpected status: ${status}`
        });
    }

    // 2.4 GET /api/repair-request/track/TD-006-01 (without token or mobile) -> must return 403
    {
        const url = `${BASE_URL}/api/repair-request/track/TD-006-01`;
        const { response, duration, error } = await timedFetch(url);
        const status = response ? response.status : 'ERR';
        const passed = status === 403;
        recordResult({
            category: 'Security Boundaries',
            name: 'Block Unauth Track Without Token/Mobile',
            endpoint: '/api/repair-request/track/TD-006-01',
            expectedStatus: 403,
            actualStatus: status,
            latencyMs: duration,
            passed,
            details: passed ? 'Correctly guarded with 403' : `Unexpected status: ${status}`
        });
    }

    // 2.5 GET /api/public/site-data with Origin: https://evil-attacker.com -> must return 403
    {
        const url = `${BASE_URL}/api/public/site-data`;
        const { response, duration, error } = await timedFetch(url, {
            headers: {
                'Origin': 'https://evil-attacker.com'
            }
        });
        const status = response ? response.status : 'ERR';
        const passed = status === 403;
        recordResult({
            category: 'Security Boundaries',
            name: 'CORS Enforcement on Unauthorized Origin',
            endpoint: '/api/public/site-data [Origin: evil]',
            expectedStatus: 403,
            actualStatus: status,
            latencyMs: duration,
            passed,
            details: passed ? 'CORS deviation blocked (403)' : `Expected 403, received: ${status}`
        });
    }
}

/**
 * 3. Public APIs Tests
 */
async function testPublicApis() {
    console.log(`${colors.cyan}[3/4] Testing Public APIs...${colors.reset}`);

    // 3.1 GET /api/public/site-data -> must return 200 and NOT contain google_sheet_url
    {
        const url = `${BASE_URL}/api/public/site-data`;
        const { response, duration, error } = await timedFetch(url);

        if (error) {
            recordResult({
                category: 'Public APIs',
                name: 'Public Site Data Sanitization',
                endpoint: '/api/public/site-data',
                expectedStatus: 200,
                actualStatus: 'ERR',
                latencyMs: duration,
                passed: false,
                details: `Fetch failed: ${error.message}`
            });
        } else {
            const status = response.status;
            const bodyText = await response.text();
            let json = null;
            try { json = JSON.parse(bodyText); } catch (_) {}

            const statusOk = status === 200;
            const containsGoogleSheet = bodyText.includes('google_sheet_url');
            const passed = statusOk && !containsGoogleSheet;

            recordResult({
                category: 'Public APIs',
                name: 'Public Site Data Sanitization',
                endpoint: '/api/public/site-data',
                expectedStatus: 200,
                actualStatus: status,
                latencyMs: duration,
                passed,
                details: containsGoogleSheet
                    ? 'SECURITY WARNING: google_sheet_url leaked in payload'
                    : 'Safe: google_sheet_url excluded from response'
            });
        }
    }

    // 3.2 GET /api/testimonials -> must return 200
    {
        const url = `${BASE_URL}/api/testimonials`;
        const { response, duration, error } = await timedFetch(url);

        if (error) {
            recordResult({
                category: 'Public APIs',
                name: 'Public Testimonials API',
                endpoint: '/api/testimonials',
                expectedStatus: 200,
                actualStatus: 'ERR',
                latencyMs: duration,
                passed: false,
                details: `Fetch failed: ${error.message}`
            });
        } else {
            const status = response.status;
            const passed = status === 200;

            recordResult({
                category: 'Public APIs',
                name: 'Public Testimonials API',
                endpoint: '/api/testimonials',
                expectedStatus: 200,
                actualStatus: status,
                latencyMs: duration,
                passed,
                details: passed ? 'Public reviews returned successfully' : `Unexpected status: ${status}`
            });
        }
    }
}

/**
 * 4. Rate Limiter Sanity Tests
 */
async function testRateLimiterSanity() {
    console.log(`${colors.cyan}[4/4] Testing Rate Limiter Sanity (15 Rapid Concurrent GETs)...${colors.reset}`);

    const url = `${BASE_URL}/api/public/site-data`;
    const numRequests = 15;
    const promises = [];

    const burstStart = performance.now();
    for (let i = 0; i < numRequests; i++) {
        promises.push(timedFetch(url));
    }

    const responses = await Promise.all(promises);
    const totalDuration = performance.now() - burstStart;

    const statusCounts = {};
    let allOk = true;

    responses.forEach(({ response }) => {
        const code = response ? response.status : 'ERR';
        statusCounts[code] = (statusCounts[code] || 0) + 1;
        if (code !== 200) {
            allOk = false;
        }
    });

    const statusBreakdown = Object.entries(statusCounts)
        .map(([code, count]) => `${count}x HTTP ${code}`)
        .join(', ');

    const avgLatency = responses.reduce((acc, r) => acc + r.duration, 0) / numRequests;

    recordResult({
        category: 'Rate Limiter Sanity',
        name: `15 Concurrent Requests Burst`,
        endpoint: '/api/public/site-data',
        expectedStatus: '15x 200',
        actualStatus: `${statusCounts[200] || 0}/15 OK`,
        latencyMs: avgLatency,
        passed: allOk,
        details: `Burst completed in ${Math.round(totalDuration)}ms (avg ${Math.round(avgLatency)}ms/req). Breakdown: ${statusBreakdown}`
    });
}

/**
 * Print Formatted Summary Report
 */
function printSummaryReport() {
    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;

    console.log('\n' + '='.repeat(110));
    console.log(`${colors.bold}  TEKDOCTOR PRODUCTION LIVE SMOKE TEST REPORT${colors.reset}`);
    console.log(`  Target Base URL: ${colors.cyan}${BASE_URL}${colors.reset}`);
    console.log(`  Execution Time:  ${new Date().toISOString()}`);
    console.log('='.repeat(110));

    // Table Header
    const colName = 38;
    const colEndpoint = 28;
    const colExp = 8;
    const colAct = 8;
    const colLat = 10;
    const colRes = 8;

    const pad = (str, len, alignRight = false) => {
        const s = String(str || '');
        if (s.length >= len) return s.slice(0, len);
        return alignRight ? ' '.repeat(len - s.length) + s : s + ' '.repeat(len - s.length);
    };

    console.log(
        pad('Test Name', colName) + ' | ' +
        pad('Target Endpoint', colEndpoint) + ' | ' +
        pad('Expected', colExp) + ' | ' +
        pad('Actual', colAct) + ' | ' +
        pad('Latency', colLat, true) + ' | ' +
        pad('Result', colRes)
    );
    console.log('-'.repeat(110));

    let currentCategory = '';
    for (const res of results) {
        if (res.category !== currentCategory) {
            currentCategory = res.category;
            console.log(`${colors.bold}${colors.dim}--- ${currentCategory} ---${colors.reset}`);
        }

        const resColor = res.passed ? colors.brightGreen : colors.brightRed;
        const resText = res.passed ? 'PASS' : 'FAIL';

        console.log(
            pad(res.name, colName) + ' | ' +
            pad(res.endpoint, colEndpoint) + ' | ' +
            pad(res.expectedStatus, colExp) + ' | ' +
            pad(res.actualStatus, colAct) + ' | ' +
            pad(`${res.latencyMs} ms`, colLat, true) + ' | ' +
            resColor + pad(resText, colRes) + colors.reset
        );
        if (res.details) {
            console.log(`  ${colors.dim}↳ ${res.details}${colors.reset}`);
        }
    }

    console.log('='.repeat(110));
    console.log(
        `${colors.bold}SUMMARY:${colors.reset} Total: ${totalTests} | ` +
        `${colors.brightGreen}Passed: ${passedTests}${colors.reset} | ` +
        `${failedTests > 0 ? colors.brightRed : colors.green}Failed: ${failedTests}${colors.reset}`
    );
    console.log('='.repeat(110) + '\n');

    return failedTests === 0;
}

/**
 * Main Runner
 */
async function main() {
    console.log(`${colors.bold}Initiating TekDoctor Live Production Smoke Test against ${BASE_URL}...${colors.reset}`);

    try {
        await testFrontendAndAssets();
        await testSecurityBoundaries();
        await testPublicApis();
        await testRateLimiterSanity();

        const allPassed = printSummaryReport();
        process.exit(allPassed ? 0 : 1);
    } catch (err) {
        console.error(`\n${colors.brightRed}Fatal error executing smoke test suite: ${err.message}${colors.reset}`);
        console.error(err);
        process.exit(2);
    }
}

main();
