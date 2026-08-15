import React from 'react';
import { ShieldAlert, Zap, MessageSquare, Bell, Radio, ArrowRight, CheckCircle2 } from 'lucide-react';

interface OnboardingEmptyProps {
  onStartSimulation: (pattern: 'steady' | 'burst' | 'mixed') => void;
}

export const OnboardingEmpty: React.FC<OnboardingEmptyProps> = ({ onStartSimulation }) => {
  return (
    <div className="bg-surface rounded-card border border-border p-8 text-center space-y-8 max-w-4xl mx-auto my-8 shadow-2xl relative overflow-hidden">
      <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      {/* Hero Icon */}
      <div className="flex flex-col items-center space-y-3">
        <div className="p-4 rounded-2xl bg-primary-muted text-primary border border-primary/30 shadow-lg glow-primary">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          SignalGuard Sentinel Initialized
        </h2>
        <p className="text-sm text-slate-400 max-w-lg mx-auto">
          Your middleware is ready to intercept, normalize, and deduplicate high-volume error events before they reach your on-call alerts.
        </p>
      </div>

      {/* Fast Setup Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
        <div className="p-4 rounded-xl bg-background border border-border space-y-2.5">
          <div className="flex items-center gap-2 text-primary font-mono text-xs font-semibold">
            <MessageSquare className="w-4 h-4" />
            <span>1. Slack Adapter</span>
          </div>
          <p className="text-xs text-slate-400">
            Posts top-level alert on new incident; automatically replies in-thread for batched updates.
          </p>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-success">
            <CheckCircle2 className="w-3 h-3" /> Ready
          </span>
        </div>

        <div className="p-4 rounded-xl bg-background border border-border space-y-2.5">
          <div className="flex items-center gap-2 text-warning font-mono text-xs font-semibold">
            <Bell className="w-4 h-4" />
            <span>2. PagerDuty Events v2</span>
          </div>
          <p className="text-xs text-slate-400">
            Automatic dedup_key grouping collapses identical error storms into a single incident.
          </p>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-success">
            <CheckCircle2 className="w-3 h-3" /> Ready
          </span>
        </div>

        <div className="p-4 rounded-xl bg-background border border-border space-y-2.5">
          <div className="flex items-center gap-2 text-info font-mono text-xs font-semibold">
            <Radio className="w-4 h-4" />
            <span>3. Discord Webhook</span>
          </div>
          <p className="text-xs text-slate-400">
            Uses live PATCH message updates to edit alert embeds in-place without spamming channels.
          </p>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-success">
            <CheckCircle2 className="w-3 h-3" /> Ready
          </span>
        </div>
      </div>

      {/* Action CTA */}
      <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-center gap-4">
        <button
          onClick={() => onStartSimulation('burst')}
          className="w-full sm:w-auto px-6 py-3 rounded-lg bg-critical hover:bg-critical-hover text-white text-xs font-mono font-bold flex items-center justify-center gap-2 shadow-lg glow-critical transition-all hover:scale-[1.02]"
        >
          <Zap className="w-4 h-4" />
          <span>Launch 500/s Error Spike Burst Simulation</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={() => onStartSimulation('steady')}
          className="w-full sm:w-auto px-5 py-3 rounded-lg bg-surface-muted hover:bg-surface-hover border border-border text-slate-200 text-xs font-mono font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <span>Run Steady Baseline Traffic</span>
        </button>
      </div>
    </div>
  );
};
