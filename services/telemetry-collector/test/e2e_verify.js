const { Kafka, Partitioners } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');

const BROKER = process.env.KAFKA_BROKERS || 'localhost:9092';
const TOPIC = process.env.TELEMETRY_TOPIC || 'telemetry.events';

async function main() {
  console.log(`[E2E-Verify] Connecting to Redpanda at ${BROKER}...`);

  const kafka = new Kafka({
    clientId: 'e2e-verifier',
    brokers: BROKER.split(',').map(b => b.trim()),
    retry: { retries: 5, initialRetryTime: 500 }
  });

  const admin = kafka.admin();
  const producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner
  });
  const consumer = kafka.consumer({
    groupId: `e2e-verify-group-${Date.now()}`
  });

  try {
    // 1. Ensure topic exists
    await admin.connect();
    const topics = await admin.listTopics();
    if (!topics.includes(TOPIC)) {
      console.log(`[E2E-Verify] Creating topic ${TOPIC}...`);
      await admin.createTopics({
        topics: [{ topic: TOPIC, numPartitions: 1, replicationFactor: 1 }]
      });
    }
    await admin.disconnect();

    // 2. Prepare canonical TelemetryEvent test payload
    const testTraceId = uuidv4();
    const testEvent = {
      trace_id: testTraceId,
      source_service: 'gateway-service',
      target_service: 'order-service',
      endpoint: '/process',
      method: 'GET',
      status_code: 200,
      latency_ms: 15.2,
      payload_entropy: 0.0,
      timestamp: Date.now()
    };

    console.log(`[E2E-Verify] Test event prepared:`);
    console.log(JSON.stringify(testEvent, null, 2));

    // 3. Connect consumer & subscribe BEFORE producing
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC, fromBeginning: true });

    let messageReceived = false;
    let receivedPayload = null;

    const consumePromise = new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for message on topic ${TOPIC} after 15000ms`));
      }, 15000);

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const rawValue = message.value.toString('utf8');
            const parsed = JSON.parse(rawValue);
            if (parsed.trace_id === testTraceId) {
              clearTimeout(timeout);
              messageReceived = true;
              receivedPayload = parsed;
              resolve(parsed);
            }
          } catch (err) {
            console.warn(`[E2E-Verify] Ignored non-matching/unparseable message: ${err.message}`);
          }
        }
      });
    });

    // 4. Connect producer and send event
    await producer.connect();
    console.log(`[E2E-Verify] Publishing test event to topic '${TOPIC}'...`);
    await producer.send({
      topic: TOPIC,
      messages: [
        {
          key: testTraceId,
          value: JSON.stringify(testEvent),
          timestamp: String(testEvent.timestamp)
        }
      ]
    });
    console.log(`[E2E-Verify] Event published successfully.`);

    // 5. Await consumer validation
    console.log(`[E2E-Verify] Awaiting consumer receipt and schema validation...`);
    const verifiedEvent = await consumePromise;

    // 6. Strict contract schema validation
    console.log(`[E2E-Verify] Message received. Validating all 9 required schema fields...`);
    const requiredKeys = [
      'trace_id',
      'source_service',
      'target_service',
      'endpoint',
      'method',
      'status_code',
      'latency_ms',
      'payload_entropy',
      'timestamp'
    ];

    for (const key of requiredKeys) {
      if (verifiedEvent[key] === undefined || verifiedEvent[key] === null) {
        throw new Error(`Validation Error: Missing required key '${key}'`);
      }
    }

    if (typeof verifiedEvent.trace_id !== 'string' || verifiedEvent.trace_id !== testTraceId) {
      throw new Error(`Validation Error: Invalid trace_id`);
    }
    if (typeof verifiedEvent.source_service !== 'string' || verifiedEvent.source_service !== 'gateway-service') {
      throw new Error(`Validation Error: Invalid source_service`);
    }
    if (typeof verifiedEvent.target_service !== 'string' || verifiedEvent.target_service !== 'order-service') {
      throw new Error(`Validation Error: Invalid target_service`);
    }
    if (typeof verifiedEvent.endpoint !== 'string' || verifiedEvent.endpoint !== '/process') {
      throw new Error(`Validation Error: Invalid endpoint`);
    }
    if (typeof verifiedEvent.method !== 'string' || verifiedEvent.method !== 'GET') {
      throw new Error(`Validation Error: Invalid method`);
    }
    if (typeof verifiedEvent.status_code !== 'number' || verifiedEvent.status_code !== 200) {
      throw new Error(`Validation Error: Invalid status_code`);
    }
    if (typeof verifiedEvent.latency_ms !== 'number' || verifiedEvent.latency_ms !== 15.2) {
      throw new Error(`Validation Error: Invalid latency_ms`);
    }
    if (typeof verifiedEvent.payload_entropy !== 'number' || verifiedEvent.payload_entropy !== 0.0) {
      throw new Error(`Validation Error: Invalid payload_entropy`);
    }
    if (typeof verifiedEvent.timestamp !== 'number' || verifiedEvent.timestamp <= 0) {
      throw new Error(`Validation Error: Invalid timestamp`);
    }

    console.log(`[E2E-Verify] ✓ All 9 schema keys verified with matching types and values!`);

    await producer.disconnect();
    await consumer.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(`[E2E-Verify] FATAL ERROR: ${err.message}`);
    try { await producer.disconnect(); } catch {}
    try { await consumer.disconnect(); } catch {}
    process.exit(1);
  }
}

main();
