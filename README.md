# AutoTrace-Sec

**Autonomous Distributed Observability & Zero-Trust Lateral Defense Mesh.**

Solves cascading microservice failure blindness via Graph Attention Networks (GAT) and stops unauthorized internal east-west lateral movement in <2 seconds using autonomous kernel/proxy isolation.

---

## 4-Member Role Ownership Matrix

| Member & Role | Assigned Directory | Technology Stack | Primary Responsibility |
| :--- | :--- | :--- | :--- |
| **Member 1**<br>Distributed Systems Engineer | `services/telemetry-collector/`<br>`infra/`<br>`testbed/cluster-simulation/` | Go / Redpanda / Docker Compose | Out-of-band network interception and broker streaming. |
| **Member 2**<br>Backend Engineer | `services/graph-engine/` | Java 21, Spring Boot 3.3+, Maven | In-memory dynamic graph state, Kafka consumer, and WebSocket topology streamer. |
| **Member 3**<br>AI / ML Engineer | `services/ml-detector/` | Python 3.11, PyTorch Geometric, FastAPI, `uv` | Graph causal root-cause localization and rogue edge anomaly scoring ($A_{\text{base}}$). |
| **Member 4**<br>Cybersecurity Engineer | `services/actuator-security/`<br>`testbed/attacks/`<br>`testbed/chaos/` | Python / Bash / `iptables` / Docker API | Zero-trust containment daemon and lateral attack simulation. |
| **Shared Responsibility**<br>Frontend Dashboard | `apps/web-dashboard/` | Next.js 14 App Router, TypeScript, Tailwind, Cytoscape.js | Member 2 connects WebSockets/state; Members 1 & 4 assist with UI layout and live demo triggers. |

---

## Repository Folder Structure

```text
autotrace-sec/
├── .github/
│   ├── workflows/                # CI/CD pipelines (linting, tests per module)
│   └── pull_request_template.md  # Enforces PR descriptions
├── docs/                         # Architecture diagrams, API specs, IEEE report drafts
│   ├── architecture.png
│   └── event-contract.md
├── shared/
│   ├── schemas/                  # SINGLE SOURCE OF TRUTH (Protobuf / JSON Schema)
│   │   ├── telemetry-event.json  # Telemetry schema agreed by all members
│   │   └── alert-payload.json    # Threat/Anomaly event contract
│   └── scripts/                  # Global setup, dev environment bootstrap scripts
│
├── apps/
│   └── web-dashboard/            # [SHARED: FRONTEND DASHBOARD]
│       ├── src/
│       │   ├── components/       # Topology graph view, alert banners
│       │   ├── hooks/            # WebSocket listeners
│       │   └── pages/
│       ├── package.json
│       └── Dockerfile
│
├── services/
│   ├── telemetry-collector/      # [MEMBER 1: DISTRIBUTED SYSTEMS ENGINEER]
│   │   ├── src/                  # eBPF / Envoy / Proxy traffic interceptor
│   │   ├── config/               # Kafka / Redpanda producer configs
│   │   └── Dockerfile
│   │
│   ├── graph-engine/             # [MEMBER 2: BACKEND ENGINEER (Java Spring Boot)]
│   │   ├── src/main/java/        # In-memory graph builder, Kafka consumer
│   │   ├── pom.xml
│   │   └── Dockerfile
│   │
│   ├── ml-detector/              # [MEMBER 3: AI/ML ENGINEER (Python / PyTorch Geometric)]
│   │   ├── models/               # GNN architecture, baseline adjacency weights
│   │   ├── src/                  # FastAPI inference service (/score-edge, /rca)
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   └── actuator-security/        # [MEMBER 4: CYBERSECURITY SPECIALIST]
│       ├── policies/             # eBPF socket-drop filters, iptables rules
│       ├── pki/                  # mTLS SPIFFE/SPIRE identity revocation hooks
│       ├── src/                  # Containment actuator daemon
│       └── Dockerfile
│
├── testbed/                      # [SHARED M1 & M4: CLUSTER TESTBED & ATTACKS]
│   ├── cluster-simulation/       # [MEMBER 1] 4-node mock microservice app
│   │   ├── gateway-service/
│   │   ├── order-service/
│   │   ├── payment-vault/
│   │   └── reviews-service/      # Vulnerable entry node for lateral attack testing
│   ├── chaos/                    # [MEMBER 4] Latency and failure injection scripts
│   └── attacks/                  # [MEMBER 4] Lateral movement attack scripts (SSRF, rogue curl)
│
├── infra/                        # [MEMBER 1: INFRASTRUCTURE ORCHESTRATION]
│   ├── docker-compose.yml        # Runs Redpanda, Redis, and central services
│   ├── docker-compose.testbed.yml# Runs the simulated Amazon microservices
│   └── env.example
│
├── .gitignore
├── AGENTS.md                     # Single Source of Truth for all AI coding agents
├── README.md
└── LICENSE
```

---

## Working Rules & Guidelines for Teammates

- **Directory Isolation:** Work strictly within your assigned module directory. Never modify shared schemas in `shared/schemas/` without consensus.
- **AI Agent Directive:** Before prompting Claude Code, Cursor, Windsurf, or Antigravity, refer them to `@AGENTS.md` as the single source of truth.
- **Port Allocation Map (`autotrace-mesh` network):**
  - **Broker:** `9092` (Redpanda / Kafka)
  - **Graph Backend:** `8080` (Spring Boot WebSocket `/ws/topology`)
  - **ML Inference:** `8000` (FastAPI)
  - **Security Actuator:** `8081`
  - **Dashboard:** `3000` (Next.js)
  - **Testbed Services:** Gateway (`5000`), Order (`5001`), Reviews (`5002`), Payment Vault (`5003`)

---

## Quick Start (Bootstrap Commands)

### 1. Start Core Infrastructure & Simulated Testbed

```bash
# Spin up Redpanda, Redis, and core AutoTrace-Sec services
docker compose -f infra/docker-compose.yml up -d

# Spin up simulated Amazon microservices (ports 5000-5003)
docker compose -f infra/docker-compose.testbed.yml up -d
```

### 2. Verify Each Module Independently

```bash
# Member 1 — Telemetry Collector & Compose Config Validation
cd services/telemetry-collector && go test ./... # (or pytest)
docker compose -f infra/docker-compose.yml config
docker compose -f infra/docker-compose.testbed.yml config

# Member 2 — Graph Engine (Spring Boot)
cd services/graph-engine && ./mvnw clean test-compile

# Member 3 — ML Detector (PyTorch Geometric / FastAPI)
cd services/ml-detector && uv run pytest tests/

# Member 4 — Actuator Security (Containment Daemon)
cd services/actuator-security && pytest tests/

# Shared — Web Dashboard (Next.js 14)
cd apps/web-dashboard && npm run build && npm run lint
```
