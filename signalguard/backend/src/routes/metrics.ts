import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getCurrentMetrics, getMetricsHistory } from '../lib/metricsTracker.js';

export const metricsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/metrics/current - Get live NRR and current system counters
  fastify.get('/api/metrics/current', async (_request, reply) => {
    const current = await getCurrentMetrics();
    return reply.send(current);
  });

  // GET /api/metrics/history - Get historical snapshots for charts
  fastify.get('/api/metrics/history', async (request, reply) => {
    const query = request.query as any;
    const limit = parseInt(query.limit || '30', 10);
    const history = await getMetricsHistory(limit);
    return reply.send({
      count: history.length,
      history
    });
  });
};
