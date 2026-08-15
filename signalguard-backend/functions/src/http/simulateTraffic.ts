import { onRequest } from 'firebase-functions/v2/https';
import { PubSub } from '@google-cloud/pubsub';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const pubsub = new PubSub();
const RAW_EVENTS_TOPIC = process.env.PUBSUB_RAW_EVENTS_TOPIC || 'raw-events';

const SimulateSchema = z.object({
  pattern: z.enum(['steady', 'burst', 'mixed']).default('burst'),
  durationSeconds: z.number().int().min(1).max(120).default(10),
  eventsPerSecond: z.number().int().min(1).max(500).default(50),
});

interface DemoErrorTemplate {
  service: string;
  errorType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  messageTemplate: (ctx: { id: string; userId: string; orderId: number; ip: string }) => string;
  stackTrace: string;
}

const DEMO_TEMPLATES: DemoErrorTemplate[] = [
  {
    service: 'checkout-service',
    errorType: 'PaymentGatewayTimeout',
    severity: 'critical',
    messageTemplate: (c) => `HTTP 504 Gateway Timeout while processing order #${c.orderId} for user ${c.userId}`,
    stackTrace: `Error: Gateway Timeout\n    at PaymentClient.executePayment (/var/task/src/services/payment.ts:142:15)\n    at CheckoutController.handleCheckout (/var/task/src/controllers/checkout.ts:88:24)\n    at Layer.handle [as handle_request] (/var/task/node_modules/express/lib/router/layer.js:95:5)`,
  },
  {
    service: 'payments-service',
    errorType: 'StripeConnectionReset',
    severity: 'high',
    messageTemplate: (c) => `ECONNRESET 0x7fff5fbff820 connecting to api.stripe.com from instance ${c.id} (user: ${c.userId})`,
    stackTrace: `Error: read ECONNRESET\n    at TLSWrap.onStreamRead (node:internal/js_stream_socket:217:20)\n    at StripeClient.createCharge (/var/task/src/stripe/client.ts:54:12)`,
  },
  {
    service: 'auth-service',
    errorType: 'JWTSignatureVerificationFailed',
    severity: 'medium',
    messageTemplate: (c) => `Invalid token signature from IP ${c.ip} for account user-${c.orderId}@example.com`,
    stackTrace: `JsonWebTokenError: invalid signature\n    at /var/task/node_modules/jsonwebtoken/verify.js:133:19\n    at AuthMiddleware.verifyToken (/var/task/src/auth/jwt.ts:32:10)`,
  },
  {
    service: 'notification-worker',
    errorType: 'SendGridRateLimitExceeded',
    severity: 'low',
    messageTemplate: (c) => `429 Too Many Requests: Email delivery rate limit exceeded for campaign ${c.orderId}`,
    stackTrace: `Error: Rate limit exceeded\n    at SendGridTransport.send (/var/task/src/notifications/sendgrid.ts:76:18)\n    at Worker.processJob (/var/task/src/queue/worker.ts:102:9)`,
  },
];

/**
 * Generates synthetic error traffic for demo and stress testing.
 */
export const simulateTraffic = onRequest(
  {
    cors: true,
    region: 'us-central1',
    timeoutSeconds: 300,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
      return;
    }

    const parseResult = SimulateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid parameters', details: parseResult.error.issues });
      return;
    }

    const { pattern, durationSeconds, eventsPerSecond } = parseResult.data;
    const totalEvents = durationSeconds * eventsPerSecond;
    const topic = pubsub.topic(RAW_EVENTS_TOPIC);

    // Auto-create topic if testing in local emulator
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      try {
        const [exists] = await topic.exists();
        if (!exists) await topic.create();
      } catch {
        // Ignore
      }
    }

    let publishedCount = 0;
    const batchSize = Math.min(eventsPerSecond, 100);

    const publishBatch = async (batchCount: number) => {
      const promises: Promise<string>[] = [];

      for (let i = 0; i < batchCount; i++) {
        // Select template based on pattern
        let template: DemoErrorTemplate;
        if (pattern === 'burst') {
          // 85% of traffic is the critical checkout storm
          template = Math.random() < 0.85 ? DEMO_TEMPLATES[0] : DEMO_TEMPLATES[Math.floor(Math.random() * DEMO_TEMPLATES.length)];
        } else if (pattern === 'steady') {
          template = DEMO_TEMPLATES[i % DEMO_TEMPLATES.length];
        } else {
          // mixed
          template = DEMO_TEMPLATES[Math.floor(Math.random() * DEMO_TEMPLATES.length)];
        }

        const ctx = {
          id: `inst-${Math.floor(Math.random() * 8) + 1}`,
          userId: randomUUID(),
          orderId: 10000 + Math.floor(Math.random() * 90000),
          ip: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
        };

        const eventPayload = {
          eventId: randomUUID(),
          service: template.service,
          instanceId: ctx.id,
          errorType: template.errorType,
          severity: template.severity,
          message: template.messageTemplate(ctx),
          stackTrace: template.stackTrace,
          timestamp: new Date().toISOString(),
          metadata: { simulated: true, pattern },
        };

        const buffer = Buffer.from(JSON.stringify(eventPayload));
        promises.push(topic.publishMessage({ data: buffer }));
      }

      await Promise.all(promises);
      publishedCount += batchCount;
    };

    // Execute simulation over time or rapidly in batches
    if (durationSeconds <= 5) {
      // Rapid execution
      while (publishedCount < totalEvents) {
        const remaining = totalEvents - publishedCount;
        const currentBatch = Math.min(remaining, batchSize);
        await publishBatch(currentBatch);
      }
    } else {
      // Stream over duration (spaced by 1 second intervals)
      for (let second = 0; second < durationSeconds; second++) {
        await publishBatch(eventsPerSecond);
        if (second < durationSeconds - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    res.status(200).json({
      status: 'success',
      pattern,
      durationSeconds,
      eventsPerSecond,
      totalEventsPublished: publishedCount,
      topic: RAW_EVENTS_TOPIC,
    });
  }
);
