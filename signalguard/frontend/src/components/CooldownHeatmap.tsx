import React, { useState } from 'react';
import { Grid, Clock, Info } from 'lucide-react';
import { CooldownConfig } from '../lib/types.js';

interface CooldownHeatmapProps {
  config: CooldownConfig;
  onSelectCell?: (service: string, severity: string, duration: number) => void;
}

export const CooldownHeatmap: React.FC<CooldownHeatmapProps> = ({
  config,
  onSelectCell
}) => {
  const [hoveredCell, setHoveredCell] = useState<{
    service: string;
    severity: string;
    duration: number;
    threshold: number;
  } | null>(null);

  const services = [
    'payments-service',
    'checkout-service',
    'auth-service',
    'notification-worker',
    'global (default)'
  ];

  const severities = ['critical', 'high', 'medium', 'low'] as const;

  const getDuration = (service: string, severity: string): number => {
    if (service !== 'global (default)' && config.overrides?.[service]?.[severity] !== undefined) {
      return config.overrides[service][severity];
    }
    return config.default?.[severity] ?? 300;
  };

  const getThreshold = (severity: string): number => {
    return config.burstThreshold?.[severity] ?? 50;
  };

  // Color interpolation:
  // Shorter cooldowns (e.g. 10s-30s) -> high alert / warm (bright blue/amber)
  // Longer cooldowns (e.g. 300s-900s) -> relaxed / deep dark purple
  const getCellColor = (duration: number) => {
    if (duration <= 15) return 'bg-critical/30 border-critical/50 text-red-200';
    if (duration <= 30) return 'bg-warning/25 border-warning/50 text-amber-200';
    if (duration <= 90) return 'bg-primary/25 border-primary/50 text-blue-200';
    if (duration <= 180) return 'bg-info/20 border-info/40 text-purple-200';
    if (duration <= 300) return 'bg-slate-800/80 border-slate-700 text-slate-300';
    return 'bg-slate-900 border-slate-800 text-slate-500';
  };

  return (
    <div className="bg-surface rounded-card border border-border p-5 shadow-lg flex flex-col space-y-4">
      {/* Heatmap Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Grid className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-slate-200">
            Cooldown & Burst Matrix Heatmap
          </h2>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          Service × Severity Duration Grid
        </span>
      </div>

      {/* 2D Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-center border-collapse">
          <thead>
            <tr>
              <th className="text-left text-xs font-mono text-slate-400 py-2 px-3">Service</th>
              {severities.map(sev => (
                <th key={sev} className="text-xs font-mono text-slate-400 uppercase py-2 px-3">
                  {sev}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {services.map(svc => (
              <tr key={svc} className="hover:bg-surface-hover/40 transition-colors">
                <td className="text-left py-2.5 px-3 font-mono text-xs font-medium text-slate-300">
                  {svc}
                </td>
                {severities.map(sev => {
                  const duration = getDuration(svc, sev);
                  const threshold = getThreshold(sev);
                  const colorClass = getCellColor(duration);

                  return (
                    <td key={sev} className="py-1.5 px-2">
                      <div
                        onClick={() => onSelectCell?.(svc, sev, duration)}
                        onMouseEnter={() => setHoveredCell({ service: svc, severity: sev, duration, threshold })}
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

      {/* Tooltip description banner */}
      <div className="p-2.5 rounded bg-background border border-border/80 text-xs font-mono flex items-center justify-between min-h-[40px]">
        {hoveredCell ? (
          <div className="flex items-center gap-3 text-slate-300">
            <span className="text-primary font-bold">{hoveredCell.service}</span>
            <span>•</span>
            <span className="uppercase text-slate-400">{hoveredCell.severity}</span>
            <span>•</span>
            <span>Window: <strong className="text-white">{hoveredCell.duration}s</strong></span>
            <span>•</span>
            <span>Burst Threshold: <strong className="text-warning">&gt;{hoveredCell.threshold} events/60s</strong></span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-500">
            <Info className="w-3.5 h-3.5" />
            <span>Hover over any cell to view active cooldown duration and burst trigger limits.</span>
          </div>
        )}

        {/* Legend */}
        <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-400">
          <span>Fast (10s)</span>
          <div className="flex gap-1">
            <span className="w-2.5 h-2.5 rounded bg-critical/60" />
            <span className="w-2.5 h-2.5 rounded bg-warning/60" />
            <span className="w-2.5 h-2.5 rounded bg-primary/60" />
            <span className="w-2.5 h-2.5 rounded bg-slate-800" />
          </div>
          <span>Slow (900s)</span>
        </div>
      </div>
    </div>
  );
};
