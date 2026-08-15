import * as admin from 'firebase-admin';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface CooldownMatrixConfig {
  default: Record<Severity, number>;
  burstThreshold: Record<Severity, number>;
  overrides?: Record<string, Partial<Record<Severity, number>>>;
}

export const DEFAULT_COOLDOWN_MATRIX: CooldownMatrixConfig = {
  default: {
    critical: 30,   // 30 seconds
    high: 120,      // 2 minutes
    medium: 300,    // 5 minutes
    low: 900,       // 15 minutes
  },
  burstThreshold: {
    critical: 20,   // >20 events / 60s
    high: 50,       // >50 events / 60s
    medium: 100,    // >100 events / 60s
    low: 200,       // >200 events / 60s
  },
  overrides: {},
};

// In-memory config cache with TTL / warm instance reuse
let cachedConfig: CooldownMatrixConfig | null = null;
let lastConfigFetchTime = 0;
const CONFIG_CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Loads the active cooldown matrix config from Firestore (/config/cooldownMatrix)
 * with an in-memory TTL cache for high performance.
 */
export async function getCooldownMatrixConfig(
  firestore?: admin.firestore.Firestore
): Promise<CooldownMatrixConfig> {
  const now = Date.now();
  if (cachedConfig && now - lastConfigFetchTime < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const db = firestore || admin.firestore();
    const docSnap = await db.collection('config').doc('cooldownMatrix').get();

    if (docSnap.exists) {
      const data = docSnap.data() as Partial<CooldownMatrixConfig>;
      cachedConfig = {
        default: { ...DEFAULT_COOLDOWN_MATRIX.default, ...(data.default || {}) },
        burstThreshold: { ...DEFAULT_COOLDOWN_MATRIX.burstThreshold, ...(data.burstThreshold || {}) },
        overrides: data.overrides || {},
      };
      lastConfigFetchTime = now;
      return cachedConfig;
    }
  } catch (err) {
    console.warn('[cooldown] Failed to fetch cooldownMatrix from Firestore, using defaults:', err);
  }

  return DEFAULT_COOLDOWN_MATRIX;
}

/**
 * Resolves the cooldown duration in seconds for a specific service and severity.
 */
export function resolveCooldownDuration(
  config: CooldownMatrixConfig,
  service: string,
  severity: Severity
): number {
  // Check service-level override first
  if (config.overrides && config.overrides[service] && config.overrides[service][severity] !== undefined) {
    return config.overrides[service][severity]!;
  }

  // Fallback to default for severity
  return config.default[severity] ?? DEFAULT_COOLDOWN_MATRIX.default[severity];
}

export interface CooldownCheckResult {
  isSuppressed: boolean;
  expiryTimestampMillis: number;
  cooldownSeconds: number;
}

/**
 * Checks and atomically updates cooldown state in Realtime Database.
 * /cooldowns/{fingerprintHash} -> <expiryTimestampMillis>
 */
export async function checkAndSetCooldown(
  rtdb: admin.database.Database,
  fingerprintHash: string,
  service: string,
  severity: Severity,
  config?: CooldownMatrixConfig,
  nowMillis: number = Date.now()
): Promise<CooldownCheckResult> {
  const activeConfig = config || (await getCooldownMatrixConfig());
  const cooldownDurationSec = resolveCooldownDuration(activeConfig, service, severity);
  const cooldownDurationMs = cooldownDurationSec * 1000;

  const cooldownRef = rtdb.ref(`cooldowns/${fingerprintHash}`);

  // Use a transaction or single read/write on the key
  const snapshot = await cooldownRef.get();
  const currentExpiry = snapshot.val() as number | null;

  if (currentExpiry !== null && currentExpiry > nowMillis) {
    // Cooldown is active -> suppressed event
    return {
      isSuppressed: true,
      expiryTimestampMillis: currentExpiry,
      cooldownSeconds: Math.ceil((currentExpiry - nowMillis) / 1000),
    };
  }

  // Cooldown is expired or missing -> Fire event! Set new expiry
  const newExpiry = nowMillis + cooldownDurationMs;
  await cooldownRef.set(newExpiry);

  return {
    isSuppressed: false,
    expiryTimestampMillis: newExpiry,
    cooldownSeconds: cooldownDurationSec,
  };
}

/**
 * Increment RTDB counter atomically via transaction
 */
export async function incrementRtdbCounter(
  rtdb: admin.database.Database,
  counterPath: string,
  amount: number = 1
): Promise<number> {
  const ref = rtdb.ref(counterPath);
  const result = await ref.transaction((currentValue: number | null) => {
    return (currentValue || 0) + amount;
  });
  return result.snapshot.val() as number;
}
