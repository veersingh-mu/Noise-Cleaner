import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const SeverityDurationSchema = z.object({
  critical: z.number().int().min(5).max(3600),
  high: z.number().int().min(10).max(7200),
  medium: z.number().int().min(30).max(14400),
  low: z.number().int().min(60).max(86400),
});

const CooldownMatrixInputSchema = z.object({
  default: SeverityDurationSchema,
  burstThreshold: SeverityDurationSchema,
  overrides: z.record(z.record(z.number().int().min(5).max(86400))).optional().default({}),
});

/**
 * Callable Function: Updates the cooldown matrix configuration.
 * Requires Firebase Authentication.
 */
export const updateCooldownMatrix = onCall(
  {
    cors: true,
    region: 'us-central1',
  },
  async (request) => {
    // 1. Enforce Authentication
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Authentication required: User must be signed in to modify the cooldown matrix.'
      );
    }

    // 2. Validate input schema
    const parseResult = CooldownMatrixInputSchema.safeParse(request.data);
    if (!parseResult.success) {
      throw new HttpsError(
        'invalid-argument',
        'Invalid cooldown matrix structure',
        parseResult.error.issues
      );
    }

    const validatedConfig = parseResult.data;

    try {
      const firestore = admin.firestore();
      await firestore.collection('config').doc('cooldownMatrix').set(
        {
          ...validatedConfig,
          updatedAt: admin.firestore.Timestamp.now(),
          updatedBy: request.auth.uid,
          updatedByEmail: request.auth.token.email || null,
        },
        { merge: true }
      );

      return {
        status: 'success',
        message: 'Cooldown matrix successfully updated',
        config: validatedConfig,
      };
    } catch (err: any) {
      console.error('[updateCooldownMatrix] Failed to write config:', err);
      throw new HttpsError('internal', `Failed to update configuration: ${err.message}`);
    }
  }
);
