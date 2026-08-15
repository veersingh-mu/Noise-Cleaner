import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import * as admin from 'firebase-admin';
import { computeFingerprint, normalizeMessage } from '../lib/fingerprint';
import { checkAndSetCooldown, incrementRtdbCounter, Severity } from '../lib/cooldown';
import { trackBurst } from '../lib/burstDetector';
import { scheduleIncidentFlush } from '../lib/taskScheduler';
import { AdapterFactory } from '../lib/adapters/AdapterFactory';
import { IncidentData } from '../lib/adapters/AlertAdapter';

// Ensure Firebase Admin is initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

export interface RawEventMessage {
  eventId?: string;
  service: string;
  instanceId: string;
  errorType: string;
  message: string;
  stackTrace?: string | null;
  severity: Severity;
  timestamp?: string;
  metadata?: Record<string, any>;
}

export const processRawEvent = onMessagePublished(
  {
    topic: 'raw-events',
    region: 'us-central1',
    retry: false,
  },
  async (event) => {
    const firestore = admin.firestore();
    const rtdb = admin.database();

    // 1. Decode and parse event message
    let rawPayload: RawEventMessage;
    try {
      const jsonString = Buffer.from(event.data.message.data, 'base64').toString('utf8');
      rawPayload = JSON.parse(jsonString);
    } catch (err) {
      console.error('[processRawEvent] Failed to parse PubSub message:', err);
      return;
    }

    const {
      service,
      instanceId = 'inst-unknown',
      errorType,
      message,
      stackTrace,
      severity = 'medium',
    } = rawPayload;

    // 2. Deterministic fingerprint computation
    const fingerprintHash = computeFingerprint({
      service,
      errorType,
      message,
      stackTrace,
    });

    // 3. Atomically increment RTDB total raw events counter
    await incrementRtdbCounter(rtdb, 'counters/rawEventsTotal', 1);

    // 4. Check & evaluate Cooldown in RTDB
    const now = Date.now();
    const nowTimestamp = admin.firestore.Timestamp.fromMillis(now);
    const cooldown = await checkAndSetCooldown(rtdb, fingerprintHash, service, severity, undefined, now);

    // 5. Look up incident ID via /fingerprintIndex fast lookup doc
    const indexRef = firestore.collection('fingerprintIndex').doc(fingerprintHash);
    const indexDoc = await indexRef.get();

    let incidentId: string;

    if (!cooldown.isSuppressed) {
      // ═══════════════════════════════════════════════════════════════
      // FIRE PATH (Cooldown expired or first occurrence)
      // ═══════════════════════════════════════════════════════════════
      if (!indexDoc.exists) {
        // Create new incident
        const incidentRef = firestore.collection('incidents').doc();
        incidentId = incidentRef.id;

        const newIncident = {
          fingerprint: fingerprintHash,
          service,
          errorType,
          severity,
          status: 'firing' as const,
          normalizedMessage: normalizeMessage(message),
          sampleStackTrace: stackTrace || null,
          occurrenceCount: 1,
          affectedInstances: [instanceId],
          firstSeen: nowTimestamp,
          lastSeen: nowTimestamp,
          alertChannelRef: null as string | null,
          pendingBatchCount: 0,
          isBurst: false,
          createdAt: nowTimestamp,
        };

        // Create incident doc & index doc in batch
        const batch = firestore.batch();
        batch.set(incidentRef, newIncident);
        batch.set(indexRef, { incidentId, fingerprint: fingerprintHash, createdAt: nowTimestamp });
        await batch.commit();

        // Send top-level alert notification via appropriate channel adapter
        try {
          const adapter = await AdapterFactory.getAdapterForService(service, firestore);
          const incidentData: IncidentData = {
            id: incidentId,
            ...newIncident,
          };
          const { channelRef } = await adapter.send(incidentData);

          if (channelRef) {
            await incidentRef.update({ alertChannelRef: channelRef });
          }
          await incrementRtdbCounter(rtdb, 'counters/notificationsSentTotal', 1);
        } catch (err) {
          console.error(`[processRawEvent] Alert dispatch failed for new incident ${incidentId}:`, err);
        }
      } else {
        // Incident index exists - check if resolved or needs reopening
        incidentId = indexDoc.data()!.incidentId;
        const incidentRef = firestore.collection('incidents').doc(incidentId);
        const incidentSnap = await incidentRef.get();

        if (incidentSnap.exists) {
          const incidentData = incidentSnap.data()!;
          if (incidentData.status === 'resolved') {
            // Reopen resolved incident
            await incidentRef.update({
              status: 'firing',
              lastSeen: nowTimestamp,
              occurrenceCount: admin.firestore.FieldValue.increment(1),
              affectedInstances: admin.firestore.FieldValue.arrayUnion(instanceId),
            });

            // Dispatch alert for reopened incident
            try {
              const adapter = await AdapterFactory.getAdapterForService(service, firestore);
              const data: IncidentData = {
                id: incidentId,
                fingerprint: incidentData.fingerprint,
                service: incidentData.service,
                errorType: incidentData.errorType,
                severity: incidentData.severity,
                status: 'firing',
                normalizedMessage: incidentData.normalizedMessage,
                occurrenceCount: (incidentData.occurrenceCount || 0) + 1,
                affectedInstances: [...(incidentData.affectedInstances || []), instanceId],
                alertChannelRef: incidentData.alertChannelRef,
                isBurst: incidentData.isBurst,
              };
              const { channelRef } = await adapter.send(data);
              if (channelRef && channelRef !== incidentData.alertChannelRef) {
                await incidentRef.update({ alertChannelRef: channelRef });
              }
              await incrementRtdbCounter(rtdb, 'counters/notificationsSentTotal', 1);
            } catch (err) {
              console.error(`[processRawEvent] Alert dispatch failed for reopened incident ${incidentId}:`, err);
            }
          } else {
            // Cooldown just expired, refresh lastSeen and status
            await incidentRef.update({
              lastSeen: nowTimestamp,
              status: 'firing',
              occurrenceCount: admin.firestore.FieldValue.increment(1),
              affectedInstances: admin.firestore.FieldValue.arrayUnion(instanceId),
            });
          }
        }
      }

      // Add occurrence subdocument (suppressed = false)
      await firestore
        .collection('incidents')
        .doc(incidentId)
        .collection('occurrences')
        .add({
          instanceId,
          rawMessage: message,
          timestamp: nowTimestamp,
          suppressed: false,
        });
    } else {
      // ═══════════════════════════════════════════════════════════════
      // SUPPRESSED PATH (Active cooldown)
      // ═══════════════════════════════════════════════════════════════
      if (indexDoc.exists) {
        incidentId = indexDoc.data()!.incidentId;
      } else {
        // Fallback: If index missing, create incident
        const incidentRef = firestore.collection('incidents').doc();
        incidentId = incidentRef.id;
        await indexRef.set({ incidentId, fingerprint: fingerprintHash, createdAt: nowTimestamp });
      }

      const incidentRef = firestore.collection('incidents').doc(incidentId);

      // Atomically increment occurrence count and pending batch count
      await incidentRef.update({
        occurrenceCount: admin.firestore.FieldValue.increment(1),
        pendingBatchCount: admin.firestore.FieldValue.increment(1),
        lastSeen: nowTimestamp,
        status: 'cooling_down',
        affectedInstances: admin.firestore.FieldValue.arrayUnion(instanceId),
      });

      // Add occurrence subdocument (suppressed = true)
      await incidentRef.collection('occurrences').add({
        instanceId,
        rawMessage: message,
        timestamp: nowTimestamp,
        suppressed: true,
      });

      // Enqueue debounced flush task scheduled 10s from now
      try {
        await scheduleIncidentFlush(rtdb, incidentId, { delaySeconds: 10 });
      } catch (err) {
        console.warn(`[processRawEvent] Cloud Task schedule failed for ${incidentId}:`, err);
      }
    }

    // 6. Sliding 60-Second Burst Rate Tracking
    const burst = await trackBurst(rtdb, fingerprintHash, severity, undefined, now);
    if (burst.isBurst) {
      await firestore.collection('incidents').doc(incidentId).update({ isBurst: true });
    }

    // 7. Publish lightweight event to /liveFeed collection for real-time dashboard listeners
    try {
      await firestore.collection('liveFeed').add({
        incidentId,
        service,
        errorType,
        severity,
        suppressed: cooldown.isSuppressed,
        instanceId,
        fingerprint: fingerprintHash,
        timestamp: nowTimestamp,
      });
    } catch (err) {
      // Non-critical telemetry feed
    }
  }
);
