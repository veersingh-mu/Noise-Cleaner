import { Redis as IORedis } from 'ioredis';
import RedisMock from 'ioredis-mock';

let activeClient: any;
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' || process.env.USE_REDIS_MOCK === 'true';

if (isTestEnv) {
  activeClient = new (RedisMock as any)();
} else {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  try {
    const realClient = new IORedis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy(times: number) {
        if (times > 2) {
          console.warn('[Redis] Real redis connection failed. Switching to in-memory instance.');
          activeClient = new (RedisMock as any)();
          return null;
        }
        return 100;
      },
      lazyConnect: false,
      connectTimeout: 1000
    });

    realClient.on('error', (err: Error) => {
      if (activeClient !== realClient) return;
      console.warn(`[Redis Notice] Real Redis at ${redisUrl} not available (${err.message}). Using mock client.`);
      activeClient = new (RedisMock as any)();
    });

    activeClient = realClient;
  } catch {
    activeClient = new (RedisMock as any)();
  }
}

// Proxy wrapper ensuring commands always route to current active client
export const redis: any = new Proxy({}, {
  get(_target, prop: string) {
    if (activeClient && prop in activeClient) {
      const val = activeClient[prop];
      if (typeof val === 'function') {
        return val.bind(activeClient);
      }
      return val;
    }
    return undefined;
  }
});

export async function initRedis(): Promise<any> {
  return activeClient;
}

export function getRedisClient(): any {
  return activeClient;
}
