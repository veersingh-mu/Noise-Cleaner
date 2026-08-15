import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Cloud Scheduler: Runs every 1 minute to compute global Noise Reduction Ratio (NRR)
 * and persist a metrics snapshot in Firestore for real-time dashboard visualization.
 */
export const rollupMetricsSnapshot = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: 'us-central1',
    retryCount: 1,
  },
  async () => {
    const firestore = admin.firestore();
    const rtdb = admin.database();

    try {
      // 1. Read counters from RTDB
      const rawEventsSnap = await rtdb.ref('counters/rawEventsTotal').get();
      const notifsSnap = await rtdb.ref('counters/notificationsSentTotal').get();

      const rawEventsReceived = (rawEventsSnap.val() as number) || 0;
      const notificationsSent = (notifsSnap.val() as number) || 0;

      // 2. Compute Noise Reduction Ratio (NRR)
      let noiseReductionRatio = 1.0;
      if (rawEventsReceived > 0) {
        noiseReductionRatio = Math.max(0, 1 - notificationsSent / rawEventsReceived);
      }

      const now = admin.firestore.Timestamp.now();

      // 3. Write metrics snapshot to Firestore /metricsSnapshots
      await firestore.collection('metricsSnapshots').add({
        timestamp: now,
        rawEventsReceived,
        notificationsSent,
        noiseReductionRatio: Math.round(noiseReductionRatio * 10000) / 10000,
        createdAt: now,
      });

      console.log(
        `[rollupMetricsSnapshot] Snapshot created: Raw=${rawEventsReceived}, Sent=${notificationsSent}, NRR=${(
          noiseReductionRatio * 100
        ).toFixed(2)}%`
      );
    } catch (err) {
      console.error('[rollupMetricsSnapshot] Error rolling up metrics:', err);
    }
  }
);
