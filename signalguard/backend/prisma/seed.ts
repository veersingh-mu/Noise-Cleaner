import { prisma } from '../src/lib/prisma.js';
import { computeFingerprint } from '../src/lib/fingerprint.js';

async function main() {
  console.log('[Seed] Seeding SignalGuard demo data...');

  const now = Date.now();

  const seedIncidents = [
    {
      service: 'checkout-service',
      errorType: 'PaymentGatewayTimeout',
      severity: 'critical',
      status: 'firing',
      normalizedMessage: 'HTTP 504 Gateway Timeout while charging customer <UUID>',
      sampleStackTrace: `Error: HTTP 504 Gateway Timeout
    at GatewayClient.charge (/app/src/client.ts:89:12)
    at CheckoutController.pay (/app/src/controller.ts:45:9)
    at Router.handle (/app/node_modules/fastify/lib/router.js:120:4)`,
      occurrenceCount: 512,
      affectedInstances: ['i-01a4b89', 'i-09f42c1', 'i-05c31d8', 'i-08d22f4'],
      firstSeen: new Date(now - 1000 * 60 * 18),
      lastSeen: new Date(now - 1000 * 12),
      alertChannelRef: 'slack_thread_1718698029.0010'
    },
    {
      service: 'payments-service',
      errorType: 'DatabaseConnectionLost',
      severity: 'high',
      status: 'cooling_down',
      normalizedMessage: 'Connection pool exhausted while querying transactions table on host <IP>',
      sampleStackTrace: `Error: ConnectionPoolExhausted
    at Pool.acquire (/app/src/db/pg.ts:210:14)
    at TransactionRepo.find (/app/src/repo.ts:104:12)
    at PaymentService.execute (/app/src/tx.ts:35:10)`,
      occurrenceCount: 1840,
      affectedInstances: ['i-07e11a2', 'i-03d99b1', 'i-02c88f9'],
      firstSeen: new Date(now - 1000 * 60 * 75),
      lastSeen: new Date(now - 1000 * 60 * 3),
      alertChannelRef: 'slack_thread_1718698000.0050'
    },
    {
      service: 'auth-service',
      errorType: 'JWTSignatureValidationFailed',
      severity: 'medium',
      status: 'cooling_down',
      normalizedMessage: 'Invalid signature for token with kid <UUID>',
      sampleStackTrace: `Error: InvalidSignature
    at JWT.verify (/app/src/jwt.ts:32:15)
    at AuthMiddleware.check (/app/src/middleware.ts:18:9)`,
      occurrenceCount: 144,
      affectedInstances: ['i-09f42c1'],
      firstSeen: new Date(now - 1000 * 60 * 140),
      lastSeen: new Date(now - 1000 * 60 * 12),
      alertChannelRef: 'discord_msg_1718698000'
    },
    {
      service: 'notification-worker',
      errorType: 'SendGridApiQuotaExhausted',
      severity: 'low',
      status: 'resolved',
      normalizedMessage: 'HTTP 429 Too Many Requests from SendGrid API for recipient <EMAIL>',
      sampleStackTrace: `Error: HTTP 429
    at Mailer.dispatch (/app/src/mailer.ts:102:18)
    at QueueConsumer.processJob (/app/src/consumer.ts:55:12)`,
      occurrenceCount: 68,
      affectedInstances: ['i-04a11f2'],
      firstSeen: new Date(now - 1000 * 60 * 320),
      lastSeen: new Date(now - 1000 * 60 * 180),
      alertChannelRef: 'discord_msg_1718697000'
    }
  ];

  for (const item of seedIncidents) {
    const fingerprint = computeFingerprint({
      service: item.service,
      errorType: item.errorType,
      message: item.normalizedMessage,
      stackTrace: item.sampleStackTrace
    });

    try {
      const inc = await prisma.incident.create({
        data: {
          fingerprint,
          service: item.service,
          errorType: item.errorType,
          severity: item.severity,
          status: item.status,
          normalizedMessage: item.normalizedMessage,
          sampleStackTrace: item.sampleStackTrace,
          occurrenceCount: item.occurrenceCount,
          affectedInstances: item.affectedInstances,
          firstSeen: item.firstSeen,
          lastSeen: item.lastSeen,
          alertChannelRef: item.alertChannelRef
        }
      });

      // Add sample occurrences
      for (let i = 0; i < 5; i++) {
        await prisma.occurrence.create({
          data: {
            incidentId: inc.id,
            instanceId: item.affectedInstances[i % item.affectedInstances.length],
            rawMessage: item.normalizedMessage.replace('<UUID>', crypto.randomUUID()),
            timestamp: new Date(inc.firstSeen.getTime() + i * 60000),
            suppressed: i > 0
          }
        });
      }
    } catch (err: any) {
      console.log(`[Seed Note] ${item.service} record:`, err.message);
    }
  }

  // Seed metrics snapshots
  for (let i = 20; i >= 0; i--) {
    const raw = 1500 + (20 - i) * 60 + Math.floor(Math.random() * 30);
    const sent = 12 + Math.floor((20 - i) * 0.4);
    const nrr = parseFloat((1 - (sent / raw)).toFixed(4));

    await prisma.metricsSnapshot.create({
      data: {
        rawEventsReceived: raw,
        notificationsSent: sent,
        noiseReductionRatio: nrr,
        timestamp: new Date(now - i * 60000)
      }
    });
  }

  console.log('[Seed] Finished seeding database successfully.');
}

main().catch(err => console.error('[Seed Error]', err));
