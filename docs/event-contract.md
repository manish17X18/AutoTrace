# AutoTrace-Sec: Event Contracts Specification

This document details the canonical schemas and message payload contracts across the AutoTrace-Sec event streaming pipeline.

---

## 1. Telemetry Event Contract (`telemetry.events`)

**Producer:** `services/telemetry-collector/` (Member 1)  
**Consumer:** `services/graph-engine/` (Member 2)  
**Schema Reference:** [`shared/schemas/telemetry-event.json`](file:///Users/vinithvshanbhag/meg/autotrace-sec/shared/schemas/telemetry-event.json)  
**Streaming Topic:** `telemetry.events` (Redpanda / Kafka port `9092` / `29092`)

### 1.1 Canonical JSON Payload Structure

Every published record value is a UTF-8 JSON string strictly conforming to the 9-field schema:

```json
{
  "trace_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "source_service": "gateway-service",
  "target_service": "order-service",
  "endpoint": "/process",
  "method": "GET",
  "status_code": 200,
  "latency_ms": 15.2,
  "payload_entropy": 0.0,
  "timestamp": 1788105014000
}
```

### 1.2 Field Definitions & Constraints

| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `trace_id` | `string` | Yes | UUIDv4 format (`[a-f0-9-]{36}`) | Unique distributed transaction identifier. |
| `source_service` | `string` | Yes | Non-empty string | Originating microservice node name. |
| `target_service` | `string` | Yes | Non-empty string | Destination microservice node name. |
| `endpoint` | `string` | Yes | String starting with `/` | Request path (e.g. `/process`, `/exploit/lateral`). |
| `method` | `string` | Yes | `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS` | Standard HTTP method. |
| `status_code` | `integer` | Yes | `100` – `599` | HTTP response status code. |
| `latency_ms` | `number` | Yes | `>= 0.0` | Observed duration in milliseconds. |
| `payload_entropy` | `number` | Yes | `0.0` – `8.0` | Shannon entropy of request payload. |
| `timestamp` | `integer` | Yes | Epoch milliseconds (`>= 0`) | Observation timestamp. |

---

## 2. Ingestion Endpoints (`services/telemetry-collector`)

- **Direct Ingestion:** `POST /api/v1/telemetry/record`
  Accepts raw metrics and buffers them asynchronously to Redpanda.
- **Proxy Interceptor:** `ALL /proxy/:targetService/*`
  Proxies calls between testbed nodes, transparently measuring latency, entropy, and emitting trace events.
- **Liveness & Health:** `GET /health`
  Reports service status and Kafka broker connection state.
