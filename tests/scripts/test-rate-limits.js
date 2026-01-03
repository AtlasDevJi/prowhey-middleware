const axios = require('axios');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3001';
const DEVICE_ID = 'test-device-' + Date.now();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function makeRequest(method, path, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${path}`,
      headers: {
        'X-Device-ID': DEVICE_ID,
        'Content-Type': 'application/json',
      },
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return {
      status: response.status,
      headers: response.headers,
      data: response.data,
    };
  } catch (error) {
    return {
      status: error.response?.status || 500,
      headers: error.response?.headers || {},
      data: error.response?.data || { error: error.message },
    };
  }
}

async function testRateLimit(endpointName, path, method, data, limit, delay = 0) {
  log(`\n${'='.repeat(60)}`, 'blue');
  log(`Testing ${endpointName} - Limit: ${limit} requests/minute`, 'blue');
  log(`${'='.repeat(60)}`, 'blue');

  const results = {
    success: 0,
    rateLimited: 0,
    errors: 0,
    firstRateLimit: null,
  };

  // Make requests up to limit + 5 to ensure we hit the limit
  const requestsToMake = limit + 5;
  log(`Making ${requestsToMake} requests...`, 'yellow');

  for (let i = 1; i <= requestsToMake; i++) {
    const response = await makeRequest(method, path, data);

    if (response.status === 200 || response.status === 201) {
      results.success++;
      if (i <= 10 || i % 10 === 0) {
        log(`  Request ${i}: ✓ Success (${response.status})`, 'green');
      }
    } else if (response.status === 429) {
      results.rateLimited++;
      if (!results.firstRateLimit) {
        results.firstRateLimit = {
          requestNumber: i,
          response: response.data,
          retryAfter: response.headers['retry-after'],
          rateLimitRemaining: response.headers['ratelimit-remaining'],
        };
        log(`  Request ${i}: ✗ Rate Limited (429)`, 'red');
        log(`    Retry-After: ${response.headers['retry-after']} seconds`, 'yellow');
        log(`    Remaining: ${response.headers['ratelimit-remaining']}`, 'yellow');
        log(`    Response: ${JSON.stringify(response.data, null, 2)}`, 'yellow');
      } else if (i <= limit + 2) {
        log(`  Request ${i}: ✗ Rate Limited (429)`, 'red');
      }
    } else {
      results.errors++;
      log(`  Request ${i}: ✗ Error (${response.status})`, 'red');
      log(`    ${JSON.stringify(response.data)}`, 'red');
    }

    // Small delay to avoid overwhelming the server
    if (delay > 0 && i < requestsToMake) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  log(`\nResults:`, 'blue');
  log(`  Successful: ${results.success}`, results.success > 0 ? 'green' : 'red');
  log(`  Rate Limited: ${results.rateLimited}`, results.rateLimited > 0 ? 'yellow' : 'red');
  log(`  Errors: ${results.errors}`, results.errors === 0 ? 'green' : 'red');

  if (results.firstRateLimit) {
    log(`\nFirst rate limit hit at request #${results.firstRateLimit.requestNumber}`, 'yellow');
    log(`Expected limit: ${limit}`, 'yellow');
    if (results.firstRateLimit.requestNumber <= limit + 2) {
      log(`✓ Rate limiting working correctly!`, 'green');
    } else {
      log(`⚠ Rate limit hit later than expected`, 'yellow');
    }
  } else {
    log(`\n⚠ No rate limit was hit - this might indicate an issue`, 'yellow');
  }

  return results;
}

async function runAllTests() {
  log(`\n${'='.repeat(60)}`, 'blue');
  log(`Rate Limit Testing Script`, 'blue');
  log(`Base URL: ${BASE_URL}`, 'blue');
  log(`Device ID: ${DEVICE_ID}`, 'blue');
  log(`${'='.repeat(60)}`, 'blue');

  const results = {};

  // Test Analytics (limit: 30/min)
  results.analytics = await testRateLimit(
    'Analytics - View Tracking',
    '/api/analytics/product/WEB-ITM-0001/view',
    'POST',
    null,
    30,
    50 // 50ms delay between requests
  );

  // Wait a bit before next test
  log(`\nWaiting 2 seconds before next test...`, 'yellow');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Test Resource endpoints (limit: 60/min) - using health endpoint as proxy
  // Note: Resource endpoints require specific routes, using health for testing
  results.resource = await testRateLimit(
    'Resource - Health Check (as proxy)',
    '/health',
    'GET',
    null,
    60,
    30
  );

  // Wait a bit before next test
  log(`\nWaiting 2 seconds before next test...`, 'yellow');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Test Management endpoints (limit: 10/min)
  // Note: This endpoint might require authentication or specific data
  // Using a simpler endpoint for testing
  results.management = await testRateLimit(
    'Management - Stock Update',
    '/api/stock/update-all',
    'POST',
    null,
    10,
    100
  );

  // Test Health check (limit: 100/min)
  log(`\nWaiting 2 seconds before next test...`, 'yellow');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  results.health = await testRateLimit(
    'Health Check',
    '/health',
    'GET',
    null,
    100,
    20
  );

  // Summary
  log(`\n${'='.repeat(60)}`, 'blue');
  log(`Test Summary`, 'blue');
  log(`${'='.repeat(60)}`, 'blue');

  Object.entries(results).forEach(([name, result]) => {
    log(`\n${name.toUpperCase()}:`, 'blue');
    log(`  Success: ${result.success}`, 'green');
    log(`  Rate Limited: ${result.rateLimited}`, result.rateLimited > 0 ? 'yellow' : 'red');
    log(`  Errors: ${result.errors}`, result.errors === 0 ? 'green' : 'red');
    if (result.firstRateLimit) {
      log(`  First limit at request #${result.firstRateLimit.requestNumber}`, 'yellow');
    }
  });

  log(`\n${'='.repeat(60)}`, 'blue');
  log(`Testing complete!`, 'blue');
  log(`${'='.repeat(60)}`, 'blue');
}

// Run tests
runAllTests().catch((error) => {
  log(`\nFatal error: ${error.message}`, 'red');
  process.exit(1);
});

