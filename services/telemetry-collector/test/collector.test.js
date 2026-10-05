const assert = require('assert');
const { calculateShannonEntropy } = require('../src/entropy');
const { TelemetryCollector } = require('../src/collector');
const { createProxyApp } = require('../src/proxy');
const http = require('http');

async function runTests() {
  console.log('--- [TEST] 1. Shannon Entropy Unit Tests ---');
  
  // Test null / undefined / empty
  assert.strictEqual(calculateShannonEntropy(null), 0.0, 'null input should yield 0.0');
  assert.strictEqual(calculateShannonEntropy(undefined), 0.0, 'undefined input should yield 0.0');
  assert.strictEqual(calculateShannonEntropy(''), 0.0, 'empty string should yield 0.0');
  assert.strictEqual(calculateShannonEntropy(Buffer.alloc(0)), 0.0, 'empty buffer should yield 0.0');

  // Test uniform string (single repeating character -> 0.0)
  assert.strictEqual(calculateShannonEntropy('AAAAAAAAAA'), 0.0, 'Single repeating char should have 0 entropy');

  // Test string with entropy
  const textEntropy = calculateShannonEntropy('The quick brown fox jumps over the lazy dog');
  assert(textEntropy > 3.0 && textEntropy < 5.0, `Expected entropy between 3 and 5, got ${textEntropy}`);

  // Test all 256 unique bytes -> max entropy ~8.0
  const maxBuffer = Buffer.alloc(256);
  for (let i = 0; i < 256; i++) maxBuffer[i] = i;
  const maxEntropy = calculateShannonEntropy(maxBuffer);
  assert.strictEqual(maxEntropy, 8.0, `All 256 uniform bytes should yield 8.0, got ${maxEntropy}`);

  console.log('✓ Shannon Entropy tests passed.');

  console.log('--- [TEST] 2. TelemetryEvent Contract Validation Tests ---');
  const collector = new TelemetryCollector({ brokers: ['localhost:9092'] });

  const validEvent = {
    trace_id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    source_service: 'gateway-service',
    target_service: 'order-service',
    endpoint: '/process',
    method: 'GET',
    status_code: 200,
    latency_ms: 15.2,
    payload_entropy: 0.0,
    timestamp: 1788105014000
  };

  assert.strictEqual(collector.validateEvent(validEvent), true, 'Valid event should pass');

  // Missing trace_id
  assert.throws(() => {
    const invalid = { ...validEvent };
    delete invalid.trace_id;
    collector.validateEvent(invalid);
  }, /Missing required telemetry field: trace_id/);

  // Invalid status_code (string instead of integer)
  assert.throws(() => {
    collector.validateEvent({ ...validEvent, status_code: '200' });
  }, /Field status_code must be an integer/);

  // Invalid payload_entropy (> 8.0)
  assert.throws(() => {
    collector.validateEvent({ ...validEvent, payload_entropy: 8.5 });
  }, /Field payload_entropy must be a number between 0.0 and 8.0/);

  // Invalid latency_ms (< 0)
  assert.throws(() => {
    collector.validateEvent({ ...validEvent, latency_ms: -5 });
  }, /Field latency_ms must be a non-negative number/);

  console.log('✓ TelemetryEvent Contract Validation tests passed.');

  console.log('--- [TEST] 3. Proxy & Ingestion HTTP API Tests ---');
  const mockCollector = {
    isConnected: true,
    sentEvents: [],
    validateEvent: (e) => collector.validateEvent(e),
    sendEvent: function(e) { this.sentEvents.push(e); }
  };

  const app = createProxyApp(mockCollector);
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    // 3a. Health check
    const health = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      }).on('error', reject);
    });

    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.status, 'HEALTHY');
    assert.strictEqual(health.body.service, 'telemetry-collector');
    console.log('✓ Ingestion /health check passed.');

    // 3b. Direct record ingestion
    const recordPayload = JSON.stringify({
      source_service: 'reviews-service',
      target_service: 'payment-vault',
      endpoint: '/exploit/lateral',
      method: 'POST',
      status_code: 200,
      latency_ms: 22.4,
      payload_entropy: 2.1
    });

    const recordRes = await new Promise((resolve, reject) => {
      const req = http.request(`http://127.0.0.1:${port}/api/v1/telemetry/record`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(recordPayload)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      });
      req.on('error', reject);
      req.write(recordPayload);
      req.end();
    });

    assert.strictEqual(recordRes.status, 201);
    assert.strictEqual(recordRes.body.status, 'RECORDED');
    assert.strictEqual(recordRes.body.event.source_service, 'reviews-service');
    assert.strictEqual(recordRes.body.event.target_service, 'payment-vault');
    assert.strictEqual(mockCollector.sentEvents.length, 1);
    assert.strictEqual(mockCollector.sentEvents[0].endpoint, '/exploit/lateral');
    console.log('✓ Ingestion POST /api/v1/telemetry/record passed.');
  } finally {
    server.close();
  }

  console.log('\n========================================');
  console.log(' ALL COLLECTOR UNIT TESTS PASSED (100%)');
  console.log('========================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
