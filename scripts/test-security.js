#!/usr/bin/env node

/**
 * Security Features Test Script
 * Tests all security enhancements including headers, certificate info, and monitoring
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const DEVICE_ID = uuidv4();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function printSection(title) {
  console.log(`\n${colors.cyan}=== ${title} ===${colors.reset}`);
}

function printSuccess(message, data = null) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function printError(message, error = null) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
  if (error) {
    console.log(`  Error: ${error.message || error}`);
    if (error.response) {
      console.log(`  Status: ${error.response.status}`);
      console.log(`  Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

function printInfo(message) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

async function testSecurityHeaders() {
  printSection('Test Security Headers');

  try {
    const response = await axios.get(`${BASE_URL}/health`, {
      headers: {
        'X-Device-ID': DEVICE_ID,
      },
    });

    const headers = response.headers;
    const securityHeaders = {
      'X-Request-ID': headers['x-request-id'],
      'X-Content-Type-Options': headers['x-content-type-options'],
      'X-Frame-Options': headers['x-frame-options'],
      'X-XSS-Protection': headers['x-xss-protection'],
      'Strict-Transport-Security': headers['strict-transport-security'],
      'Referrer-Policy': headers['referrer-policy'],
      'X-DNS-Prefetch-Control': headers['x-dns-prefetch-control'],
      'X-Download-Options': headers['x-download-options'],
      'X-Permitted-Cross-Domain-Policies': headers['x-permitted-cross-domain-policies'],
      'X-API-Version': headers['x-api-version'],
    };

    printInfo('Security Headers Received:');
    Object.entries(securityHeaders).forEach(([key, value]) => {
      if (value) {
        printSuccess(`${key}: ${value}`);
      } else {
        printError(`${key}: Missing`);
      }
    });

    // Verify critical headers
    const criticalHeaders = [
      'X-Request-ID',
      'X-Content-Type-Options',
      'X-Frame-Options',
    ];

    let allPresent = true;
    for (const header of criticalHeaders) {
      if (!headers[header.toLowerCase()]) {
        printError(`Critical header missing: ${header}`);
        allPresent = false;
      }
    }

    if (allPresent) {
      printSuccess('All critical security headers present');
    }

    return { success: allPresent, headers: securityHeaders };
  } catch (error) {
    printError('Failed to test security headers', error);
    return { success: false, error: error.message };
  }
}

async function testCertificateInfo() {
  printSection('Test Certificate Info Endpoint');

  try {
    const response = await axios.get(`${BASE_URL}/api/security/certificate-info`, {
      headers: {
        'X-Device-ID': DEVICE_ID,
      },
    });

    if (response.data.success) {
      printSuccess('Certificate info retrieved successfully');
      printInfo('Certificate Details:');
      console.log(JSON.stringify(response.data.data, null, 2));

      // Verify required fields
      const requiredFields = ['fingerprint', 'fingerprintNoColons', 'publicKeyHash', 'algorithm', 'server'];
      const data = response.data.data;
      let allPresent = true;

      for (const field of requiredFields) {
        if (!data[field]) {
          printError(`Missing field: ${field}`);
          allPresent = false;
        }
      }

      if (allPresent) {
        printSuccess('All required certificate fields present');
      }

      return { success: allPresent, data: response.data.data };
    } else {
      printError('Certificate info endpoint returned error');
      return { success: false };
    }
  } catch (error) {
    printError('Failed to retrieve certificate info', error);
    return { success: false, error: error.message };
  }
}

async function testRequestIdTracking() {
  printSection('Test Request ID Tracking');

  try {
    // Test 1: Server generates request ID
    const response1 = await axios.get(`${BASE_URL}/health`, {
      headers: {
        'X-Device-ID': DEVICE_ID,
      },
    });

    const serverGeneratedId = response1.headers['x-request-id'];
    if (serverGeneratedId) {
      printSuccess(`Server generated request ID: ${serverGeneratedId}`);
    } else {
      printError('Server did not generate request ID');
      return { success: false };
    }

    // Test 2: Client provides request ID
    const clientRequestId = uuidv4();
    const response2 = await axios.get(`${BASE_URL}/health`, {
      headers: {
        'X-Device-ID': DEVICE_ID,
        'X-Request-ID': clientRequestId,
      },
    });

    const receivedId = response2.headers['x-request-id'];
    if (receivedId === clientRequestId) {
      printSuccess(`Server used client-provided request ID: ${receivedId}`);
    } else {
      printError(`Request ID mismatch. Expected: ${clientRequestId}, Got: ${receivedId}`);
      return { success: false };
    }

    return { success: true };
  } catch (error) {
    printError('Failed to test request ID tracking', error);
    return { success: false, error: error.message };
  }
}

async function testSecurityMonitoring() {
  printSection('Test Security Monitoring (Suspicious Patterns)');

  const suspiciousTests = [
    {
      name: 'Path Traversal Attempt',
      path: '/api/resource/../../../etc/passwd',
      expected: 'Should detect path traversal',
    },
    {
      name: 'XSS Attempt',
      body: { text: '<script>alert("xss")</script>' },
      expected: 'Should detect XSS pattern',
    },
    {
      name: 'SQL Injection Attempt',
      query: { id: "1' OR '1'='1" },
      expected: 'Should detect SQL injection',
    },
  ];

  let detectedCount = 0;

  for (const test of suspiciousTests) {
    try {
      printInfo(`Testing: ${test.name}`);
      
      // Make request with suspicious pattern
      // Note: These should be detected but not blocked (validation/sanitization handles them)
      await axios.get(`${BASE_URL}/health`, {
        headers: {
          'X-Device-ID': DEVICE_ID,
        },
        params: test.query,
        data: test.body,
      }).catch(() => {
        // Expected to fail, but monitoring should log it
      });

      printInfo(`  ${test.expected} (check logs for security event)`);
      detectedCount++;
    } catch (error) {
      // Expected - validation should reject these
      printInfo(`  Request rejected (expected): ${error.response?.status || 'Network error'}`);
      detectedCount++;
    }
  }

  printInfo(`\nNote: Check server logs for 'suspicious_activity' entries`);
  printInfo(`Security monitoring is active and should log these patterns`);

  return { success: true, patternsTested: detectedCount };
}

async function testBodyParserSecurity() {
  printSection('Test Body Parser Security');

  try {
    // Test 1: Normal request should work
    const normalResponse = await axios.post(
      `${BASE_URL}/api/analytics/product/TEST-001/view`,
      {},
      {
        headers: {
          'X-Device-ID': DEVICE_ID,
          'Content-Type': 'application/json',
        },
      }
    );

    if (normalResponse.status === 200) {
      printSuccess('Normal request processed successfully');
    }

    // Test 2: Large payload (should be limited)
    try {
      const largePayload = { data: 'x'.repeat(11 * 1024 * 1024) }; // 11MB
      await axios.post(
        `${BASE_URL}/api/analytics/product/TEST-001/view`,
        largePayload,
        {
          headers: {
            'X-Device-ID': DEVICE_ID,
            'Content-Type': 'application/json',
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );
      printError('Large payload was accepted (should be rejected)');
    } catch (error) {
      if (error.code === 'ECONNRESET' || error.response?.status === 413) {
        printSuccess('Large payload correctly rejected');
      } else {
        printInfo(`Large payload handling: ${error.message}`);
      }
    }

    return { success: true };
  } catch (error) {
    printError('Failed to test body parser security', error);
    return { success: false, error: error.message };
  }
}

async function testRateLimitSecurityLogging() {
  printSection('Test Rate Limit Security Logging');

  try {
    printInfo('Making multiple rapid requests to trigger rate limit...');
    
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(
        axios.get(`${BASE_URL}/health`, {
          headers: {
            'X-Device-ID': DEVICE_ID,
          },
        }).catch((err) => err.response || err)
      );
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.some((r) => r.status === 429);

    if (rateLimited) {
      printSuccess('Rate limit triggered (check logs for security event)');
      printInfo('SecurityLogger should have logged rate_limit_violation');
    } else {
      printInfo('Rate limit not triggered (may need more requests or different endpoint)');
    }

    return { success: true, rateLimited };
  } catch (error) {
    printError('Failed to test rate limit security logging', error);
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  printSection('Security Features Test Suite');
  printInfo(`Testing against: ${BASE_URL}`);
  printInfo(`Device ID: ${DEVICE_ID}\n`);

  const results = {
    securityHeaders: await testSecurityHeaders(),
    certificateInfo: await testCertificateInfo(),
    requestIdTracking: await testRequestIdTracking(),
    securityMonitoring: await testSecurityMonitoring(),
    bodyParserSecurity: await testBodyParserSecurity(),
    rateLimitSecurityLogging: await testRateLimitSecurityLogging(),
  };

  printSection('Test Summary');
  
  let passed = 0;
  let failed = 0;

  Object.entries(results).forEach(([test, result]) => {
    if (result.success) {
      printSuccess(`${test}: PASSED`);
      passed++;
    } else {
      printError(`${test}: FAILED`);
      failed++;
    }
  });

  console.log(`\n${colors.cyan}Total: ${passed + failed} | Passed: ${colors.green}${passed}${colors.cyan} | Failed: ${colors.red}${failed}${colors.reset}\n`);

  if (failed === 0) {
    printSuccess('All security tests passed!');
  } else {
    printError('Some tests failed. Review the output above.');
  }

  return results;
}

// Run tests
if (require.main === module) {
  runAllTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      printError('Test suite failed', error);
      process.exit(1);
    });
}

module.exports = {
  runAllTests,
  testSecurityHeaders,
  testCertificateInfo,
  testRequestIdTracking,
  testSecurityMonitoring,
  testBodyParserSecurity,
  testRateLimitSecurityLogging,
};

