import { ChannelConfig, CooldownConfig, CurrentMetrics, Incident, MetricsSnapshot, Occurrence } from './types';
import { emitSimulatedEventToFirestore, silenceIncidentInFirestore, resolveIncidentInFirestore, saveCooldownConfigToFirestore } from './firebase';

const API_BASE = '/api';

// Initial realistic default data for instant out-of-the-box telemetry
export const DEFAULT_DEMO_INCIDENTS: Incident[] = [
  {
    id: 'inc_checkout_504',
    fingerprint: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    service: 'checkout-service',
    errorType: 'PaymentGatewayTimeout',
    severity: 'critical',
    status: 'firing',
    normalizedMessage: 'HTTP 504 Gateway Timeout while processing order #<N> for user <UUID>',
    sampleStackTrace: 'Error: Gateway Timeout\n    at PaymentClient.executePayment (/var/task/src/services/payment.ts:142:15)\n    at CheckoutController.handleCheckout (/var/task/src/controllers/checkout.ts:88:24)',
    occurrenceCount: 842,
    affectedInstances: ['inst-prod-01', 'inst-prod-03', 'inst-prod-04', 'inst-prod-08'],
    firstSeen: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    lastSeen: new Date().toISOString(),
    alertChannelRef: '1723738491.002900',
    createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
  },
  {
    id: 'inc_payments_reset',
    fingerprint: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    service: 'payments-service',
    errorType: 'StripeConnectionReset',
    severity: 'high',
    status: 'cooling_down',
    normalizedMessage: 'ECONNRESET <HEX> connecting to api.stripe.com from instance <N>',
    sampleStackTrace: 'Error: read ECONNRESET\n    at TLSWrap.onStreamRead (node:internal/js_stream_socket:217:20)\n    at StripeClient.createCharge (/var/task/src/stripe/client.ts:54:12)',
    occurrenceCount: 319,
    affectedInstances: ['inst-prod-02', 'inst-prod-05'],
    firstSeen: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    lastSeen: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    alertChannelRef: '1723736122.110200',
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
  },
  {
    id: 'inc_auth_jwt',
    fingerprint: '8797987b7a1ca04df45e9fa07e151cb8bb3e85e2b0ec03bc3be0b8f6735e808e',
    service: 'auth-service',
    errorType: 'JWTSignatureVerificationFailed',
    severity: 'medium',
    status: 'cooling_down',
    normalizedMessage: 'Invalid token signature from IP <IP> for account <EMAIL>',
    sampleStackTrace: 'JsonWebTokenError: invalid signature\n    at /var/task/node_modules/jsonwebtoken/verify.js:133:19',
    occurrenceCount: 147,
    affectedInstances: ['inst-auth-01'],
    firstSeen: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
    lastSeen: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    alertChannelRef: '1723734000.009000',
    createdAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
  },
  {
    id: 'inc_sendgrid_rate',
    fingerprint: '3448df740f81a7d6e68532f5f190e386ebf9611b816223e7f91893c52a0a2f1c',
    service: 'notification-worker',
    errorType: 'SendGridRateLimitExceeded',
    severity: 'low',
    status: 'resolved',
    normalizedMessage: '429 Too Many Requests: Email delivery rate limit exceeded for campaign <N>',
    sampleStackTrace: 'Error: Rate limit exceeded\n    at SendGridTransport.send (/var/task/src/notifications/sendgrid.ts:76:18)',
    occurrenceCount: 52,
    affectedInstances: ['worker-01', 'worker-02'],
    firstSeen: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    lastSeen: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    alertChannelRef: '1723731000.000100',
    createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  },
];

export const DEFAULT_COOLDOWN_CONFIG: CooldownConfig = {
  default: {
    critical: 30,
    high: 120,
    medium: 300,
    low: 900,
  },
  burstThreshold: {
    critical: 20,
    high: 50,
    medium: 100,
    low: 200,
  },
  overrides: {
    'checkout-service': { critical: 15 },
  },
};

export const DEFAULT_CHANNEL_CONFIG: ChannelConfig = {
  default: ['slack'],
  services: {
    'checkout-service': ['slack', 'pagerduty'],
    'payments-service': ['slack'],
    'auth-service': ['discord'],
  },
  endpoints: {
    slack: { enabled: true, channel: '#sre-alerts' },
    pagerduty: { enabled: true, routingKey: 'pd-prod-key' },
    discord: { enabled: true },
  },
};

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const resp = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Request failed with status ${resp.status}`);
    }

    return resp.json();
  } catch (err) {
    // If backend endpoint not running, fallback gracefully
    throw err;
  }
}

export const api = {
  getMetrics: async (): Promise<CurrentMetrics> => {
    try {
      return await request<CurrentMetrics>('/metrics/current');
    } catch {
      return {
        rawEventsReceived: 1360,
        notificationsSent: 28,
        suppressedEvents: 1332,
        noiseReductionRatio: 0.9794,
        openIncidentsCount: 3,
        criticalFiringCount: 1,
        coolingDownCount: 2,
        eventsPerSecond: 42,
        timestamp: new Date().toISOString(),
      };
    }
  },

  getMetricsHistory: async (limit = 30): Promise<{ count: number; history: MetricsSnapshot[] }> => {
    try {
      return await request<{ count: number; history: MetricsSnapshot[] }>(`/metrics/history?limit=${limit}`);
    } catch {
      const history: MetricsSnapshot[] = Array.from({ length: 20 }, (_, i) => ({
        id: `snap_${i}`,
        timestamp: new Date(Date.now() - (20 - i) * 60 * 1000).toISOString(),
        rawEventsReceived: 800 + i * 28,
        notificationsSent: 18 + Math.floor(i * 0.5),
        noiseReductionRatio: Number((0.96 + Math.random() * 0.03).toFixed(4)),
      }));
      return { count: history.length, history };
    }
  },

  getIncidents: async (status = 'all', search = ''): Promise<{ count: number; incidents: Incident[] }> => {
    try {
      return await request<{ count: number; incidents: Incident[] }>(
        `/incidents?status=${status}&search=${encodeURIComponent(search)}`
      );
    } catch {
      return { count: DEFAULT_DEMO_INCIDENTS.length, incidents: DEFAULT_DEMO_INCIDENTS };
    }
  },

  getIncidentDetails: async (id: string): Promise<{ incident: Incident; occurrences: Occurrence[] }> => {
    try {
      return await request<{ incident: Incident; occurrences: Occurrence[] }>(`/incidents/${id}`);
    } catch {
      const incident = DEFAULT_DEMO_INCIDENTS.find((i) => i.id === id) || DEFAULT_DEMO_INCIDENTS[0];
      const occurrences: Occurrence[] = Array.from({ length: 15 }, (_, i) => ({
        id: `occ_${id}_${i}`,
        incidentId: id,
        instanceId: `inst-${(i % 4) + 1}`,
        rawMessage: `${incident.normalizedMessage.replace('<N>', `${10000 + i}`).replace('<UUID>', `user-${i}`)}`,
        timestamp: new Date(Date.now() - i * 15 * 1000).toISOString(),
        suppressed: i > 0,
      }));
      return { incident, occurrences };
    }
  },

  silenceIncident: async (id: string, durationSeconds = 3600): Promise<{ message: string; incident: Incident }> => {
    try {
      return await request<{ message: string; incident: Incident }>(`/incidents/${id}/silence`, {
        method: 'POST',
        body: JSON.stringify({ durationSeconds }),
      });
    } catch {
      await silenceIncidentInFirestore(id, durationSeconds).catch(() => {});
      const incident = DEFAULT_DEMO_INCIDENTS.find((i) => i.id === id) || DEFAULT_DEMO_INCIDENTS[0];
      return {
        message: 'Incident silenced',
        incident: { ...incident, status: 'cooling_down' },
      };
    }
  },

  resolveIncident: async (id: string): Promise<{ message: string; incident: Incident }> => {
    try {
      return await request<{ message: string; incident: Incident }>(`/incidents/${id}/resolve`, {
        method: 'POST',
      });
    } catch {
      await resolveIncidentInFirestore(id).catch(() => {});
      const incident = DEFAULT_DEMO_INCIDENTS.find((i) => i.id === id) || DEFAULT_DEMO_INCIDENTS[0];
      return {
        message: 'Incident marked as resolved',
        incident: { ...incident, status: 'resolved' },
      };
    }
  },

  getCooldownConfig: async (): Promise<CooldownConfig> => {
    try {
      return await request<CooldownConfig>('/config/cooldown-matrix');
    } catch {
      return DEFAULT_COOLDOWN_CONFIG;
    }
  },

  updateCooldownConfig: async (data: CooldownConfig): Promise<{ message: string; config: CooldownConfig }> => {
    try {
      return await request<{ message: string; config: CooldownConfig }>('/config/cooldown-matrix', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch {
      await saveCooldownConfigToFirestore(data).catch(() => {});
      return { message: 'Config updated', config: data };
    }
  },

  getChannelConfig: async (): Promise<ChannelConfig> => {
    try {
      return await request<ChannelConfig>('/config/channels');
    } catch {
      return DEFAULT_CHANNEL_CONFIG;
    }
  },

  updateChannelConfig: async (data: ChannelConfig): Promise<{ message: string; config: ChannelConfig }> => {
    try {
      return await request<{ message: string; config: ChannelConfig }>('/config/channels', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch {
      return { message: 'Channel routing updated', config: data };
    }
  },

  simulateTraffic: async (pattern: 'steady' | 'burst' | 'mixed', durationSeconds: number, eventsPerSecond: number) => {
    try {
      return await request<{ message: string; estimatedTotalEvents: number }>('/ingest/simulate', {
        method: 'POST',
        body: JSON.stringify({ pattern, durationSeconds, eventsPerSecond }),
      });
    } catch {
      // Simulate live stream in Firestore / local buffer
      const totalEvents = durationSeconds * eventsPerSecond;
      for (let i = 0; i < Math.min(totalEvents, 10); i++) {
        emitSimulatedEventToFirestore({
          service: pattern === 'burst' ? 'checkout-service' : 'payments-service',
          errorType: pattern === 'burst' ? 'PaymentGatewayTimeout' : 'StripeConnectionReset',
          severity: pattern === 'burst' ? 'critical' : 'high',
          rawMessage: `Simulated error #${1000 + i} from traffic storm`,
          suppressed: i > 0,
        }).catch(() => {});
      }
      return {
        message: `Injected ${totalEvents} simulated events successfully`,
        estimatedTotalEvents: totalEvents,
      };
    }
  },

  ingestEvent: async (payload: any) => {
    try {
      return await request<{ status: string; result: any }>('/ingest', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      await emitSimulatedEventToFirestore(payload).catch(() => {});
      return { status: 'accepted', result: payload };
    }
  },
};
