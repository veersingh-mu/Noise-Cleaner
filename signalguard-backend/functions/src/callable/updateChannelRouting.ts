import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const RouteRuleSchema = z.object({
  adapter: z.enum(['slack', 'pagerduty', 'discord']),
  target: z.string().min(1, 'Target channel, key, or webhook URL is required'),
});

const ChannelRoutingInputSchema = z.record(RouteRuleSchema);

/**
 * Callable Function: Updates alert channel routing configuration.
 * Requires Firebase Authentication.
 */
export const updateChannelRouting = onCall(
  {
    cors: true,
    region: 'us-central1',
  },
  async (request) => {
    // 1. Enforce Authentication
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Authentication required: User must be signed in to modify alert channel routing.'
      );
    }

    // 2. Validate input schema
    const parseResult = ChannelRoutingInputSchema.safeParse(request.data);
    if (!parseResult.success) {
      throw new HttpsError(
        'invalid-argument',
        'Invalid channel routing structure',
        parseResult.error.issues
      );
    }

    const validatedRouting = parseResult.data;

    try {
      const firestore = admin.firestore();
      await firestore.collection('config').doc('channelRouting').set(
        {
          ...validatedRouting,
          updatedAt: admin.firestore.Timestamp.now(),
          updatedBy: request.auth.uid,
          updatedByEmail: request.auth.token.email || null,
        },
        { merge: false }
      );

      return {
        status: 'success',
        message: 'Channel routing successfully updated',
        routing: validatedRouting,
      };
    } catch (err: any) {
      console.error('[updateChannelRouting] Failed to write channel routing:', err);
      throw new HttpsError('internal', `Failed to update channel routing: ${err.message}`);
    }
  }
);
