import React from 'react';
import { ShieldCheck, TrendingUp, Zap, Radio } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import { MetricsSnapshot } from '../lib/types.js';

interface NoiseReductionCardProps {
  percentage: number;
  rawCount: number;
  sentCount: number;
  suppressedCount: number;
  eventsPerSecond: number;
  history: MetricsSnapshot[];
}

export const NoiseReductionCard: React.FC<NoiseReductionCardProps> = ({
  percentage,
  rawCount,
  sentCount,
  suppressedCount,
  eventsPerSecond,
  history
}) => {
  // Format chart data
  const chartData = history.map((item, idx) => ({
    time: idx,
    nrr: parseFloat((item.noiseReductionRatio * 100).toFixed(1))
  }));

  const formattedPct = percentage.toFixed(1);
  const isHighEfficiency = percentage >= 90;

  return (
    <div className="relative overflow-hidden bg-surface rounded-card border border-border p-6 shadow-xl transition-all duration-300 hover:border-border-bright">
      {/* Background glow gradient */}
      <div className="absolute -right-16 -top-16 w-64 h-64 bg-success/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
        {/* Left Side: Hero NRR & Badges */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-success-muted text-success border border-success/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
                Sentinel Efficiency
              </span>
              <h3 className="text-sm font-medium text-slate-200">
                Noise Reduction Ratio (NRR)
              </h3>
            </div>
            {eventsPerSecond > 0 && (
              <div className="ml-2 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary-muted border border-primary/30 text-primary text-xs font-mono">
                <Radio className="w-3 h-3 animate-pulse" />
                <span>{eventsPerSecond} eps</span>
              </div>
            )}
          </div>

          <div className="flex items-baseline gap-3">
            <span className="font-mono text-5xl lg:text-6xl font-bold tracking-tight text-white animate-number-flash">
              {formattedPct}%
            </span>
            <span className="text-xs font-mono text-success bg-success-muted px-2.5 py-1 rounded-full border border-success/30 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {isHighEfficiency ? 'Optimal Suppression' : 'Active Filtering'}
            </span>
          </div>

          <p className="text-xs text-slate-400 max-w-md leading-relaxed">
            <strong className="text-slate-200 font-mono">{suppressedCount.toLocaleString()}</strong> duplicate error occurrences intercepted & batched into thread updates, preventing alert storm fatigue across on-call channels.
          </p>
        </div>

        {/* Right Side: Mini Trend Sparkline & Ratio Breakdown */}
        <div className="w-full lg:w-72 flex flex-col gap-3 bg-surface-muted/70 p-4 rounded-xl border border-border/80">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Reduction Trend</span>
            <span className="text-slate-300">{sentCount} sent / {rawCount.toLocaleString()} raw</span>
          </div>

          {/* Sparkline chart */}
          <div className="h-16 w-full">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="nrrGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, 100]} hide />
                  <Area
                    type="monotone"
                    dataKey="nrr"
                    stroke="#10B981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#nrrGrad)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                Gathering telemetry...
              </div>
            )}
          </div>

          {/* Ratio bar */}
          <div className="w-full bg-border h-2 rounded-full overflow-hidden flex">
            <div
              className="bg-success transition-all duration-500 h-full rounded-l-full"
              style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
              title={`Suppressed: ${percentage.toFixed(1)}%`}
            />
            <div
              className="bg-critical transition-all duration-500 h-full rounded-r-full"
              style={{ width: `${Math.min(100, Math.max(0, 100 - percentage))}%` }}
              title={`Dispatched: ${(100 - percentage).toFixed(1)}%`}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span className="text-success flex items-center gap-1">● {suppressedCount} Suppressed</span>
            <span className="text-critical flex items-center gap-1">● {sentCount} Dispatched</span>
          </div>
        </div>
      </div>
    </div>
  );
};
