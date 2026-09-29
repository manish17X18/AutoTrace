# AGENTS.md — AutoTrace-Sec Central Engineering & AI Agent Guide

This document is the **central source of truth** for all human developers (Members 1–6) and all AI coding agents (including Antigravity, Claude, and other coding assistants) working inside the `autotrace-sec/` repository.

Every developer and AI coding agent MUST read and follow this document before inspecting, creating, or modifying any file in this repository.

---

## 1. Project Overview

**AutoTrace-Sec** is a distributed security monitoring, anomaly/threat detection, and automated security containment system built around service-to-service telemetry, live dependency graph construction, graph machine learning inference, and automated runtime containment.

### High-Level Concept

```text
telemetry collection (services/telemetry-collector)
        ↓
Kafka / Redpanda event streaming
        ↓
graph construction (services/graph-engine)
        ↓
ML anomaly / threat detection & RCA (services/ml-detector)
        ↓
security containment (services/actuator-security)
        ↓
web dashboard visualization (apps/web-dashboard)
```

In addition to the core detection and response pipeline, the repository includes an isolated multi-service simulation and fault/attack injection environment (`testbed/`) representing a mock e-commerce cluster ("Mock Amazon") used to safely evaluate detection accuracy, root-cause analysis (RCA), and automated containment policies.

> **Important Constraint:** Do NOT invent or assume additional product features, external cloud integrations, or extra pipeline stages beyond the architecture established in this repository. Where specific implementation details (such as exact topic names, payload fields, or transport protocols between specific stages) are not yet populated in the repository files, they must be agreed upon by the team and recorded in `shared/schemas/` and `docs/event-contract.md` rather than invented unilaterally.

---

## 2. Core Architectural Principles

1. **Modular Services:** Each runtime capability (telemetry collection, graph building, ML detection, security containment, frontend visualization, and testbed simulation) lives in its own isolated directory with independent build and runtime configuration.
2. **Clear Service Boundaries:** Each service owns its internal domain logic, state, and dependencies. No service may reach into another service's source tree or internal runtime state.
3. **Event-Driven Communication Where Applicable:** Telemetry ingestion and downstream alerting follow an asynchronous, event-driven pipeline backed by Kafka/Redpanda and explicitly defined HTTP/WebSocket interfaces where applicable.
4. **Shared Contracts as the Interoperability Layer:** While each service owns its internal implementation, cross-service payloads are governed strictly by the shared schemas in `shared/schemas/`.
5. **Loose Coupling:** Services interact only through versioned, documented schemas and explicit network APIs/streams.
6. **Reproducibility:** Local builds, container images, ML model weights/inference behavior, and testbed scenarios must be deterministic and reproducible across all six team members' machines via `infra/`.
7. **Security by Design:** Privileged telemetry/containment hooks (`eBPF`, `iptables`, `mTLS`/SPIFFE/SPIRE) and offensive testbed scripts (`testbed/attacks/`, `testbed/chaos/`) are strictly scoped, auditable, and isolated from host and external systems.
8. **Testability:** Every module must be testable in isolation (unit and contract tests) as well as within the orchestrated local environment (`infra/docker-compose.yml` and `infra/docker-compose.testbed.yml`).
9. **Observability:** Services must emit structured, actionable logs covering lifecycle events, contract validation errors, inference outcomes, and containment actions without leaking sensitive data.
10. **Minimal Cross-Service Assumptions:** A service must never assume undocumented behavior, internal class structures, or unvalidated payload fields from upstream or downstream components.

---

## 3. Repository Structure

The repository structure is finalized. **Do NOT reorganize directories, rename top-level folders, move modules, or introduce new top-level directories.**

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
│   └── web-dashboard/            # MEMBER 5: FRONTEND ENGINEER
│       ├── src/
│       │   ├── components/       # Topology graph view, alert banners
│       │   ├── hooks/            # WebSocket listeners
│       │   └── pages/
│       ├── package.json
│       └── Dockerfile
│
├── services/
│   ├── telemetry-collector/      # MEMBER 1: DISTRIBUTED SYSTEMS ENGINEER
│   │   ├── src/                  # eBPF / Envoy / Proxy traffic interceptor
│   │   ├── config/               # Kafka / Redpanda producer configs
│   │   └── Dockerfile
│   │
│   ├── graph-engine/             # MEMBER 2: BACKEND ENGINEER (Java Spring Boot)
│   │   ├── src/main/java/        # In-memory graph builder, Kafka consumer
│   │   ├── pom.xml (or build.gradle)
│   │   └── Dockerfile
│   │
│   ├── ml-detector/              # MEMBER 3: AI/ML ENGINEER (Python / PyTorch Geometric)
│   │   ├── models/                # GNN architecture, baseline adjacency weights
│   │   ├── src/                   # FastAPI inference service (/score-edge, /rca)
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   └── actuator-security/         # MEMBER 4: CYBERSECURITY SPECIALIST
│       ├── policies/              # eBPF socket-drop filters, iptables rules
│       ├── pki/                   # mTLS SPIFFE/SPIRE identity revocation hooks
│       ├── src/                   # Containment actuator daemon
│       └── Dockerfile
│
├── testbed/                       # MEMBER 6: DEVOPS / TESTBED ENGINEER
│   ├── cluster-simulation/        # The "Mock Amazon" multi-service app
│   │   ├── gateway-service/
│   │   ├── order-service/
│   │   ├── payment-vault/
│   │   └── reviews-service/       # Intentionally vulnerable node for attack testing
│   ├── chaos/                     # Injected failure scripts (CPU hog, latency injection)
│   └── attacks/                   # Lateral movement attack scripts (SSRF, rogue curl)
│
├── infra/                         # Shared infrastructure orchestration
│   ├── docker-compose.yml         # Runs Kafka, Redis, and local services together
│   ├── docker-compose.testbed.yml # Runs the simulated Amazon services
│   └── env.example
│
├── .gitignore
├── AGENTS.md
├── README.md
└── LICENSE
```

### Directory Responsibilities & Ownership Mapping

| Path | Owner | Primary Role & Responsibility |
| :--- | :--- | :--- |
| `services/telemetry-collector/` | **MEMBER 1:** Distributed Systems Engineer | Intercepts service traffic (eBPF / Envoy / proxy) and produces standardized telemetry events to Kafka/Redpanda. |
| `services/graph-engine/` | **MEMBER 2:** Backend Engineer | Java Spring Boot service that consumes telemetry events, constructs/maintains the live in-memory service dependency graph, and coordinates downstream scoring/updates. |
| `services/ml-detector/` | **MEMBER 3:** AI/ML Engineer | Python / PyTorch Geometric / FastAPI service providing graph neural network (GNN) anomaly scoring (`/score-edge`) and root-cause analysis (`/rca`). |
| `services/actuator-security/` | **MEMBER 4:** Cybersecurity Specialist | Automated security containment daemon enforcing eBPF socket-drop filters, `iptables` rules, and mTLS SPIFFE/SPIRE identity revocation hooks upon threat detection. |
| `apps/web-dashboard/` | **MEMBER 5:** Frontend Engineer | Web UI displaying the live service topology graph, anomaly/threat alert banners, and real-time updates via WebSocket listeners. |
| `testbed/` | **MEMBER 6:** DevOps / Testbed Engineer | Simulated e-commerce microservices (`gateway-service`, `order-service`, `payment-vault`, and intentionally vulnerable `reviews-service`), chaos injection scripts (`testbed/chaos/`), and lateral movement attack scripts (`testbed/attacks/`). |
| `shared/schemas/` | **All Members (Shared Governance)** | Single source of truth for cross-service data contracts (`telemetry-event.json`, `alert-payload.json`). |
| `shared/scripts/` | **All Members (Shared Governance)** | Global developer bootstrap and environment setup scripts. |
| `infra/` | **Shared (Coordinated with Member 6)** | Local container orchestration (`docker-compose.yml`, `docker-compose.testbed.yml`) and environment variable template (`env.example`). |
| `docs/` | **All Members (Shared Governance)** | Architecture diagrams (`architecture.png`), event contract specifications (`event-contract.md`), and IEEE report drafts. |
| `.github/` | **All Members (Shared Governance)** | CI/CD workflows (`.github/workflows/`) and pull request template (`.github/pull_request_template.md`). |

---

## 4. Ownership and Responsibility Rules

Each module has a designated owner (Members 1–6) as defined in Section 3:

- **Member 1 (Distributed Systems Engineer)** owns telemetry collection (`services/telemetry-collector/`), traffic interception mechanisms, and Kafka/Redpanda telemetry producer configuration.
- **Member 2 (Backend Engineer)** owns `services/graph-engine/`, Kafka telemetry consumption, in-memory dependency graph construction, and graph-related backend processing.
- **Member 3 (AI/ML Engineer)** owns `services/ml-detector/`, PyTorch Geometric GNN models, baseline adjacency weights, FastAPI inference endpoints (`/score-edge`, `/rca`), and RCA logic.
- **Member 4 (Cybersecurity Specialist)** owns `services/actuator-security/`, containment policies (`eBPF` socket-drop filters, `iptables` rules), `pki/` mTLS SPIFFE/SPIRE revocation hooks, and the actuator daemon.
- **Member 5 (Frontend Engineer)** owns `apps/web-dashboard/`, topology graph visualization components, alert banners, and frontend WebSocket integration.
- **Member 6 (DevOps / Testbed Engineer)** owns `testbed/` (`cluster-simulation/`, `chaos/`, `attacks/`) and coordinates testbed orchestration.

### What Ownership Means

Ownership carries five core obligations:
1. **Primary Responsibility:** Designing, implementing, and maintaining the module's internal architecture and runtime behavior.
2. **Code Review Responsibility:** Reviewing and approving any pull requests that touch files within the owned directory.
3. **Maintaining Tests:** Ensuring unit, integration, and contract tests for the module remain green and comprehensive.
4. **Preventing Breaking Changes:** Safeguarding upstream/downstream consumers from unannounced behavioral or interface changes.
5. **Documenting Interfaces:** Keeping module usage, configuration variables, and contract expectations accurate.

### Cross-Module Contributions

Ownership does **not** mean other members are forbidden from contributing to a module. Cross-module contributions are permitted when:
- They are explicitly coordinated with the module owner beforehand.
- The module owner reviews and approves the pull request.
- An AI coding agent is **explicitly instructed** by the human developer to modify that specific module.

By default, an AI agent working on a task for Member $X$ must **never** modify files owned by Member $Y$ unless explicitly instructed to do so.

---

## 5. Shared Contracts — VERY IMPORTANT

`shared/schemas/` is the **SINGLE SOURCE OF TRUTH** for all cross-service event and payload schemas.

Key contract files:
- `shared/schemas/telemetry-event.json` — The canonical telemetry event schema produced by `services/telemetry-collector/` and consumed downstream.
- `shared/schemas/alert-payload.json` — The canonical threat/anomaly alert contract emitted when anomalous behavior or attacks are detected and consumed by containment and visualization components.

### Mandatory Contract Rules for Developers and AI Agents

1. **No Local Redefinition or Drift:** Agents and developers MUST NOT invent divergent local schema definitions inside individual services that contradict or silently extend `shared/schemas/`. Internal data transfer objects (DTOs), Pydantic models, Java POJOs/records, or TypeScript interfaces must strictly mirror the definitions in `shared/schemas/`.
2. **No Silent Schema Edits:** No agent or developer may silently alter a file in `shared/schemas/` merely to make their single service compile or pass local tests.
3. **Required Workflow Before Changing a Shared Schema:**
   1. **Identify all producers and consumers** across `services/` and `apps/web-dashboard/`.
   2. **Assess backward compatibility** (e.g., whether fields are added optionally vs. renamed/removed/retyped).
   3. **Coordinate with all affected module owners** (Members 1–6) and obtain explicit agreement.
   4. **Update affected producers and consumers** (or coordinate synchronized PRs) so no service breaks.
   5. **Update contract and integration tests** in all affected modules.
   6. **Update `docs/event-contract.md`** so human-readable documentation stays synchronized with `shared/schemas/`.
   7. **Clearly call out the schema change** in the Pull Request description.

If a schema file in `shared/schemas/` is currently empty or incomplete during early development, an agent must **not** unilaterally invent its final schema without confirming the exact field structure with the developer/team.

---

## 6. Event Flow

The conceptual end-to-end runtime flow of AutoTrace-Sec is:

```text
[ Testbed / Monitored Services ]
              │
              ▼ (service-to-service traffic)
┌──────────────────────────────┐
│  1. Telemetry Collector      │  (services/telemetry-collector)
│     eBPF / Envoy / Proxy     │
└──────────────┬───────────────┘
               │ Produces telemetry events (shared/schemas/telemetry-event.json)
               ▼
┌──────────────────────────────┐
│  2. Kafka / Redpanda         │  (infra/docker-compose.yml)
└──────────────┬───────────────┘
               │ Consumes telemetry stream
               ▼
┌──────────────────────────────┐
│  3. Graph Engine             │  (services/graph-engine — Java Spring Boot)
│     In-memory graph builder  │
└──────────────┬───────────────┘
               │ Graph state / edge scoring & RCA requests (/score-edge, /rca)
               ▼
┌──────────────────────────────┐
│  4. ML Detector              │  (services/ml-detector — Python / FastAPI / PyG)
│     GNN inference & RCA      │
└──────────────┬───────────────┘
               │ Emits threat / anomaly alert data (shared/schemas/alert-payload.json)
               ├──────────────────────────────────────┐
               ▼                                      ▼
┌──────────────────────────────┐       ┌──────────────────────────────┐
│  5. Security Actuator        │       │  6. Web Dashboard            │
│     (services/               │       │     (apps/web-dashboard)     │
│      actuator-security)      │       │     Topology view & alerts   │
│     eBPF drop / iptables /   │       │     via WebSocket listeners  │
│     SPIFFE-SPIRE revocation  │       └──────────────────────────────┘
└──────────────────────────────┘
```

### Rules Regarding Event Flow
- While internal implementation details within each stage may evolve, the **interfaces and event contracts between stages must remain explicit and documented**.
- **Do NOT invent Kafka topic names, Redis keys, WebSocket channels, or HTTP endpoints** unless they already exist in the repository configuration/code or are explicitly specified by the user/team for the task. If a topic name or endpoint path is not yet defined, surface it as a configuration parameter (via environment variables documented in `infra/env.example`) and confirm with the team.

---

## 7. Service Boundary Rules

Every service in `services/` and `apps/` is an independent deployable unit.

### Strictly Prohibited Practices
- **Direct Internal State Access:** Never read or mutate another service's in-memory data structures, local filesystem storage, or internal database/cache structures without going through an agreed contract.
- **Tight Coupling of Implementation Details:** Do not leak language-specific serialization formats (e.g., Java serialization, Python `pickle`) across service boundaries. Use standard JSON/Protobuf contracts defined in `shared/schemas/`.
- **Duplicating Core Business Logic:**
  - `telemetry-collector` captures and forwards telemetry; it does not run ML inference or build global topology graphs.
  - `graph-engine` manages graph state and topology assembly; it does not execute low-level kernel packet drops.
  - `ml-detector` performs GNN scoring and root-cause analysis (`/score-edge`, `/rca`); it does not directly manipulate `iptables` or `eBPF` sockets.
  - `actuator-security` executes containment policies based on verified threat/alert inputs; it does not perform ML model training or graph construction.
  - `web-dashboard` renders topology and alert streams; it does not make security containment decisions.
- **Hidden Dependencies:** Do not rely on undocumented startup ordering, shared local temp files, or implicit network ports not declared in `infra/`.
- **Hard-Coded Machine Paths:** Never hard-code developer-specific absolute paths (e.g., `/Users/...` or `/home/...`) in source code, scripts, or Dockerfiles.
- **Cross-Service Source Imports:** Never import source code directly from a sibling service directory (e.g., `services/ml-detector` importing files from `services/actuator-security`). Shared artifacts belong strictly in `shared/`.

---

## 8. Technology-Specific Guidelines

Respect the existing technology stack and directory layout of each module. **Do not impose a rigid sub-package structure that does not currently exist unless creating initial files as instructed by the module owner.**

### 8.1 Java / Spring Boot (`services/graph-engine/`)
- Follow idiomatic Spring Boot conventions appropriate to the existing `pom.xml` or `build.gradle` setup.
- Separate concerns cleanly across:
  - **Messaging / Integration layer:** Kafka consumer listeners and event deserialization.
  - **Domain / Service layer:** In-memory dependency graph construction, node/edge state updates, windowing, and orchestration with `ml-detector`.
  - **Controller / API layer:** REST or WebSocket endpoints exposing topology/graph state.
- Keep Kafka consumer logic isolated from core graph-domain algorithms so graph construction and traversal can be unit-tested without a live Kafka broker.
- Never place business or graph manipulation logic inside Spring `@RestController` classes.
- Validate all incoming telemetry payloads and API inputs before mutating graph state; handle malformed messages gracefully (log and dead-letter/skip rather than crashing the consumer thread).
- Avoid large monolithic "God" classes; keep classes small, thread-safe (especially around concurrent in-memory graph updates), and well-named.
- Write deterministic unit tests for graph construction, edge updates, and serialization.

### 8.2 Python / FastAPI / PyTorch Geometric (`services/ml-detector/`)
- Separate HTTP transport logic (`src/` FastAPI routes and request/response schemas) from GNN model definitions and inference logic (`models/`).
- Load PyTorch Geometric models and baseline adjacency weights (`models/`) **once at service startup** (e.g., via FastAPI lifespan/startup hooks) rather than reloading weights on every `/score-edge` or `/rca` request.
- Make model paths, device selection (`cpu`/`cuda`), and threshold hyperparameters configurable via environment variables with safe defaults.
- Strictly validate request payloads using Pydantic models aligned with `shared/schemas/` and documented API contracts.
- Return predictable, structured JSON responses for `/score-edge` and `/rca` with explicit status codes and error messages when inference fails or inputs are invalid (e.g., unknown nodes, empty subgraphs).
- Keep ML inference deterministic where needed (seed control, `model.eval()`, `torch.no_grad()` during inference).
- Document model input assumptions (node feature dimensions, edge attributes, adjacency ordering) and avoid introducing unnecessary deep-learning dependencies or complex training pipelines inside the inference microservice unless requested.

### 8.3 Frontend (`apps/web-dashboard/`)
- Keep UI components in `src/components/` (such as topology graph views and alert banners) modular, focused, and reusable.
- Isolate WebSocket lifecycle management, reconnection backoff, and raw message parsing inside custom hooks in `src/hooks/`, keeping presentation components in `src/components/` and `src/pages/` declarative.
- Validate incoming WebSocket messages and REST responses against expected contracts (`shared/schemas/alert-payload.json` and topology structures) before rendering so malformed payloads do not crash the React/UI tree.
- Handle disconnected, connecting, and error states gracefully in the UI (e.g., visible connection status indicators rather than blank screens or unhandled promise rejections).
- Never hard-code `localhost` ports or backend URLs inside deeply nested UI components; read endpoints from environment configuration.

### 8.4 eBPF / Envoy / Security Components (`services/telemetry-collector/` & `services/actuator-security/`)
- Treat all kernel-space (`eBPF`), network proxy (`Envoy`), firewall (`iptables`), and identity (`pki/` mTLS SPIFFE/SPIRE) code as **high-risk, security-critical code**.
- **Principle of Least Privilege:** Request only the minimum Linux capabilities (`CAP_BPF`, `CAP_NET_ADMIN`, etc.) required for the specific container, and document every required capability clearly in the service `Dockerfile` and `infra/docker-compose.yml`.
- **Safe Defaults & Dry-Run Mode:** Provide a configurable safe/dry-run mode (where containment actions such as socket drops, `iptables` blocks, or identity revocations are logged and emitted as events without executing destructive host-level network blocks) for local development and unit testing.
- **Explicit Allowlists/Safeguards:** `actuator-security` must validate target identifiers and never block critical infrastructure components (such as Kafka/Redpanda, the Graph Engine, ML Detector, Web Dashboard, or host loopback/management interfaces).
- Never execute live containment rules or kernel hooks directly on a developer's host OS outside the isolated container/testbed namespaces unless explicitly designed and approved for a sandboxed VM.

### 8.5 Docker / Infrastructure (`infra/` & Service `Dockerfile`s)
- Ensure all `Dockerfile`s use reproducible, pinned base image tags (avoid floating `:latest` tags).
- Keep image sizes reasonable and layer ordering optimized for caching (copy dependency manifests like `package.json`, `requirements.txt`, `pom.xml`/`build.gradle` before copying `src/`).
- Never bake secrets, private keys, or environment-specific credentials into Docker images.
- Configure all service URLs, ports, broker addresses, and toggles through environment variables documented in `infra/env.example`.
- Keep `infra/docker-compose.yml` (core platform: Kafka/Redpanda, Redis, and AutoTrace-Sec services) and `infra/docker-compose.testbed.yml` (simulated "Mock Amazon" cluster) clean, well-documented, and runnable with standard `docker compose` commands.
- Do not introduce new infrastructure containers (e.g., extra databases, message brokers, or monitoring stacks) without team approval.

---

## 9. Security Rules

AutoTrace-Sec includes both defensive containment tooling (`services/actuator-security/`) and intentionally vulnerable applications plus offensive attack/chaos scripts (`testbed/`). Strict operational boundaries are mandatory.

### Environment Separation

| Environment | Scope | Permitted Actions |
| :--- | :--- | :--- |
| **SAFE TEST ENVIRONMENT** | `testbed/` containers (`gateway-service`, `order-service`, `payment-vault`, `reviews-service`) running inside isolated Docker networks defined in `infra/docker-compose.testbed.yml`. | Running `testbed/attacks/` (SSRF, lateral movement, rogue `curl`), `testbed/chaos/` (CPU hog, latency injection), and automated containment policies from `services/actuator-security/`. |
| **REAL / HOST ENVIRONMENT** | Developer's workstation/OS, university/corporate networks, and any external internet hosts or cloud infrastructure. | **ZERO offensive scripts, ZERO chaos scripts, and ZERO destructive firewall/socket drops.** |

### Mandatory Security Directives
1. **Target Scope Enforcement:** Scripts in `testbed/attacks/` and `testbed/chaos/` must **only** target the isolated `testbed/cluster-simulation/` containers (e.g., internal Docker DNS names). Never point attack scripts at external domains, public IPs, or the host machine.
2. **Scoped Vulnerability:** Intentional vulnerabilities (such as those in `testbed/cluster-simulation/reviews-service/`) must remain strictly confined to the testbed service and must never be copied into production services (`services/*` or `apps/web-dashboard/`), nor exposed on public network interfaces (`0.0.0.0` on untrusted networks).
3. **No Host Security Tampering:** Never disable host firewalls, macOS/Linux system integrity protections, or host TLS verification to work around a local development issue.
4. **No Committed Secrets or Keys:** Never commit real private keys, mTLS production certificates, API tokens, or credentials anywhere in the repository (including `services/actuator-security/pki/`). Any test certificates required for local SPIFFE/SPIRE or mTLS simulation must be generated dynamically by bootstrap scripts (`shared/scripts/`) or clearly marked as ephemeral local-only test fixtures ignored by Git.
5. **Document Privileged Operations:** Any script or container requiring `root`, `privileged: true`, `CAP_NET_ADMIN`, or `CAP_BPF` must clearly document why those privileges are required and how they are bounded.

---

## 10. Secrets and Configuration

- **Zero Secrets in Git:** Passwords, API keys, tokens, private keys (`.pem`, `.key`), and sensitive connection strings must never be committed to version control.
- **Environment Variable Driven:** All runtime configuration (broker URLs, ports, model file paths, feature flags, dry-run toggles, credentials) must be injected via environment variables.
- **`infra/env.example` as Template:** Whenever a service introduces a new required or optional environment variable, add a documented placeholder entry to `infra/env.example` (with dummy/safe example values only—never real secrets).
- **Local `.env` Files:** Developers must use local, git-ignored `.env` files for machine-specific overrides. Verify `.gitignore` covers local secret and certificate files before staging commits.

---

## 11. Coding Standards

All code written by humans or AI agents across Java, Python, TypeScript/JavaScript, C/eBPF, and Shell scripts must adhere to these standards:

- **Readability Over Cleverness:** Write clear, straightforward code that any of the six team members can understand quickly.
- **Meaningful Naming:** Use descriptive, domain-accurate names aligned with the repository terminology (`TelemetryEvent`, `AlertPayload`, `score_edge`, `reviews-service`, etc.).
- **Small, Focused Units:** Keep functions, methods, classes, and React components small and single-purpose.
- **Purposeful Comments:** Write comments and docstrings that explain **WHY** a decision, threshold, or workaround exists—not line-by-line narration of obvious syntax. Preserve existing meaningful comments and docstrings when editing files.
- **No Premature Abstraction:** Do not build generic plugin frameworks, complex inheritance hierarchies, or over-engineered factories for a single concrete use case.
- **No Premature Optimization:** Prioritize correctness, contract compliance, and clarity first; optimize hot paths (such as telemetry parsing or graph updates) based on actual requirements.
- **Explicit Error Handling & Input Validation:** Validate all external inputs (Kafka messages, HTTP payloads, WebSocket frames, CLI arguments, environment variables) at the boundary of each service.
- **Clean Up Dead Code:** Do not leave commented-out code blocks, unused imports, or orphaned debug print statements in commits.
- **Justified Dependencies:** Do not add third-party packages for trivial functionality that the standard library or existing stack already provides.

---

## 12. Testing Requirements

Changes are not complete without appropriate verification.

### Testing Layers
1. **Contract / Schema Tests:** Verify that JSON payloads produced and consumed by services strictly validate against `shared/schemas/telemetry-event.json` and `shared/schemas/alert-payload.json`.
2. **Unit Tests:** Test isolated domain logic in each module (e.g., graph mutation and querying in `graph-engine`, feature extraction and scoring helpers in `ml-detector`, policy rule generation in `actuator-security`, UI component rendering in `web-dashboard`).
3. **Service-Level / API Tests:** Test service endpoints and consumers (e.g., FastAPI `/score-edge` and `/rca` request/response validation, Spring Boot controllers and Kafka consumer handling).
4. **Integration & Testbed Validation:** Verify end-to-end event flow across `infra/docker-compose.yml` and validate detection and containment against simulated faults (`testbed/chaos/`) and attacks (`testbed/attacks/`) inside `infra/docker-compose.testbed.yml`.

### Mandatory Trigger Rules for Tests
- **If a shared event schema (`shared/schemas/*`) changes:** You MUST validate compatibility across both the producer(s) and all downstream consumer(s).
- **If an HTTP or WebSocket API changes:** You MUST test both valid request/response contracts and error-handling paths (invalid inputs, missing fields).
- **If ML inference (`services/ml-detector/`) changes:** You MUST test that `/score-edge` and `/rca` return deterministic, schema-compliant outputs for baseline, anomalous, and edge-case graph inputs.
- **If security actuator behavior (`services/actuator-security/`) changes:** You MUST verify containment rules in dry-run/unit tests and solely against the isolated `testbed/` environment.

---

## 13. Git and Branching Rules

To keep collaboration smooth across six engineers and multiple AI agents, follow a clean, lightweight branching workflow:

```text
main
 └── feature/<member>-<short-description>
 └── fix/<member>-<short-description>
 └── docs/<member>-<short-description>
```

*(Examples: `feature/member1-ebpf-collector`, `feature/member3-gnn-rca-endpoint`, `fix/member5-websocket-reconnect`)*

### Workflow Rules
- **Focused Commits:** Each commit and branch should address a single logical task or module change. Do not bundle unrelated refactors or multi-module edits into one uncoordinated branch.
- **Keep Branches Current:** Pull or rebase against `main` regularly before opening a PR or starting cross-service integration work, as agreed by the team.
- **Never Force-Push Shared Branches:** Never `git push --force` to `main` or any branch shared with another team member without explicit coordination.
- **Use Pull Requests:** All changes merging into `main` should go through a Pull Request and pass `.github/workflows/` checks.
- **Explicit Disclosures in Commits/PRs:** Always highlight any changes to `shared/schemas/`, `infra/`, or security-sensitive components (`actuator-security/`, `telemetry-collector/`, `testbed/attacks/`).

---

## 14. Pull Request Requirements

All Pull Requests must respect `.github/pull_request_template.md` and clearly answer the following nine questions:

1. **What changed?** (Concise summary of added, modified, or removed behavior)
2. **Why?** (The problem solved, requirement fulfilled, or bug fixed)
3. **Which module(s) are affected?** (e.g., `services/graph-engine/`, `shared/schemas/`)
4. **What tests were performed?** (Unit tests, schema validation, local Docker Compose / testbed verification)
5. **Are there any schema or API changes?** (Impact on `shared/schemas/telemetry-event.json`, `shared/schemas/alert-payload.json`, REST endpoints, or WebSocket events)
6. **Are there any infrastructure changes?** (Changes to `Dockerfile`s, `infra/docker-compose.yml`, `infra/docker-compose.testbed.yml`, or `infra/env.example`)
7. **Are there any security implications?** (Privileged capabilities, `eBPF`/`iptables`/`pki` rules, or `testbed/attacks/` behavior)
8. **Are there any breaking changes?** (Anything requiring action from other members)
9. **Is coordination required from another member?** (Tag the specific Member 1–6 whose upstream/downstream module is impacted)

---

## 15. AI Coding Agent Rules — VERY IMPORTANT

This repository is actively developed by six engineers using multiple AI coding agents (Antigravity, Claude, and others). To prevent cross-agent conflicts, architectural drift, and hallucinated interfaces, **every AI coding agent MUST obey the following protocol.**

### Mandatory Pre-Change Sequence (Before Writing Any Code)
1. **Inspect the repository** structure to confirm current files and layout.
2. **Read `AGENTS.md`** in full.
3. **Identify the target module** and its owner (Members 1–6).
4. **Read the existing code** inside the target module.
5. **Read the shared schemas** in `shared/schemas/` (`telemetry-event.json`, `alert-payload.json`).
6. **Read the relevant documentation** in `docs/` (`event-contract.md`, `architecture.png`).
7. **Understand upstream and downstream dependencies** and interfaces.
8. **Check cross-module impact:** Determine whether any other service or dashboard component depends on the code or contract being modified.
9. **Plan and execute the smallest reasonable change** that satisfies the user's request.

### Strictly Prohibited Agent Behaviors (Agents MUST NOT)
- **Do NOT redesign the architecture** without explicit approval from the developer/team.
- **Do NOT create new microservices or top-level directories** casually.
- **Do NOT rename existing directories** or reorganize the repository layout.
- **Do NOT move files** across modules unnecessarily.
- **Do NOT modify shared schemas (`shared/schemas/*`) silently.**
- **Do NOT introduce new frameworks** or replace existing ones (e.g., do not swap Spring Boot, FastAPI, PyTorch Geometric, Kafka/Redpanda, or Docker) because of agent preference.
- **Do NOT modify another member's module** unless the user prompt explicitly instructs you to work across those modules.
- **Do NOT overwrite working code** without first reading and understanding its purpose and edge cases.
- **Do NOT create duplicate implementations** of existing utilities, models, or schema definitions.
- **Do NOT invent undocumented APIs, database structures, event fields, or Kafka topics.**
- **Do NOT assume undocumented behavior** from upstream or downstream services.
- **Do NOT delete or disable functionality or assertions** just to make a failing test pass.

### How to Handle Architectural Conflicts
If an AI agent discovers a contradiction between a user prompt, an existing implementation, and a shared contract in `shared/schemas/` or `docs/`:
1. **STOP and DO NOT silently resolve or overwrite the contract.**
2. **Identify the exact conflict** (citing the specific files and lines).
3. **Explain the cross-module impact** (which of Members 1–6 are affected).
4. **Propose clear options** (with trade-offs and compatibility implications).
5. **Ask the human developer/team to decide** before making breaking or cross-module edits.

---

## 16. Minimal-Diff Principle

AI agents must always produce the **smallest, cleanest diff necessary** to complete the requested task:

- **Fixing a single function or bug:** Modify only the affected function and its corresponding test. Do not rewrite or reformat the entire file or service.
- **Adding an API endpoint:** Add the route, handler, validation model, and test within the existing application structure. Do not restructure the project layout.
- **Updating a specific schema field (when approved):** Edit only the targeted field in the relevant schema. Do not reformat or alter unrelated schemas.
- **Fixing a Docker or Compose issue:** Fix the specific service stanza, port, or build step. Do not rewrite the entire `docker-compose.yml` or replace base images across the repo.
- **No Drive-By Formatting:** Never run repo-wide reformatting, import sorting, or whitespace changes on untouched files or lines outside the scope of the task.

Minimal diffs prevent merge conflicts when six developers and multiple AI agents work in parallel.

---

## 17. Multi-Agent Collaboration Rules

Because six team members may be prompting different AI coding agents concurrently on different branches:

1. **Assume Parallel Work:** Always assume other modules (`services/*`, `apps/*`, `testbed/*`) have active in-flight changes by their respective owners.
2. **Treat Other Modules as External Dependencies:** Unless explicitly instructed to perform a cross-module integration task, treat sibling directories in `services/`, `apps/`, and `testbed/` as read-only external dependencies connected solely via `shared/schemas/` and documented APIs.
3. **Respect Implementation Style:** Do not rewrite code written by another developer or another AI agent merely because you prefer a different coding style, design pattern, or library.
4. **Protect Shared Files:** Treat `shared/schemas/*`, `infra/docker-compose.yml`, `infra/docker-compose.testbed.yml`, `infra/env.example`, `docs/event-contract.md`, and `.github/workflows/*` as high-coordination files. Modify them only when explicitly required by the task and highlight those edits prominently in your final report.
5. **Preserve Interface Stability:** Keep REST routes (`/score-edge`, `/rca`, etc.), WebSocket payload formats, and Kafka message structures stable so parallel work does not break.

---

## 18. Dependency Rules

Before adding any new library, package, Maven/Gradle artifact, Python package (`requirements.txt`), or npm dependency (`package.json`):

1. **Check Existing Dependencies First:** Verify whether the standard library or an already-installed package in the module solves the problem.
2. **Verify Necessity:** Do not add a heavy library or framework for a small helper function that can be written cleanly in a few lines of standard code.
3. **Evaluate Security and Maintenance:** Ensure the package is reputable, actively maintained, free of known critical vulnerabilities, and compatible with the service's language/runtime version and container architecture (e.g., ARM64/AMD64 compatibility for macOS and Linux developers).
4. **Pin Versions Appropriately:** Record exact or bounded compatible versions in `pom.xml`/`build.gradle`, `requirements.txt`, or `package.json` to guarantee reproducible Docker builds.
5. **Document Significant Additions:** In your task summary and PR description, state explicitly which dependency was added and why it was necessary.

---

## 19. Logging and Observability

Every service in `services/` and `testbed/` should emit clear, structured (or consistently formatted) logs with timestamps, severity levels (`DEBUG`, `INFO`, `WARN`, `ERROR`), and service context.

### What Must Be Logged
- **Service Startup & Configuration Summary:** Port bindings, target broker addresses, active mode (e.g., live vs. dry-run containment), and model load status.
- **Connection & Transport Failures:** Kafka/Redpanda broker disconnects, Redis unavailability, HTTP client timeouts to `ml-detector`, or WebSocket drops.
- **Message & Contract Failures:** Schema validation failures on incoming `telemetry-event.json` or `alert-payload.json` messages (including the reason for rejection).
- **ML Inference Outcomes & Failures:** Latency/errors on `/score-edge` and `/rca` calls, invalid graph inputs, or anomalous score detections.
- **Security & Containment Decisions:** Every alert received by `actuator-security` and the exact containment action taken (or simulated in dry-run mode)—such as eBPF socket drop applied, `iptables` rule inserted/removed, or SPIFFE/SPIRE identity revoked.
- **Testbed & Chaos Events:** Start and completion of chaos injections (`testbed/chaos/`) and attack simulations (`testbed/attacks/`) to aid correlation during experiments.

### What Must NEVER Be Logged
- Passwords or database/broker credentials
- API keys, bearer tokens, or session secrets
- Private cryptographic keys (`pki/` private key material)
- Raw sensitive user/payment secrets (even simulated patterns should avoid training bad logging habits)

---

## 20. Error Handling

- **Never Silently Swallow Exceptions:** Empty `catch {}` blocks or bare `except: pass` statements are prohibited.
- **Handle Errors at the Appropriate Layer:**
  - Low-level components should raise typed, descriptive errors with context.
  - Service boundary layers (Kafka consumers, FastAPI exception handlers, Spring `@ControllerAdvice`, WebSocket handlers) should catch, log with diagnostic context, and return structured error responses or route poison messages safely without crashing the entire process.
- **Fail Fast on Fatal Startup Misconfiguration:** If a required environment variable, schema file, or ML model weight file is missing at startup, log a clear, actionable error message and exit immediately rather than failing mysteriously at runtime.
- **Preserve Runtime Resilience:** A single malformed telemetry event or failed `/score-edge` request must not crash `graph-engine`, `ml-detector`, or `actuator-security`.
- **Sanitize External Error Responses:** Never leak internal stack traces, host filesystem paths, or secret configuration values in HTTP responses or WebSocket messages sent to clients.

---

## 21. Documentation Rules

- **Primary Architectural References:**
  - `AGENTS.md` — Operational rules, ownership, and architectural guardrails.
  - `docs/architecture.png` — Visual system architecture reference.
  - `docs/event-contract.md` — Human-readable specification of shared event contracts and service interfaces.
- **Read Before Modifying Interfaces:** Developers and AI agents must inspect `docs/event-contract.md` and `shared/schemas/` before proposing or implementing any interface change.
- **Keep Documentation Synchronized:** When a change to an event schema or cross-service API is approved by the team, `docs/event-contract.md` must be updated alongside `shared/schemas/`.
- **No Unsolicited Markdown Sprawl:** AI agents must **not** create extra `.md` files, scratch notes, nested `AGENTS.md` files, or unrequested documentation files inside the repository unless explicitly instructed by the user.

---

## 22. Definition of Done

A task or Pull Request is considered **Done** only when all of the following criteria are met:

1. **Requested Functionality Implemented:** All requirements stated in the user prompt or task ticket are accurately fulfilled.
2. **Existing Functionality Preserved:** No regressions are introduced in existing module behavior.
3. **Tests Added & Passing:** Relevant unit, contract, and service-level tests are written/updated and pass locally and in CI.
4. **Contract & Interface Compatibility:** All payloads conform to `shared/schemas/telemetry-event.json` and `shared/schemas/alert-payload.json`, and existing service APIs remain compatible.
5. **Security Reviewed:** No host-level risks, unscoped attack targets, or unsafe defaults are introduced.
6. **Zero Secrets Introduced:** No credentials, tokens, or private keys exist in the diff; any new config keys are templated in `infra/env.example`.
7. **Conventions Followed:** Code adheres to the technology-specific guidelines (Section 8) and coding standards (Section 11).
8. **Scope & Minimal-Diff Respected:** Only files directly relevant to the assigned module and task were modified; no unrelated files or formatting diffs are included.
9. **Required Documentation Updated:** If and only if an approved contract/config change occurred, `docs/event-contract.md` or `infra/env.example` reflects it.
10. **Clear Verification Report:** The developer or AI agent can concisely explain **what** changed, **why** it changed, **how** it was tested, and whether any other member (Members 1–6) is impacted.

---

## 23. What Agents Should Do When Requirements Are Ambiguous

When a task prompt or specification leaves details underspecified, AI coding agents must follow this decision tree:

1. **Never Guess on Architecture or Contracts:** Do not invent cross-service JSON fields, Kafka topic names, REST endpoints, or security policies by guessing.
2. **Inspect the Repository First:** Check in order:
   - `AGENTS.md`
   - `docs/event-contract.md` and `docs/architecture.png`
   - `shared/schemas/telemetry-event.json` and `shared/schemas/alert-payload.json`
   - `infra/docker-compose.yml`, `infra/docker-compose.testbed.yml`, and `infra/env.example`
   - Existing source code and tests in the target module and adjacent modules.
3. **Cross-Module / Contract Ambiguity → Ask the Developer:** If the ambiguity affects a shared schema, an API between two services, infrastructure configuration, or another member's module, **stop and ask the human developer for clarification** (presenting concise options if helpful) before writing code.
4. **Purely Local Implementation Details → Choose the Simplest Standard Approach:** If the ambiguity is strictly internal to a single function or component within the assigned module, does not affect external behavior or contracts, and has a standard idiomatic solution, implement the simplest, cleanest option and note the assumption in your response.

---

## 24. Architecture Change Policy

The AutoTrace-Sec architecture and technology stack are **shared team territory**.

An individual AI agent or developer must **NEVER** independently:
- Replace **Kafka / Redpanda** with another message broker
- Replace **Java Spring Boot** in `services/graph-engine/`
- Replace **Python / FastAPI** or **PyTorch Geometric** in `services/ml-detector/`
- Replace **Docker / Docker Compose** in `infra/`
- Redesign service boundaries or shift responsibilities between `telemetry-collector`, `graph-engine`, `ml-detector`, `actuator-security`, `web-dashboard`, and `testbed`
- Introduce a new microservice or top-level application
- Merge two existing services into one
- Remove an existing service
- Alter the core event-driven pipeline flow

Any proposal to change the items above requires **explicit prior discussion and approval from the project owner and affected team members** before any code or structural changes are made.

---

## 25. Source of Truth / Instruction Precedence

When instructions or references appear to conflict, developers and AI agents must follow this strict precedence order (from highest authority to lowest):

1. **Explicit instructions from the repository owner / team** for the current task (provided they do not accidentally violate core safety/security rules).
2. **`AGENTS.md`** (this document).
3. **Existing architecture and shared contracts** in `shared/schemas/` (`telemetry-event.json`, `alert-payload.json`) and `docs/` (`event-contract.md`, `architecture.png`).
4. **Existing working implementation** and configuration in the repository (`services/`, `apps/`, `testbed/`, `infra/`).
5. **Framework and language conventions / defaults** (Spring Boot, FastAPI, PyTorch Geometric, React, Docker).
6. **AI coding agent personal preferences or stylistic defaults.**

> **Critical Rule:** Even when following Precedence #1 (explicit task instructions), if a task request conflicts with `AGENTS.md` or breaks a contract in `shared/schemas/`, the AI agent must **flag the conflict to the user** and confirm whether a coordinated contract/architecture update is intended before silently breaking compatibility.

---

## 26. Final Agent Checklist

Before completing **ANY** coding task in `autotrace-sec/`, every AI coding agent must verify all items on this checklist:

- [ ] **Read `AGENTS.md`:** Did I read and follow the rules in `AGENTS.md`?
- [ ] **Inspected Existing Code:** Did I inspect the relevant existing files in the target module before editing?
- [ ] **Respected Module Ownership:** Did I stay strictly inside my assigned module (Member 1–6) unless explicitly instructed otherwise?
- [ ] **No Unauthorized Architecture Changes:** Did I avoid changing service boundaries, core frameworks, or the repository layout?
- [ ] **Verified Shared Schemas:** Did I check `shared/schemas/telemetry-event.json` and `shared/schemas/alert-payload.json` for contract compliance?
- [ ] **Preserved Interfaces:** Did I preserve backward compatibility for existing REST endpoints (`/score-edge`, `/rca`, etc.), WebSocket streams, and Kafka consumers/producers?
- [ ] **No Hallucinated Contracts:** Did I avoid inventing undocumented APIs, event fields, database structures, or Kafka topics?
- [ ] **Minimal Dependencies:** Did I avoid introducing unnecessary third-party libraries or frameworks?
- [ ] **Zero Secrets:** Did I verify that no credentials, API keys, tokens, or private keys were added to any file?
- [ ] **Added / Updated Tests:** Did I include or update appropriate unit, contract, or service tests for my changes?
- [ ] **Verified Security Boundaries:** Did I ensure that any security/containment/attack logic is safe by default and strictly scoped to the isolated `testbed/` environment?
- [ ] **Applied Minimal-Diff Principle:** Did I keep the diff focused strictly on the requested change without drive-by formatting or refactoring?
- [ ] **Left Unrelated Files Untouched:** Did I verify via `git status` / `git diff` that no unrelated files, backup files, or temporary files were created or modified?
- [ ] **Reported Changes Clearly:** Did I clearly summarize what files changed and why?
- [ ] **Reported Testing Clearly:** Did I clearly state what tests or verification steps were executed?
- [ ] **Identified Cross-Module Impact:** Did I explicitly note whether any other team member (Members 1–6) needs to be aware of or coordinate around this change?
