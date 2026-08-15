import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { CurrentMetrics, MetricsSnapshot } from '../lib/types.js';

export function useMetrics(initialMetrics?: CurrentMetrics) {
  const [metrics, setMetrics] = useState<CurrentMetrics>(initialMetrics || {
    rawEventsReceived: 0,
    notificationsSent: 0,
    suppressedEvents: 0,
    noiseReductionRatio: 0,
    openIncidentsCount: 0,
    criticalFiringCount: 0,
    coolingDownCount: 0,
    eventsPerSecond: 0,
    timestamp: new Date().toISOString()
  });

  const [history, setHistory] = useState<MetricsSnapshot[]>([]);
  const [displayNrr, setDisplayNrr] = useState<number>(0);
  const isMountedRef = useRef(true);

  // Poll / fetch baseline metrics & history on mount
  useEffect(() => {
    isMountedRef.current = true;

    async function loadData() {
      try {
        const [current, hist] = await Promise.all([
          api.getMetrics(),
          api.getMetricsHistory(20)
        ]);
        if (isMountedRef.current) {
          setMetrics(current);
          setHistory(hist.history || []);
          setDisplayNrr(current.noiseReductionRatio * 100);
        }
      } catch (err) {
        console.warn('[useMetrics] Could not load initial metrics:', err);
      }
    }

    loadData();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Update live metrics and smoothly tween displayed percentage
  const updateMetrics = (newMetrics: CurrentMetrics) => {
    setMetrics(newMetrics);
    
    // Smooth animated count-up / tween towards new target
    const targetPct = newMetrics.noiseReductionRatio * 100;
    setDisplayNrr(prev => {
      const diff = targetPct - prev;
      if (Math.abs(diff) < 0.1) return targetPct;
      return prev + diff * 0.35;
    });

    // Append to live chart history if newer
    setHistory(prev => {
      const last = prev[prev.length - 1];
      const nowTs = new Date(newMetrics.timestamp).getTime();
      if (!last || nowTs - new Date(last.timestamp).getTime() > 15000) {
        return [
          ...prev.slice(-25),
          {
            id: `snap_${Date.now()}`,
            timestamp: newMetrics.timestamp,
            rawEventsReceived: newMetrics.rawEventsReceived,
            notificationsSent: newMetrics.notificationsSent,
            noiseReductionRatio: newMetrics.noiseReductionRatio
          }
        ];
      }
      return prev;
    });
  };

  return {
    metrics,
    displayNrr,
    history,
    updateMetrics
  };
}
