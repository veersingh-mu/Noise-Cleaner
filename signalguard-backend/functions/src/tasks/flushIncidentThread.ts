import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { clearPendingFlushFlag } from '../lib/taskScheduler';
import { AdapterFactory } from '../lib/adapters/AdapterFactory';
import { IncidentData } from '../lib/adapters/AlertAdapter';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Cloud Tasks HTTP Handler: Flushes batched thread updates for an incident.
 * Consolidates suppressed occurrences into a single in-thread notification or in-place edit.
 */
export const flushIncidentThread = onRequest(
  {
    cors: true,
    region: 'us-central1',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    let incidentId = req.body?.incidentId;
    if (!incidentId && typeof req.body === 'string') {
      try {
        incidentId = JSON.parse(req.body).incidentId;
      } catch {
        // Ignore
      }
    }

    if (!incidentId) {
      res.status(400).json({ error: 'Missing incidentId in request body' });
      return;
    }

    const firestore = admin.firestore();
    const rtdb = admin.database();

    try {
      const incidentRef = firestore.collection('incidents').doc(incidentId);
      const incidentSnap = await incidentRef.get();

      if (!incidentSnap.exists) {
        await clearPendingFlushFlag(rtdb, incidentId);
        res.status(404).json({ error: `Incident ${incidentId} not found` });
        return;
      }

      const data = incidentSnap.data()!;
      const pendingCount = (data.pendingBatchCount as number) || 0;
      const isBurst = Boolean(data.isBurst);

      if (pendingCount > 0 && data.alertChannelRef) {
        const incidentData: IncidentData = {
          id: incidentId,
          fingerprint: data.fingerprint,
          service: data.service,
          errorType: data.errorType,
          severity: data.severity,
          status: data.status,
          normalizedMessage: data.normalizedMessage,
          occurrenceCount: data.occurrenceCount,
          affectedInstances: data.affectedInstances || [],
          alertChannelRef: data.alertChannelRef,
          isBurst,
        };

        const adapter = await AdapterFactory.getAdapterForService(data.service, firestore);
        await adapter.updateThread(incidentData, pendingCount, isBurst);

        // Reset pending batch count to 0 in Firestore
        await incidentRef.update({
          pendingBatchCount: 0,
        });
      }

      // Clear RTDB pending flag to allow future batch tasks
      await clearPendingFlushFlag(rtdb, incidentId);

      res.status(200).json({
        status: 'flushed',
        incidentId,
        deltaFlushed: pendingCount,
        isBurst,
      });
    } catch (err: any) {
      console.error(`[flushIncidentThread] Error flushing incident ${incidentId}:`, err);
      // Still attempt to clear pending flag so retries or subsequent batches are not blocked forever
      await clearPendingFlushFlag(rtdb, incidentId).catch(() => {});
      res.status(500).json({ error: 'Failed to flush incident thread', message: err.message });
    }
  }
);
