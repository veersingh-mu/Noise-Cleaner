import React from 'react';
import { Flame, Layers, Clock, ShieldAlert } from 'lucide-react';
import { CurrentMetrics } from '../lib/types';

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
      borderClass: 'border-primary/20',
    },
    {
      title: 'Critical Firing',
      value: metrics.criticalFiringCount,
      subtext: metrics.criticalFiringCount > 0 ? 'Requires immediate SRE review' : 'No critical alerts active',
      icon: Flame,
      colorClass: 'text-critical',
      bgClass: 'bg-critical-muted',
      borderClass: 'border-critical/30',
      isPulsing: metrics.criticalFiringCount > 0,
    },
    {
      title: 'Suppressed Events',
      value: metrics.suppressedEvents.toLocaleString(),
      subtext: `${((metrics.suppressedEvents / Math.max(1, metrics.rawEventsReceived)) * 100).toFixed(1)}% deduplicated`,
      icon: ShieldAlert,
      colorClass: 'text-success',
      bgClass: 'bg-success-muted',
      borderClass: 'border-success/20',
    },
    {
      title: 'Throughput Rate',
      value: `${metrics.eventsPerSecond} /s`,
      subtext: `${metrics.rawEventsReceived.toLocaleString()} total raw ingested`,
      icon: Clock,
      colorClass: 'text-info',
      bgClass: 'bg-info-muted',
      borderClass: 'border-info/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card, idx) => {
        const IconComponent = card.icon;
        return (
          <div
            key={idx}
            className="bg-surface rounded-card border border-border p-3.5 sm:p-4 min-h-[88px] sm:min-h-[96px] transition-all duration-200 hover:border-border-bright flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] sm:text-xs font-medium text-slate-400 truncate">
                {card.title}
              </span>
              <div className={`p-1 sm:p-1.5 rounded-md ${card.bgClass} ${card.colorClass} border ${card.borderClass} shrink-0`}>
                <IconComponent className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${card.isPulsing ? 'animate-pulse' : ''}`} />
              </div>
            </div>

            <div className="mt-2 sm:mt-3">
              <div className="flex items-baseline gap-1.5 sm:gap-2">
                <span className={`font-mono text-xl sm:text-2xl font-bold tracking-tight ${card.colorClass}`}>
                  {card.value}
                </span>
                {card.isPulsing && (
                  <span className="inline-flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-critical opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-critical"></span>
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] font-mono text-slate-400 mt-0.5 truncate">
                {card.subtext}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
