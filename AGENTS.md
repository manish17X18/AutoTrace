# AGENTS.md — AutoTrace-Sec Central Engineering & AI Agent Guide

This document is the **central source of truth** for all human developers (**Members 1–4**) and all AI coding agents (including Antigravity, Claude, Cursor, GitHub Copilot, and other coding assistants) working inside the `autotrace-sec/` repository. Any companion agent pointer files (such as `CLAUDE.md`, `.cursorrules`, or `.github/copilot-instructions.md`) defer strictly to this file.

Every developer and AI coding agent MUST read and follow this document before inspecting, creating, or modifying any file in this repository.

---

## 1. Project Overview

**AutoTrace-Sec** is a distributed security monitoring, anomaly/threat detection, and automated security containment system built around service-to-service telemetry, live dependency graph construction, graph machine learning inference, and automated runtime containment.

### High-Level Concept

```text
telemetry collection (services/telemetry-collector)
        ↓
Kafka / Redpanda event streaming (port 9092)
        ↓
graph construction & state/WS orchestration (services/graph-engine — port 8080)
        ↓
ML anomaly / threat detection & GAT RCA (services/ml-detector — port 8000)
        ↓
security containment (services/actuator-security — port 8081)
        ↓
web dashboard visualization (apps/web-dashboard — port 3000)
```

In addition to the core detection and response pipeline, the repository includes an isolated multi-service simulation and fault/attack injection environment (`testbed/`, ports `5000–5003`) representing a mock e-commerce cluster ("Mock Amazon") used to safely evaluate detection accuracy, root-cause analysis (RCA), and automated containment policies over the shared `autotrace-mesh` network.

> **Important Constraint:** Do NOT invent or assume additional product features, external cloud integrations, or extra pipeline stages beyond the architecture established in this repository. Where specific implementation details are not yet populated in the repository files, they must be agreed upon by the team and recorded in `shared/schemas/` and `docs/event-contract.md` rather than invented unilaterally.

---

## 2. Core Architectural Principles & Directory Ownership Matrix

### 2.1 Core Architectural Principles

1. **Modular Services:** Each runtime capability (telemetry collection, graph building, ML detection, security containment, frontend visualization, and testbed simulation) lives in its own isolated directory with independent build and runtime configuration.
2. **Clear Service Boundaries:** Each service owns its internal domain logic, state, and dependencies. No service may reach into another service's source tree or internal runtime state.
3. **Event-Driven & Contract-First Communication:** Telemetry ingestion and downstream alerting follow an asynchronous, event-driven pipeline backed by Redpanda/Kafka and explicitly defined HTTP/WebSocket interfaces governed by `shared/schemas/`.
4. **Loose Coupling:** Services interact only through versioned, documented schemas (`telemetry-event.json`, `alert-payload.json`, and WebSocket frames) and explicit network APIs/streams.
5. **Reproducibility:** Local builds, container images, ML model weights/inference behavior (`A_base`), and testbed scenarios must be deterministic and reproducible across all four team members' machines via `infra/`.
6. **Security by Design:** Privileged telemetry/containment hooks (`eBPF`, `iptables`, Docker API, `mTLS`/SPIFFE/SPIRE) and offensive testbed scripts (`testbed/attacks/`, `testbed/chaos/`) are strictly scoped, auditable, and isolated from host and external systems.
7. **Testability:** Every module must be testable in isolation (via its role-specific verification command) as well as within the orchestrated local environment (`infra/docker-compose.yml` and `infra/docker-compose.testbed.yml`).
8. **Observability:** Services must emit structured, actionable logs covering lifecycle events, contract validation errors, inference outcomes, and containment actions without leaking sensitive data.
9. **Minimal Cross-Service Assumptions:** A service must never assume undocumented behavior, internal class structures, or unvalidated payload fields from upstream or downstream components.

### 2.2 The 4-Member Role & Directory Ownership Matrix

The team operates under a **4-Member Engineering Structure** with shared responsibility for `apps/web-dashboard/`:

| Member & Role | Owned Directories | Scope & Core Responsibilities | Core Tech Stack | Mandatory Verification Command(s) |
| :--- | :--- | :--- | :--- | :--- |
| **Member 1**<br>Distributed Systems Engineer | `services/telemetry-collector/`<br>`infra/`<br>`testbed/cluster-simulation/` | Telemetry interception & Redpanda/Kafka producer configs; Docker Compose platform & testbed orchestration; "Mock Amazon" cluster simulation services (`gateway-service`, `order-service`, `payment-vault`, `reviews-service`). | Go 1.22+ / Python 3.11, Redpanda/Kafka broker configs, Docker Compose | `go test ./...` or `pytest`<br>`docker compose -f infra/docker-compose.testbed.yml config`<br>`docker compose -f infra/docker-compose.yml config` |
| **Member 2**<br>Backend Engineer | `services/graph-engine/` | Topology ingestion from Redpanda/Kafka, in-memory dependency graph state, `/score-edge` & `/rca` orchestration, WebSocket broadcaster to frontend, and actuation dispatcher. | Java 21, Spring Boot 3.3+, Maven | `./mvnw clean test-compile`<br>`./mvnw test` |
| **Member 3**<br>AI / ML Engineer | `services/ml-detector/` | Graph Attention Network (GAT) for Root-Cause Analysis (`/rca`), Baseline Adjacency Matrix ($A_{\text{base}}$), and Rogue Edge Link Prediction (`/score-edge`). | Python 3.11, PyTorch Geometric, FastAPI, `uv` | `uv run pytest tests/` |
| **Member 4**<br>Cybersecurity Engineer | `services/actuator-security/`<br>`testbed/attacks/`<br>`testbed/chaos/` | Automated containment daemon (`iptables`, eBPF socket-drop filters, Docker API, SPIFFE/SPIRE hooks), lateral movement attack scripts (`testbed/attacks/`), and chaos injection scripts (`testbed/chaos/`). | Python 3.11, Bash, `iptables`, eBPF socket filters, Docker API | `pytest tests/` and containment/attack script verification in isolated testbed |
| **Shared Responsibility**<br>Frontend Dashboard | `apps/web-dashboard/` | **Member 2:** WebSocket integration & live graph/alert state binding (`src/hooks/`).<br>**Member 4 & Member 1:** UI layout, Cytoscape.js visual topology graph rendering, alert banners, and attack/chaos trigger controls (`src/components/`, `src/pages/` or `src/app/`). | Next.js 14 (App Router), TypeScript, Tailwind CSS, Cytoscape.js | `npm run build && npm run lint` |
| **All Members (1–4)**<br>Shared Governance | `shared/schemas/`<br>`shared/scripts/`<br>`docs/`<br>`.github/` | Single source of truth for event contracts (`telemetry-event.json`, `alert-payload.json`), global bootstrap scripts, architecture specs (`event-contract.md`), and CI workflows. | JSON Schema / Protobuf, Bash, Markdown, GitHub Actions | Contract validation across all affected producers and consumers |

### 2.3 Shared Frontend Protocol (`apps/web-dashboard/`)

Because `apps/web-dashboard/` is shared across **Member 2** (WebSocket & state binding) and **Member 4 / Member 1** (UI layout, Cytoscape.js graph rendering, and attack trigger controls), all contributors and AI agents touching `apps/web-dashboard/` MUST follow these rules:
1. **Work in Isolated Components/Hooks:** Keep WebSocket listeners and state management cleanly isolated in `src/hooks/` (Member 2) and visual presentation components (`Cytoscape` topology canvas, alert banners, attack trigger panels) isolated in `src/components/` (Member 4 / Member 1).
2. **Standard Stack Conventions:** Strictly use **Next.js 14 App Router** conventions with **TypeScript** and **Tailwind CSS**. Do not introduce conflicting state libraries or styling systems.
3. **Mandatory Verification:** Every change to `apps/web-dashboard/` must pass `npm run build && npm run lint` before opening or merging a Pull Request.

---

## 3. Repository Structure

The repository directory structure is finalized. **Do NOT delete, rename, move, or reorganize any directories.**

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
│   └── web-dashboard/            # SHARED: MEMBER 2 (WS/State) & MEMBER 4 / MEMBER 1 (UI/Cytoscape/Attack Controls)
│       ├── src/
│       │   ├── components/       # Cytoscape.js topology graph view, alert banners, attack trigger controls
│       │   ├── hooks/            # WebSocket listeners & state binding
│       │   └── pages/            # (or Next.js 14 App Router routes)
│       ├── package.json
│       └── Dockerfile
│
├── services/
│   ├── telemetry-collector/      # MEMBER 1: DISTRIBUTED SYSTEMS ENGINEER (Go 1.22+ / Python 3.11)
│   │   ├── src/                  # eBPF / Envoy / Proxy traffic interceptor
│   │   ├── config/               # Kafka / Redpanda producer configs
│   │   └── Dockerfile
│   │
│   ├── graph-engine/             # MEMBER 2: BACKEND ENGINEER (Java 21 / Spring Boot 3.3+ / Maven)
│   │   ├── src/main/java/        # In-memory graph builder, Kafka consumer, WS broadcaster, actuation dispatcher
│   │   ├── pom.xml (or build.gradle)
│   │   └── Dockerfile
│   │
│   ├── ml-detector/              # MEMBER 3: AI/ML ENGINEER (Python 3.11 / PyTorch Geometric / FastAPI / uv)
│   │   ├── models/                # GAT RCA architecture, baseline adjacency matrix (A_base), rogue edge link prediction
│   │   ├── src/                   # FastAPI inference service (/score-edge, /rca)
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   └── actuator-security/         # MEMBER 4: CYBERSECURITY ENGINEER (Python 3.11 / Bash / iptables / eBPF / Docker API)
│       ├── policies/              # eBPF socket-drop filters, iptables rules
│       ├── pki/                   # mTLS SPIFFE/SPIRE identity revocation hooks
│       ├── src/                   # Containment actuator daemon
│       └── Dockerfile
│
├── testbed/                       # SPLIT OWNERSHIP: MEMBER 1 (Cluster) & MEMBER 4 (Attacks/Chaos)
│   ├── cluster-simulation/        # MEMBER 1: The "Mock Amazon" multi-service app (ports 5000-5003)
│   │   ├── gateway-service/
│   │   ├── order-service/
│   │   ├── payment-vault/
│   │   └── reviews-service/       # Intentionally vulnerable node for attack testing
│   ├── chaos/                     # MEMBER 4: Injected failure scripts (CPU hog, latency injection)
│   └── attacks/                   # MEMBER 4: Lateral movement attack scripts (SSRF, rogue curl)
│
├── infra/                         # MEMBER 1: Shared infrastructure orchestration (autotrace-mesh)
│   ├── docker-compose.yml         # Runs Redpanda/Kafka, Redis, and core AutoTrace-Sec services
│   ├── docker-compose.testbed.yml # Runs the simulated "Mock Amazon" services
│   └── env.example
│
├── .gitignore
├── AGENTS.md
├── README.md
└── LICENSE
```

---

## 4. Ownership and Responsibility Rules

Each module has a designated owner (**Members 1–4**) as defined in Section 2.2:

1. **Member 1 (Distributed Systems Engineer)** owns:
   - `services/telemetry-collector/` (traffic interception and telemetry event production to Redpanda/Kafka)
   - `infra/` (`docker-compose.yml`, `docker-compose.testbed.yml`, Redpanda/Kafka broker configs, `autotrace-mesh` network orchestration, and `env.example`)
   - `testbed/cluster-simulation/` (`gateway-service`, `order-service`, `payment-vault`, and `reviews-service`)
   - Shared UI contributions in `apps/web-dashboard/` (layout, Cytoscape.js topology rendering, and testbed control integration).
2. **Member 2 (Backend Engineer)** owns:
   - `services/graph-engine/` (Redpanda/Kafka telemetry ingestion, in-memory dependency graph state, ML scoring orchestration, WebSocket broadcasting, and actuation dispatching)
   - Shared frontend contributions in `apps/web-dashboard/` (WebSocket client hooks and live state binding).
3. **Member 3 (AI / ML Engineer)** owns:
   - `services/ml-detector/` (Graph Attention Network for root-cause analysis `/rca`, Baseline Adjacency Matrix $A_{\text{base}}$, and Rogue Edge Link Prediction `/score-edge`).
4. **Member 4 (Cybersecurity Engineer)** owns:
   - `services/actuator-security/` (containment daemon, `iptables` rules, eBPF socket-drop filters, Docker API containment, and SPIFFE/SPIRE identity revocation hooks)
   - `testbed/attacks/` and `testbed/chaos/` (lateral movement attack scripts such as SSRF/rogue `curl` and chaos failure injection scripts)
   - Shared UI contributions in `apps/web-dashboard/` (security containment visualizations and attack/chaos trigger controls).

### What Ownership Means

Ownership carries five core obligations:
1. **Primary Responsibility:** Designing, implementing, and maintaining the module's internal architecture and runtime behavior.
2. **Code Review Responsibility:** Reviewing and approving any pull requests that touch files within the owned directory.
3. **Maintaining Tests:** Ensuring unit, integration, and contract verification commands for the module remain green and comprehensive.
4. **Preventing Breaking Changes:** Safeguarding upstream/downstream consumers from unannounced behavioral or interface changes.
5. **Documenting Interfaces:** Keeping module usage, configuration variables, and contract expectations accurate.

### Cross-Module Contributions

Ownership does **not** mean other members are forbidden from contributing to a module. Cross-module contributions are permitted when:
- They are explicitly coordinated with the module owner (Member 1, 2, 3, or 4) beforehand.
- The module owner reviews and approves the pull request.
- An AI coding agent is **explicitly instructed** by the human developer to modify that specific module.

By default, an AI agent working on a task for Member $X$ must **never** modify files owned by Member $Y$ unless explicitly instructed to do so.

---

## 5. Frozen Contracts, Network Topology & Port Allocations — VERY IMPORTANT

### 5.1 Shared Schemas (`shared/schemas/`)

`shared/schemas/` is the **SINGLE SOURCE OF TRUTH** for all cross-service event and payload schemas:
- `shared/schemas/telemetry-event.json` — The canonical telemetry event schema produced by `services/telemetry-collector/` and consumed by `services/graph-engine/`.
- `shared/schemas/alert-payload.json` — The canonical threat/anomaly alert contract emitted upon anomaly/rogue-edge detection and consumed by `services/actuator-security/` and `apps/web-dashboard/` (alongside WebSocket topology/alert broadcast frames from `services/graph-engine/`).

### 5.2 Frozen Network & Port Allocations

All services and testbed containers communicate over the shared Docker network **`autotrace-mesh`** using the following frozen port allocations. **Do NOT change these ports or network names without unanimous team approval:**

| Component / Service | Directory | Frozen Port(s) | Docker Network | Owner |
| :--- | :--- | :--- | :--- | :--- |
| **Redpanda / Kafka Broker** | `infra/docker-compose.yml` | `9092` | `autotrace-mesh` | Member 1 |
| **Graph Engine** (REST & WebSocket) | `services/graph-engine/` | `8080` | `autotrace-mesh` | Member 2 |
| **ML Detector** (FastAPI `/score-edge`, `/rca`) | `services/ml-detector/` | `8000` | `autotrace-mesh` | Member 3 |
| **Actuator Security** (Containment API/Daemon) | `services/actuator-security/` | `8081` | `autotrace-mesh` | Member 4 |
| **Web Dashboard** (Next.js 14 Frontend) | `apps/web-dashboard/` | `3000` | `autotrace-mesh` | Shared (M2 & M4/M1) |
| **Testbed Cluster Simulation** (`gateway-service`, `order-service`, `payment-vault`, `reviews-service`) | `testbed/cluster-simulation/` | `5000–5003` | `autotrace-mesh` | Member 1 |

### 5.3 Mandatory Contract Rules for Developers and AI Agents

1. **No Local Redefinition or Drift:** Agents and developers MUST NOT invent divergent local schema definitions inside individual services that contradict or silently extend `shared/schemas/`. Internal DTOs, Go structs, Pydantic models, Java records/POJOs, and TypeScript interfaces must strictly mirror `shared/schemas/`.
2. **No Silent Schema Edits:** No agent or developer may silently alter a file in `shared/schemas/` merely to make their single service compile or pass local tests.
3. **Required Workflow Before Changing a Shared Schema:**
   1. **Identify all producers and consumers** across `services/` and `apps/web-dashboard/`.
   2. **Assess backward compatibility** (e.g., whether fields are added optionally vs. renamed/removed/retyped).
   3. **Coordinate with all affected module owners** (Members 1–4) and obtain explicit agreement.
   4. **Update affected producers and consumers** (or coordinate synchronized PRs) so no service breaks.
   5. **Update contract and integration tests** in all affected modules.
   6. **Update `docs/event-contract.md`** so human-readable documentation stays synchronized with `shared/schemas/`.
   7. **Clearly call out the schema change** in the Pull Request description.

---

## 6. Event Flow

The end-to-end runtime flow of AutoTrace-Sec across `autotrace-mesh` is:

```text
[ Testbed Cluster Simulation (ports 5000–5003) / Monitored Services ]
              │
              ▼ (service-to-service traffic)
┌──────────────────────────────────────────┐
│  1. Telemetry Collector                  │  (services/telemetry-collector — Member 1)
│     Go 1.22+ / Python 3.11 interceptor   │
└────────────────────┬─────────────────────┘
                     │ Produces telemetry events (shared/schemas/telemetry-event.json)
                     ▼
┌──────────────────────────────────────────┐
│  2. Redpanda / Kafka Broker (port 9092)  │  (infra/docker-compose.yml — Member 1)
└────────────────────┬─────────────────────┘
                     │ Consumes telemetry stream
                     ▼
┌──────────────────────────────────────────┐
│  3. Graph Engine (port 8080)             │  (services/graph-engine — Member 2)
│     Java 21 / Spring Boot 3.3+           │
│     In-memory graph, WS broadcaster,     │
│     & actuation dispatcher               │
└────────────────────┬─────────────────────┘
                     │ Graph state / rogue edge scoring & GAT RCA (/score-edge, /rca)
                     ▼
┌──────────────────────────────────────────┐
│  4. ML Detector (port 8000)              │  (services/ml-detector — Member 3)
│     Python 3.11 / FastAPI / PyG / uv     │
│     GAT RCA & A_base link prediction     │
└────────────────────┬─────────────────────┘
                     │ Threat / anomaly alert payload (shared/schemas/alert-payload.json)
                     ├────────────────────────────────────────────┐
                     ▼                                            ▼
┌──────────────────────────────────────────┐ ┌──────────────────────────────────────────┐
│  5. Security Actuator (port 8081)        │ │  6. Web Dashboard (port 3000)            │
│     (services/actuator-security — M4)    │ │     (apps/web-dashboard — Shared M2/M4/M1)│
│     iptables / eBPF socket-drop /        │ │     Next.js 14 / Cytoscape.js topology   │
│     Docker API / SPIFFE-SPIRE hooks      │ │     & real-time WebSocket alerts         │
└──────────────────────────────────────────┘ └──────────────────────────────────────────┘
```

### Rules Regarding Event Flow
- While internal implementation details within each stage may evolve, the **interfaces, ports, and event contracts between stages must remain explicit and documented**.
- **Do NOT invent Kafka topic names, Redis keys, WebSocket frame types, or HTTP endpoints** unless they already exist in the repository configuration/code or are explicitly specified by the user/team for the task. Surface configurable parameters via environment variables documented in `infra/env.example`.

---

## 7. Service Boundary Rules

Every service in `services/` and `apps/` is an independent deployable unit.

### Strictly Prohibited Practices
- **Direct Internal State Access:** Never read or mutate another service's in-memory data structures, local filesystem storage, or internal database/cache structures without going through an agreed contract.
- **Tight Coupling of Implementation Details:** Do not leak language-specific serialization formats (e.g., Java serialization, Python `pickle`) across service boundaries. Use standard JSON/Protobuf contracts defined in `shared/schemas/`.
- **Duplicating Core Business Logic:**
  - `telemetry-collector` (Member 1) captures and forwards telemetry; it does not run ML inference or build global topology graphs.
  - `graph-engine` (Member 2) manages in-memory graph state, orchestrates ML scoring, broadcasts WebSocket updates, and dispatches actuation; it does not execute low-level kernel packet drops directly.
  - `ml-detector` (Member 3) performs GAT root-cause analysis (`/rca`) and $A_{\text{base}}$ rogue-edge link prediction (`/score-edge`); it does not directly manipulate `iptables`, Docker containers, or `eBPF` sockets.
  - `actuator-security` (Member 4) executes containment policies based on verified threat/alert inputs; it does not perform ML model training or graph construction.
  - `web-dashboard` (Shared: M2 & M4/M1) renders Cytoscape.js topology, alert banners, and testbed trigger controls; it does not make autonomous security containment decisions.
- **Hidden Dependencies:** Do not rely on undocumented startup ordering, shared local temp files, or implicit network ports outside the frozen port table (`9092`, `8080`, `8000`, `8081`, `3000`, `5000–5003`).
- **Hard-Coded Machine Paths:** Never hard-code developer-specific absolute paths (e.g., `/Users/...` or `/home/...`) in source code, scripts, or Dockerfiles.
- **Cross-Service Source Imports:** Never import source code directly from a sibling service directory. Shared artifacts belong strictly in `shared/`.

---

## 8. Technology-Specific Guidelines & Verification Commands

Respect the existing technology stack and directory layout of each module. **Do not impose a rigid sub-package structure that does not currently exist unless creating initial files as instructed by the module owner.**

### 8.1 Telemetry Collector, Infrastructure & Cluster Simulation (`services/telemetry-collector/`, `infra/`, `testbed/cluster-simulation/` — Member 1)
- **Stack:** Go 1.22+ / Python 3.11, Redpanda/Kafka broker configurations, Docker Compose orchestration.
- Keep telemetry capture logic modular and decouple event serialization from transport so schema compliance with `shared/schemas/telemetry-event.json` can be unit-tested without a live broker.
- Keep `testbed/cluster-simulation/` ("Mock Amazon": `gateway-service`, `order-service`, `payment-vault`, `reviews-service`) mapped to ports `5000–5003` on the `autotrace-mesh` network.
- Ensure all `Dockerfile`s and Compose files (`infra/docker-compose.yml`, `infra/docker-compose.testbed.yml`) use pinned base images and environment variables templated in `infra/env.example`.
- **Verification:** Run `go test ./...` or `pytest`, plus `docker compose -f infra/docker-compose.testbed.yml config` (and `docker compose -f infra/docker-compose.yml config`).

### 8.2 Graph Engine (`services/graph-engine/` — Member 2)
- **Stack:** Java 21, Spring Boot 3.3+, Maven (`pom.xml`), exposed on port `8080`.
- Separate concerns cleanly across:
  - **Messaging / Ingestion layer:** Redpanda/Kafka consumer listeners and telemetry event deserialization.
  - **Domain / Service layer:** Concurrent in-memory dependency graph state, windowing, ML Detector client calls (`/score-edge`, `/rca`), and Actuation Dispatcher calls (`port 8081`).
  - **Controller / Broadcaster layer:** REST endpoints and WebSocket broadcaster pushing live topology/alert frames to `apps/web-dashboard/`.
- Keep Kafka consumer logic isolated from core graph-domain algorithms so graph construction and traversal can be unit-tested without a live Kafka broker.
- Never place business or graph manipulation logic inside Spring `@RestController` classes.
- Validate all incoming telemetry payloads and API inputs before mutating graph state; handle malformed messages gracefully without crashing the consumer thread.
- **Verification:** Run `./mvnw clean test-compile` (and `./mvnw test`).

### 8.3 ML Detector (`services/ml-detector/` — Member 3)
- **Stack:** Python 3.11, PyTorch Geometric, FastAPI, managed with `uv`, exposed on port `8000`.
- Separate HTTP transport logic (`src/` FastAPI routes and Pydantic request/response schemas) from GNN model definitions and inference logic (`models/` — Graph Attention Network for RCA, Baseline Adjacency Matrix $A_{\text{base}}$, and Rogue Edge Link Prediction).
- Load PyTorch Geometric models and $A_{\text{base}}$ weights (`models/`) **once at service startup** (via FastAPI lifespan hooks) rather than reloading weights on every `/score-edge` or `/rca` request.
- Make model paths, device selection (`cpu`/`cuda`), and threshold hyperparameters configurable via environment variables with safe defaults.
- Keep ML inference deterministic (`model.eval()`, `torch.no_grad()`, fixed seeds where applicable) and return structured JSON responses with explicit status codes when inputs are invalid.
- **Verification:** Run `uv run pytest tests/`.

### 8.4 Actuator Security & Attack/Chaos Scripts (`services/actuator-security/`, `testbed/attacks/`, `testbed/chaos/` — Member 4)
- **Stack:** Python 3.11, Bash, `iptables`, eBPF socket-drop filters, Docker API, SPIFFE/SPIRE hooks; service exposed on port `8081`.
- Treat all kernel-space (`eBPF`), firewall (`iptables`), Docker container control, identity (`pki/`), and offensive simulation (`testbed/attacks/`, `testbed/chaos/`) code as **high-risk, security-critical code**.
- **Principle of Least Privilege:** Request only the minimum Linux capabilities (`CAP_BPF`, `CAP_NET_ADMIN`, etc.) required, and document every required capability clearly in the `Dockerfile` and `infra/docker-compose.yml`.
- **Safe Defaults & Dry-Run Mode:** Provide a configurable safe/dry-run mode (where containment actions such as socket drops, `iptables` blocks, Docker network disconnects, or identity revocations are logged and emitted as events without executing destructive host-level blocks) for local development and unit testing.
- **Explicit Safeguards:** `actuator-security` must validate target identifiers and never block critical platform components (Redpanda/Kafka `9092`, Graph Engine `8080`, ML Detector `8000`, Web Dashboard `3000`, or host interfaces).
- **Verification:** Run `pytest tests/` and test containment/attack scripts strictly inside the isolated testbed environment.

### 8.5 Frontend Web Dashboard (`apps/web-dashboard/` — Shared: Member 2 & Member 4 / Member 1)
- **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Cytoscape.js, exposed on port `3000`.
- Keep UI components in `src/components/` (Cytoscape.js topology graph canvas, alert banners, and attack/chaos trigger controls) modular, focused, and isolated from raw socket management.
- Isolate WebSocket lifecycle management, reconnection backoff, and frame validation inside custom hooks in `src/hooks/` (owned by Member 2).
- Validate incoming WebSocket frames and REST responses against expected contracts (`shared/schemas/alert-payload.json` and topology schemas) before rendering so malformed payloads never crash the UI.
- Handle disconnected, connecting, and error states gracefully in the UI, and read backend URLs (`8080`, `8081`, etc.) from environment variables (`NEXT_PUBLIC_*`) rather than hard-coding ports in components.
- **Verification:** Run `npm run build && npm run lint`.

---

## 9. Security Rules

AutoTrace-Sec includes both defensive containment tooling (`services/actuator-security/`) and intentionally vulnerable applications plus offensive attack/chaos scripts (`testbed/`). Strict operational boundaries are mandatory.

### Environment Separation

| Environment | Scope | Permitted Actions |
| :--- | :--- | :--- |
| **SAFE TEST ENVIRONMENT** | `testbed/` containers (`gateway-service`, `order-service`, `payment-vault`, `reviews-service` on ports `5000–5003`) running inside the isolated `autotrace-mesh` Docker network defined in `infra/docker-compose.testbed.yml`. | Running `testbed/attacks/` (SSRF, lateral movement, rogue `curl`), `testbed/chaos/` (CPU hog, latency injection), and automated containment policies from `services/actuator-security/`. |
| **REAL / HOST ENVIRONMENT** | Developer's workstation/OS, university/corporate networks, and any external internet hosts or cloud infrastructure. | **ZERO offensive scripts, ZERO chaos scripts, and ZERO destructive firewall/socket drops.** |

### Mandatory Security Directives
1. **Target Scope Enforcement:** Scripts in `testbed/attacks/` and `testbed/chaos/` (Member 4) must **only** target the isolated `testbed/cluster-simulation/` containers (Member 1) over `autotrace-mesh`. Never point attack scripts at external domains, public IPs, or the host machine.
2. **Scoped Vulnerability:** Intentional vulnerabilities (such as those in `testbed/cluster-simulation/reviews-service/`) must remain strictly confined to the testbed service and must never be copied into production services (`services/*` or `apps/web-dashboard/`), nor exposed on public network interfaces (`0.0.0.0` on untrusted networks).
3. **No Host Security Tampering:** Never disable host firewalls, macOS/Linux system integrity protections, or host TLS verification to work around a local development issue.
4. **No Committed Secrets or Keys:** Never commit real private keys, mTLS production certificates, API tokens, or credentials anywhere in the repository (including `services/actuator-security/pki/`). Any test certificates required for local SPIFFE/SPIRE or mTLS simulation must be generated dynamically by bootstrap scripts (`shared/scripts/`) or clearly marked as ephemeral local-only test fixtures ignored by Git.
5. **Document Privileged Operations:** Any script or container requiring `root`, `privileged: true`, `CAP_NET_ADMIN`, `CAP_BPF`, or Docker socket access must clearly document why those privileges are required and how they are bounded.

---

## 10. Secrets and Configuration

- **Zero Secrets in Git:** Passwords, API keys, tokens, private keys (`.pem`, `.key`), and sensitive connection strings must never be committed to version control.
- **Environment Variable Driven:** All runtime configuration (broker URLs, service ports, model file paths, feature flags, dry-run toggles, credentials) must be injected via environment variables.
- **`infra/env.example` as Template:** Whenever a service introduces a new required or optional environment variable, add a documented placeholder entry to `infra/env.example` (with dummy/safe example values only—never real secrets).
- **Local `.env` Files:** Developers must use local, git-ignored `.env` files for machine-specific overrides. Verify `.gitignore` covers local secret and certificate files before staging commits.

---

## 11. Coding Standards

All code written by humans or AI agents across Go, Java, Python, TypeScript/JavaScript, C/eBPF, and Bash scripts must adhere to these standards:

- **Readability Over Cleverness:** Write clear, straightforward code that any of the four team members can understand quickly.
- **Meaningful Naming:** Use descriptive, domain-accurate names aligned with the repository terminology (`TelemetryEvent`, `AlertPayload`, `score_edge`, `A_base`, `reviews-service`, etc.).
- **Small, Focused Units:** Keep functions, methods, classes, and React components small and single-purpose.
- **Purposeful Comments:** Write comments and docstrings that explain **WHY** a decision, threshold, or workaround exists—not line-by-line narration of obvious syntax. Preserve existing meaningful comments and docstrings when editing files.
- **No Premature Abstraction:** Do not build generic plugin frameworks, complex inheritance hierarchies, or over-engineered factories for a single concrete use case.
- **No Premature Optimization:** Prioritize correctness, contract compliance, and clarity first; optimize hot paths based on actual requirements.
- **Explicit Error Handling & Input Validation:** Validate all external inputs (Kafka messages, HTTP payloads, WebSocket frames, CLI arguments, environment variables) at the boundary of each service.
- **Clean Up Dead Code:** Do not leave commented-out code blocks, unused imports, or orphaned debug print statements in commits.
- **Justified Dependencies:** Do not add third-party packages for trivial functionality that the standard library or existing stack already provides.

---

## 12. Testing & Verification Requirements

Changes are not complete without running and passing the module's mandatory verification commands.

### Role-Specific Verification Matrix

| Role / Area | Mandatory Verification Command(s) |
| :--- | :--- |
| **Member 1** (`telemetry-collector`, `infra`, `cluster-simulation`) | `go test ./...` or `pytest`, plus `docker compose -f infra/docker-compose.testbed.yml config` |
| **Member 2** (`graph-engine`) | `./mvnw clean test-compile` (and `./mvnw test`) |
| **Member 3** (`ml-detector`) | `uv run pytest tests/` |
| **Member 4** (`actuator-security`, `attacks`, `chaos`) | `pytest tests/` and containment script verification in isolated testbed |
| **Shared Frontend** (`apps/web-dashboard`) | `npm run build && npm run lint` |

### Mandatory Trigger Rules for Tests
- **If a shared event schema (`shared/schemas/*`) changes:** You MUST validate compatibility across both the producer(s) and all downstream consumer(s).
- **If an HTTP or WebSocket API changes:** You MUST test both valid request/response contracts and error-handling paths (invalid inputs, missing fields).
- **If ML inference (`services/ml-detector/`) changes:** You MUST verify via `uv run pytest tests/` that `/score-edge` ($A_{\text{base}}$ link prediction) and `/rca` (GAT) return deterministic, schema-compliant outputs.
- **If security actuator behavior (`services/actuator-security/`) changes:** You MUST verify containment rules via `pytest tests/` in dry-run mode and solely against the isolated `testbed/` environment.

---

## 13. Git and Branching Rules

To keep collaboration smooth across four engineers and multiple AI agents, follow a clean branching workflow using `develop` for integration verification prior to merging into `main`:

```text
main (production-ready, verified releases)
 └── develop (integration & verification branch)
      ├── feature/member1-<short-description>
      ├── feature/member2-<short-description>
      ├── feature/member3-<short-description>
      ├── feature/member4-<short-description>
      ├── fix/member<1-4>-<short-description>
      └── docs/member<1-4>-<short-description>
```

*(Examples: `feature/member1-telemetry-collector`, `feature/member2-graph-ws-broadcaster`, `feature/member3-gat-rca`, `feature/member4-ebpf-containment`)*

### Workflow Rules
- **Focused Commits:** Each commit and branch should address a single logical task or module change. Do not bundle unrelated refactors or uncoordinated multi-module edits into one branch.
- **Keep Branches Current:** Pull or rebase against `develop` / `main` regularly before opening a PR or starting cross-service integration work.
- **Never Force-Push Shared Branches:** Never `git push --force` to `main`, `develop`, or any branch shared with another team member without explicit coordination.
- **Use Pull Requests:** All changes merging into `develop` and `main` should go through a Pull Request and pass `.github/workflows/` checks.
- **Explicit Disclosures in Commits/PRs:** Always highlight any changes to `shared/schemas/`, `infra/`, `apps/web-dashboard/`, or security-sensitive components (`actuator-security/`, `telemetry-collector/`, `testbed/attacks/`).

---

## 14. Pull Request Requirements

All Pull Requests must respect `.github/pull_request_template.md` and clearly answer the following nine questions:

1. **What changed?** (Concise summary of added, modified, or removed behavior)
2. **Why?** (The problem solved, requirement fulfilled, or bug fixed)
3. **Which module(s) and Member role(s) (Members 1–4) are affected?** (e.g., `services/graph-engine/` [Member 2], `apps/web-dashboard/` [Shared M2/M4/M1])
4. **What verification commands and tests were executed?** (e.g., `./mvnw clean test-compile`, `uv run pytest tests/`, `npm run build && npm run lint`, `docker compose -f infra/docker-compose.testbed.yml config`)
5. **Are there any schema, port, or API changes?** (Impact on `shared/schemas/telemetry-event.json`, `shared/schemas/alert-payload.json`, REST endpoints, WebSocket frames, or frozen ports `9092`, `8080`, `8000`, `8081`, `3000`, `5000–5003`)
6. **Are there any infrastructure changes?** (Changes to `Dockerfile`s, `infra/docker-compose.yml`, `infra/docker-compose.testbed.yml`, `autotrace-mesh`, or `infra/env.example`)
7. **Are there any security implications?** (Privileged capabilities, `eBPF`/`iptables`/Docker API/`pki` rules, or `testbed/attacks/` behavior)
8. **Are there any breaking changes?** (Anything requiring action from other members)
9. **Is coordination required from another member (Members 1–4)?** (Tag the specific member whose upstream/downstream module or shared frontend component is impacted)

---

## 15. AI Coding Agent Rules — VERY IMPORTANT

This repository is actively developed by four engineers using multiple AI coding agents (Antigravity, Claude, Cursor, GitHub Copilot, and others). To prevent cross-agent conflicts, architectural drift, and hallucinated interfaces, **every AI coding agent MUST obey the following protocol.**

### Mandatory Pre-Change Sequence (Before Writing Any Code)
1. **Inspect the repository** structure to confirm current files and layout.
2. **Read `AGENTS.md`** in full.
3. **Identify the target module** and its owner (**Member 1, 2, 3, or 4**, or **Shared Frontend** protocol).
4. **Read the existing code** inside the target module.
5. **Read the shared schemas** in `shared/schemas/` (`telemetry-event.json`, `alert-payload.json`).
6. **Read the relevant documentation** in `docs/` (`event-contract.md`, `architecture.png`).
7. **Understand upstream and downstream dependencies**, frozen ports (`9092`, `8080`, `8000`, `8081`, `3000`, `5000–5003`), and network names (`autotrace-mesh`).
8. **Check cross-module impact:** Determine whether any other service or dashboard component depends on the code or contract being modified.
9. **Plan and execute the smallest reasonable change** that satisfies the user's request, then run the role's mandatory verification command.

### Strictly Prohibited Agent Behaviors (Agents MUST NOT)
- **Do NOT redesign the architecture** without explicit approval from the developer/team.
- **Do NOT create new microservices or top-level directories** casually.
- **Do NOT delete or rename existing directories** (`apps/web-dashboard/`, `services/*`, `testbed/*`, `infra/`, `shared/schemas/` must all remain intact).
- **Do NOT move files** across modules unnecessarily.
- **Do NOT modify shared schemas (`shared/schemas/*`) or frozen ports (`9092`, `8080`, `8000`, `8081`, `3000`, `5000–5003`) silently.**
- **Do NOT introduce new frameworks** or replace existing ones (do not swap Go/Python, Java 21/Spring Boot 3.3+, Python 3.11/FastAPI/PyTorch Geometric/`uv`, Next.js 14/Tailwind/Cytoscape.js, Redpanda/Kafka, or Docker Compose).
- **Do NOT modify another member's module** unless the user prompt explicitly instructs you to work across those modules.
- **Do NOT overwrite working code** without first reading and understanding its purpose and edge cases.
- **Do NOT create duplicate implementations** of existing utilities, models, or schema definitions.
- **Do NOT invent undocumented APIs, database structures, event fields, WebSocket frame types, or Kafka topics.**
- **Do NOT assume undocumented behavior** from upstream or downstream services.
- **Do NOT delete or disable functionality or assertions** just to make a failing test pass.

### How to Handle Architectural Conflicts
If an AI agent discovers a contradiction between a user prompt, an existing implementation, and a shared contract in `shared/schemas/` or `docs/`:
1. **STOP and DO NOT silently resolve or overwrite the contract.**
2. **Identify the exact conflict** (citing the specific files and lines).
3. **Explain the cross-module impact** (which of **Members 1–4** are affected).
4. **Propose clear options** (with trade-offs and compatibility implications).
5. **Ask the human developer/team to decide** before making breaking or cross-module edits.

---

## 16. Minimal-Diff Principle

AI agents must always produce the **smallest, cleanest diff necessary** to complete the requested task:

- **Fixing a single function or bug:** Modify only the affected function and its corresponding test. Do not rewrite or reformat the entire file or service.
- **Adding an API endpoint:** Add the route, handler, validation model, and test within the existing application structure. Do not restructure the project layout.
- **Touching `apps/web-dashboard/`:** Edit only the isolated component (`src/components/`) or hook (`src/hooks/`) relevant to your task so Member 2 and Member 4 / Member 1 never experience merge conflicts.
- **Updating a specific schema field (when approved):** Edit only the targeted field in the relevant schema. Do not reformat or alter unrelated schemas.
- **Fixing a Docker or Compose issue:** Fix the specific service stanza, port, or build step. Do not rewrite the entire `docker-compose.yml` or replace base images across the repo.
- **No Drive-By Formatting:** Never run repo-wide reformatting, import sorting, or whitespace changes on untouched files or lines outside the scope of the task.

---

## 17. Multi-Agent Collaboration Rules

Because four team members may be prompting different AI coding agents concurrently on different branches:

1. **Assume Parallel Work:** Always assume other modules (`services/*`, `apps/web-dashboard/`, `testbed/*`, `infra/`) have active in-flight changes by their respective owners (Members 1–4).
2. **Treat Other Modules as External Dependencies:** Unless explicitly instructed to perform a cross-module integration task, treat sibling directories in `services/` and `testbed/` as read-only external dependencies connected solely via `shared/schemas/`, `autotrace-mesh`, and documented APIs.
3. **Follow the Shared Frontend Protocol:** When working in `apps/web-dashboard/`, strictly respect the boundary between Member 2's WebSocket/state hooks (`src/hooks/`) and Member 4 / Member 1's UI layout, Cytoscape.js graph components, and attack trigger controls (`src/components/`).
4. **Respect Implementation Style:** Do not rewrite code written by another developer or another AI agent merely because you prefer a different coding style, design pattern, or library.
5. **Protect Shared Files:** Treat `shared/schemas/*`, `infra/docker-compose.yml`, `infra/docker-compose.testbed.yml`, `infra/env.example`, `docs/event-contract.md`, and `.github/workflows/*` as high-coordination files. Modify them only when explicitly required by the task and highlight those edits prominently in your final report.
6. **Preserve Interface Stability:** Keep REST routes (`/score-edge`, `/rca`, etc.), WebSocket frame structures, Kafka message structures, and frozen ports (`9092`, `8080`, `8000`, `8081`, `3000`, `5000–5003`) stable so parallel work does not break.

---

## 18. Dependency Rules

Before adding any new library, Go module, Maven artifact (`pom.xml`), Python package (`pyproject.toml` / `requirements.txt` via `uv`), or npm package (`package.json`):

1. **Check Existing Dependencies First:** Verify whether the standard library or an already-installed package in the module solves the problem.
2. **Verify Necessity:** Do not add a heavy library or framework for a small helper function that can be written cleanly in a few lines of standard code.
3. **Evaluate Security and Maintenance:** Ensure the package is reputable, actively maintained, free of known critical vulnerabilities, and compatible with the service's runtime version and container architecture (ARM64/AMD64 compatibility across macOS and Linux).
4. **Pin Versions Appropriately:** Record exact or bounded compatible versions in `go.mod`, `pom.xml`, `pyproject.toml`/`requirements.txt`, or `package.json` to guarantee reproducible Docker builds.
5. **Document Significant Additions:** In your task summary and PR description, state explicitly which dependency was added and why it was necessary.

---

## 19. Logging and Observability

Every service in `services/` and `testbed/` should emit clear, structured (or consistently formatted) logs with timestamps, severity levels (`DEBUG`, `INFO`, `WARN`, `ERROR`), and service context.

### What Must Be Logged
- **Service Startup & Configuration Summary:** Port bindings (`9092`, `8080`, `8000`, `8081`, `3000`, `5000–5003`), target broker addresses, active mode (live vs. dry-run containment), and model/$A_{\text{base}}$ load status.
- **Connection & Transport Failures:** Redpanda/Kafka broker disconnects, Redis unavailability, HTTP client timeouts to `ml-detector` (`8000`) or `actuator-security` (`8081`), or WebSocket client drops.
- **Message & Contract Failures:** Schema validation failures on incoming `telemetry-event.json`, `alert-payload.json`, or WebSocket frames (including the reason for rejection).
- **ML Inference Outcomes & Failures:** Latency/errors on `/score-edge` and `/rca` calls, invalid graph inputs, or anomalous rogue-edge / GAT root-cause detections.
- **Security & Containment Decisions:** Every alert received by `actuator-security` and the exact containment action taken (or simulated in dry-run mode)—such as eBPF socket drop applied, `iptables` rule inserted/removed, Docker API container isolation, or SPIFFE/SPIRE identity revoked.
- **Testbed & Chaos Events:** Start and completion of chaos injections (`testbed/chaos/`) and attack simulations (`testbed/attacks/`) to aid correlation during experiments.

### What Must NEVER Be Logged
- Passwords or database/broker credentials
- API keys, bearer tokens, or session secrets
- Private cryptographic keys (`pki/` private key material)
- Raw sensitive user/payment secrets

---

## 20. Error Handling

- **Never Silently Swallow Exceptions:** Empty `catch {}` blocks, ignored Go `err` returns, or bare `except: pass` statements are prohibited.
- **Handle Errors at the Appropriate Layer:**
  - Low-level components should return or raise typed, descriptive errors with context.
  - Service boundary layers (Kafka consumers, FastAPI exception handlers, Spring `@ControllerAdvice`, WebSocket handlers) should catch, log with diagnostic context, and return structured error responses or route poison messages safely without crashing the process.
- **Fail Fast on Fatal Startup Misconfiguration:** If a required environment variable, schema file, or ML model weight file ($A_{\text{base}}$ / GAT weights) is missing at startup, log a clear, actionable error message and exit immediately rather than failing mysteriously at runtime.
- **Preserve Runtime Resilience:** A single malformed telemetry event or failed `/score-edge` request must not crash `graph-engine`, `ml-detector`, or `actuator-security`.
- **Sanitize External Error Responses:** Never leak internal stack traces, host filesystem paths, or secret configuration values in HTTP responses or WebSocket frames sent to clients.

---

## 21. Documentation & Agent Pointer Rules

- **Primary Architectural References:**
  - `AGENTS.md` — Central source of truth for operational rules, 4-member ownership, frozen ports/contracts, and AI agent guardrails.
  - `docs/architecture.png` — Visual system architecture reference.
  - `docs/event-contract.md` — Human-readable specification of shared event contracts and service interfaces.
- **Companion AI Agent Files (`CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`):** If present in the repository, these files must remain lightweight pointers or strictly synchronized mirrors that defer to `AGENTS.md` and reflect the 4-member role mapping without contradiction.
- **Read Before Modifying Interfaces:** Developers and AI agents must inspect `docs/event-contract.md` and `shared/schemas/` before proposing or implementing any interface change.
- **Keep Documentation Synchronized:** When a change to an event schema or cross-service API is approved by the team, `docs/event-contract.md` must be updated alongside `shared/schemas/`.
- **No Unsolicited Markdown Sprawl:** AI agents must **not** create extra `.md` files, scratch notes, nested `AGENTS.md` files, or unrequested documentation files inside the repository unless explicitly instructed by the user.

---

## 22. Definition of Done

A task or Pull Request is considered **Done** only when all of the following criteria are met:

1. **Requested Functionality Implemented:** All requirements stated in the user prompt or task ticket are accurately fulfilled.
2. **Existing Functionality Preserved:** No regressions are introduced in existing module behavior.
3. **Role Verification Command Passed:** The module's mandatory verification command (`go test ./...` / `pytest` / `docker compose -f infra/docker-compose.testbed.yml config` for M1; `./mvnw clean test-compile` for M2; `uv run pytest tests/` for M3; `pytest tests/` for M4; `npm run build && npm run lint` for Shared Frontend) has been executed and passes.
4. **Frozen Contracts & Ports Preserved:** All payloads conform to `shared/schemas/telemetry-event.json` and `shared/schemas/alert-payload.json`, network `autotrace-mesh` is respected, and frozen ports (`9092`, `8080`, `8000`, `8081`, `3000`, `5000–5003`) remain unchanged.
5. **Security Reviewed:** No host-level risks, unscoped attack targets, or unsafe defaults are introduced.
6. **Zero Secrets Introduced:** No credentials, tokens, or private keys exist in the diff; any new config keys are templated in `infra/env.example`.
7. **Conventions Followed:** Code adheres to the technology-specific guidelines (Section 8) and coding standards (Section 11).
8. **Scope & Minimal-Diff Respected:** Only files directly relevant to the assigned module and task were modified; no unrelated files or formatting diffs are included.
9. **Required Documentation Updated:** If and only if an approved contract/config change occurred, `docs/event-contract.md` or `infra/env.example` reflects it.
10. **Clear Verification Report:** The developer or AI agent can concisely explain **what** changed, **why** it changed, **which verification commands** were run, and whether any other member (**Members 1–4**) is impacted.

---

## 23. What Agents Should Do When Requirements Are Ambiguous

When a task prompt or specification leaves details underspecified, AI coding agents must follow this decision tree:

1. **Never Guess on Architecture or Contracts:** Do not invent cross-service JSON fields, Kafka topic names, REST endpoints, WebSocket frame formats, or security policies by guessing.
2. **Inspect the Repository First:** Check in order:
   - `AGENTS.md`
   - `docs/event-contract.md` and `docs/architecture.png`
   - `shared/schemas/telemetry-event.json` and `shared/schemas/alert-payload.json`
   - `infra/docker-compose.yml`, `infra/docker-compose.testbed.yml`, and `infra/env.example`
   - Existing source code and tests in the target module and adjacent modules.
3. **Cross-Module / Contract Ambiguity → Ask the Developer:** If the ambiguity affects a shared schema, an API between two services, infrastructure configuration, `apps/web-dashboard/` component boundaries, or another member's module (Members 1–4), **stop and ask the human developer for clarification** before writing code.
4. **Purely Local Implementation Details → Choose the Simplest Standard Approach:** If the ambiguity is strictly internal to a single function or component within the assigned module, does not affect external behavior or contracts, and has a standard idiomatic solution, implement the simplest, cleanest option and note the assumption in your response.

---

## 24. Architecture Change Policy

The AutoTrace-Sec architecture, directory layout, network topology (`autotrace-mesh`), and technology stack are **shared team territory**.

An individual AI agent or developer must **NEVER** independently:
- Replace **Redpanda / Kafka** (`9092`) with another message broker
- Replace **Java 21 / Spring Boot 3.3+ / Maven** in `services/graph-engine/` (`8080`)
- Replace **Python 3.11 / FastAPI / PyTorch Geometric / `uv`** in `services/ml-detector/` (`8000`)
- Replace **Next.js 14 App Router / TypeScript / Tailwind CSS / Cytoscape.js** in `apps/web-dashboard/` (`3000`)
- Replace **Docker / Docker Compose** in `infra/`
- Delete, rename, or reorganize any top-level or service directories (`apps/web-dashboard/`, `services/*`, `testbed/*`, `infra/`, `shared/schemas/`)
- Redesign service boundaries or shift responsibilities between `telemetry-collector`, `graph-engine`, `ml-detector`, `actuator-security`, `web-dashboard`, and `testbed`
- Introduce a new microservice or merge/remove existing services
- Alter the core event-driven pipeline flow or frozen port allocations (`9092`, `8080`, `8000`, `8081`, `3000`, `5000–5003`)

Any proposal to change the items above requires **explicit prior discussion and approval from the project owner and all four team members (Members 1–4)** before any code or structural changes are made.

---

## 25. Source of Truth / Instruction Precedence

When instructions or references appear to conflict, developers and AI agents must follow this strict precedence order (from highest authority to lowest):

1. **Explicit instructions from the repository owner / team** for the current task (provided they do not accidentally violate core safety/security rules).
2. **`AGENTS.md`** (this document — superseding any secondary agent pointer files such as `CLAUDE.md`, `.cursorrules`, or `.github/copilot-instructions.md`).
3. **Existing architecture and shared contracts** in `shared/schemas/` (`telemetry-event.json`, `alert-payload.json`) and `docs/` (`event-contract.md`, `architecture.png`).
4. **Existing working implementation** and configuration in the repository (`services/`, `apps/`, `testbed/`, `infra/`).
5. **Framework and language conventions / defaults** (Go, Spring Boot 3.3+, FastAPI, PyTorch Geometric, Next.js 14, Docker).
6. **AI coding agent personal preferences or stylistic defaults.**

> **Critical Rule:** Even when following Precedence #1 (explicit task instructions), if a task request conflicts with `AGENTS.md` or breaks a contract in `shared/schemas/`, the AI agent must **flag the conflict to the user** and confirm whether a coordinated contract/architecture update is intended before silently breaking compatibility.

---

## 26. Final Agent Checklist

Before completing **ANY** coding task in `autotrace-sec/`, every AI coding agent must verify all items on this checklist:

- [ ] **Read `AGENTS.md`:** Did I read and follow the rules in `AGENTS.md`?
- [ ] **Inspected Existing Code:** Did I inspect the relevant existing files in the target module before editing?
- [ ] **Respected 4-Member Ownership & Shared Frontend Protocol:** Did I stay strictly inside my assigned module (**Member 1, 2, 3, or 4**, or isolated component/hook in `apps/web-dashboard/`) unless explicitly instructed otherwise?
- [ ] **No Unauthorized Architecture or Directory Changes:** Did I keep all directories (`apps/web-dashboard/`, `services/*`, `testbed/*`, `infra/`, `shared/schemas/`), core frameworks, `autotrace-mesh`, and frozen ports (`9092`, `8080`, `8000`, `8081`, `3000`, `5000–5003`) intact?
- [ ] **Verified Shared Schemas:** Did I check `shared/schemas/telemetry-event.json` and `shared/schemas/alert-payload.json` for contract compliance?
- [ ] **Preserved Interfaces:** Did I preserve backward compatibility for existing REST endpoints (`/score-edge`, `/rca`, etc.), WebSocket frames, and Redpanda/Kafka consumers/producers?
- [ ] **No Hallucinated Contracts:** Did I avoid inventing undocumented APIs, event fields, database structures, or Kafka topics?
- [ ] **Minimal Dependencies:** Did I avoid introducing unnecessary third-party libraries or frameworks?
- [ ] **Zero Secrets:** Did I verify that no credentials, API keys, tokens, or private keys were added to any file?
- [ ] **Ran Role Verification Command:** Did I run and pass the role-specific verification command (`go test ./...` / `pytest` / `docker compose -f infra/docker-compose.testbed.yml config` for M1; `./mvnw clean test-compile` for M2; `uv run pytest tests/` for M3; `pytest tests/` for M4; `npm run build && npm run lint` for `apps/web-dashboard/`)?
- [ ] **Verified Security Boundaries:** Did I ensure that any security/containment/attack logic is safe by default and strictly scoped to the isolated `testbed/` environment?
- [ ] **Applied Minimal-Diff Principle:** Did I keep the diff focused strictly on the requested change without drive-by formatting or refactoring?
- [ ] **Left Unrelated Files Untouched:** Did I verify via `git status` / `git diff` that no unrelated files, backup files, or temporary files were created or modified?
- [ ] **Reported Changes & Verification Clearly:** Did I clearly summarize what files changed, what verification commands were run, and whether any other team member (**Members 1–4**) needs to coordinate around this change?
