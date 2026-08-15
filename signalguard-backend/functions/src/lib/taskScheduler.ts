import * as admin from 'firebase-admin';
import { CloudTasksClient } from '@google-cloud/tasks';

let tasksClient: CloudTasksClient | null = null;

function getTasksClient(): CloudTasksClient {
  if (!tasksClient) {
    tasksClient = new CloudTasksClient();
  }
  return tasksClient;
}

export interface TaskSchedulerOptions {
  projectId?: string;
  location?: string;
  queueName?: string;
  targetUrl?: string;
  delaySeconds?: number;
}

const DEFAULT_DELAY_SECONDS = 10;
const DEFAULT_QUEUE = 'incident-flushes';
const DEFAULT_LOCATION = 'us-central1';

/**
 * Enqueues a delayed flush task for an incident if one is not already scheduled.
 * Uses RTDB flag `/pendingFlush/{incidentId}` for atomic debouncing.
 */
export async function scheduleIncidentFlush(
  rtdb: admin.database.Database,
  incidentId: string,
  options: TaskSchedulerOptions = {}
): Promise<{ scheduled: boolean; reason?: string }> {
  const pendingFlagRef = rtdb.ref(`pendingFlush/${incidentId}`);

  // Atomic transaction to set the flag only if false or missing
  const txResult = await pendingFlagRef.transaction((currentValue: boolean | null) => {
    if (currentValue === true) {
      return; // Abort transaction if already pending
    }
    return true;
  });

  if (!txResult.committed || txResult.snapshot.val() !== true) {
    // A flush task is already pending for this incident
    return { scheduled: false, reason: 'ALREADY_PENDING' };
  }

  const delaySeconds = options.delaySeconds ?? DEFAULT_DELAY_SECONDS;
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'test';

  if (isEmulator) {
    // Local Emulator Mode: Dispatch flush task via HTTP or timer
    const functionsPort = process.env.FIREBASE_FUNCTIONS_PORT || '5001';
    const projectId = process.env.GCLOUD_PROJECT || 'demo-signalguard';
    const emulatorTargetUrl =
      options.targetUrl ||
      `http://127.0.0.1:${functionsPort}/${projectId}/us-central1/flushIncidentThread`;

    // Schedule delayed fetch execution for emulator testing
    setTimeout(async () => {
      try {
        await fetch(emulatorTargetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ incidentId }),
        });
      } catch (err) {
        console.warn(`[taskScheduler] Local emulator flush dispatch failed for ${incidentId}:`, err);
      }
    }, delaySeconds * 1000);

    return { scheduled: true, reason: 'EMULATOR_TIMER' };
  }

  // Production Cloud Tasks Mode
  try {
    const client = getTasksClient();
    const projectId = options.projectId || process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG && JSON.parse(process.env.FIREBASE_CONFIG).projectId || 'demo-signalguard';
    const location = options.location || process.env.FUNCTION_REGION || DEFAULT_LOCATION;
    const queue = options.queueName || DEFAULT_QUEUE;

    const parent = client.queuePath(projectId, location, queue);
    const targetUrl =
      options.targetUrl ||
      `https://${location}-${projectId}.cloudfunctions.net/flushIncidentThread`;

    const scheduledTimeSeconds = Math.floor(Date.now() / 1000) + delaySeconds;
    const taskName = `${parent}/tasks/flush-${incidentId}-${Date.now()}`;

    await client.createTask({
      parent,
      task: {
        name: taskName,
        httpRequest: {
          httpMethod: 'POST',
          url: targetUrl,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify({ incidentId })).toString('base64'),
        },
        scheduleTime: {
          seconds: scheduledTimeSeconds,
        },
      },
    });

    return { scheduled: true, reason: 'CLOUD_TASKS' };
  } catch (err) {
    console.error(`[taskScheduler] Failed to enqueue Cloud Task for incident ${incidentId}:`, err);
    // If Cloud Tasks fails, revert the RTDB flag so subsequent events can retry scheduling
    await pendingFlagRef.set(null);
    throw err;
  }
}

/**
 * Clears the pending flush flag in RTDB after a flush operation completes.
 */
export async function clearPendingFlushFlag(
  rtdb: admin.database.Database,
  incidentId: string
): Promise<void> {
  const pendingFlagRef = rtdb.ref(`pendingFlush/${incidentId}`);
  await pendingFlagRef.set(null);
}
