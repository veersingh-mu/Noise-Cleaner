# 🛡️ SignalGuard — Intelligent Alert Fatigue Reducer

> **Real-Time Middleware System for Deduplicating Error Storms and Suppressing On-Call Alert Fatigue.**

SignalGuard sits between your distributed application error sources and notification channels (Slack, PagerDuty, Discord). It intercepts raw error and log events at high volume, normalizes and fingerprints them, groups them into incidents, applies a configurable cooldown matrix to suppress duplicate noise, and dispatches only meaningful alerts — streaming live telemetry to a real-time SRE mission control dashboard.

---

## 🏛️ System Architecture

```
                                  ┌───────────────────────────────┐
                                  │   Application Error Sources   │
                                  │  (checkout, auth, payments)   │
                                  └───────────────┬───────────────┘
                                                  │ POST /api/ingest (500+ eps)
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│  SIGNALGUARD BACKEND (Fastify + TypeScript)                                                     │
│                                                                                                 │
│  1. Ingestion Buffer        2. Normalization Engine        3. Cooldown Matrix State Machine     │
│  ┌───────────────────────┐  ┌───────────────────────────┐  ┌──────────────────────────────────┐ │
│  │ Redis 7 Stream        │  │ • Strip variable line #s  │  │ • Native Redis Key TTL Cooldown  │ │
│  │ 'raw-events'          ├──► • Template UUIDs / <N>    ├──► • Sorted Set 60s Burst Window    │ │
│  │ (Consumer Group & ACK)│  │ • Deterministic SHA-256   │  │ • Hot-Reloadable JSON Matrix     │ │
│  └───────────────────────┘  └───────────────────────────┘  └─────────────────┬────────────────┘ │
│                                                                              │                  │
│                                         ┌────────────────────────────────────┴───────────────┐  │
│                                         │ Decision: Should Alert?                            │  │
│                                         ├──────────────────────────┬─────────────────────────┤  │
│                                         │ Fire = TRUE (1st event)  │ Fire = FALSE (Duplicate)│  │
│                                         └───────────┬──────────────┴────────────┬────────────┘  │
│                                                     │                           │               │
│  4. PostgreSQL Persistent Store                     ▼                           ▼               │
│  ┌───────────────────────┐              ┌───────────────────────┐   ┌────────────────────────┐  │
│  │ Prisma ORM            │              │ Immediate Dispatch    │   │ 10-Second Batch Queue  │  │
│  │ • Incidents           │◄─────────────┤ • Top-level Slack     │   │ (threadBatchFlusher)   │  │
│  │ • Occurrences         │              │ • PagerDuty trigger   │   └───────────┬────────────┘  │
│  │ • MetricsSnapshots    │              │ • Discord embed       │               │               │
│  └───────────────────────┘              └───────────────────────┘               │ 10s ticker    │
│                                                                                 ▼               │
│  5. Real-Time Telemetry                 ┌────────────────────────────────────────────────────┐  │
│  ┌───────────────────────┐              │ Threaded Update Flush                              │  │
│  │ Socket.io Server      ├─────────────►│ • Slack: Reply in thread_ts (no top-level spam)   │  │
│  │ • event:new           │              │ • PagerDuty: Merge under same dedup_key            │  │
│  │ • incident:update     │              │ • Discord: In-place PATCH message update           │  │
│  │ • metrics:tick        │              └────────────────────────────────────────────────────┘  │
│  └──────────┬────────────┘                                                                      │
└─────────────┼───────────────────────────────────────────────────────────────────────────────────┘
              │ WebSockets
              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│  SIGNALGUARD FRONTEND DASHBOARD (React 18 + Vite + Tailwind CSS + Stitch Theme)                 │
│                                                                                                 │
│  • Hero Noise Reduction Ratio (NRR) with Animated Count-Up                                      │
│  • SRE KPI Stat Cards (Active Incidents, Critical Firing, Total Suppressed)                     │
│  • Expandable Incident Table with Inline Mini-Timeline & Forensic Stack Traces                  │
│  • Throttled Live Event Feed (60 FPS slide-in animation without DOM thrash)                     │
│  • Interactive Service × Severity Cooldown Heatmap Grid                                         │
│  • Live Traffic Storm Simulator (500 eps burst mode)                                            │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🧠 Core Algorithms Explained in Plain English

### 1. The Fingerprinting Engine (`backend/src/lib/fingerprint.ts`)
When an application fails, dynamic variables (such as user IDs, order numbers, IP addresses, timestamps, and memory addresses) cause identical root causes to appear as distinct text strings. 

SignalGuard normalizes each event through a deterministic multi-stage pipeline:
1. **Message Templating**:
   - Dates and timestamps are replaced with `<TIMESTAMP>`
   - UUIDs (`[0-9a-fA-F-]{36}`) are replaced with `<UUID>`
   - IP addresses are replaced with `<IP>`
   - Emails are replaced with `<EMAIL>`
   - Numbers and sequence counts are replaced with `<N>`
2. **Stack Trace Normalization**:
   - Memory hex addresses (e.g. `0x7fff...`) are stripped
   - Line numbers and column indices that fluctuate between deployments are removed
   - Deep stack noise is pruned to the top 5 most relevant application frames
   - Absolute filesystem paths are trimmed down to relative module names
3. **Cryptographic Hashing**:
   - Computes `SHA-256(service:errorType:templatedMessage:normalizedTrace)`
   - Result: 10,000 distinct user errors caused by the same database connection drop produce **one identical 64-character fingerprint**.

### 2. Dual-State Cooldown Matrix (`backend/src/lib/cooldownMatrix.ts`)
When an event arrives:
1. **TTL Cooldown State**: SignalGuard checks Redis key `cooldown:{fingerprint}`.
   - If missing: This is a **new incident**. The alert fires immediately to your channels, and a Redis key is stored with a TTL (e.g., 30s for critical, 120s for high, 300s for medium).
   - If present: The incident is actively **cooling down**. The occurrence is recorded and suppressed from triggering new top-level notifications.
2. **Rolling 60-Second Burst Rate Tracking**:
   - Every event adds a timestamped score to a Redis Sorted Set `burst:{fingerprint}`.
   - SignalGuard trims entries older than 60 seconds (`ZREMRANGEBYSCORE`).
   - If occurrences in the last 60 seconds breach the configured threshold (e.g., >20/min for critical), `isBurst` is set to `true`, switching the system to send an urgent **High-Visibility Summary Card**.

### 3. Anti-Spam Thread Batch Flusher (`backend/src/workers/threadBatchFlusher.ts`)
Instead of sending a notification every time a duplicate error happens, SignalGuard buffers suppressed occurrences in memory. Every **10 seconds**, a background flusher sweeps the buffer and sends **one consolidated thread reply or in-place edit per incident**.

---

## ⚡ Quick Start

### Option A: Running with Docker Compose (Recommended)

Bring up the complete production stack (PostgreSQL 15, Redis 7, Fastify Backend, Vite/Nginx Frontend) with one command:

```bash
docker compose up --build
```

- **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:4000/api/health](http://localhost:4000/api/health)

---

### Option B: Local Bare-Metal Development

#### 1. Backend Setup
```bash
cd signalguard/backend
npm install
npm run dev
```

#### 2. Frontend Setup
```bash
cd signalguard/frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing & Verification

Run the full Vitest automated test suite:

```bash
cd signalguard/backend
npm test
```

### Test Coverage Highlights:
- `test/fingerprint.test.ts`: Tests normalization of dynamic integer IDs, UUIDs, emails, IPs, ISO timestamps, memory addresses, variable line numbers, and multi-service uniqueness.
- `test/cooldownMatrix.test.ts`: Tests TTL expiration, service duration overrides, and sliding 60-second burst detection.
- `test/dedup.test.ts`: Simulates 100 high-frequency burst errors and verifies that **exactly 1 alert is sent**, 99 are marked suppressed, and the 10-second batch flusher batches them cleanly.

---

## 📡 API Reference

### Ingestion
- `POST /api/ingest`
  ```json
  {
    "service": "checkout-service",
    "errorType": "PaymentGatewayTimeout",
    "severity": "critical",
    "message": "HTTP 504 Gateway Timeout while processing order 10492 for user 89b21a00-1234-4567-89ab-cdef01234567",
    "stackTrace": "Error: Gateway Timeout\n at Client.pay (/src/pay.ts:45)"
  }
  ```
- `POST /api/ingest/simulate`
  ```json
  {
    "pattern": "burst", // "burst" | "steady" | "mixed"
    "durationSeconds": 10,
    "eventsPerSecond": 500
  }
  ```

### Incidents & Management
- `GET /api/incidents?status=firing&search=checkout`
- `GET /api/incidents/:id`
- `POST /api/incidents/:id/silence` (`{ "durationSeconds": 3600 }`)
- `POST /api/incidents/:id/resolve`

### Telemetry & Config
- `GET /api/metrics/current`
- `GET /api/metrics/history`
- `GET /api/config/cooldown-matrix`
- `PUT /api/config/cooldown-matrix`
- `GET /api/config/channels`
- `PUT /api/config/channels`
