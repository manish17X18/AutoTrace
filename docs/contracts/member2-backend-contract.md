# Backend Contract Specification: Member 2 (Graph Engine)

**Target Service:** `services/graph-engine/`  
**Owner:** Member 2 (Backend Engineer)  
**Upstream Provider:** Member 1 (Distributed Systems Engineer) — Telemetry Stream & Cluster Orchestration  
**Downstream Consumers:** 
- Member 3 (AI/ML Engineer) — `services/ml-detector` (`/score-edge`, `/rca`)
- Member 4 (Cybersecurity Engineer) — `services/actuator-security` (`/quarantine`)
- Shared Frontend — `apps/web-dashboard` (WebSocket `/topic/topology`)

---

## 1. System Context & Active Infrastructure

All core messaging infrastructure and microservice nodes have been orchestrated, verified, and placed on the shared Docker bridge network `autotrace-mesh`:

| Component / Hostname | Internal Port | Host Port | Protocol / Technology | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Redpanda Broker** (`redpanda`) | `29092` | `9092` | Kafka 3.x Protocol | High-throughput streaming broker for telemetry events |
| **Redpanda Admin** (`redpanda`) | `9644` | `9644` | HTTP REST API | Cluster health, topic management, metrics |
| **Redis Cache** (`redis`) | `6379` | `6379` | RESP (Redis Protocol) | Topology caching, sliding window rate limits |
| **Telemetry Collector** (`telemetry-collector`) | `8085` | `8085` | HTTP Proxy & Ingestion | Captures traffic and streams to `telemetry.events` |
| **Gateway Service** (`gateway-service`) | `5000` | `5000` | HTTP Express | Ingress node, forwards to `order-service` |
| **Order Service** (`order-service`) | `5001` | `5001` | HTTP Express | Order engine, forwards to `payment-vault` |
| **Reviews Service** (`reviews-service`) | `5002` | `5002` | HTTP Express | Peripheral node, contains `/exploit/lateral` hook |
| **Payment Vault** (`payment-vault`) | `5003` | `5003` | HTTP Express | High-security leaf node, stores vault records |

### Active Kafka Topics
- **`telemetry.events`**
  - **Partitions:** `1`
  - **Replication Factor:** `1`
  - **Payload Encoding:** UTF-8 Stringified JSON matching [`shared/schemas/telemetry-event.json`](file:///Users/vinithvshanbhag/meg/autotrace-sec/shared/schemas/telemetry-event.json)

---

## 2. Inbound Data Contract (`telemetry.events`)

Every message published by `telemetry-collector` to `telemetry.events` conforms strictly to the following 9-field JSON contract.

### 2.1 Canonical Payload Example
```json
{
  "trace_id": "d1644dd1-91a2-4fa8-a6bd-bf5fc4c11a16",
  "source_service": "gateway-service",
  "target_service": "order-service",
  "endpoint": "/process",
  "method": "GET",
  "status_code": 200,
  "latency_ms": 15.2,
  "payload_entropy": 0.0,
  "timestamp": 1791188308857
}
```

### 2.2 Field Specifications & Constraints

| Field Name | JSON Type | Validation Rule | Description |
| :--- | :--- | :--- | :--- |
| `trace_id` | `String` | Non-empty UUIDv4 | Unique identifier for the distributed call trace |
| `source_service` | `String` | Non-empty string | Origin microservice (`gateway-service`, `order-service`, `reviews-service`) |
| `target_service` | `String` | Non-empty string | Destination microservice (`order-service`, `payment-vault`, etc.) |
| `endpoint` | `String` | Begins with `/` | HTTP request path (`/process`, `/health`, `/exploit/lateral`) |
| `method` | `String` | `GET`, `POST`, `PUT`, `DELETE` | HTTP Method |
| `status_code` | `Integer` | `100` to `599` | HTTP Response Status Code |
| `latency_ms` | `Double` | `>= 0.0` | Measured request execution time in milliseconds |
| `payload_entropy` | `Double` | `0.0` to `8.0` | Shannon entropy of request body bytes (0.0 = uniform/empty) |
| `timestamp` | `Long` | Epoch Milliseconds | Time when request was observed |

### 2.3 Java 21 Record Implementation (`TelemetryEventRecord.java`)

Member 2 must consume events into an immutable Jackson-mapped record:

```java
package com.autotrace.graphengine.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record TelemetryEventRecord(
    @JsonProperty(value = "trace_id", required = true) String traceId,
    @JsonProperty(value = "source_service", required = true) String sourceService,
    @JsonProperty(value = "target_service", required = true) String targetService,
    @JsonProperty(value = "endpoint", required = true) String endpoint,
    @JsonProperty(value = "method", required = true) String method,
    @JsonProperty(value = "status_code", required = true) int statusCode,
    @JsonProperty(value = "latency_ms", required = true) double latencyMs,
    @JsonProperty(value = "payload_entropy", required = true) double payloadEntropy,
    @JsonProperty(value = "timestamp", required = true) long timestamp
) {}
```

---

## 3. Required Architecture for `services/graph-engine/`

### 3.1 Technology Stack
- **Language & Runtime:** Java 21 (LTS)
- **Framework:** Spring Boot 3.3.x
- **Build Tool:** Maven (`./mvnw clean test-compile` must pass)
- **Kafka Client:** `spring-kafka`
- **Graph In-Memory Engine:** JGraphT (`org.jgrapht:jgrapht-core`) or concurrent thread-safe adjacency map (`ConcurrentHashMap`)
- **WebSocket Protocol:** Spring WebSocket with STOMP message broker (`spring-boot-starter-websocket`)
- **HTTP Client:** `WebClient` / `RestClient` for downstream REST dispatch

### 3.2 Kafka Consumer Configuration
In `application.yml`:
```yaml
spring:
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
    consumer:
      group-id: autotrace-graph-engine-group
      auto-offset-reset: latest
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      properties:
        spring.json.trusted.packages: "com.autotrace.graphengine.*"
        spring.json.value.default.type: "com.autotrace.graphengine.model.TelemetryEventRecord"
```

### 3.3 Dynamic In-Memory Dependency Graph Model ($G = (V, E)$)
The Graph Engine maintains a live, thread-safe directed graph in memory:
1. **Vertices ($V$):** Each unique service node (`gateway-service`, `order-service`, `payment-vault`, `reviews-service`).
   - Node status: `HEALTHY`, `DEGRADED`, or `ANOMALOUS`.
2. **Directed Edges ($E$):** Each active service-to-service communication link $(u, v)$.
   - Sliding window aggregation (recommended: 5-second tumbling or sliding window):
     - `call_count`: Total requests observed over window.
     - `p99_latency_ms`: 99th percentile response latency over window.
     - `error_rate`: Ratio of non-2xx responses $\frac{\sum \text{errors}}{\sum \text{requests}}$.
     - `avg_payload_entropy`: Mean Shannon entropy of requests.
     - `last_seen_timestamp`: Timestamp of most recent telemetry event.
     - `is_anomalous`: Boolean flag set when flagged by Member 3.

---

## 4. Cross-Service Integration & Dispatch Protocols

```text
[ Redpanda: telemetry.events ]
              │
              ▼ (Kafka Consumer)
┌──────────────────────────────────────────┐
│  Graph Engine (port 8080)                │
│  - In-memory graph G = (V, E)            │
│  - 5-sec sliding window aggregation      │
└──────┬──────────────────────┬────────────┘
       │                      │
       ▼ (REST /score-edge)   ▼ (REST /quarantine)
┌───────────────┐      ┌─────────────────────────┐
│  ML Detector  │      │  Security Actuator      │
│  (port 8000)  │      │  (port 8081)            │
└───────────────┘      └─────────────────────────┘
       │
       ▼ (STOMP WebSocket /topic/topology)
┌─────────────────────────┐
│  Web Dashboard          │
│  (port 3000)            │
└─────────────────────────┘
```

### 4.1 Dispatch to Member 3 (AI/ML Inference)
- **Trigger:** When a new edge $(u, v)$ is registered or an existing edge exhibits anomalous latency/entropy.
- **Endpoint:** `POST http://ml-detector:8000/api/v1/score-edge` (or `http://localhost:8000/api/v1/score-edge` locally).
- **Request Payload:**
  ```json
  {
    "source": "reviews-service",
    "target": "payment-vault",
    "features": {
      "call_count": 5,
      "p99_latency_ms": 18.5,
      "error_rate": 0.0,
      "payload_entropy": 2.45
    }
  }
  ```
- **Response Handling:**
  ```json
  {
    "source": "reviews-service",
    "target": "payment-vault",
    "is_anomalous": true,
    "confidence": 0.98,
    "reason": "Rogue edge detected outside baseline topology A_base"
  }
  ```

### 4.2 Dispatch to Member 4 (Security Actuator)
- **Trigger:** When Member 3 returns `is_anomalous: true`.
- **Endpoint:** `POST http://actuator-security:8081/api/v1/quarantine` (or `http://localhost:8081/api/v1/quarantine` locally).
- **Request Payload:**
  ```json
  {
    "alert_id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": 1791188308857,
    "source_service": "reviews-service",
    "target_service": "payment-vault",
    "anomaly_type": "ROGUE_EDGE",
    "severity": "CRITICAL",
    "details": {
      "confidence": 0.98,
      "reason": "Rogue edge detected outside baseline topology A_base"
    }
  }
  ```

### 4.3 Outbound WebSocket Broadcast to Frontend (Port 3000)
- **STOMP Destination:** `/topic/topology`
- **Broadcast Frequency:** Every `1000ms` via `@Scheduled(fixedRate = 1000)`
- **WebSocket Frame Schema:**
  ```json
  {
    "timestamp": 1791188308857,
    "nodes": [
      {
        "id": "gateway-service",
        "name": "gateway-service",
        "status": "HEALTHY",
        "metrics": {
          "req_per_sec": 12.4,
          "avg_latency_ms": 14.5,
          "error_rate": 0.0
        }
      },
      {
        "id": "order-service",
        "name": "order-service",
        "status": "HEALTHY",
        "metrics": {
          "req_per_sec": 12.4,
          "avg_latency_ms": 28.2,
          "error_rate": 0.0
        }
      },
      {
        "id": "reviews-service",
        "name": "reviews-service",
        "status": "ANOMALOUS",
        "metrics": {
          "req_per_sec": 1.0,
          "avg_latency_ms": 16.8,
          "error_rate": 0.0
        }
      },
      {
        "id": "payment-vault",
        "name": "payment-vault",
        "status": "HEALTHY",
        "metrics": {
          "req_per_sec": 13.4,
          "avg_latency_ms": 10.1,
          "error_rate": 0.0
        }
      }
    ],
    "edges": [
      {
        "id": "gateway-service->order-service",
        "source": "gateway-service",
        "target": "order-service",
        "call_count": 62,
        "p99_latency_ms": 32.1,
        "is_anomalous": false
      },
      {
        "id": "order-service->payment-vault",
        "source": "order-service",
        "target": "payment-vault",
        "call_count": 62,
        "p99_latency_ms": 18.0,
        "is_anomalous": false
      },
      {
        "id": "reviews-service->payment-vault",
        "source": "reviews-service",
        "target": "payment-vault",
        "call_count": 1,
        "p99_latency_ms": 16.8,
        "is_anomalous": true
      }
    ]
  }
  ```

---

## 5. Local Development, Decoupled Mocking & Verification

### 5.1 Local Execution against Running Testbed
Member 2 can run the Spring Boot service directly on the host machine without starting full containers:
```bash
# Ensure infrastructure and testbed are active in Docker
docker compose -f infra/docker-compose.yml up -d redpanda redis
docker compose -f infra/docker-compose.testbed.yml up -d

# Start the continuous legitimate traffic generator
./testbed/cluster-simulation/traffic-generator.sh http://localhost:5001/process

# Run Spring Boot Graph Engine locally on host port 8080
cd services/graph-engine
./mvnw spring-boot:run -Dspring-boot.run.arguments="--spring.kafka.bootstrap-servers=localhost:9092"
```

### 5.2 Synthetic Mock Stream Fallback
To allow isolated unit testing when Redpanda is not reachable, implement a mock stream configuration:
```yaml
autotrace:
  mock-stream: ${MOCK_STREAM:false}
```
When `autotrace.mock-stream=true`, an internal `@Scheduled` mock producer generates synthetic `TelemetryEventRecord` objects every 500ms to drive graph state calculations without Kafka.

### 5.3 Mandatory Verification Commands
Before submitting a pull request, Member 2 must execute and pass:
```bash
cd services/graph-engine
./mvnw clean test-compile
./mvnw test
```
