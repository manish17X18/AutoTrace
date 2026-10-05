const express = require('express');
const axios = require('axios');

const app = express();

// Parse JSON bodies
app.use(express.json());

// Configuration via environment variables
const SERVICE_NAME = process.env.SERVICE_NAME || 'service';
const PORT = parseInt(process.env.PORT, 10) || 5000;
const DOWNSTREAM_URL = (process.env.DOWNSTREAM_URL || '').trim();

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] [${SERVICE_NAME}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

/**
 * Health Check Endpoint
 * GET /health
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'HEALTHY',
    service: SERVICE_NAME,
    timestamp: Date.now()
  });
});

/**
 * Main Traffic Processing Endpoint
 * ALL /process
 * 
 * Simulates business computation via `delay` (ms).
 * Recursively propagates downstream if DOWNSTREAM_URL is configured.
 */
app.all('/process', async (req, res) => {
  const startTime = Date.now();

  // Parse simulated CPU/compute delay parameter
  const delayParam = req.query.delay;
  const delay = delayParam !== undefined && !isNaN(parseInt(delayParam, 10))
    ? Math.max(0, parseInt(delayParam, 10))
    : 15;

  // Simulate compute processing time
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  let downstreamResponse = null;

  // If a downstream service is configured, forward request
  if (DOWNSTREAM_URL) {
    const downstreamEndpoint = `${DOWNSTREAM_URL.replace(/\/+$/, '')}/process`;
    try {
      const response = await axios.get(downstreamEndpoint, {
        params: { delay },
        timeout: 5000,
        headers: {
          'X-AutoTrace-Parent': SERVICE_NAME
        }
      });
      downstreamResponse = response.data;
    } catch (err) {
      const elapsed = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [${SERVICE_NAME}] Downstream call to ${downstreamEndpoint} failed: ${err.message}`);
      return res.status(500).json({
        service: SERVICE_NAME,
        status: 'ERROR',
        latency_ms: elapsed,
        error: `Downstream call to ${downstreamEndpoint} failed: ${err.message}`,
        details: err.response ? err.response.data : undefined
      });
    }
  }

  const elapsed = Date.now() - startTime;
  return res.status(200).json({
    service: SERVICE_NAME,
    status: 'PROCESSED',
    latency_ms: elapsed,
    downstream: downstreamResponse
  });
});

/**
 * Attack Vector Hook Endpoint
 * POST /exploit/lateral
 * 
 * Intentionally vulnerable hook for simulating lateral traversal attacks.
 * Accepts: { "target": "http://payment-vault:5003/process" }
 */
app.post('/exploit/lateral', async (req, res) => {
  const target = req.body && req.body.target;
  if (!target) {
    return res.status(400).json({
      exploit: 'FAILED_OR_BLOCKED',
      error: "Missing 'target' field in request body. Expected { 'target': 'http://...' }"
    });
  }

  console.log(`[${new Date().toISOString()}] [${SERVICE_NAME}] [EXPLOIT] Initiating lateral traversal request to: ${target}`);
  try {
    const response = await axios.get(target, {
      timeout: 5000,
      headers: {
        'X-Exploit-Origin': SERVICE_NAME
      }
    });

    console.log(`[${new Date().toISOString()}] [${SERVICE_NAME}] [EXPLOIT] Lateral traversal SUCCEEDED to: ${target}`);
    return res.status(200).json({
      exploit: 'SUCCESS',
      message: 'Lateral traversal achieved',
      data: response.data
    });
  } catch (error) {
    console.warn(`[${new Date().toISOString()}] [${SERVICE_NAME}] [EXPLOIT] Lateral traversal FAILED or BLOCKED to ${target}: ${error.message}`);
    // ETIMEDOUT or ECONNABORTED indicates timeout/drop (504 Gateway Timeout)
    // ECONNREFUSED or network unreachable indicates active block/reset (502 Bad Gateway)
    const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
    const statusCode = isTimeout ? 504 : 502;

    return res.status(statusCode).json({
      exploit: 'FAILED_OR_BLOCKED',
      error: error.message
    });
  }
});

// Start listening (binds dual-stack IPv4/IPv6 on all interfaces)
const server = app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] [${SERVICE_NAME}] Service started on port ${PORT} (Downstream: ${DOWNSTREAM_URL || 'NONE'})`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`[${SERVICE_NAME}] Received SIGTERM, shutting down gracefully...`);
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log(`[${SERVICE_NAME}] Received SIGINT, shutting down gracefully...`);
  server.close(() => process.exit(0));
});

module.exports = app;
