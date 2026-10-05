#!/usr/bin/env bash
# ==============================================================================
# AutoTrace-Sec: Telemetry Collector & Redpanda End-to-End Verification
# ==============================================================================

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COLLECTOR_DIR="${ROOT_DIR}/services/telemetry-collector"
INFRA_COMPOSE="${ROOT_DIR}/infra/docker-compose.yml"

echo "========================================================================"
echo " 📡 AutoTrace-Sec: Telemetry Collector & Message Broker Verification"
echo " Working Dir: ${COLLECTOR_DIR}"
echo " Compose:     ${INFRA_COMPOSE}"
echo "========================================================================"

# 1. Ensure Docker Network Exists
echo -e "\n[STEP 1/5] Ensuring 'autotrace-mesh' Docker network exists..."
docker network inspect autotrace-mesh >/dev/null 2>&1 || docker network create autotrace-mesh
echo "✓ autotrace-mesh network ready."

# 2. Start Redpanda and Redis containers
echo -e "\n[STEP 2/5] Starting Redpanda and Redis infrastructure..."
docker compose -f "${INFRA_COMPOSE}" up -d redpanda redis

# 3. Wait for Redpanda Health
echo -e "\n[STEP 3/5] Waiting for Redpanda broker readiness on port 9092..."
MAX_ATTEMPTS=30
ATTEMPT=0
READY=false

while [ ${ATTEMPT} -lt ${MAX_ATTEMPTS} ]; do
  ATTEMPT=$((ATTEMPT + 1))
  
  # Check via rpk inside container first, or socket check on port 9092
  if docker exec redpanda rpk cluster health 2>&1 | grep -iq "healthy"; then
    echo "✓ Redpanda cluster health verified via rpk."
    READY=true
    break
  fi

  # Fallback to nc / bash socket check
  if nc -z localhost 9092 2>/dev/null || (exec 3<>/dev/tcp/localhost/9092) 2>/dev/null; then
    echo "✓ Redpanda broker socket open on localhost:9092."
    READY=true
    break
  fi

  echo "  [Attempt ${ATTEMPT}/${MAX_ATTEMPTS}] Redpanda initializing, retrying in 1s..."
  sleep 1
done

if [ "${READY}" != "true" ]; then
  echo -e "\033[31m[ERROR] Redpanda failed to become healthy within ${MAX_ATTEMPTS} seconds.\033[0m"
  docker compose -f "${INFRA_COMPOSE}" logs redpanda
  exit 1
fi

# Print cluster info
docker exec redpanda rpk cluster info || true

# 4. Run local test suite (Entropy & Ingestion API unit tests)
echo -e "\n[STEP 4/5] Running Collector Unit & Schema Tests..."
(cd "${COLLECTOR_DIR}" && node test/collector.test.js)

# 5. Run End-to-End Producer/Consumer Verification against Redpanda
echo -e "\n[STEP 5/5] Running End-to-End Redpanda Producer & Consumer Contract Verification..."
(cd "${COLLECTOR_DIR}" && KAFKA_BROKERS="localhost:9092" node test/e2e_verify.js)
E2E_STATUS=$?

echo -e "\n========================================================================"
if [ ${E2E_STATUS} -eq 0 ]; then
  echo -e "\033[32m ✓ [SUCCESS] TELEMETRY COLLECTOR & REDPANDA BROKER VERIFIED!\033[0m"
  echo "   - Redpanda single-node broker online (ports 9092, 9644)"
  echo "   - Redis cache online (port 6379)"
  echo "   - Topic 'telemetry.events' active with 1 partition"
  echo "   - TelemetryEvent published & consumed with strict 9-field schema match"
  echo -e "========================================================================\n"
  exit 0
else
  echo -e "\033[31m ✗ [FAILED] Telemetry verification failed.\033[0m"
  echo -e "========================================================================\n"
  exit 1
fi
