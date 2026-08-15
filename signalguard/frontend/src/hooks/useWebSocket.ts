import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { CurrentMetrics, Incident, LiveEvent } from '../lib/types';
import { subscribeToIncidents, subscribeToLiveFeed, subscribeToMetricsHistory } from '../lib/firebase';

interface UseWebSocketOptions {
  onEvent?: (event: LiveEvent) => void;
  onIncidentUpdate?: (incident: Incident, isNew: boolean) => void;
  onMetricsTick?: (metrics: CurrentMetrics) => void;
  onIncidentsBatch?: (incidents: Incident[]) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const eventBufferRef = useRef<LiveEvent[]>([]);

  // 1. Firebase Firestore Real-Time Subscriptions (Serverless Cloud Sync)
  useEffect(() => {
    let unsubscribeIncidents: (() => void) | null = null;
    let unsubscribeFeed: (() => void) | null = null;
    let unsubscribeMetrics: (() => void) | null = null;

    try {
      // Stream incidents in real-time directly from Firestore
      unsubscribeIncidents = subscribeToIncidents((incidents) => {
        setIsConnected(true);
        if (options.onIncidentsBatch) {
          options.onIncidentsBatch(incidents);
        } else if (incidents.length > 0) {
          // Send latest incident update
          const latest = incidents[0];
          options.onIncidentUpdate?.(latest, false);
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
          const latest = snapshots[snapshots.length - 1];
          const calculatedMetrics: CurrentMetrics = {
            rawEventsReceived: latest.rawEventsReceived,
            notificationsSent: latest.notificationsSent,
            suppressedEvents: Math.max(0, latest.rawEventsReceived - latest.notificationsSent),
            noiseReductionRatio: latest.noiseReductionRatio,
            openIncidentsCount: 0,
            criticalFiringCount: 0,
            coolingDownCount: 0,
            eventsPerSecond: 0,
            timestamp: latest.timestamp,
          };
          options.onMetricsTick?.(calculatedMetrics);
        }
      });
    } catch (err) {
      console.warn('[Firebase Client] Real-time listener fallback:', err);
    }

    // 2. Secondary WebSocket connection (for local containerized dev)
    let socket: Socket | null = null;
    try {
      socket = io('/', {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 3,
        reconnectionDelay: 2000,
        timeout: 3000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setIsConnected(true);
      });

      socket.on('event:new', (evt: LiveEvent) => {
        eventBufferRef.current.unshift(evt);
        if (eventBufferRef.current.length > 200) {
          eventBufferRef.current = eventBufferRef.current.slice(0, 200);
        }
        options.onEvent?.(evt);
      });

      socket.on('incident:update', ({ incident, isNew }: { incident: Incident; isNew: boolean }) => {
        options.onIncidentUpdate?.(incident, isNew);
      });

      socket.on('metrics:tick', (metrics: CurrentMetrics) => {
        options.onMetricsTick?.(metrics);
      });
    } catch (e) {
      // Ignore socket connection in static/Vercel host
    }

    // Throttled UI state flusher: batch events every 100ms
    const flushInterval = setInterval(() => {
      if (eventBufferRef.current.length > 0) {
        setLiveEvents([...eventBufferRef.current]);
      }
    }, 100);

    return () => {
      clearInterval(flushInterval);
      unsubscribeIncidents?.();
      unsubscribeFeed?.();
      unsubscribeMetrics?.();
      socket?.disconnect();
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
    socket: socketRef.current,
  };
}
