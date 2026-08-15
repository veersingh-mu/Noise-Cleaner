import fs from 'fs';
import path from 'path';
import { redis } from './redis.js';

export interface CooldownConfig {
  default: Record<string, number>;
  burstThreshold: Record<string, number>;
  overrides?: Record<string, Record<string, number>>;
}

export interface ShouldAlertResult {
  fire: boolean;
  isBurst: boolean;
  cooldownTtl: number;
  burstCount: number;
  suppressedReason?: string;
}

let activeConfig: CooldownConfig;
const configPath = path.resolve(process.cwd(), 'src/config/cooldownMatrix.json');

// Default fallback config if file not yet loaded
const defaultConfig: CooldownConfig = {
  default: {
    critical: 30,
    high: 120,
    medium: 300,
    low: 900
  },
  burstThreshold: {
    critical: 20,
    high: 50,
    medium: 100,
    low: 200
  },
  overrides: {
    'payments-service': {
      critical: 10,
      high: 60
    }
  }
};

function loadConfig(): void {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      activeConfig = JSON.parse(content);
      console.log('[CooldownMatrix] Loaded config successfully from disk.');
    } else {
      activeConfig = defaultConfig;
      console.warn('[CooldownMatrix] Config file not found. Using default.');
    }
  } catch (err: any) {
    console.error('[CooldownMatrix] Error parsing cooldownMatrix.json:', err.message);
    if (!activeConfig) activeConfig = defaultConfig;
  }
}

// Initial load
loadConfig();

// Watch for file changes for hot-reloading
try {
  if (fs.existsSync(configPath)) {
    fs.watch(configPath, (eventType) => {
      if (eventType === 'change') {
        console.log('[CooldownMatrix] Detected file change in cooldownMatrix.json, reloading...');
        loadConfig();
      }
    });
  }
} catch (err: any) {
  console.warn('[CooldownMatrix] File watcher warning:', err.message);
}

export function getCooldownConfig(): CooldownConfig {
  return activeConfig || defaultConfig;
}

export function updateCooldownConfig(newConfig: CooldownConfig): void {
  activeConfig = newConfig;
  try {
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
  } catch (err: any) {
    console.error('[CooldownMatrix] Failed to write updated config to disk:', err.message);
  }
}

/**
 * Resolves the cooldown duration in seconds for a given severity and service.
 */
export function getCooldownDuration(severity: string, service?: string): number {
  const normSev = (severity || 'medium').toLowerCase();
  const cfg = getCooldownConfig();

  if (service && cfg.overrides && cfg.overrides[service] && cfg.overrides[service][normSev] !== undefined) {
    return cfg.overrides[service][normSev];
  }

  return cfg.default[normSev] ?? cfg.default['medium'] ?? 300;
}

/**
 * Resolves the burst threshold (events/60s) for a given severity and service.
 */
export function getBurstThreshold(severity: string, service?: string): number {
  const normSev = (severity || 'medium').toLowerCase();
  const cfg = getCooldownConfig();
  return cfg.burstThreshold[normSev] ?? cfg.burstThreshold['medium'] ?? 50;
}

/**
 * Determines whether an incoming error occurrence should trigger a new alert or be suppressed
 * and batched, and checks if the occurrence rate is currently breaching the burst threshold.
 */
export async function shouldAlert(
  fingerprint: string,
  severity: string,
  service: string
): Promise<ShouldAlertResult> {
  const cooldownDuration = getCooldownDuration(severity, service);
  const burstThreshold = getBurstThreshold(severity, service);

  const cooldownKey = `cooldown:${fingerprint}`;
  const burstKey = `burst:${fingerprint}`;
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  // 1. Check Burst Sorted Set (sliding 60-second window)
  const member = `${now}:${Math.random().toString(36).substring(2, 7)}`;
  let burstCount = 1;

  try {
    // Remove items older than 60s
    await redis.zremrangebyscore(burstKey, 0, oneMinuteAgo);
    // Add current event
    await redis.zadd(burstKey, now, member);
    // Refresh TTL for the burst sorted set
    await redis.expire(burstKey, 120);
    // Count occurrences in the past 60s
    burstCount = await redis.zcard(burstKey);
  } catch (err: any) {
    console.warn('[CooldownMatrix] Redis sorted set error:', err.message);
  }

  const isBurst = burstCount >= burstThreshold;

  // 2. Check Cooldown State
  let isInCooldown = false;
  try {
    const exists = await redis.get(cooldownKey);
    if (exists) {
      isInCooldown = true;
    } else {
      // Set cooldown key with TTL
      await redis.set(cooldownKey, 'active', 'EX', cooldownDuration);
      isInCooldown = false;
    }
  } catch (err: any) {
    console.warn('[CooldownMatrix] Redis cooldown key error:', err.message);
    // If Redis fails, default to false so we don't drop alerts
    isInCooldown = false;
  }

  const fire = !isInCooldown;

  return {
    fire,
    isBurst,
    cooldownTtl: cooldownDuration,
    burstCount,
    suppressedReason: !fire ? `In cooldown (${cooldownDuration}s window)` : undefined
  };
}

/**
 * Manually resets or silences an incident's cooldown.
 */
export async function silenceFingerprint(fingerprint: string, durationSeconds: number): Promise<void> {
  const cooldownKey = `cooldown:${fingerprint}`;
  await redis.set(cooldownKey, 'silenced', 'EX', durationSeconds);
}
