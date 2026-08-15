import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { silenceFingerprint } from '../lib/cooldownMatrix.js';
import { broadcastIncidentUpdate, broadcastMetrics } from '../websocket/server.js';

const SilenceSchema = z.object({
  durationSeconds: z.number().min(10).max(86400).default(3600)
});

export const incidentsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/incidents - List all incidents
  fastify.get('/api/incidents', async (request, reply) => {
    const query = request.query as any;
    const status = query.status;
    const search = query.search?.toLowerCase();
    const limit = parseInt(query.limit || '50', 10);

    let whereClause: any = {};
    if (status && status !== 'all') {
      whereClause.status = status;
    }

    let incidents = await prisma.incident.findMany({
      where: whereClause,
      take: limit,
      orderBy: { lastSeen: 'desc' }
    });

    if (search) {
      incidents = incidents.filter((i: any) =>
        i.service.toLowerCase().includes(search) ||
        i.errorType.toLowerCase().includes(search) ||
        i.normalizedMessage.toLowerCase().includes(search) ||
        i.fingerprint.toLowerCase().includes(search)
      );
    }

    return reply.send({
      count: incidents.length,
      incidents
    });
  });

  // GET /api/incidents/:id - Get specific incident details & occurrence timeline
  fastify.get('/api/incidents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const incident = await prisma.incident.findUnique({
      where: { id }
    });

    if (!incident) {
      return reply.status(404).send({ error: 'Incident not found' });
    }

    // Retrieve recent occurrences
    const occurrences = await prisma.occurrence.findMany({
      where: { incidentId: id },
      take: 50,
      orderBy: { timestamp: 'desc' }
    });

    return reply.send({
      incident,
      occurrences
    });
  });

  // POST /api/incidents/:id/silence - Silence an incident
  fastify.post('/api/incidents/:id/silence', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = SilenceSchema.safeParse(request.body || {});
    const duration = parseResult.success ? parseResult.data.durationSeconds : 3600;

    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) {
      return reply.status(404).send({ error: 'Incident not found' });
    }

    await silenceFingerprint(incident.fingerprint, duration);

    const updated = await prisma.incident.update({
      where: { id },
      data: { status: 'cooling_down' }
    });

    broadcastIncidentUpdate(updated);
    broadcastMetrics();

    return reply.send({
      message: `Incident ${id} silenced for ${duration}s`,
      incident: updated
    });
  });

  // POST /api/incidents/:id/resolve - Mark incident as resolved
  fastify.post('/api/incidents/:id/resolve', async (request, reply) => {
    const { id } = request.params as { id: string };

    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) {
      return reply.status(404).send({ error: 'Incident not found' });
    }

    const updated = await prisma.incident.update({
      where: { id },
      data: { status: 'resolved' }
    });

    broadcastIncidentUpdate(updated);
    broadcastMetrics();

    return reply.send({
      message: `Incident ${id} marked as resolved`,
      incident: updated
    });
  });
};
