import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getCooldownConfig, updateCooldownConfig } from '../lib/cooldownMatrix.js';
import { getChannelConfig, updateChannelConfig } from '../lib/adapters/AdapterFactory.js';

const CooldownConfigSchema = z.object({
  default: z.record(z.number().min(1)),
  burstThreshold: z.record(z.number().min(1)),
  overrides: z.record(z.record(z.number().min(1))).optional()
});

const ChannelConfigSchema = z.object({
  default: z.array(z.string()),
  services: z.record(z.array(z.string())),
  endpoints: z.object({
    slack: z.object({ enabled: z.boolean(), channel: z.string().optional(), webhookUrl: z.string().optional() }).optional(),
    pagerduty: z.object({ enabled: z.boolean(), routingKey: z.string().optional(), endpoint: z.string().optional() }).optional(),
    discord: z.object({ enabled: z.boolean(), webhookUrl: z.string().optional() }).optional()
  })
});

export const configRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/config/cooldown-matrix
  fastify.get('/api/config/cooldown-matrix', async (_request, reply) => {
    return reply.send(getCooldownConfig());
  });

  // PUT /api/config/cooldown-matrix
  fastify.put('/api/config/cooldown-matrix', async (request, reply) => {
    const parseResult = CooldownConfigSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid cooldown config',
        details: parseResult.error.format()
      });
    }

    updateCooldownConfig(parseResult.data as any);
    return reply.send({
      message: 'Cooldown matrix updated successfully',
      config: getCooldownConfig()
    });
  });

  // GET /api/config/channels
  fastify.get('/api/config/channels', async (_request, reply) => {
    return reply.send(getChannelConfig());
  });

  // PUT /api/config/channels
  fastify.put('/api/config/channels', async (request, reply) => {
    const parseResult = ChannelConfigSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid channel config',
        details: parseResult.error.format()
      });
    }

    updateChannelConfig(parseResult.data as any);
    return reply.send({
      message: 'Channel routing updated successfully',
      config: getChannelConfig()
    });
  });
};
