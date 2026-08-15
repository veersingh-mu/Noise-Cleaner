import { describe, it, expect, beforeEach } from 'vitest';
import { computeFingerprint, normalizeMessage } from '../src/lib/fingerprint';
import { checkAndSetCooldown, incrementRtdbCounter, CooldownMatrixConfig } from '../src/lib/cooldown';
import { trackBurst } from '../src/lib/burstDetector';

// Mock in-memory state containers
class MockFirestoreCollection {
  private docs = new Map<string, any>();
  private subcollections = new Map<string, Map<string, any>>();

  doc(id?: string) {
    const docId = id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return {
      id: docId,
      get: async () => ({
        exists: this.docs.has(docId),
        data: () => this.docs.get(docId),
      }),
      set: async (data: any) => {
        this.docs.set(docId, { ...data });
      },
      update: async (updates: any) => {
        const curr = this.docs.get(docId) || {};
        for (const [k, v] of Object.entries(updates)) {
          if (v && typeof v === 'object' && (v as any).__op === 'increment') {
            curr[k] = (curr[k] || 0) + (v as any).amount;
          } else if (v && typeof v === 'object' && (v as any).__op === 'arrayUnion') {
            curr[k] = Array.from(new Set([...(curr[k] || []), ...(v as any).elements]));
          } else {
            curr[k] = v;
          }
        }
        this.docs.set(docId, curr);
      },
      collection: (subName: string) => {
        const subKey = `${docId}/${subName}`;
        if (!this.subcollections.has(subKey)) {
          this.subcollections.set(subKey, new Map());
        }
        const subMap = this.subcollections.get(subKey)!;
        return {
          add: async (data: any) => {
            const subId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            subMap.set(subId, data);
            return { id: subId };
          },
          get: async () => ({
            size: subMap.size,
            docs: Array.from(subMap.entries()).map(([id, d]) => ({ id, data: () => d })),
          }),
        };
      },
    };
  }

  getDoc(id: string) {
    return this.docs.get(id);
  }

  getSubcollection(docId: string, subName: string) {
    return this.subcollections.get(`${docId}/${subName}`);
  }

  clear() {
    this.docs.clear();
    this.subcollections.clear();
  }
}

class MockRtdb {
  public store = new Map<string, any>();

  ref(path: string) {
    return {
      get: async () => ({ val: () => this.store.get(path) ?? null }),
      once: async () => ({ val: () => this.store.get(path) ?? null }),
      set: async (val: any) => {
        if (val === null) this.store.delete(path);
        else this.store.set(path, val);
      },
      push: () => {
        const pushId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        return {
          key: pushId,
          set: async (val: any) => {
            const parent = this.store.get(path) || {};
            parent[pushId] = val;
            this.store.set(path, parent);
          },
        };
      },
      update: async (updates: Record<string, any>) => {
        const parent = this.store.get(path) || {};
        for (const [k, v] of Object.entries(updates)) {
          if (v === null) delete parent[k];
          else parent[k] = v;
        }
        this.store.set(path, parent);
      },
      transaction: async (fn: (c: any) => any) => {
        const curr = this.store.get(path) ?? null;
        const next = fn(curr);
        this.store.set(path, next);
        return { committed: true, snapshot: { val: () => next } };
      },
    };
  }
}

describe('processRawEvent Deduplication & Alert Fatigue Suppression', () => {
  let incidentsCol: MockFirestoreCollection;
  let fingerprintIndexCol: MockFirestoreCollection;
  let rtdb: MockRtdb;
  let dispatchedAlerts: any[];

  const testConfig: CooldownMatrixConfig = {
    default: { critical: 30, high: 120, medium: 300, low: 900 },
    burstThreshold: { critical: 10, high: 25, medium: 50, low: 100 },
    overrides: {},
  };

  // Simplified core worker simulation mirroring processRawEvent logic
  async function processEvent(eventPayload: {
    service: string;
    instanceId: string;
    errorType: string;
    message: string;
    stackTrace?: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
  }) {
    const fingerprintHash = computeFingerprint({
      service: eventPayload.service,
      errorType: eventPayload.errorType,
      message: eventPayload.message,
      stackTrace: eventPayload.stackTrace,
    });

    // 1. RTDB rawEvents counter increment
    await incrementRtdbCounter(rtdb as any, 'counters/rawEventsTotal', 1);

    // 2. Cooldown check
    const cooldown = await checkAndSetCooldown(
      rtdb as any,
      fingerprintHash,
      eventPayload.service,
      eventPayload.severity,
      testConfig
    );

    // 3. Lookup incident ID
    const indexDocRef = fingerprintIndexCol.doc(fingerprintHash);
    const indexSnap = await indexDocRef.get();

    let incidentId: string;

    if (!cooldown.isSuppressed) {
      // FIRE EVENT
      if (!indexSnap.exists) {
        const incidentDocRef = incidentsCol.doc();
        incidentId = incidentDocRef.id;

        const newIncident = {
          id: incidentId,
          fingerprint: fingerprintHash,
          service: eventPayload.service,
          errorType: eventPayload.errorType,
          severity: eventPayload.severity,
          status: 'firing',
          normalizedMessage: normalizeMessage(eventPayload.message),
          occurrenceCount: 1,
          affectedInstances: [eventPayload.instanceId],
          pendingBatchCount: 0,
          isBurst: false,
        };

        await incidentDocRef.set(newIncident);
        await indexDocRef.set({ incidentId, fingerprint: fingerprintHash });

        // Dispatch initial alert
        dispatchedAlerts.push({
          type: 'INITIAL_SEND',
          service: eventPayload.service,
          incidentId,
          fingerprint: fingerprintHash,
        });

        await incrementRtdbCounter(rtdb as any, 'counters/notificationsSentTotal', 1);

        // Record unsuppressed occurrence
        const occurrences = incidentsCol.doc(incidentId).collection('occurrences');
        await occurrences.add({
          instanceId: eventPayload.instanceId,
          rawMessage: eventPayload.message,
          suppressed: false,
        });
      } else {
        incidentId = indexSnap.data().incidentId;
      }
    } else {
      // SUPPRESSED EVENT
      incidentId = indexSnap.data().incidentId;
      const incidentDocRef = incidentsCol.doc(incidentId);

      // Increment counts atomically
      await incidentDocRef.update({
        occurrenceCount: { __op: 'increment', amount: 1 },
        pendingBatchCount: { __op: 'increment', amount: 1 },
        affectedInstances: { __op: 'arrayUnion', elements: [eventPayload.instanceId] },
      });

      // Record suppressed occurrence
      const occurrences = incidentDocRef.collection('occurrences');
      await occurrences.add({
        instanceId: eventPayload.instanceId,
        rawMessage: eventPayload.message,
        suppressed: true,
      });
    }

    // 4. Burst tracking
    const burst = await trackBurst(rtdb as any, fingerprintHash, eventPayload.severity, testConfig);
    if (burst.isBurst) {
      await incidentsCol.doc(incidentId).update({ isBurst: true });
    }

    return { incidentId, suppressed: cooldown.isSuppressed };
  }

  beforeEach(() => {
    incidentsCol = new MockFirestoreCollection();
    fingerprintIndexCol = new MockFirestoreCollection();
    rtdb = new MockRtdb();
    dispatchedAlerts = [];
  });

  it('ingesting 20 identical-fingerprint events results in exactly ONE incident doc with count=20 and ONE alert sent', async () => {
    const errorTemplate = {
      service: 'checkout-service',
      errorType: 'PaymentGatewayTimeout',
      stackTrace: 'Error: Gateway Timeout\n at pay (/app/pay.ts:10)',
      severity: 'critical' as const,
    };

    // Ingest 20 events with varying order numbers and instance IDs
    for (let i = 1; i <= 20; i++) {
      const res = await processEvent({
        ...errorTemplate,
        instanceId: `inst-${(i % 4) + 1}`,
        message: `HTTP 504 Gateway Timeout while processing order #${1000 + i}`,
      });

      if (i === 1) {
        expect(res.suppressed).toBe(false); // 1st event is unsuppressed
      } else {
        expect(res.suppressed).toBe(true); // Remaining 19 events are suppressed
      }
    }

    // 1. Verify RTDB counters
    const rawEvents = rtdb.store.get('counters/rawEventsTotal');
    const notifsSent = rtdb.store.get('counters/notificationsSentTotal');
    expect(rawEvents).toBe(20);
    expect(notifsSent).toBe(1);

    // 2. Verify exactly ONE initial alert dispatched
    expect(dispatchedAlerts).toHaveLength(1);
    expect(dispatchedAlerts[0].type).toBe('INITIAL_SEND');

    // 3. Verify exactly ONE incident doc exists in Firestore
    const incidentId = dispatchedAlerts[0].incidentId;
    const incident = incidentsCol.getDoc(incidentId);
    expect(incident).toBeDefined();
    expect(incident.occurrenceCount).toBe(20);
    expect(incident.pendingBatchCount).toBe(19);
    expect(incident.affectedInstances).toEqual(expect.arrayContaining(['inst-1', 'inst-2', 'inst-3', 'inst-4']));

    // 4. Verify occurrences subcollection
    const occurrencesMap = incidentsCol.getSubcollection(incidentId, 'occurrences')!;
    expect(occurrencesMap.size).toBe(20);

    const occurrences = Array.from(occurrencesMap.values());
    const unsuppressed = occurrences.filter((o: any) => !o.suppressed);
    const suppressed = occurrences.filter((o: any) => o.suppressed);

    expect(unsuppressed).toHaveLength(1);
    expect(suppressed).toHaveLength(19);

    // 5. Verify Burst was detected (threshold is 10 for critical, we sent 20)
    expect(incident.isBurst).toBe(true);

    // 6. Compute NRR (Noise Reduction Ratio)
    const nrr = 1 - notifsSent / rawEvents;
    expect(nrr).toBe(0.95); // 95% noise reduction!
  });
});
