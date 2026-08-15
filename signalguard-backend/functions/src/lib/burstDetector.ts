import * as admin from 'firebase-admin';
import { CooldownMatrixConfig, DEFAULT_COOLDOWN_MATRIX, Severity } from './cooldown';

export interface BurstCheckResult {
  isBurst: boolean;
  count: number;
  threshold: number;
}

const BURST_WINDOW_MS = 60 * 1000; // 60 seconds
const PRUNE_WINDOW_MS = 120 * 1000; // 2 minutes

/**
 * Records an occurrence in the sliding 60-second burst window for a given fingerprint,
 * calculates the current occurrence rate, prunes stale entries, and checks against severity threshold.
 */
export async function trackBurst(
  rtdb: admin.database.Database,
  fingerprintHash: string,
  severity: Severity,
  config: CooldownMatrixConfig = DEFAULT_COOLDOWN_MATRIX,
  nowMillis: number = Date.now()
): Promise<BurstCheckResult> {
  const burstRef = rtdb.ref(`burstCounters/${fingerprintHash}`);

  // 1. Append new occurrence timestamp with push()
  const newEntryRef = burstRef.push();
  await newEntryRef.set(nowMillis);

  // 2. Fetch all recent entries in the trailing burst window
  const windowStart = nowMillis - BURST_WINDOW_MS;
  const pruneThreshold = nowMillis - PRUNE_WINDOW_MS;

  const snapshot = await burstRef.once('value');
  const entries = (snapshot.val() || {}) as Record<string, number>;

  let recentCount = 0;
  const staleKeys: string[] = [];

  for (const [key, timestamp] of Object.entries(entries)) {
    if (typeof timestamp === 'number') {
      if (timestamp >= windowStart) {
        recentCount++;
      } else if (timestamp < pruneThreshold) {
        staleKeys.push(key);
      }
    }
  }

  // 3. Asynchronously prune old keys without blocking
  if (staleKeys.length > 0) {
    const updates: Record<string, null> = {};
    for (const key of staleKeys) {
      updates[key] = null;
    }
    burstRef.update(updates).catch((err) => {
      console.warn(`[burstDetector] Failed to prune stale burst records for ${fingerprintHash}:`, err);
    });
  }

  // 4. Evaluate threshold
  const threshold = config.burstThreshold[severity] ?? DEFAULT_COOLDOWN_MATRIX.burstThreshold[severity];
  const isBurst = recentCount >= threshold;

  return {
    isBurst,
    count: recentCount,
    threshold,
  };
}
