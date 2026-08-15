import React, { useState } from 'react';
import { Grid, ChevronDown, ChevronRight, Clock, ShieldCheck, Flame, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { CooldownConfig } from '../lib/types';

interface CooldownHeatmapProps {
  config: CooldownConfig;
  onSelectCell?: (service: string, severity: string, duration: number) => void;
}

export const CooldownHeatmap: React.FC<CooldownHeatmapProps> = ({
  config,
  onSelectCell,
}) => {
  const [hoveredCell, setHoveredCell] = useState<{
    service: string;
    severity: string;
    duration: number;
    threshold: number;
  } | null>(null);

  const [expandedServices, setExpandedServices] = useState<Record<string, boolean>>({
    'payments-service': true,
    'checkout-service': true,
  });

  const services = [
    'payments-service',
    'checkout-service',
    'auth-service',
    'notification-worker',
    'global (default)',
  ];

  const severities = ['critical', 'high', 'medium', 'low'] as const;

  const toggleServiceAccordion = (svc: string) => {
    setExpandedServices((prev) => ({ ...prev, [svc]: !prev[svc] }));
  };

  const getDuration = (service: string, severity: string): number => {
    if (service !== 'global (default)' && config.overrides?.[service]?.[severity] !== undefined) {
      return config.overrides[service][severity];
    }
    return config.default?.[severity] ?? 300;
  };

  const getThreshold = (severity: string): number => {
    return config.burstThreshold?.[severity] ?? 50;
  };

  const getCellColor = (duration: number) => {
    if (duration <= 15) return 'bg-critical/30 border-critical/50 text-red-200';
    if (duration <= 30) return 'bg-warning/25 border-warning/50 text-amber-200';
    if (duration <= 90) return 'bg-primary/25 border-primary/50 text-blue-200';
    if (duration <= 180) return 'bg-info/20 border-info/40 text-purple-200';
    if (duration <= 300) return 'bg-slate-800/80 border-slate-700 text-slate-300';
    return 'bg-slate-900 border-slate-800 text-slate-500';
  };

  const getSeverityIcon = (sev: string) => {
    switch (sev) {
      case 'critical':
        return <Flame className="w-3.5 h-3.5 text-critical shrink-0" />;
      case 'high':
        return <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />;
      case 'medium':
        return <AlertCircle className="w-3.5 h-3.5 text-primary shrink-0" />;
      default:
        return <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    }
  };

  return (
    <div className="bg-surface rounded-card border border-border p-4 sm:p-5 shadow-lg flex flex-col space-y-3.5 sm:space-y-4">
      {/* Heatmap Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
        <div className="flex items-center gap-2">
          <Grid className="w-4 h-4 text-primary shrink-0" />
          <h2 className="text-xs sm:text-sm font-semibold text-slate-200">
            Cooldown & Burst Matrix Heatmap
          </h2>
        </div>
        <span className="text-[10px] sm:text-[11px] font-mono text-slate-400">
          Service × Severity Duration Grid
        </span>
      </div>

      {/* MOBILE ACCORDION VIEW (< md) */}
      <div className="block md:hidden space-y-2">
        {services.map((svc) => {
          const isExpanded = Boolean(expandedServices[svc]);
          return (
            <div
              key={svc}
              className="bg-background/80 rounded-lg border border-border/80 overflow-hidden transition-all"
            >
              {/* Accordion header button */}
              <button
                type="button"
                onClick={() => toggleServiceAccordion(svc)}
                className="w-full p-3 flex items-center justify-between text-left font-mono text-xs text-slate-200 font-bold hover:bg-surface-hover/50 min-h-[44px]"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-primary font-bold">●</span>
                  <span className="truncate">{svc}</span>
                </div>
                <div className="flex items-center gap-1 text-slate-400 shrink-0">
                  <span className="text-[10px] font-normal text-slate-500">
                    {isExpanded ? 'Collapse' : '4 levels'}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </div>
              </button>

              {/* Accordion content */}
              {isExpanded && (
                <div className="p-2.5 pt-0 border-t border-border/40 grid grid-cols-2 gap-2 animate-fade-in">
                  {severities.map((sev) => {
                    const duration = getDuration(svc, sev);
                    const threshold = getThreshold(sev);
                    const colorClass = getCellColor(duration);

                    return (
                      <div
                        key={sev}
                        onClick={() => onSelectCell?.(svc, sev, duration)}
                        className={`p-2.5 rounded-lg border font-mono transition-all cursor-pointer active:scale-95 shadow-sm flex flex-col justify-between ${colorClass}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] uppercase font-bold text-slate-300 flex items-center gap-1">
                            {getSeverityIcon(sev)}
                            {sev}
                          </span>
                          <span className="text-xs font-bold text-white">{duration}s</span>
                        </div>
                        <span className="text-[9px] font-normal opacity-80 text-slate-400">
                          burst: &gt;{threshold}/min
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* DESKTOP 2D MATRIX TABLE VIEW (md+) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-center border-collapse">
          <thead>
            <tr>
              <th className="text-left text-xs font-mono text-slate-400 py-2 px-3">Service</th>
              {severities.map((sev) => (
                <th key={sev} className="text-xs font-mono text-slate-400 uppercase py-2 px-3">
                  {sev}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {services.map((svc) => (
              <tr key={svc} className="hover:bg-surface-hover/40 transition-colors">
                <td className="text-left py-2.5 px-3 font-mono text-xs font-medium text-slate-300">
                  {svc}
                </td>
                {severities.map((sev) => {
                  const duration = getDuration(svc, sev);
                  const threshold = getThreshold(sev);
                  const colorClass = getCellColor(duration);

                  return (
                    <td key={sev} className="py-1.5 px-2">
                      <div
                        onClick={() => onSelectCell?.(svc, sev, duration)}
                        onMouseEnter={() =>
                          setHoveredCell({ service: svc, severity: sev, duration, threshold })
                        }
                        onMouseLeave={() => setHoveredCell(null)}
                        className={`p-2 rounded border font-mono text-xs font-bold transition-all duration-150 cursor-pointer hover:scale-[1.03] shadow-sm flex flex-col items-center justify-center ${colorClass}`}
                      >
                        <span>{duration}s</span>
                        <span className="text-[9px] font-normal opacity-70">
                          burst: &gt;{threshold}/m
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tooltip / Status Description banner */}
      <div className="p-2.5 rounded bg-background border border-border/80 text-[11px] sm:text-xs font-mono flex items-center justify-between min-h-[38px]">
        {hoveredCell ? (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-slate-300">
            <span className="text-primary font-bold">{hoveredCell.service}</span>
            <span>•</span>
            <span className="uppercase text-slate-400">{hoveredCell.severity}</span>
            <span>•</span>
            <span className="text-white font-bold">{hoveredCell.duration}s cooldown TTL</span>
            <span>•</span>
            <span className="text-warning">burst: &gt;{hoveredCell.threshold} events/min</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-400">
            <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>Tap or hover over any matrix cell to inspect suppression TTL & burst rules</span>
          </div>
        )}
      </div>
    </div>
  );
};
