import React, { useState } from 'react';
import { X, Zap, Activity, Flame, Play, CheckCircle2, Clock } from 'lucide-react';
import { api } from '../lib/api.js';

interface SimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SimulatorModal: React.FC<SimulatorModalProps> = ({ isOpen, onClose }) => {
  const [pattern, setPattern] = useState<'steady' | 'burst' | 'mixed'>('burst');
  const [durationSeconds, setDurationSeconds] = useState(10);
  const [eventsPerSecond, setEventsPerSecond] = useState(100);
  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartSimulation = async () => {
    setIsRunning(true);
    setStatusMessage(`Dispatched ${pattern.toUpperCase()} simulation: ${eventsPerSecond} eps for ${durationSeconds}s...`);

    try {
      await api.simulateTraffic(pattern, durationSeconds, eventsPerSecond);
      setTimeout(() => {
        setIsRunning(false);
        setStatusMessage(`Simulation active! Check the Live Feed and Noise Reduction Ratio.`);
      }, 1500);
    } catch (err: any) {
      setIsRunning(false);
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface rounded-card border border-border w-full max-w-lg p-6 shadow-2xl space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary-muted text-primary border border-primary/30">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                Traffic & Alert Storm Simulator
              </h2>
              <p className="text-[11px] text-slate-400">
                Inject synthetic production error volume to test deduplication
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-border text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pattern Selector */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-slate-300 font-semibold block">
            Select Simulation Pattern:
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              {
                id: 'burst',
                title: 'Spike Burst',
                desc: '500 eps flood on 1 incident',
                icon: Flame,
                color: 'text-critical'
              },
              {
                id: 'steady',
                title: 'Steady Load',
                desc: 'Uniform traffic across services',
                icon: Activity,
                color: 'text-primary'
              },
              {
                id: 'mixed',
                title: 'Mixed Spikes',
                desc: 'Baseline + random outages',
                icon: Clock,
                color: 'text-warning'
              }
            ].map(p => {
              const IconComp = p.icon;
              const isSel = pattern === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPattern(p.id as any);
                    if (p.id === 'burst') setEventsPerSecond(500);
                    else if (p.id === 'steady') setEventsPerSecond(25);
                    else setEventsPerSecond(150);
                  }}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isSel
                      ? 'bg-surface-hover border-primary shadow-md'
                      : 'bg-background border-border/80 hover:border-border'
                  }`}
                >
                  <IconComp className={`w-4 h-4 mb-1.5 ${p.color}`} />
                  <span className="text-xs font-mono font-bold block text-slate-200">{p.title}</span>
                  <span className="text-[10px] text-slate-400 leading-tight block mt-0.5">{p.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Controls Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-400">Duration (Seconds):</label>
            <select
              value={durationSeconds}
              onChange={e => setDurationSeconds(parseInt(e.target.value, 10))}
              className="w-full bg-background border border-border rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-primary"
            >
              <option value={5}>5 seconds</option>
              <option value={10}>10 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-400">Events / Second:</label>
            <select
              value={eventsPerSecond}
              onChange={e => setEventsPerSecond(parseInt(e.target.value, 10))}
              className="w-full bg-background border border-border rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-primary"
            >
              <option value={10}>10 eps (Low)</option>
              <option value={50}>50 eps (Medium)</option>
              <option value={100}>100 eps (High)</option>
              <option value={500}>500 eps (Extreme Storm)</option>
            </select>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className="p-3 rounded bg-primary-muted border border-primary/30 text-xs font-mono text-primary flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t border-border flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-500">
            Total load: ~{(durationSeconds * eventsPerSecond).toLocaleString()} events
          </span>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded bg-border hover:bg-border-bright text-xs font-mono text-slate-300 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleStartSimulation}
              disabled={isRunning}
              className="px-4 py-1.5 rounded bg-primary hover:bg-primary-hover text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-md glow-primary transition-all disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isRunning ? 'Injecting...' : 'Inject Traffic'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
