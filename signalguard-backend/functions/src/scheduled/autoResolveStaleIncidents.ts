import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const DEFAULT_SILENCE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Cloud Scheduler: Runs every 5 minutes to automatically resolve incidents
 * that have not received any new occurrences within the silence window.
 */
export const autoResolveStaleIncidents = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'us-central1',
    retryCount: 1,
  },
  async () => {
    const firestore = admin.firestore();
    const cutoffMillis = Date.now() - DEFAULT_SILENCE_WINDOW_MS;
    const cutoffTimestamp = admin.firestore.Timestamp.fromMillis(cutoffMillis);

    try {
      // Query active firing / cooling down incidents older than cutoff
      const firingQuery = await firestore
        .collection('incidents')
        .where('status', 'in', ['firing', 'cooling_down'])
        .where('lastSeen', '<=', cutoffTimestamp)
        .limit(100)
        .get();

      if (firingQuery.empty) {
        return;
      }

      const batch = firestore.batch();
      let resolvedCount = 0;

      for (const doc of firingQuery.docs) {
        batch.update(doc.ref, {
          status: 'resolved',
          resolvedAt: admin.firestore.Timestamp.now(),
          resolvedReason: 'auto_silence_timeout',
        });
        resolvedCount++;
      }

      await batch.commit();
      console.log(`[autoResolveStaleIncidents] Successfully auto-resolved ${resolvedCount} stale incidents`);
    } catch (err) {
      console.error('[autoResolveStaleIncidents] Error running auto-resolve sweep:', err);
    }
  }
);
