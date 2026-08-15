import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { redis } from '../lib/redis.js';
import { processRawEvent, RawEventPayload } from '../workers/incidentWorker.js';

const IngestEventSchema = z.object({
  service: z.string().min(1),
  errorType: z.string().min(1),
  message: z.string().min(1),
  stackTrace: z.string().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  instanceId: z.string().optional(),
  timestamp: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

const SimulatePayloadSchema = z.object({
  pattern: z.enum(['steady', 'burst', 'mixed']).default('steady'),
  durationSeconds: z.number().min(1).max(300).default(10),
  eventsPerSecond: z.number().min(1).max(1000).default(20)
});

const demoServices = [
  {
    name: 'checkout-service',
    errors: [
      {
        type: 'PaymentGatewayTimeout',
        severity: 'critical',
        msg: () => `HTTP 504 Gateway Timeout while processing payment ${Math.floor(Math.random() * 90000 + 10000)} for customer ${crypto.randomUUID()}`,
        trace: 'Error: Gateway Timeout\n    at GatewayClient.charge (/app/src/client.ts:89:12)\n    at CheckoutController.pay (/app/src/controller.ts:45:9)\n    at Router.handle (/app/node_modules/fastify/lib/router.js:120:4)'
      },
      {
        type: 'InventoryLockException',
        severity: 'high',
        msg: () => `Failed to acquire optimistic lock for SKU item-${Math.floor(Math.random() * 500)}`,
        trace: 'Error: OptimisticLockFailure\n    at InventoryService.reserve (/app/src/inventory.ts:140:15)\n    at Cart.checkout (/app/src/cart.ts:60:8)'
      }
    ]
  },
  {
    name: 'payments-service',
    errors: [
      {
        type: 'DatabaseConnectionLost',
        severity: 'critical',
        msg: () => `Lost connection to PostgreSQL master pool at 10.0.4.${Math.floor(Math.random() * 254)}:5432 after retry 3`,
        trace: 'Error: ConnectionLost\n    at PgPool.query (/app/src/db/pg.ts:210:14)\n    at TransactionService.execute (/app/src/tx.ts:35:10)'
      },
      {
        type: 'StripeWebhookSignatureInvalid',
        severity: 'medium',
        msg: () => `Invalid webhook signature header t=${Date.now()},v1=sig_${Math.random().toString(36).substring(2, 10)}`,
        trace: 'Error: SignatureMismatch\n    at WebhookHandler.verify (/app/src/webhooks.ts:18:7)'
      }
    ]
  },
  {
    name: 'auth-service',
    errors: [
      {
        type: 'RedisTokenBlacklistUnreachable',
        severity: 'high',
        msg: () => `Failed to check session blacklist on redis node cache-${Math.floor(Math.random() * 4)}.internal:6379`,
        trace: 'Error: RedisClusterDown\n    at TokenService.verifySession (/app/src/tokens.ts:74:11)\n    at AuthMiddleware.authenticate (/app/src/middleware.ts:22:5)'
      },
      {
        type: 'RateLimitExceeded',
        severity: 'low',
        msg: () => `IP 192.168.1.${Math.floor(Math.random() * 254)} exceeded max login attempts threshold 10/min`,
        trace: 'Error: RateLimitBreach\n    at RateLimiter.consume (/app/src/limiter.ts:40:9)'
      }
    ]
  },
  {
    name: 'notification-worker',
    errors: [
      {
        type: 'SendGridApiQuotaExhausted',
        severity: 'medium',
        msg: () => `HTTP 429 Too Many Requests from SendGrid API for recipient user_${Math.floor(Math.random() * 1000)}@example.com`,
        trace: 'Error: HTTP 429\n    at Mailer.dispatch (/app/src/mailer.ts:102:18)\n    at QueueConsumer.processJob (/app/src/consumer.ts:55:12)'
      }
    ]
  }
];

export const ingestRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/ingest - Ingest single raw error event
  fastify.post('/api/ingest', async (request, reply) => {
    const parseResult = IngestEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid event payload',
        details: parseResult.error.format()
      });
    }

    const event = parseResult.data;

    // Publish to Redis Stream or process immediately
    try {
      if (typeof redis.xadd === 'function') {
        await redis.xadd(
          'raw-events',
          '*',
          'service', event.service,
          'errorType', event.errorType,
          'payload', JSON.stringify(event)
        );
      }
    } catch {}

    // Process event directly to ensure real-time deduplication and immediate feedback
    const result = await processRawEvent(event);

    return reply.status(202).send({
      status: 'ingested',
      result
    });
  });

  // POST /api/ingest/simulate - Trigger synthetic traffic simulation
  fastify.post('/api/ingest/simulate', async (request, reply) => {
    const parseResult = SimulatePayloadSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid simulation parameters',
        details: parseResult.error.format()
      });
    }

    const { pattern, durationSeconds, eventsPerSecond } = parseResult.data;
    const totalEvents = durationSeconds * eventsPerSecond;
    const intervalMs = Math.max(5, Math.floor(1000 / eventsPerSecond));

    console.log(`[Simulator] Starting simulation: pattern=${pattern}, rate=${eventsPerSecond}/s, duration=${durationSeconds}s (~${totalEvents} events)`);

    // Asynchronously run simulation generator in background
    let eventsGenerated = 0;
    const startTime = Date.now();

    const burstTargetService = demoServices[0]; // checkout-service
    const burstTargetError = burstTargetService.errors[0]; // PaymentGatewayTimeout

    const timer = setInterval(async () => {
      if (eventsGenerated >= totalEvents || Date.now() - startTime >= durationSeconds * 1000 + 500) {
        clearInterval(timer);
        console.log(`[Simulator] Simulation finished: ${eventsGenerated} events generated.`);
        return;
      }

      // Determine event based on pattern
      let targetService = demoServices[Math.floor(Math.random() * demoServices.length)];
      let targetError = targetService.errors[Math.floor(Math.random() * targetService.errors.length)];

      if (pattern === 'burst') {
        // 95% of events target the identical error to simulate severe duplicate flood
        if (Math.random() < 0.95) {
          targetService = burstTargetService;
          targetError = burstTargetError;
        }
      } else if (pattern === 'mixed') {
        // Intermittent burst spikes
        const isSpikeMoment = (Date.now() % 6000) < 2000;
        if (isSpikeMoment) {
          targetService = burstTargetService;
          targetError = burstTargetError;
        }
      }

      const instanceId = `i-${Math.floor(Math.random() * 8 + 1).toString().padStart(2, '0')}${Math.random().toString(36).substring(2, 6)}`;
      const payload: RawEventPayload = {
        service: targetService.name,
        errorType: targetError.type,
        severity: targetError.severity,
        message: targetError.msg(),
        stackTrace: targetError.trace,
        instanceId,
        timestamp: new Date().toISOString()
      };

      eventsGenerated++;
      processRawEvent(payload).catch(() => {});
    }, intervalMs);

    return reply.status(200).send({
      message: `Simulation started: ${pattern} mode at ${eventsPerSecond} events/s for ${durationSeconds}s`,
      estimatedTotalEvents: totalEvents
    });
  });
};
