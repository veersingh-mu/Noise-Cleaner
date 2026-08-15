import React, { useState } from 'react';
import { Radio, Pause, Play, Trash2 } from 'lucide-react';
import { LiveEvent } from '../lib/types';

interface LiveEventFeedProps {
  events: LiveEvent[];
  isConnected: boolean;
  onClear: () => void;
}

export const LiveEventFeed: React.FC<LiveEventFeedProps> = ({
  events,
  isConnected,
  onClear,
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const displayEvents = isPaused ? events : events.slice(0, 50);

  return (
    <div className="bg-surface rounded-card border border-border overflow-hidden shadow-lg flex flex-col h-[380px] sm:h-[460px] lg:h-[520px]">
      {/* Header */}
      <div className="p-3 sm:p-3.5 border-b border-border flex items-center justify-between bg-surface-muted/60">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Radio
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
                isConnected ? 'text-success animate-pulse' : 'text-slate-500'
              }`}
            />
            {isConnected && (
              <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-success rounded-full ring-2 ring-background" />
            )}
          </div>
          <h2 className="text-xs font-semibold text-slate-200">Real-Time Ingestion Stream</h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-border text-slate-400">
            {events.length} received
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`p-1.5 min-h-[36px] px-2 rounded text-xs font-mono flex items-center gap-1 transition-colors ${
              isPaused
                ? 'bg-warning/20 text-warning border border-warning/30'
                : 'hover:bg-border text-slate-400 hover:text-slate-200'
            }`}
            title={isPaused ? 'Resume live streaming' : 'Pause feed scrolling'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span className="text-[10px]">{isPaused ? 'Paused' : 'Live'}</span>
          </button>

          <button
            onClick={onClear}
            className="p-1.5 min-h-[36px] min-w-[36px] rounded hover:bg-border text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center"
            title="Clear buffer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y-0">
        {displayEvents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 p-4 text-center">
            <Radio className="w-6 h-6 animate-pulse opacity-40" />
            <p className="text-xs font-mono">Listening for incoming error events...</p>
            <p className="text-[11px] text-slate-600">
              Trigger a simulation above to test high-volume traffic
            </p>
          </div>
        ) : (
          displayEvents.map((evt, idx) => {
            const isFirst = idx === 0;
            return (
              <div
                key={evt.id || idx}
                className={`p-2 sm:p-2.5 rounded bg-background/60 border transition-all duration-200 ${
                  isFirst ? 'animate-slide-down' : ''
                } ${
                  evt.suppressed
                    ? 'border-border/60 hover:border-border'
                    : 'border-critical/40 bg-critical/5 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  {/* Left: Service & Error */}
                  <div className="flex items-center gap-1.5 sm:gap-2 truncate min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        evt.severity === 'critical'
                          ? 'bg-critical animate-ping'
                          : evt.severity === 'high'
                          ? 'bg-warning'
                          : 'bg-primary'
                      }`}
                    />
                    <span className="font-mono text-[11px] sm:text-xs font-semibold text-slate-200 truncate">
                      {evt.service}
                    </span>
                    <span className="text-slate-500 font-mono text-[10px] sm:text-[11px]">/</span>
                    <span className="text-slate-400 font-mono text-[10px] sm:text-[11px] truncate">
                      {evt.errorType}
                    </span>
                  </div>

                  {/* Right: Badge */}
                  <span
                    className={`text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.5 rounded shrink-0 ${
                      evt.suppressed
                        ? 'bg-success/15 text-success border border-success/30'
                        : 'bg-critical/20 text-critical border border-critical/40 font-bold'
                    }`}
                  >
                    {evt.suppressed ? 'Suppressed' : 'Alert Sent'}
                  </span>
                </div>

                {/* Message & Host line */}
                <p className="text-[10px] sm:text-[11px] text-slate-400 truncate mt-1 font-mono">
                  {evt.rawMessage}
                </p>

                <div className="flex items-center justify-between mt-1 text-[9px] sm:text-[10px] font-mono text-slate-500">
                  <span>Host: {evt.instanceId || 'inst-1'}</span>
                  <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
