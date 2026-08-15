import { describe, it, expect, beforeEach } from 'vitest';
import { shouldAlert, getCooldownDuration, getBurstThreshold } from '../src/lib/cooldownMatrix.js';
import { redis } from '../src/lib/redis.js';

describe('Cooldown Matrix State Machine', () => {
  beforeEach(async () => {
    try {
      await redis.flushall();
    } catch {}
  });

  it('should resolve default and overridden durations correctly', () => {
    expect(getCooldownDuration('critical')).toBe(30);
    expect(getCooldownDuration('high')).toBe(120);
    expect(getCooldownDuration('critical', 'payments-service')).toBe(10);
  });

  it('should resolve burst thresholds correctly', () => {
    expect(getBurstThreshold('critical')).toBe(20);
    expect(getBurstThreshold('high')).toBe(50);
  });

  it('should fire on first occurrence and enter cooldown', async () => {
    const fp = 'test-fp-1001';
    const firstCheck = await shouldAlert(fp, 'critical', 'payments-service');
    expect(firstCheck.fire).toBe(true);

    const secondCheck = await shouldAlert(fp, 'critical', 'payments-service');
    expect(secondCheck.fire).toBe(false);
    expect(secondCheck.suppressedReason).toContain('In cooldown');
  });

  it('should detect burst when occurrence rate exceeds burst threshold', async () => {
    const fp = 'test-burst-fp-2002';
    // Burst threshold for critical is 20
    let lastResult;
    for (let i = 0; i < 22; i++) {
      lastResult = await shouldAlert(fp, 'critical', 'default-service');
    }

    expect(lastResult?.isBurst).toBe(true);
    expect(lastResult?.burstCount).toBeGreaterThanOrEqual(20);
  });
});
