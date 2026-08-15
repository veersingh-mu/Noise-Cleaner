import React, { useEffect, useState } from 'react';
import {
  X,
  Copy,
  Check,
  Flame,
  AlertTriangle,
  CheckCircle2,
  Server,
  Clock,
  ShieldCheck,
  VolumeX,
  Hash,
  Terminal,
  Activity
} from 'lucide-react';
import { api } from '../lib/api';
import { Incident, Occurrence } from '../lib/types';

interface IncidentDetailProps {
  incident: Incident | null;
  onClose: () => void;
  onSilence: (incident: Incident, durationSeconds: number) => void;
  onResolve: (incident: Incident) => void;
}

export const IncidentDetail: React.FC<IncidentDetailProps> = ({
  incident,
  onClose,
  onSilence,
  onResolve,
}) => {
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [copied, setCopied] = useState(false);
  const [silenceDuration, setSilenceDuration] = useState(3600);

  useEffect(() => {
    if (!incident) return;
    api
      .getIncidentDetails(incident.id)
      .then((res: { occurrences?: Occurrence[] }) => {
        setOccurrences(res.occurrences || []);
      })
      .catch(() => {});
  }, [incident]);

  if (!incident) return null;

  const copyFingerprint = () => {
    navigator.clipboard.writeText(incident.fingerprint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev.toLowerCase()) {
      case 'critical':
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-critical/20 text-critical border border-critical/30 flex items-center gap-1.5 shrink-0">
            <Flame className="w-3.5 h-3.5" /> CRITICAL
          </span>
        );
      case 'high':
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-warning/20 text-warning border border-warning/30 flex items-center gap-1.5 shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" /> HIGH
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-primary/20 text-primary border border-primary/30 shrink-0">
            {sev.toUpperCase()}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-surface rounded-card border border-border w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col animate-fade-in">
        {/* Header */}
        <div className="p-3.5 sm:p-5 border-b border-border flex items-start justify-between gap-2 bg-surface-muted/60 sticky top-0 z-20 backdrop-blur-md">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {getSeverityBadge(incident.severity)}
              <span className="text-base sm:text-lg font-bold text-slate-100 font-mono truncate">
                {incident.service}
              </span>
              <span className="text-slate-500 font-mono">/</span>
              <span className="text-sm sm:text-base text-slate-300 font-mono font-medium truncate">
                {incident.errorType}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 font-sans max-w-2xl">
              {incident.normalizedMessage}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 min-h-[40px] min-w-[40px] rounded-lg hover:bg-border text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-6">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <div className="p-2.5 sm:p-3 bg-background rounded border border-border">
              <span className="text-[9px] sm:text-[10px] font-mono uppercase text-slate-400 block">
                Total Occurrences
              </span>
              <span className="text-lg sm:text-xl font-bold font-mono text-slate-100">
                {incident.occurrenceCount.toLocaleString()}
              </span>
            </div>
            <div className="p-2.5 sm:p-3 bg-background rounded border border-border">
              <span className="text-[9px] sm:text-[10px] font-mono uppercase text-slate-400 block">
                Deduplication Ratio
              </span>
              <span className="text-lg sm:text-xl font-bold font-mono text-success">
                {(((incident.occurrenceCount - 1) / Math.max(1, incident.occurrenceCount)) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="p-2.5 sm:p-3 bg-background rounded border border-border">
              <span className="text-[9px] sm:text-[10px] font-mono uppercase text-slate-400 block">
                Affected Hosts
              </span>
              <span className="text-lg sm:text-xl font-bold font-mono text-primary truncate block">
                {incident.affectedInstances?.length || 1} hosts
              </span>
            </div>
            <div className="p-2.5 sm:p-3 bg-background rounded border border-border">
              <span className="text-[9px] sm:text-[10px] font-mono uppercase text-slate-400 block">
                Current Status
              </span>
              <span className="text-xs sm:text-sm font-bold font-mono uppercase text-slate-200 mt-1 block truncate">
                {incident.status}
              </span>
            </div>
          </div>

          {/* Fingerprint Bar */}
          <div className="p-3 sm:p-3.5 bg-background rounded border border-border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                <Hash className="w-3.5 h-3.5 text-primary" />
                <span>Deterministic SHA-256 Fingerprint:</span>
              </div>
              <button
                onClick={copyFingerprint}
                className="text-xs font-mono text-primary hover:text-primary-hover flex items-center gap-1 p-1"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <code className="text-[11px] sm:text-xs font-mono text-slate-300 break-all select-all block bg-surface p-2 rounded border border-border/80">
              {incident.fingerprint}
            </code>
          </div>

          {/* Stack Trace Viewer */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <Terminal className="w-4 h-4 text-warning" />
              <span className="font-semibold">Normalized SRE Stack Trace</span>
            </div>
            <pre className="p-3 sm:p-4 bg-background rounded-lg border border-border text-[11px] sm:text-xs font-mono text-slate-300 overflow-x-auto max-h-44 leading-relaxed selection:bg-primary/40">
              {incident.sampleStackTrace || 'No stack trace captured for this incident.'}
            </pre>
          </div>

          {/* Affected Instances Grid */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <Server className="w-4 h-4 text-primary" />
              <span className="font-semibold">
                Affected Service Hosts ({incident.affectedInstances?.length || 0})
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {incident.affectedInstances?.map((inst: string) => (
                <div
                  key={inst}
                  className="px-2.5 py-1 rounded bg-background border border-border text-xs font-mono text-slate-300 flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  {inst}
                </div>
              ))}
            </div>
          </div>

          {/* Recent Occurrences Activity Log */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-slate-300">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-success" />
                <span className="font-semibold">Recent Occurrences Log</span>
              </div>
              <span className="text-slate-500">{occurrences.length} events logged</span>
            </div>

            <div className="max-h-44 overflow-y-auto rounded border border-border bg-background divide-y divide-border/60">
              {occurrences.length === 0 ? (
                <div className="p-4 text-center text-xs font-mono text-slate-500">
                  No discrete occurrence records in buffer.
                </div>
              ) : (
                occurrences.map((occ) => (
                  <div
                    key={occ.id}
                    className="p-2.5 flex items-center justify-between text-xs font-mono hover:bg-surface/50"
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      {occ.suppressed ? (
                        <span className="text-success text-[10px] flex items-center gap-1 bg-success/10 px-1.5 py-0.5 rounded border border-success/20">
                          <ShieldCheck className="w-3 h-3" /> Suppressed
                        </span>
                      ) : (
                        <span className="text-critical text-[10px] flex items-center gap-1 bg-critical/10 px-1.5 py-0.5 rounded border border-critical/20 font-bold">
                          <Flame className="w-3 h-3" /> Initial Alert
                        </span>
                      )}
                      <span className="text-slate-400 text-[11px]">Host: {occ.instanceId}</span>
                    </div>
                    <span className="text-slate-500 text-[10px] sm:text-[11px]">
                      {new Date(occ.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 sm:p-4 border-t border-border bg-surface-muted/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-mono text-slate-400">Silence:</label>
            <select
              value={silenceDuration}
              onChange={(e) => setSilenceDuration(parseInt(e.target.value, 10))}
              className="bg-background border border-border rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-primary min-h-[36px]"
            >
              <option value={300}>5m</option>
              <option value={1800}>30m</option>
              <option value={3600}>1h</option>
              <option value={14400}>4h</option>
              <option value={86400}>24h</option>
            </select>
            <button
              onClick={() => onSilence(incident, silenceDuration)}
              className="px-3 py-1.5 min-h-[36px] rounded bg-border hover:bg-border-bright text-xs font-mono text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <VolumeX className="w-3.5 h-3.5" /> Silence
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onResolve(incident)}
              className="w-full sm:w-auto px-4 py-2 min-h-[40px] rounded bg-success/20 hover:bg-success/30 text-success border border-success/30 text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" /> Mark as Resolved
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
