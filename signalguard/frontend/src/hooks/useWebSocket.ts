import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { CurrentMetrics, Incident, LiveEvent } from '../lib/types.js';

interface UseWebSocketOptions {
  onEvent?: (event: LiveEvent) => void;
  onIncidentUpdate?: (incident: Incident, isNew: boolean) => void;
  onMetricsTick?: (metrics: CurrentMetrics) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const eventBufferRef = useRef<LiveEvent[]>([]);

  useEffect(() => {
    // Determine socket target url (fallback to current origin in dev/prod)
    const socket = io('/', {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('[WebSocket Client] Connected to SignalGuard stream');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('[WebSocket Client] Disconnected');
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

    // Throttled UI state flusher: batch events every 100ms to avoid DOM thrash
    const flushInterval = setInterval(() => {
      if (eventBufferRef.current.length > 0) {
        setLiveEvents([...eventBufferRef.current]);
      }
    }, 100);

    return () => {
      clearInterval(flushInterval);
      socket.disconnect();
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
    socket: socketRef.current
  };
}
