import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { computeFingerprint, normalizeMessage, normalizeStackTrace } from '../lib/fingerprint.js';
import { shouldAlert } from '../lib/cooldownMatrix.js';
import { AdapterFactory } from '../lib/adapters/AdapterFactory.js';
import { incrementRaw, incrementSent, incrementSuppressed } from '../lib/metricsTracker.js';
import { enqueueBatchOccurrence } from './threadBatchFlusher.js';
import { broadcastEvent, broadcastIncidentUpdate } from '../websocket/server.js';

export interface RawEventPayload {
  service: string;
  errorType: string;
  message: string;
  stackTrace?: string;
  severity?: string; // critical | high | medium | low
  instanceId?: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

const STREAM_KEY = 'raw-events';
const GROUP_NAME = 'signalguard-workers';
const CONSUMER_NAME = `worker-${process.pid}`;

let isWorkerRunning = false;

/**
 * Direct core processor for an ingested raw event.
 * Reusable both by stream consumer and high-throughput direct simulation.
 */
export async function processRawEvent(event: RawEventPayload): Promise<any> {
  const service = (event.service || 'default-service').trim();
  const errorType = (event.errorType || 'Error').trim();
  const severity = (event.severity || 'medium').toLowerCase();
  const rawMessage = event.message || 'Unknown error occurred';
  const stackTrace = event.stackTrace || '';
  const instanceId = event.instanceId || `inst-${Math.random().toString(36).substring(2, 6)}`;
  const timestamp = event.timestamp ? new Date(event.timestamp) : new Date();

  // 1. Compute deterministic fingerprint
  const fingerprint = computeFingerprint({
    service,
    errorType,
    message: rawMessage,
    stackTrace
  });

  const normalizedMessage = normalizeMessage(rawMessage);
  const sampleStackTrace = normalizeStackTrace(stackTrace);

  // 2. Track raw count
  await incrementRaw(1);

  // 3. Determine alert routing vs suppression
  const decision = await shouldAlert(fingerprint, severity, service);
  const isSuppressed = !decision.fire;

  // 4. Look up existing active Incident
  let incident = await prisma.incident.findUnique({
    where: { fingerprint }
  });

  let createdNewIncident = false;

  if (!incident) {
    // New Incident
    createdNewIncident = true;
    const adapter = AdapterFactory.getAdapterForService(service);

    const initialPayload = {
      id: `temp_${Date.now()}`,
      fingerprint,
      service,
      errorType,
      severity,
      status: 'firing',
      normalizedMessage,
      sampleStackTrace,
      occurrenceCount: 1,
      affectedInstances: [instanceId],
      firstSeen: timestamp,
      lastSeen: timestamp
    };

    // Dispatch primary alert
    const alertResult = await adapter.send(initialPayload);
    await incrementSent(1);

    incident = await prisma.incident.create({
      data: {
        fingerprint,
        service,
        errorType,
        severity,
        status: 'firing',
        normalizedMessage,
        sampleStackTrace,
        occurrenceCount: 1,
        affectedInstances: [instanceId],
        firstSeen: timestamp,
        lastSeen: timestamp,
        alertChannelRef: alertResult.channelRef
      }
    });

    // Record non-suppressed occurrence
    await prisma.occurrence.create({
      data: {
        incidentId: incident.id,
        instanceId,
        rawMessage,
        timestamp,
        suppressed: false
      }
    });
  } else {
    // Existing Incident
    const affectedInstances = Array.from(
      new Set([...(incident.affectedInstances || []), instanceId])
    );

    if (decision.fire) {
      // Cooldown expired, re-fire alert top-level or new thread
      const adapter = AdapterFactory.getAdapterForService(service);
      const alertResult = await adapter.send({
        ...incident,
        occurrenceCount: incident.occurrenceCount + 1,
        lastSeen: timestamp
      });
      await incrementSent(1);

      incident = await prisma.incident.update({
        where: { id: incident.id },
        data: {
          occurrenceCount: { increment: 1 },
          lastSeen: timestamp,
          status: 'firing',
          affectedInstances,
          alertChannelRef: alertResult.channelRef
        }
      });

      await prisma.occurrence.create({
        data: {
          incidentId: incident.id,
          instanceId,
          rawMessage,
          timestamp,
          suppressed: false
        }
      });
    } else {
      // SUPPRESSED & BATCHED
      await incrementSuppressed(1);

      incident = await prisma.incident.update({
        where: { id: incident.id },
        data: {
          occurrenceCount: { increment: 1 },
          lastSeen: timestamp,
          status: 'cooling_down',
          affectedInstances
        }
      });

      await prisma.occurrence.create({
        data: {
          incidentId: incident.id,
          instanceId,
          rawMessage,
          timestamp,
          suppressed: true
        }
      });

      // Buffer occurrence for the 10-second batch flusher
      enqueueBatchOccurrence(
        incident.id,
        fingerprint,
        service,
        instanceId,
        decision.isBurst
      );
    }
  }

  // 5. Broadcast live events over WebSockets
  const eventPayload = {
    id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    incidentId: incident.id,
    fingerprint,
    service,
    errorType,
    severity,
    rawMessage,
    normalizedMessage,
    instanceId,
    timestamp: timestamp.toISOString(),
    suppressed: isSuppressed,
    isBurst: decision.isBurst,
    burstCount: decision.burstCount
  };

  broadcastEvent(eventPayload);
  broadcastIncidentUpdate(incident, createdNewIncident);

  return {
    incidentId: incident.id,
    fingerprint,
    suppressed: isSuppressed,
    isBurst: decision.isBurst,
    occurrenceCount: incident.occurrenceCount
  };
}

/**
 * Starts the Redis Stream consumer group loop.
 */
export async function startIncidentWorker(): Promise<void> {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  console.log('[IncidentWorker] Initializing Redis Stream consumer...');

  try {
    // Attempt to create consumer group if it doesn't already exist
    await redis.xgroup('CREATE', STREAM_KEY, GROUP_NAME, '$', 'MKSTREAM').catch((err: any) => {
      if (!err.message?.includes('BUSYGROUP')) {
        console.warn('[IncidentWorker] Note on stream group creation:', err.message);
      }
    });
  } catch {}

  // Worker polling loop
  const pollStream = async () => {
    while (isWorkerRunning) {
      try {
        if (typeof redis.xreadgroup === 'function') {
          const streamResults = await redis.xreadgroup(
            'GROUP',
            GROUP_NAME,
            CONSUMER_NAME,
            'BLOCK',
            2000,
            'COUNT',
            50,
            'STREAMS',
            STREAM_KEY,
            '>'
          );

          if (streamResults && Array.isArray(streamResults)) {
            for (const [_stream, messages] of streamResults) {
              for (const [messageId, fields] of messages) {
                try {
                  // Parse fields from stream (key-value list)
                  const parsed: any = {};
                  for (let i = 0; i < fields.length; i += 2) {
                    parsed[fields[i]] = fields[i + 1];
                  }

                  const payload: RawEventPayload = parsed.payload
                    ? JSON.parse(parsed.payload)
                    : parsed;

                  await processRawEvent(payload);
                  await redis.xack(STREAM_KEY, GROUP_NAME, messageId);
                } catch (procErr: any) {
                  console.error('[IncidentWorker] Failed processing stream message:', procErr.message);
                }
              }
            }
          }
        } else {
          // If mock redis doesn't have xreadgroup, sleep briefly
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (err: any) {
        // Stream read timeout or pause
        await new Promise(r => setTimeout(r, 500));
      }
    }
  };

  pollStream().catch(err => console.error('[IncidentWorker Fatal Loop Error]', err));
}
