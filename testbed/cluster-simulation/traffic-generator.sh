#!/usr/bin/env bash
# ==============================================================================
# AutoTrace-Sec: Cluster Simulation Traffic Generator
# Continuous or bounded legitimate traffic generator pointing to gateway-service
# ==============================================================================

set -uo pipefail

TARGET_URL="${1:-http://localhost:5000/process}"
DELAY_MS="${DELAY_MS:-15}"
INTERVAL_SEC="${INTERVAL_SEC:-1}"
MAX_REQUESTS="${MAX_REQUESTS:-0}" # 0 means infinite loop

echo "========================================================================"
echo " [TRAFFIC-GENERATOR] AutoTrace-Sec Legitimate Traffic Stream"
echo " Target Endpoint : ${TARGET_URL}"
echo " Compute Delay   : ${DELAY_MS}ms"
echo " Sleep Interval  : ${INTERVAL_SEC}s"
echo " Max Requests    : $([ "${MAX_REQUESTS}" -eq 0 ] && echo "Infinite (Ctrl+C to stop)" || echo "${MAX_REQUESTS}")"
echo "========================================================================"

COUNT=0

# Trap SIGINT (Ctrl+C) and SIGTERM for graceful exit
trap 'echo -e "\n\n[TRAFFIC-GENERATOR] Interrupted. Total requests sent: ${COUNT}. Exiting gracefully."; exit 0' SIGINT SIGTERM

while true; do
  COUNT=$((COUNT + 1))
  TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

  # Perform HTTP request and extract HTTP status code and total time
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "${TARGET_URL}?delay=${DELAY_MS}" 2>&1)
  CURL_EXIT=$?

  if [ ${CURL_EXIT} -eq 0 ]; then
    HTTP_CODE=$(echo "${RESPONSE}" | awk '{print $1}')
    TIME_SEC=$(echo "${RESPONSE}" | awk '{print $2}')
    LATENCY_MS=$(awk "BEGIN {printf \"%.1f\", ${TIME_SEC} * 1000}")

    if [ "${HTTP_CODE}" = "200" ]; then
      STATUS_COLOR="\033[32m" # Green
    else
      STATUS_COLOR="\033[31m" # Red
    fi
    RESET_COLOR="\033[0m"

    echo -e "[${TIMESTAMP}] [REQ #${COUNT}] GET ${TARGET_URL} | Status: ${STATUS_COLOR}${HTTP_CODE}${RESET_COLOR} | Latency: ${LATENCY_MS}ms"
  else
    echo -e "[${TIMESTAMP}] [REQ #${COUNT}] GET ${TARGET_URL} | \033[31mCONNECTION FAILED (curl exit: ${CURL_EXIT})\033[0m"
  fi

  if [ "${MAX_REQUESTS}" -gt 0 ] && [ "${COUNT}" -ge "${MAX_REQUESTS}" ]; then
    echo -e "\n[TRAFFIC-GENERATOR] Reached target request count (${MAX_REQUESTS}). Completed."
    break
  fi

  sleep "${INTERVAL_SEC}"
done
