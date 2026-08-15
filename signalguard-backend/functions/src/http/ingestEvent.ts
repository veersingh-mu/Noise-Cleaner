import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { PubSub } from '@google-cloud/pubsub';
import { z } from 'zod';
import { randomUUID } from 'crypto';

// Initialize admin SDK if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const pubsub = new PubSub();
const RAW_EVENTS_TOPIC = process.env.PUBSUB_RAW_EVENTS_TOPIC || 'raw-events';

export const RawEventSchema = z.object({
  service: z.string().min(1, 'Service name is required'),
  instanceId: z.string().default(() => `inst-${Math.random().toString(36).slice(2, 8)}`),
  errorType: z.string().min(1, 'Error type is required'),
  message: z.string().min(1, 'Error message is required'),
  stackTrace: z.string().nullable().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  timestamp: z
    .string()
    .datetime({ offset: true })
    .optional()
    .default(() => new Date().toISOString()),
  metadata: z.record(z.any()).optional().default({}),
});

export type RawEventPayload = z.infer<typeof RawEventSchema>;

/**
 * Validates API key against Firestore /apiKeys collection if key is provided or enforced.
 */
async function validateApiKey(apiKey: string | undefined): Promise<boolean> {
  if (!apiKey) return true; // Optional by default for development/simulation, but validated if provided
  try {
    const doc = await admin.firestore().collection('apiKeys').doc(apiKey).get();
    if (!doc.exists) return false;
    const data = doc.data();
    return data?.active !== false;
  } catch (err) {
    console.error('[ingestEvent] API Key check error:', err);
    return false;
  }
}

/**
 * HTTP Ingest Endpoint (POST /ingest)
 * Ingests raw error events, validates schema, and immediately buffers to Cloud Pub/Sub topic "raw-events".
 */
export const ingestEvent = onRequest(
  {
    cors: true,
    region: 'us-central1',
  },
  async (req, res) => {
    // Only accept POST
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
      return;
    }

    // Optional API key header check
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
    if (apiKeyHeader) {
      const isValid = await validateApiKey(apiKeyHeader);
      if (!isValid) {
        res.status(401).json({ error: 'Unauthorized: Invalid or inactive API key' });
        return;
      }
    }

    // Validate payload schema with Zod
    const parseResult = RawEventSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid event payload',
        details: parseResult.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }

    const eventData = parseResult.data;
    const eventId = randomUUID();

    const enrichedEvent = {
      ...eventData,
      eventId,
      ingestedAt: new Date().toISOString(),
    };

    try {
      // Publish event asynchronously to Pub/Sub "raw-events" topic
      const messageBuffer = Buffer.from(JSON.stringify(enrichedEvent));
      const topic = pubsub.topic(RAW_EVENTS_TOPIC);
      
      // Auto-create topic in local emulator if it doesn't exist
      if (process.env.FUNCTIONS_EMULATOR === 'true') {
        try {
          const [exists] = await topic.exists();
          if (!exists) {
            await topic.create();
          }
        } catch {
          // Ignore topic creation race conditions
        }
      }

      await topic.publishMessage({ data: messageBuffer });

      // Return 202 Accepted immediately - no synchronous processing
      res.status(202).json({
        status: 'accepted',
        eventId,
        service: eventData.service,
        errorType: eventData.errorType,
        severity: eventData.severity,
      });
    } catch (err: any) {
      console.error('[ingestEvent] Failed to publish event to Pub/Sub:', err);
      res.status(500).json({
        error: 'Failed to buffer event to ingestion queue',
        message: err.message,
      });
    }
  }
);
