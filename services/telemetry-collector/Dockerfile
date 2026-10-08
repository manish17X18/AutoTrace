FROM node:20-alpine

WORKDIR /app

# Install dependencies first for optimal Docker layer caching
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy source code
COPY src/ ./src/

# Default environment configuration
ENV PORT=8085 \
    KAFKA_BROKERS=redpanda:29092 \
    TELEMETRY_TOPIC=telemetry.events \
    NODE_ENV=production

EXPOSE 8085

CMD ["node", "src/index.js"]
