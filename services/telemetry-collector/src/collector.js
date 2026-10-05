const { Kafka, Partitioners } = require('kafkajs');

const DEFAULT_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092')
  .split(',')
  .map(b => b.trim());
const TELEMETRY_TOPIC = process.env.TELEMETRY_TOPIC || 'telemetry.events';
const CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'telemetry-collector';

class TelemetryCollector {
  constructor(options = {}) {
    this.brokers = options.brokers || DEFAULT_BROKERS;
    this.topic = options.topic || TELEMETRY_TOPIC;
    this.clientId = options.clientId || CLIENT_ID;

    this.kafka = new Kafka({
      clientId: this.clientId,
      brokers: this.brokers,
      retry: {
        initialRetryTime: 300,
        retries: 8
      }
    });

    this.producer = this.kafka.producer({
      createPartitioner: Partitioners.DefaultPartitioner
    });
    this.admin = this.kafka.admin();

    this.isConnected = false;
    this.queue = [];
    this.isFlushing = false;
    this.flushIntervalMs = options.flushIntervalMs || 100;
    this.timer = null;
  }

  /**
   * Initializes Kafka Admin and Producer, ensuring the target topic exists.
   */
  async init() {
    console.log(`[TelemetryCollector] Connecting to Redpanda/Kafka at ${this.brokers.join(', ')}...`);
    
    // Connect Admin and ensure topic exists
    try {
      await this.admin.connect();
      const existingTopics = await this.admin.listTopics();
      if (!existingTopics.includes(this.topic)) {
        console.log(`[TelemetryCollector] Topic '${this.topic}' does not exist. Creating with 1 partition...`);
        await this.admin.createTopics({
          topics: [
            {
              topic: this.topic,
              numPartitions: 1,
              replicationFactor: 1
            }
          ]
        });
        console.log(`[TelemetryCollector] Topic '${this.topic}' successfully created.`);
      } else {
        console.log(`[TelemetryCollector] Topic '${this.topic}' confirmed present.`);
      }
      await this.admin.disconnect();
    } catch (err) {
      console.warn(`[TelemetryCollector] Topic check warning: ${err.message}. Proceeding to producer connect...`);
      try { await this.admin.disconnect(); } catch {}
    }

    // Connect Producer
    await this.producer.connect();
    this.isConnected = true;
    console.log(`[TelemetryCollector] Connected to Redpanda/Kafka producer successfully.`);

    // Start background flush loop
    this.timer = setInterval(() => this.flushQueue(), this.flushIntervalMs);
  }

  /**
   * Validates that an event strictly conforms to the TelemetryEvent schema.
   */
  validateEvent(event) {
    if (!event || typeof event !== 'object') {
      throw new Error('Event must be a non-null object');
    }

    const requiredFields = [
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

    for (const field of requiredFields) {
      if (event[field] === undefined || event[field] === null) {
        throw new Error(`Missing required telemetry field: ${field}`);
      }
    }

    if (typeof event.trace_id !== 'string' || event.trace_id.length === 0) {
      throw new Error('Field trace_id must be a non-empty string');
    }
    if (typeof event.source_service !== 'string' || event.source_service.length === 0) {
      throw new Error('Field source_service must be a non-empty string');
    }
    if (typeof event.target_service !== 'string' || event.target_service.length === 0) {
      throw new Error('Field target_service must be a non-empty string');
    }
    if (typeof event.endpoint !== 'string') {
      throw new Error('Field endpoint must be a string');
    }
    if (typeof event.method !== 'string') {
      throw new Error('Field method must be a string');
    }
    if (typeof event.status_code !== 'number' || !Number.isInteger(event.status_code)) {
      throw new Error('Field status_code must be an integer');
    }
    if (typeof event.latency_ms !== 'number' || isNaN(event.latency_ms) || event.latency_ms < 0) {
      throw new Error('Field latency_ms must be a non-negative number');
    }
    if (typeof event.payload_entropy !== 'number' || isNaN(event.payload_entropy) || event.payload_entropy < 0 || event.payload_entropy > 8.0) {
      throw new Error('Field payload_entropy must be a number between 0.0 and 8.0');
    }
    if (typeof event.timestamp !== 'number' || !Number.isInteger(event.timestamp) || event.timestamp < 0) {
      throw new Error('Field timestamp must be a non-negative integer epoch timestamp');
    }

    return true;
  }

  /**
   * Enqueues an event into the asynchronous buffer.
   * Does not block the HTTP proxy path.
   */
  sendEvent(event) {
    this.validateEvent(event);

    const message = {
      key: event.trace_id || event.source_service,
      value: JSON.stringify(event),
      timestamp: String(event.timestamp)
    };

    this.queue.push(message);

    // If buffer exceeds threshold, trigger immediate flush
    if (this.queue.length >= 50) {
      setImmediate(() => this.flushQueue());
    }

    return true;
  }

  /**
   * Sends an event synchronously, waiting for broker ack (useful for tests/direct API).
   */
  async sendEventSync(event) {
    this.validateEvent(event);

    if (!this.isConnected) {
      throw new Error('Collector is not connected to Redpanda/Kafka');
    }

    return await this.producer.send({
      topic: this.topic,
      messages: [
        {
          key: event.trace_id,
          value: JSON.stringify(event),
          timestamp: String(event.timestamp)
        }
      ]
    });
  }

  /**
   * Flushes queued events to Kafka.
   */
  async flushQueue() {
    if (this.isFlushing || this.queue.length === 0 || !this.isConnected) {
      return;
    }

    this.isFlushing = true;
    const batch = this.queue.splice(0, 100);

    try {
      await this.producer.send({
        topic: this.topic,
        messages: batch
      });
      // console.debug(`[TelemetryCollector] Flushed ${batch.length} events to ${this.topic}`);
    } catch (err) {
      console.error(`[TelemetryCollector] Failed to publish ${batch.length} events: ${err.message}`);
      // Re-queue failed batch at head
      this.queue.unshift(...batch);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Graceful disconnection.
   */
  async disconnect() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Flush any remaining messages
    if (this.queue.length > 0) {
      await this.flushQueue();
    }

    if (this.isConnected) {
      try {
        await this.producer.disconnect();
      } catch (err) {
        console.warn(`[TelemetryCollector] Disconnect error: ${err.message}`);
      }
      this.isConnected = false;
    }
  }
}

module.exports = {
  TelemetryCollector
};
