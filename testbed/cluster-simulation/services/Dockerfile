FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package manifests for optimal layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev --no-audit --no-fund

# Copy service source code
COPY server.js ./

# Default environment configuration (overridden dynamically per service)
ENV PORT=5000 \
    SERVICE_NAME=service \
    NODE_ENV=production

# Informational expose of testbed port range
EXPOSE 5000 5001 5002 5003

# Universal service entrypoint
CMD ["node", "server.js"]
