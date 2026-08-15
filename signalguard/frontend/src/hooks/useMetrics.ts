import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { CurrentMetrics, MetricsSnapshot } from '../lib/types';

const INITIAL_BASELINE_METRICS: CurrentMetrics = {
  rawEventsReceived: 1420,
  notificationsSent: 29,
  suppressedEvents: 1391,
  noiseReductionRatio: 0.9795,
  openIncidentsCount: 3,
  criticalFiringCount: 1,
  coolingDownCount: 2,
  eventsPerSecond: 48,
  timestamp: new Date().toISOString(),
};

export function useMetrics(initialMetrics?: CurrentMetrics) {
  const [metrics, setMetrics] = useState<CurrentMetrics>(initialMetrics || INITIAL_BASELINE_METRICS);
  const [history, setHistory] = useState<MetricsSnapshot[]>([]);
  const [displayNrr, setDisplayNrr] = useState<number>(97.9);
  const isMountedRef = useRef(true);

  // Poll / fetch baseline metrics & history on mount
  useEffect(() => {
    isMountedRef.current = true;

    async function loadData() {
      try {
        const [current, hist] = await Promise.all([
          api.getMetrics(),
          api.getMetricsHistory(20),
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
    setDisplayNrr((prev) => {
      const diff = targetPct - prev;
      if (Math.abs(diff) < 0.1) return targetPct;
      return prev + diff * 0.35;
    });

    // Append to live chart history if newer
    setHistory((prev) => {
      const last = prev[prev.length - 1];
      const nowTs = new Date(newMetrics.timestamp).getTime();
      if (!last || nowTs - new Date(last.timestamp).getTime() > 10000) {
        return [
          ...prev.slice(-25),
          {
            id: `snap_${Date.now()}`,
            timestamp: newMetrics.timestamp,
            rawEventsReceived: newMetrics.rawEventsReceived,
            notificationsSent: newMetrics.notificationsSent,
            noiseReductionRatio: newMetrics.noiseReductionRatio,
          },
        ];
      }
      return prev;
    });
  };

  return {
    metrics,
    displayNrr,
    history,
    updateMetrics,
  };
}
