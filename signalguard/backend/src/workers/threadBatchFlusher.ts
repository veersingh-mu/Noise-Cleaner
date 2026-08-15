import { AdapterFactory } from '../lib/adapters/AdapterFactory.js';
import { prisma } from '../lib/prisma.js';

interface BatchedIncidentDelta {
  incidentId: string;
  fingerprint: string;
  service: string;
  deltaCount: number;
  isBurst: boolean;
  instances: Set<string>;
}

const pendingBatches: Map<string, BatchedIncidentDelta> = new Map();
let isFlusherRunning = false;

/**
 * Enqueue a suppressed occurrence into the 10-second batch buffer.
 */
export function enqueueBatchOccurrence(
  incidentId: string,
  fingerprint: string,
  service: string,
  instanceId?: string,
  isBurst: boolean = false
): void {
  let batch = pendingBatches.get(incidentId);
  if (!batch) {
    batch = {
      incidentId,
      fingerprint,
      service,
      deltaCount: 0,
      isBurst: false,
      instances: new Set()
    };
    pendingBatches.set(incidentId, batch);
  }

  batch.deltaCount += 1;
  if (isBurst) batch.isBurst = true;
  if (instanceId) batch.instances.add(instanceId);
}

/**
 * Flushes all pending batched occurrences to their respective alert channel threads.
 * Runs once every 10 seconds.
 */
export async function flushBatchedOccurrences(): Promise<number> {
  if (pendingBatches.size === 0) return 0;

  const entries = Array.from(pendingBatches.entries());
  pendingBatches.clear();

  let flushedCount = 0;

  for (const [incidentId, batch] of entries) {
    if (batch.deltaCount <= 0) continue;

    try {
      const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
      if (!incident) continue;

      const adapter = AdapterFactory.getAdapterForService(incident.service);
      await adapter.updateThread(incident, batch.deltaCount, batch.isBurst);
      flushedCount += batch.deltaCount;
    } catch (err: any) {
      console.error(`[ThreadBatchFlusher] Error flushing incident ${incidentId}:`, err.message);
    }
  }

  if (flushedCount > 0) {
    console.log(`[ThreadBatchFlusher] Flushed ${flushedCount} batched events across ${entries.length} incidents.`);
  }

  return flushedCount;
}

export function startThreadBatchFlusher(): void {
  if (isFlusherRunning) return;
  isFlusherRunning = true;

  console.log('[ThreadBatchFlusher] Started 10-second batch flusher timer.');
  setInterval(() => {
    flushBatchedOccurrences().catch(err => console.warn('[Flusher Error]', err.message));
  }, 10000);
}
