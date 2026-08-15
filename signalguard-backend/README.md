# 🛡️ SignalGuard Backend — Firebase/GCP Serverless Architecture

> **Serverless Alert Fatigue Reducer & Noise Deduplication Engine built entirely on Firebase 2nd Gen, Firestore, Realtime Database, Cloud Pub/Sub, Cloud Tasks, and Cloud Scheduler.**

SignalGuard intercepts raw application error streams at high volume, normalizes and fingerprints errors into deterministic hashes, groups them into incidents, applies a configurable per-service/severity cooldown matrix, batches thread updates to avoid re-flooding channels, and streams real-time state to dashboards via native Firestore `onSnapshot()` listeners without requiring custom WebSocket infrastructure.

---

## 🏛️ System Architecture

```
                                  ┌───────────────────────────────┐
                                  │   Application Error Sources   │
                                  │  (checkout, auth, payments)   │
                                  └───────────────┬───────────────┘
                                                  │ POST /ingest (HTTPS)
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│  SIGNALGUARD SERVERLESS BACKEND (Cloud Functions 2nd Gen, Node.js 20, TypeScript)               │
│                                                                                                 │
│  1. Ingest Endpoint (onRequest)               2. Ingestion Queue (Cloud Pub/Sub)                │
│  ┌──────────────────────────────────────┐     ┌──────────────────────────────────────────────┐  │
│  │ • Zod Schema Validation              │────►│ Topic: 'raw-events'                          │  │
│  │ • Optional API Key Check (/apiKeys)  │     │ (Non-blocking async message buffer)          │  │
│  │ • Immediate 202 Accepted Response    │     └──────────────────────┬───────────────────────┘  │
│  └──────────────────────────────────────┘                            │                          │
│                                                                      ▼                          │
│  3. Core Stream Worker (onMessagePublished)   ◄──────────────────────┘                          │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  a. Normalization & Fingerprinting Engine                                                  │ │
│  │     • Replace Dynamic IDs, UUIDs, Dates, IPs, Emails, and Numbers (<N>, <UUID>, etc.)      │ │
│  │     • Prune Hex Addresses & Stack Noise to Top 5 Frames                                    │ │
│  │     • Cryptographic SHA-256 Hash Calculation                                               │ │
│  │                                                                                            │ │
│  │  b. Ephemeral State Machine (Firebase Realtime Database)                                   │ │
│  │     • Atomic Ingestion Counter (/counters/rawEventsTotal)                                  │ │
│  │     • Cooldown Expiry Key Check (/cooldowns/{fingerprintHash})                             │ │
│  │     • Rolling 60-Second Sliding Window Burst Rate (/burstCounters/{fingerprintHash})       │ │
│  │                                                                                            │ │
│  │  c. Decision Matrix:                                                                       │ │
│  │     ├─► [FIRE PATH] (New or Reopened Incident)                                             │ │
│  │     │   • Write /incidents/{id} & /fingerprintIndex/{hash} in Firestore                    │ │
│  │     │   • Dispatch Initial Top-Level Alert via Adapter (Slack/PagerDuty/Discord)           │ │
│  │     │   • Set RTDB Cooldown Expiry (e.g., Critical: 30s, High: 120s, Medium: 300s)         │ │
│  │     │   • Increment /counters/notificationsSentTotal                                       │ │
│  │     │                                                                                      │ │
│  │     └─► [SUPPRESSED PATH] (Active Cooldown Window)                                         │ │
│  │         • Increment incident.occurrenceCount & incident.pendingBatchCount (FieldValue)     │ │
│  │         • Append occurrence subdoc (/incidents/{id}/occurrences/{occId})                   │ │
│  │         • Enqueue Debounced Cloud Task: `flush-{incidentId}` (10s Delay)                   │ │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                              │                                                  │
│                       ┌──────────────────────┴──────────────────────┐                           │
│                       ▼                                             ▼                           │
│  4. Cloud Tasks Batch Flusher (onRequest)     5. Scheduled Rollups (onSchedule)                 │
│  ┌──────────────────────────────────────┐     ┌──────────────────────────────────────────────┐  │
│  │ flushIncidentThread (~10s delay)     │     │ • rollupMetricsSnapshot (every 1 min)        │  │
│  │ • Consolidates batched occurrences   │     │   Calculates NRR = 1 - (sent/raw)            │  │
│  │ • Posts ONE Slack in-thread reply or │     │   Writes Firestore /metricsSnapshots         │  │
│  │   Discord in-place PATCH edit        │     │                                              │  │
│  │ • Resets pendingBatchCount to 0      │     │ • autoResolveStaleIncidents (every 5 min)    │  │
│  │ • If isBurst: Formats urgent card    │     │   Auto-resolves incidents inactive > 30 min  │  │
│  └──────────────────────────────────────┘     └──────────────────────────────────────────────┘  │
│                                                                                                 │
│  6. Auth-Gated Config Functions (onCall)                                                        │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ • updateCooldownMatrix: Hot-reloadable service × severity cooldown configuration          │  │
│  │ • updateChannelRouting: Dynamic service routing to Slack, PagerDuty, or Discord           │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                               │ Firestore onSnapshot() Real-Time Sync
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND SRE MISSION CONTROL (React / Vite / Next.js Dashboard)                                │
│                                                                                                 │
│  • Live Real-Time Incident Grid (`/incidents` query where status in ["firing", "cooling_down"]) │
│  • Real-Time NRR & Event Metrics Chart (`/metricsSnapshots` order by timestamp desc limit 60)   │
│  • Live Throttled Event Feed (`/liveFeed` capped telemetry collection)                          │
│  • Cooldown Matrix & Channel Routing Editor (invoking `httpsCallable` with Firebase Auth)       │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🧠 Core Algorithms in Plain English

### 1. The Normalization & Fingerprinting Engine (`src/lib/fingerprint.ts`)
Distributed systems emit millions of errors where variable IDs (such as user UUIDs, order numbers, IP addresses, timestamps, and memory pointer addresses) make the exact same underlying failure appear unique.

SignalGuard executes a pure, 3-stage normalization pipeline:
1. **Message Templating**:
   - Dates and timestamps are normalized to `<TIMESTAMP>`
   - UUIDs (`[0-9a-fA-F-]{36}`) are normalized to `<UUID>`
   - IPv4 addresses (`192.168.x.x`) are normalized to `<IP>`
   - Email addresses are normalized to `<EMAIL>`
   - Number tokens and database row IDs are normalized to `<N>`
   - Hex memory addresses are normalized to `<HEX>`
2. **Stack Trace Pruning**:
   - Memory hex pointers (`0x7fff5fbff820`) are stripped
   - Line numbers and column indices (`:45:12`) that fluctuate across deployments are removed
   - Deep platform noise is pruned, keeping only the top 5 stack frames
   - Absolute filesystem paths are trimmed to relative module names
3. **Cryptographic Hashing**:
   - Computes `SHA-256("${service}:${errorType}:${normalizedMessage}:${normalizedStackTrace}")`
   - **Result**: 10,000 distinct user errors from a database timeout produce **one identical 64-character fingerprint**.

### 2. Dual-State Cooldown Matrix & Burst Tracking (`src/lib/cooldown.ts` & `src/lib/burstDetector.ts`)
Realtime Database (RTDB) is leveraged for high-frequency state updates because atomic increments and TTL keys are substantially cheaper and faster than Firestore writes under heavy traffic storms.

1. **TTL Cooldown State**:
   - Checks `/cooldowns/{fingerprintHash}` in RTDB.
   - **If missing/expired**: Marks event as `FIRE`. Creates or reopens the incident, sets `/cooldowns/{fingerprintHash} = now + cooldownSeconds`, dispatches a top-level alert, and increments `counters/notificationsSentTotal`.
   - **If active**: Marks event as `SUPPRESSED`. Atomically increments `occurrenceCount` and `pendingBatchCount` in Firestore and enqueues a debounced Cloud Task.
2. **Rolling 60-Second Sliding Window Burst Rate**:
   - Appends occurrence timestamps to `/burstCounters/{fingerprintHash}/{pushId}`.
   - Evaluates count of occurrences within `now - 60000`.
   - If rate breaches severity threshold (e.g. >20/min for critical, >50/min for high), sets `incident.isBurst = true`, switching updates to high-visibility burst summary cards.

### 3. Anti-Spam Debounced Batch Flusher (`src/tasks/flushIncidentThread.ts`)
Instead of flooding chat channels with every duplicate occurrence, SignalGuard buffers suppressed counts in Firestore and uses Cloud Tasks (`flush-{incidentId}`) with a 10-second delay.
- When the task executes, it reads `pendingBatchCount`, sends **one single in-thread reply or in-place edit** summarizing the batched delta (e.g., `"+47 new occurrences across 6 instances"`), and resets `pendingBatchCount = 0`.

---

## ⚡ Quick Start with Firebase Emulator Suite

### 1. Prerequisites
- Node.js 20+
- Java Runtime Environment (JRE 11+) for Firebase Emulators

### 2. Install Dependencies
```bash
cd signalguard-backend/functions
npm install
```

### 3. Run Automated Tests
```bash
npm test
```

### 4. Start Local Firebase Emulator Suite
```bash
cd signalguard-backend
npx -y firebase-tools@latest emulators:start
```

Emulators will boot on:
- **Emulator UI**: [http://127.0.0.1:4000](http://127.0.0.1:4000)
- **Functions**: `http://127.0.0.1:5001/demo-signalguard/us-central1`
- **Firestore**: `127.0.0.1:8080`
- **Realtime Database**: `127.0.0.1:9000`
- **Pub/Sub**: `127.0.0.1:8085`
- **Auth**: `127.0.0.1:9099`

---

## 📡 API Reference & Simulation

### 1. Ingest Raw Error Event
**POST** `http://127.0.0.1:5001/demo-signalguard/us-central1/ingestEvent`

```json
{
  "service": "checkout-service",
  "instanceId": "inst-prod-04",
  "errorType": "PaymentGatewayTimeout",
  "severity": "critical",
  "message": "HTTP 504 Gateway Timeout while processing order #10492 for user 89b21a00-1234-4567-89ab-cdef01234567",
  "stackTrace": "Error: Gateway Timeout\n    at PaymentClient.executePayment (/var/task/src/services/payment.ts:142:15)\n    at CheckoutController.handleCheckout (/var/task/src/controllers/checkout.ts:88:24)"
}
```
**Response (202 Accepted):**
```json
{
  "status": "accepted",
  "eventId": "f74a009c-3004-4fa7-8b0f-8c38a168a2bf",
  "service": "checkout-service",
  "errorType": "PaymentGatewayTimeout",
  "severity": "critical"
}
```

---

### 2. Simulate High-Volume Traffic Storm
**POST** `http://127.0.0.1:5001/demo-signalguard/us-central1/simulateTraffic`

```json
{
  "pattern": "burst",
  "durationSeconds": 10,
  "eventsPerSecond": 50
}
```
**Response:**
```json
{
  "status": "success",
  "pattern": "burst",
  "durationSeconds": 10,
  "eventsPerSecond": 50,
  "totalEventsPublished": 500,
  "topic": "raw-events"
}
```

---

## 🔒 Security Model

- **Firestore Rules (`firestore.rules`)**:
  - `/incidents/**`, `/metricsSnapshots/**`, `/liveFeed/**`: Read access granted only to authenticated dashboard users (`request.auth != null`). Direct client write access is completely blocked (`allow write: if false`).
  - `/config/**`: Read access for dashboard; all modifications must go through callable Cloud Functions with server-side validation.
  - `/apiKeys/**`: Strictly blocked from all client access.
- **Realtime Database Rules (`database.rules.json`)**:
  - Entire database locked (`.read: false, .write: false`). Only Cloud Functions using the Firebase Admin SDK can interact with cooldowns, burst state, and atomic counters.
- **Secrets Management**:
  - Production credentials (`SLACK_BOT_TOKEN`, `PAGERDUTY_ROUTING_KEY`, `DISCORD_WEBHOOK_URL`) are bound securely using Firebase Secret Manager (`firebase functions:secrets:set`).
