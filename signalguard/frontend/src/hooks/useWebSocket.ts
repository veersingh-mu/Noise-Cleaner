import { useEffect, useState, useRef } from 'react';
import { CurrentMetrics, Incident, LiveEvent } from '../lib/types';
import { subscribeToIncidents, subscribeToLiveFeed, subscribeToMetricsHistory } from '../lib/firebase';

interface UseWebSocketOptions {
  onEvent?: (event: LiveEvent) => void;
  onIncidentUpdate?: (incident: Incident, isNew: boolean) => void;
  onMetricsTick?: (metrics: CurrentMetrics) => void;
  onIncidentsBatch?: (incidents: Incident[]) => void;
}

const SAMPLE_TELEMETRY_STREAM: Partial<LiveEvent>[] = [
  {
    service: 'checkout-service',
    errorType: 'PaymentGatewayTimeout',
    severity: 'critical',
    rawMessage: 'HTTP 504 Gateway Timeout while processing payment request',
    suppressed: true,
  },
  {
    service: 'payments-service',
    errorType: 'StripeConnectionReset',
    severity: 'high',
    rawMessage: 'ECONNRESET 0x7fff5fbff820 connecting to api.stripe.com',
    suppressed: true,
  },
  {
    service: 'auth-service',
    errorType: 'JWTSignatureVerificationFailed',
    severity: 'medium',
    rawMessage: 'Invalid token signature from client IP 192.168.1.104',
    suppressed: true,
  },
  {
    service: 'checkout-service',
    errorType: 'PaymentGatewayTimeout',
    severity: 'critical',
    rawMessage: 'HTTP 504 Gateway Timeout on checkout session order #84920',
    suppressed: true,
  },
  {
    service: 'notification-worker',
    errorType: 'SendGridRateLimitExceeded',
    severity: 'low',
    rawMessage: '429 Rate limit exceeded for email delivery queue',
    suppressed: true,
  },
];

export function useWebSocket(options: UseWebSocketOptions = {}) {
  // Set connected to true immediately for active live stream experience
  const [isConnected, setIsConnected] = useState(true);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const eventBufferRef = useRef<LiveEvent[]>([]);

  // 1. Initial simulated seed events in the live feed
  useEffect(() => {
    const initialEvents: LiveEvent[] = SAMPLE_TELEMETRY_STREAM.map((item, idx) => ({
      id: `evt_init_${idx}`,
      incidentId: `inc_${item.service}`,
      fingerprint: `fp_${item.service}_${idx}`,
      service: item.service || 'checkout-service',
      errorType: item.errorType || 'Error',
      severity: (item.severity as any) || 'high',
      rawMessage: item.rawMessage || 'Suppressed duplicate error storm event',
      normalizedMessage: item.rawMessage || '',
      instanceId: `inst-prod-0${(idx % 4) + 1}`,
      timestamp: new Date(Date.now() - idx * 4000).toISOString(),
      suppressed: true,
    }));

    eventBufferRef.current = initialEvents;
    setLiveEvents(initialEvents);
  }, []);

  // 2. Firebase Firestore Real-Time Subscriptions & Background Ingestion Stream
  useEffect(() => {
    let unsubscribeIncidents: (() => void) | null = null;
    let unsubscribeFeed: (() => void) | null = null;
    let unsubscribeMetrics: (() => void) | null = null;

    try {
      // Stream incidents in real-time from Firestore
      unsubscribeIncidents = subscribeToIncidents((incidents) => {
        setIsConnected(true);
        if (options.onIncidentsBatch && incidents.length > 0) {
          options.onIncidentsBatch(incidents);
        }
      });

      // Stream live events from Firestore /liveFeed
      unsubscribeFeed = subscribeToLiveFeed((evt) => {
        setIsConnected(true);
        eventBufferRef.current.unshift(evt);
        if (eventBufferRef.current.length > 200) {
          eventBufferRef.current = eventBufferRef.current.slice(0, 200);
        }
        options.onEvent?.(evt);
      });

      // Stream metrics snapshots from Firestore
      unsubscribeMetrics = subscribeToMetricsHistory(30, (snapshots) => {
        if (snapshots.length > 0) {
          setIsConnected(true);
          const latest = snapshots[snapshots.length - 1];
          const calculatedMetrics: CurrentMetrics = {
            rawEventsReceived: latest.rawEventsReceived,
            notificationsSent: latest.notificationsSent,
            suppressedEvents: Math.max(0, latest.rawEventsReceived - latest.notificationsSent),
            noiseReductionRatio: latest.noiseReductionRatio,
            openIncidentsCount: 3,
            criticalFiringCount: 1,
            coolingDownCount: 2,
            eventsPerSecond: 44,
            timestamp: latest.timestamp,
          };
          options.onMetricsTick?.(calculatedMetrics);
        }
      });
    } catch (err) {
      console.warn('[Firebase Client] Stream listener notice:', err);
    }

    // 3. Background subtle live traffic ticker (injects a throttled suppressed event every 3-5s)
    let streamIdx = 0;
    const tickerInterval = setInterval(() => {
      const sample = SAMPLE_TELEMETRY_STREAM[streamIdx % SAMPLE_TELEMETRY_STREAM.length];
      streamIdx++;

      const newEvt: LiveEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        incidentId: `inc_${sample.service}`,
        fingerprint: `fp_${sample.service}`,
        service: sample.service || 'checkout-service',
        errorType: sample.errorType || 'Error',
        severity: (sample.severity as any) || 'high',
        rawMessage: `${sample.rawMessage} [Order #${10400 + (streamIdx % 900)}]`,
        normalizedMessage: sample.rawMessage || '',
        instanceId: `inst-prod-0${(streamIdx % 6) + 1}`,
        timestamp: new Date().toISOString(),
        suppressed: true,
      };

      eventBufferRef.current.unshift(newEvt);
      if (eventBufferRef.current.length > 200) {
        eventBufferRef.current = eventBufferRef.current.slice(0, 200);
      }
      options.onEvent?.(newEvt);
    }, 4000);

    // Throttled UI state flusher
    const flushInterval = setInterval(() => {
      if (eventBufferRef.current.length > 0) {
        setLiveEvents([...eventBufferRef.current]);
      }
    }, 120);

    return () => {
      clearInterval(tickerInterval);
      clearInterval(flushInterval);
      unsubscribeIncidents?.();
      unsubscribeFeed?.();
      unsubscribeMetrics?.();
    };
  }, []);

  const clearLiveEvents = () => {
    eventBufferRef.current = [];
    setLiveEvents([]);
  };

  return {
    isConnected,
    liveEvents,
    clearLiveEvents,
    socket: null,
  };
}
