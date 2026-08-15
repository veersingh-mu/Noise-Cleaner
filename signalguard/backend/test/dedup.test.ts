import { describe, it, expect, beforeEach } from 'vitest';
import { processRawEvent } from '../src/workers/incidentWorker.js';
import { flushBatchedOccurrences } from '../src/workers/threadBatchFlusher.js';
import { getCurrentMetrics } from '../src/lib/metricsTracker.js';
import { redis } from '../src/lib/redis.js';

describe('SignalGuard Ingestion & Dedup Pipeline (Vertical Slice)', () => {
  beforeEach(async () => {
    try {
      await redis.flushall();
    } catch {}
  });

  it('should collapse 100 identical burst errors into 1 primary alert and 99 suppressed occurrences', async () => {
    const errorTemplate = {
      service: 'checkout-service',
      errorType: 'PaymentGatewayTimeout',
      message: 'HTTP 504 Gateway Timeout while processing payment for customer',
      stackTrace: 'Error: Timeout\n    at PaymentGateway.charge (/src/gateway.ts:88:12)\n    at CheckoutController.pay (/src/controller.ts:45:9)',
      severity: 'critical'
    };

    const results = [];
    for (let i = 0; i < 100; i++) {
      const res = await processRawEvent({
        ...errorTemplate,
        message: `${errorTemplate.message} user_${i}_${crypto.randomUUID()}`,
        instanceId: `inst-${i % 4}`
      });
      results.push(res);
    }

    // First event should not be suppressed
    expect(results[0].suppressed).toBe(false);
    // Subsequent 99 events should all be suppressed
    for (let i = 1; i < 100; i++) {
      expect(results[i].suppressed).toBe(true);
    }

    // All should share the exact same incident ID and fingerprint
    const firstFp = results[0].fingerprint;
    const firstIncId = results[0].incidentId;
    for (const r of results) {
      expect(r.fingerprint).toBe(firstFp);
      expect(r.incidentId).toBe(firstIncId);
    }

    // Check final occurrence count
    expect(results[99].occurrenceCount).toBe(100);

    // Check Metrics NRR
    const metrics = await getCurrentMetrics();
    expect(metrics.rawEventsReceived).toBeGreaterThanOrEqual(100);
    expect(metrics.notificationsSent).toBe(1);
    expect(metrics.suppressedEvents).toBe(99);
    expect(metrics.noiseReductionRatio).toBeGreaterThanOrEqual(0.98); // 99% reduction

    // Flush batch queue (simulating 10s ticker)
    const flushed = await flushBatchedOccurrences();
    expect(flushed).toBe(99);
  });
});
