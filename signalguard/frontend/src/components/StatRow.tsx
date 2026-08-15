import React from 'react';
import { AlertCircle, Flame, Layers, Clock, ShieldAlert } from 'lucide-react';
import { CurrentMetrics } from '../lib/types.js';

interface StatRowProps {
  metrics: CurrentMetrics;
}

export const StatRow: React.FC<StatRowProps> = ({ metrics }) => {
  const cards = [
    {
      title: 'Active Incidents',
      value: metrics.openIncidentsCount,
      subtext: `${metrics.criticalFiringCount} firing • ${metrics.coolingDownCount} in cooldown`,
      icon: Layers,
      colorClass: 'text-primary',
      bgClass: 'bg-primary-muted',
      borderClass: 'border-primary/20'
    },
    {
      title: 'Critical Firing',
      value: metrics.criticalFiringCount,
      subtext: metrics.criticalFiringCount > 0 ? 'Requires immediate SRE review' : 'No critical alerts active',
      icon: Flame,
      colorClass: 'text-critical',
      bgClass: 'bg-critical-muted',
      borderClass: 'border-critical/30',
      isPulsing: metrics.criticalFiringCount > 0
    },
    {
      title: 'Suppressed Events',
      value: metrics.suppressedEvents.toLocaleString(),
      subtext: `${((metrics.suppressedEvents / Math.max(1, metrics.rawEventsReceived)) * 100).toFixed(1)}% of all traffic deduplicated`,
      icon: ShieldAlert,
      colorClass: 'text-success',
      bgClass: 'bg-success-muted',
      borderClass: 'border-success/20'
    },
    {
      title: 'Throughput Rate',
      value: `${metrics.eventsPerSecond} /s`,
      subtext: `${metrics.rawEventsReceived.toLocaleString()} total raw ingested`,
      icon: Clock,
      colorClass: 'text-info',
      bgClass: 'bg-info-muted',
      borderClass: 'border-info/20'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const IconComponent = card.icon;
        return (
          <div
            key={idx}
            className="bg-surface rounded-card border border-border p-4 transition-all duration-200 hover:border-border-bright flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">
                {card.title}
              </span>
              <div className={`p-1.5 rounded-md ${card.bgClass} ${card.colorClass} border ${card.borderClass}`}>
                <IconComponent className={`w-4 h-4 ${card.isPulsing ? 'animate-pulse' : ''}`} />
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className={`font-mono text-2xl font-bold tracking-tight ${card.colorClass}`}>
                  {card.value}
                </span>
                {card.isPulsing && (
                  <span className="inline-flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-critical opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-critical"></span>
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-slate-400 mt-1 truncate">
                {card.subtext}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
