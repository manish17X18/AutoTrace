const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { calculateShannonEntropy } = require('./entropy');

function createProxyApp(collector) {
  const app = express();

  // Capture raw body for entropy calculation before JSON parsing
  app.use(express.raw({ type: '*/*', limit: '10mb' }));

  // Helper to parse JSON if applicable
  app.use((req, res, next) => {
    if (req.body && Buffer.isBuffer(req.body)) {
      req.rawBody = req.body;
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        try {
          req.parsedBody = JSON.parse(req.body.toString('utf8'));
        } catch {
          req.parsedBody = null;
        }
      }
    } else {
      req.rawBody = Buffer.alloc(0);
      req.parsedBody = null;
    }
    next();
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'HEALTHY',
      service: 'telemetry-collector',
      timestamp: Date.now(),
      kafka_connected: collector.isConnected
    });
  });

  /**
   * Direct Ingestion Endpoint:
   * POST /api/v1/telemetry/record
   * 
   * Accepts direct telemetry event emissions from instrumentation hooks.
   */
  app.post('/api/v1/telemetry/record', async (req, res) => {
    try {
      const payload = req.parsedBody || (req.rawBody && req.rawBody.length > 0 ? JSON.parse(req.rawBody.toString('utf8')) : {});

      // Populate default/derived fields if not explicitly passed
      const event = {
        trace_id: payload.trace_id || uuidv4(),
        source_service: payload.source_service,
        target_service: payload.target_service,
        endpoint: payload.endpoint || '/',
        method: (payload.method || 'GET').toUpperCase(),
        status_code: parseInt(payload.status_code, 10),
        latency_ms: parseFloat(payload.latency_ms),
        payload_entropy: payload.payload_entropy !== undefined 
          ? parseFloat(payload.payload_entropy)
          : calculateShannonEntropy(payload.body || payload.payload || ''),
        timestamp: payload.timestamp ? parseInt(payload.timestamp, 10) : Date.now()
      };

      // Validate event schema
      collector.validateEvent(event);

      // Enqueue to Kafka producer buffer
      collector.sendEvent(event);

      return res.status(201).json({
        status: 'RECORDED',
        event
      });
    } catch (err) {
      return res.status(400).json({
        status: 'ERROR',
        message: err.message
      });
    }
  });

  /**
   * Out-of-band Interceptor & Forwarder Middleware:
   * /proxy/:targetService/*
   * Or via header X-Target-URL / X-Target-Service
   */
  app.use('/proxy/:targetService', (req, res, next) => {
    const targetService = req.params.targetService;
    const targetHost = req.headers['x-target-host'] || `${targetService}`;
    const targetPort = req.headers['x-target-port'] || (
      targetService === 'gateway-service' ? 5000 :
      targetService === 'order-service' ? 5001 :
      targetService === 'reviews-service' ? 5002 :
      targetService === 'payment-vault' ? 5003 : 80
    );

    const targetUrl = `http://${targetHost}:${targetPort}`;
    const startTime = Date.now();
    const entropy = calculateShannonEntropy(req.rawBody);
    const traceId = req.headers['x-trace-id'] || uuidv4();
    const sourceService = req.headers['x-source-service'] || req.headers['x-autotrace-parent'] || 'external-client';

    const proxy = createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      pathRewrite: (path) => path.replace(new RegExp(`^/proxy/${targetService}`), '') || '/',
      on: {
        proxyReq: (proxyReq) => {
          proxyReq.setHeader('x-trace-id', traceId);
          proxyReq.setHeader('x-source-service', sourceService);
          proxyReq.setHeader('x-target-service', targetService);
          if (req.rawBody && req.rawBody.length > 0) {
            proxyReq.write(req.rawBody);
          }
        },
        proxyRes: (proxyRes, req, res) => {
          const latencyMs = Date.now() - startTime;
          const telemetryEvent = {
            trace_id: traceId,
            source_service: sourceService,
            target_service: targetService,
            endpoint: req.originalUrl.replace(new RegExp(`^/proxy/${targetService}`), '') || '/',
            method: req.method,
            status_code: proxyRes.statusCode || 200,
            latency_ms: latencyMs,
            payload_entropy: entropy,
            timestamp: Date.now()
          };

          try {
            collector.sendEvent(telemetryEvent);
            console.log(`[Proxy] Captured telemetry: ${sourceService} -> ${targetService} (${telemetryEvent.endpoint}) [${telemetryEvent.status_code}] ${latencyMs}ms`);
          } catch (err) {
            console.error(`[Proxy] Failed to buffer telemetry event: ${err.message}`);
          }
        },
        error: (err, req, res) => {
          const latencyMs = Date.now() - startTime;
          const telemetryEvent = {
            trace_id: traceId,
            source_service: sourceService,
            target_service: targetService,
            endpoint: req.originalUrl.replace(new RegExp(`^/proxy/${targetService}`), '') || '/',
            method: req.method,
            status_code: 502,
            latency_ms: latencyMs,
            payload_entropy: entropy,
            timestamp: Date.now()
          };

          try {
            collector.sendEvent(telemetryEvent);
          } catch {}

          if (!res.headersSent) {
            res.status(502).json({
              error: 'Proxy forwarding failed',
              details: err.message
            });
          }
        }
      }
    });

    return proxy(req, res, next);
  });

  return app;
}

module.exports = {
  createProxyApp
};
