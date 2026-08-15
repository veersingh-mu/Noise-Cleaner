import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkAndSetCooldown,
  resolveCooldownDuration,
  CooldownMatrixConfig,
  incrementRtdbCounter,
} from '../src/lib/cooldown';
import { trackBurst } from '../src/lib/burstDetector';

// Lightweight In-Memory RTDB Mock for fast unit testing
class MockRtdbRef {
  private data: any;
  private path: string;
  private root: Map<string, any>;

  constructor(path: string, root: Map<string, any>) {
    this.path = path;
    this.root = root;
  }

  async get() {
    return {
      val: () => this.root.get(this.path) ?? null,
    };
  }

  async once(eventType: string) {
    return this.get();
  }

  async set(val: any) {
    if (val === null) {
      this.root.delete(this.path);
    } else {
      this.root.set(this.path, val);
    }
  }

  push() {
    const pushId = `push_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const childPath = `${this.path}/${pushId}`;
    return {
      key: pushId,
      set: async (val: any) => {
        let parentObj = this.root.get(this.path) || {};
        parentObj[pushId] = val;
        this.root.set(this.path, parentObj);
      },
    };
  }

  async update(updates: Record<string, any>) {
    let parentObj = this.root.get(this.path) || {};
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) {
        delete parentObj[k];
      } else {
        parentObj[k] = v;
      }
    }
    this.root.set(this.path, parentObj);
  }

  async transaction(fn: (curr: any) => any) {
    const curr = this.root.get(this.path) ?? null;
    const next = fn(curr);
    if (next === undefined) {
      return { committed: false, snapshot: { val: () => curr } };
    }
    this.root.set(this.path, next);
    return { committed: true, snapshot: { val: () => next } };
  }
}

class MockRtdb {
  public store = new Map<string, any>();

  ref(path: string) {
    return new MockRtdbRef(path, this.store);
  }

  reset() {
    this.store.clear();
  }
}

describe('Cooldown & Burst Logic', () => {
  let mockRtdb: MockRtdb;

  const testConfig: CooldownMatrixConfig = {
    default: {
      critical: 30,
      high: 120,
      medium: 300,
      low: 900,
    },
    burstThreshold: {
      critical: 5,
      high: 10,
      medium: 20,
      low: 50,
    },
    overrides: {
      'checkout-service': {
        critical: 15, // Custom override
      },
    },
  };

  beforeEach(() => {
    mockRtdb = new MockRtdb();
  });

  describe('resolveCooldownDuration', () => {
    it('uses severity default when no service override exists', () => {
      expect(resolveCooldownDuration(testConfig, 'auth-service', 'critical')).toBe(30);
      expect(resolveCooldownDuration(testConfig, 'auth-service', 'high')).toBe(120);
      expect(resolveCooldownDuration(testConfig, 'auth-service', 'medium')).toBe(300);
      expect(resolveCooldownDuration(testConfig, 'auth-service', 'low')).toBe(900);
    });

    it('respects service-level severity duration override', () => {
      expect(resolveCooldownDuration(testConfig, 'checkout-service', 'critical')).toBe(15);
      expect(resolveCooldownDuration(testConfig, 'checkout-service', 'high')).toBe(120);
    });
  });

  describe('checkAndSetCooldown', () => {
    it('returns isSuppressed = false on first event and sets expiry timestamp in RTDB', async () => {
      const now = 1000000;
      const res = await checkAndSetCooldown(
        mockRtdb as any,
        'hash123',
        'auth-service',
        'critical',
        testConfig,
        now
      );

      expect(res.isSuppressed).toBe(false);
      expect(res.cooldownSeconds).toBe(30);
      expect(res.expiryTimestampMillis).toBe(now + 30000);

      // Verify RTDB state
      const savedExpiry = mockRtdb.store.get('cooldowns/hash123');
      expect(savedExpiry).toBe(now + 30000);
    });

    it('returns isSuppressed = true if event arrives before cooldown expires', async () => {
      const now = 1000000;
      // First event
      await checkAndSetCooldown(mockRtdb as any, 'hash123', 'auth-service', 'critical', testConfig, now);

      // Second event 10 seconds later (cooldown is 30s)
      const res2 = await checkAndSetCooldown(
        mockRtdb as any,
        'hash123',
        'auth-service',
        'critical',
        testConfig,
        now + 10000
      );

      expect(res2.isSuppressed).toBe(true);
      expect(res2.cooldownSeconds).toBe(20); // 20s remaining
    });

    it('returns isSuppressed = false and resets expiry if event arrives after cooldown expires', async () => {
      const now = 1000000;
      await checkAndSetCooldown(mockRtdb as any, 'hash123', 'auth-service', 'critical', testConfig, now);

      // Subsequent event 35 seconds later (cooldown expired at +30s)
      const res3 = await checkAndSetCooldown(
        mockRtdb as any,
        'hash123',
        'auth-service',
        'critical',
        testConfig,
        now + 35000
      );

      expect(res3.isSuppressed).toBe(false);
      expect(res3.expiryTimestampMillis).toBe(now + 35000 + 30000);
    });
  });

  describe('trackBurst', () => {
    it('detects burst storm when occurrences in 60s window exceed threshold', async () => {
      const now = 2000000;
      const hash = 'burst_hash';

      // Record 4 events (threshold is 5 for critical)
      for (let i = 0; i < 4; i++) {
        const res = await trackBurst(mockRtdb as any, hash, 'critical', testConfig, now + i * 1000);
        expect(res.isBurst).toBe(false);
        expect(res.count).toBe(i + 1);
      }

      // 5th event breaches threshold
      const burstRes = await trackBurst(mockRtdb as any, hash, 'critical', testConfig, now + 5000);
      expect(burstRes.isBurst).toBe(true);
      expect(burstRes.count).toBe(5);
    });
  });

  describe('incrementRtdbCounter', () => {
    it('atomically increments counters in RTDB', async () => {
      const c1 = await incrementRtdbCounter(mockRtdb as any, 'counters/rawEventsTotal', 1);
      expect(c1).toBe(1);

      const c2 = await incrementRtdbCounter(mockRtdb as any, 'counters/rawEventsTotal', 5);
      expect(c2).toBe(6);
    });
  });
});
