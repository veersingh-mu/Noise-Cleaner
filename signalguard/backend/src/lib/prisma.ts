import { PrismaClient } from '@prisma/client';

let prismaInstance: any;

try {
  prismaInstance = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  });
} catch (err: any) {
  console.warn('[Prisma Notice] Prisma client initialization error, preparing fallback:', err.message);
}

// In-memory fallback repository for standalone testing or offline execution
class InMemoryDb {
  public incidents: Map<string, any> = new Map();
  public occurrences: any[] = [];
  public snapshots: any[] = [];

  constructor() {
    // Seed initial demo data
    this.seedDemoData();
  }

  private seedDemoData() {
    const demo1 = {
      id: 'inc_chk_001',
      fingerprint: '3b890f84a1d82f7c9e0114b3014a0e19a4b361aa6868d4971a2857441f0e3f644',
      service: 'checkout-service',
      errorType: 'PaymentGatewayTimeout',
      severity: 'critical',
      status: 'firing',
      normalizedMessage: 'HTTP 504 Gateway Timeout while charging customer <UUID>',
      sampleStackTrace: 'Error: HTTP 504\n    at PaymentClient.charge (/src/client.ts:45)\n    at CheckoutController.pay (/src/controller.ts:12)',
      occurrenceCount: 384,
      affectedInstances: ['i-01a4b89', 'i-09f42c1', 'i-05c31d8'],
      firstSeen: new Date(Date.now() - 1000 * 60 * 25),
      lastSeen: new Date(),
      alertChannelRef: 'slack_thread_1718698029.0010',
      createdAt: new Date(Date.now() - 1000 * 60 * 25)
    };

    const demo2 = {
      id: 'inc_pay_002',
      fingerprint: '942a1b09ef32c81d4a0198bc72ef819347a2f83a874b46089aa5cb39133178ad',
      service: 'payments-service',
      errorType: 'DatabaseConnectionLost',
      severity: 'high',
      status: 'cooling_down',
      normalizedMessage: 'Connection pool exhausted while querying transactions table on host <IP>',
      sampleStackTrace: 'Error: ConnectionPoolExhausted\n    at Pool.acquire (/src/pool.ts:89)\n    at TransactionRepo.find (/src/repo.ts:104)',
      occurrenceCount: 1420,
      affectedInstances: ['i-07e11a2', 'i-03d99b1'],
      firstSeen: new Date(Date.now() - 1000 * 60 * 90),
      lastSeen: new Date(Date.now() - 1000 * 45),
      alertChannelRef: 'slack_thread_1718698000.0050',
      createdAt: new Date(Date.now() - 1000 * 60 * 90)
    };

    const demo3 = {
      id: 'inc_auth_003',
      fingerprint: '8f72a1e0b9213456789abcdef0123456dbd3429c2e3c47fb8f025c178f9ef610',
      service: 'auth-service',
      errorType: 'JWTSignatureValidationFailed',
      severity: 'medium',
      status: 'cooling_down',
      normalizedMessage: 'Invalid signature for token with kid <UUID>',
      sampleStackTrace: 'Error: InvalidSignature\n    at JWT.verify (/src/jwt.ts:32)\n    at AuthMiddleware.check (/src/middleware.ts:18)',
      occurrenceCount: 92,
      affectedInstances: ['i-09f42c1'],
      firstSeen: new Date(Date.now() - 1000 * 60 * 180),
      lastSeen: new Date(Date.now() - 1000 * 60 * 5),
      alertChannelRef: 'discord_msg_1718698000',
      createdAt: new Date(Date.now() - 1000 * 60 * 180)
    };

    this.incidents.set(demo1.fingerprint, demo1);
    this.incidents.set(demo2.fingerprint, demo2);
    this.incidents.set(demo3.fingerprint, demo3);
  }

  public incident = {
    findUnique: async ({ where }: any) => {
      if (where.fingerprint) {
        return this.incidents.get(where.fingerprint) || null;
      }
      if (where.id) {
        for (const inc of this.incidents.values()) {
          if (inc.id === where.id) return inc;
        }
      }
      return null;
    },
    findMany: async (args?: any) => {
      let list = Array.from(this.incidents.values());
      if (args?.where?.status) {
        if (typeof args.where.status === 'string') {
          list = list.filter(i => i.status === args.where.status);
        } else if (Array.isArray(args.where.status.in)) {
          list = list.filter(i => args.where.status.in.includes(i.status));
        }
      }
      if (args?.orderBy?.lastSeen === 'desc') {
        list.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
      }
      if (args?.take) {
        list = list.slice(0, args.take);
      }
      return list;
    },
    create: async ({ data }: any) => {
      const id = data.id || `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const record = {
        ...data,
        id,
        firstSeen: data.firstSeen || new Date(),
        lastSeen: data.lastSeen || new Date(),
        createdAt: data.createdAt || new Date(),
        affectedInstances: data.affectedInstances || []
      };
      this.incidents.set(record.fingerprint, record);
      return record;
    },
    update: async ({ where, data }: any) => {
      let target: any = null;
      if (where.fingerprint) target = this.incidents.get(where.fingerprint);
      if (where.id) {
        for (const inc of this.incidents.values()) {
          if (inc.id === where.id) {
            target = inc;
            break;
          }
        }
      }
      if (!target) throw new Error('Record not found for update');

      const updated = {
        ...target,
        ...data,
        occurrenceCount: data.occurrenceCount?.increment !== undefined 
          ? target.occurrenceCount + data.occurrenceCount.increment 
          : (data.occurrenceCount ?? target.occurrenceCount),
        affectedInstances: data.affectedInstances ?? target.affectedInstances,
        lastSeen: data.lastSeen || new Date()
      };
      this.incidents.set(target.fingerprint, updated);
      return updated;
    },
    count: async (args?: any) => {
      return (await this.incident.findMany(args)).length;
    }
  };

  public occurrence = {
    create: async ({ data }: any) => {
      const record = {
        id: `occ_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        ...data,
        timestamp: data.timestamp || new Date()
      };
      this.occurrences.push(record);
      return record;
    },
    findMany: async ({ where, take, orderBy }: any) => {
      let list = this.occurrences;
      if (where?.incidentId) {
        list = list.filter(o => o.incidentId === where.incidentId);
      }
      if (orderBy?.timestamp === 'desc') {
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }
      if (take) {
        list = list.slice(0, take);
      }
      return list;
    },
    count: async (args?: any) => {
      if (args?.where?.suppressed !== undefined) {
        return this.occurrences.filter(o => o.suppressed === args.where.suppressed).length;
      }
      return this.occurrences.length;
    }
  };

  public metricsSnapshot = {
    create: async ({ data }: any) => {
      const record = {
        id: `snap_${Date.now()}`,
        ...data,
        timestamp: data.timestamp || new Date()
      };
      this.snapshots.push(record);
      return record;
    },
    findMany: async ({ take, orderBy }: any) => {
      let list = [...this.snapshots];
      if (orderBy?.timestamp === 'desc') {
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }
      if (take) {
        list = list.slice(0, take);
      }
      return list;
    }
  };

  public async $connect() {
    return true;
  }
}

const fallbackDb = new InMemoryDb();

let isConnectedToRealDb = false;

export const prisma: any = new Proxy({}, {
  get(_target, prop) {
    if (isConnectedToRealDb && prismaInstance && prop in prismaInstance) {
      return prismaInstance[prop];
    }
    if (prop in fallbackDb) {
      return (fallbackDb as any)[prop];
    }
    if (prismaInstance && prop in prismaInstance) {
      return prismaInstance[prop];
    }
    return undefined;
  }
});

export async function initPrisma(): Promise<void> {
  if (!prismaInstance) {
    console.log('[Prisma] Running with in-memory database provider.');
    return;
  }

  try {
    await prismaInstance.$connect();
    isConnectedToRealDb = true;
    console.log('[Prisma] Connected to PostgreSQL successfully.');
  } catch (err: any) {
    console.warn(`[Prisma Notice] PostgreSQL connection failed (${err.message}). Using fallback in-memory database.`);
    isConnectedToRealDb = false;
  }
}
