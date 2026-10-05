const { TelemetryCollector } = require('./collector');
const { createProxyApp } = require('./proxy');

const PORT = parseInt(process.env.PORT, 10) || 8085;
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map(b => b.trim());
const TELEMETRY_TOPIC = process.env.TELEMETRY_TOPIC || 'telemetry.events';

async function main() {
  console.log(`========================================================================`);
  console.log(` 📡 AutoTrace-Sec: Telemetry Collector Daemon`);
  console.log(` Port           : ${PORT}`);
  console.log(` Kafka Brokers  : ${KAFKA_BROKERS.join(', ')}`);
  console.log(` Target Topic   : ${TELEMETRY_TOPIC}`);
  console.log(`========================================================================`);

  const collector = new TelemetryCollector({
    brokers: KAFKA_BROKERS,
    topic: TELEMETRY_TOPIC
  });

  try {
    await collector.init();
  } catch (err) {
    console.error(`[Main] Warning during Kafka initialization: ${err.message}. Retrying in background...`);
  }

  const app = createProxyApp(collector);

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Main] Telemetry Collector listening on 0.0.0.0:${PORT}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[Main] Received ${signal}. Shutting down telemetry collector...`);
    server.close(async () => {
      await collector.disconnect();
      console.log(`[Main] Graceful shutdown complete.`);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(`[Main] Fatal startup error: ${err.stack || err.message}`);
  process.exit(1);
});
