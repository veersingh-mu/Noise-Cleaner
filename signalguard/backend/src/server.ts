import fastify from 'fastify';
import cors from '@fastify/cors';
import { initPrisma } from './lib/prisma.js';
import { initRedis } from './lib/redis.js';
import { initWebSocketServer } from './websocket/server.js';
import { startIncidentWorker } from './workers/incidentWorker.js';
import { startThreadBatchFlusher } from './workers/threadBatchFlusher.js';
import { startMetricsSnapshotting } from './lib/metricsTracker.js';
import { ingestRoutes } from './routes/ingest.js';
import { incidentsRoutes } from './routes/incidents.js';
import { metricsRoutes } from './routes/metrics.js';
import { configRoutes } from './routes/config.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = fastify({
  logger: {
    level: process.env.NODE_ENV === 'test' ? 'silent' : 'info'
  }
});

async function bootstrap() {
  // 1. Enable Cross-Origin Resource Sharing
  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  });

  // 2. Health check route
  app.get('/api/health', async () => {
    return {
      status: 'healthy',
      service: 'signalguard-backend',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  });

  // 3. Register route modules
  await app.register(ingestRoutes);
  await app.register(incidentsRoutes);
  await app.register(metricsRoutes);
  await app.register(configRoutes);

  // 4. Initialize storage & services
  await initPrisma();
  await initRedis();

  // 5. Start background workers
  startIncidentWorker().catch(err => console.error('[Incident Worker Error]', err));
  startThreadBatchFlusher();
  startMetricsSnapshotting();

  // 6. Bind Socket.io WebSocket server to Fastify's underlying HTTP server
  app.addHook('onReady', () => {
    initWebSocketServer(app.server);
    console.log('[WebSocket] Socket.io server initialized and attached.');
  });

  // 7. Start listening
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`\n🛡️ SignalGuard Backend running at http://${HOST}:${PORT}`);
    console.log(`📡 WebSocket ready on port ${PORT}`);
    console.log(`📊 Health check at http://${HOST}:${PORT}/api/health\n`);
  } catch (err: any) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();
