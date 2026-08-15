import React, { useState } from 'react';
import {
  AlertTriangle,
  Flame,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  VolumeX,
  Check,
  Server,
  Search,
  Clock,
  Radio
} from 'lucide-react';
import { Incident } from '../lib/types';

interface IncidentTableProps {
  incidents: Incident[];
  onSelectIncident: (incident: Incident) => void;
  onSilence: (incident: Incident) => void;
  onResolve: (incident: Incident) => void;
}

export const IncidentTable: React.FC<IncidentTableProps> = ({
  incidents,
  onSelectIncident,
  onSilence,
  onResolve,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedFp, setCopiedFp] = useState<string | null>(null);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const copyFingerprint = (fp: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fp);
    setCopiedFp(fp);
    setTimeout(() => setCopiedFp(null), 1500);
  };

  // Filter and search logic
  const filteredIncidents = incidents.filter((inc) => {
    if (statusFilter !== 'all' && inc.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        inc.service.toLowerCase().includes(q) ||
        inc.errorType.toLowerCase().includes(q) ||
        inc.normalizedMessage.toLowerCase().includes(q) ||
        inc.fingerprint.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getSeverityBadge = (sev: string) => {
    switch (sev.toLowerCase()) {
      case 'critical':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono font-semibold bg-critical/15 text-critical border border-critical/30 flex items-center gap-1 w-fit">
            <Flame className="w-3 h-3" /> CRITICAL
          </span>
        );
      case 'high':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono font-semibold bg-warning/15 text-warning border border-warning/30 flex items-center gap-1 w-fit">
            <AlertTriangle className="w-3 h-3" /> HIGH
          </span>
        );
      case 'medium':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono font-semibold bg-primary/15 text-primary border border-primary/30 w-fit">
            MEDIUM
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700 w-fit">
            LOW
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'firing':
        return (
          <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono font-bold bg-critical/20 text-critical border border-critical/40 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-critical animate-ping" />
            FIRING
          </span>
        );
      case 'cooling_down':
        return (
          <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono font-bold bg-warning/20 text-warning border border-warning/40">
            COOLING DOWN
          </span>
        );
      case 'resolved':
        return (
          <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono font-bold bg-success/20 text-success border border-success/40 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> RESOLVED
          </span>
        );
      default:
        return null;
    }
  };

  const formatTimeAgo = (isoString: string) => {
    try {
      const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (diff < 60) return `${diff}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      return `${Math.floor(diff / 3600)}h ago`;
    } catch {
      return 'just now';
    }
  };

  return (
    <div className="bg-surface rounded-card border border-border overflow-hidden shadow-lg flex flex-col">
      {/* Table Header Controls */}
      <div className="p-3.5 sm:p-4 border-b border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface-muted/50">
        <div className="flex items-center justify-between sm:justify-start gap-2">
          <h2 className="text-xs sm:text-sm font-semibold text-slate-200">
            Deduplicated Incident Clusters
          </h2>
          <span className="text-[10px] sm:text-xs font-mono px-2 py-0.5 rounded bg-border text-slate-400">
            {filteredIncidents.length} active
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          {/* Search bar (full width on mobile) */}
          <div className="relative w-full sm:w-52 md:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search service, error, trace..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary font-sans"
            />
          </div>

          {/* Status filter tabs (horizontal scrollable on mobile) */}
          <div className="flex overflow-x-auto no-scrollbar rounded border border-border bg-background p-0.5 text-xs font-mono shrink-0">
            {['all', 'firing', 'cooling_down', 'resolved'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded transition-colors uppercase text-[10px] whitespace-nowrap min-h-[32px] sm:min-h-[28px] ${
                  statusFilter === st
                    ? 'bg-primary text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MOBILE CARD VIEW (< md) */}
      <div className="block md:hidden divide-y divide-border/60">
        {filteredIncidents.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-mono text-xs">
            No incidents matching your filter criteria.
          </div>
        ) : (
          filteredIncidents.map((inc) => (
            <div
              key={inc.id}
              onClick={() => onSelectIncident(inc)}
              className={`p-3.5 transition-colors cursor-pointer active:bg-surface-hover/90 ${
                inc.status === 'firing' ? 'bg-critical/5' : ''
              }`}
            >
              {/* Top Row: Service, Error & Badges */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-xs text-slate-100 truncate font-mono">
                      {inc.service}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 truncate">
                      / {inc.errorType}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 font-sans">
                    {inc.normalizedMessage}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {getSeverityBadge(inc.severity)}
                  {getStatusBadge(inc.status)}
                </div>
              </div>

              {/* Bottom Metadata & Actions Row */}
              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/40 text-[11px] font-mono text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="text-slate-200 font-bold">
                    {inc.occurrenceCount.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">events</span>
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <Server className="w-3 h-3 text-slate-500" />
                    {inc.affectedInstances.length} hosts
                  </span>
                  <span className="text-slate-500">
                    {formatTimeAgo(inc.lastSeen)}
                  </span>
                </div>

                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onSilence(inc)}
                    className="p-2 min-h-[36px] min-w-[36px] rounded hover:bg-border text-slate-400 hover:text-warning transition-colors"
                    title="Silence 1h"
                  >
                    <VolumeX className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onResolve(inc)}
                    className="p-2 min-h-[36px] min-w-[36px] rounded hover:bg-border text-slate-400 hover:text-success transition-colors"
                    title="Resolve"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* DESKTOP TABLE VIEW (md+) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-background/50 text-slate-400 font-mono text-[11px]">
              <th className="py-2.5 px-3 w-8"></th>
              <th className="py-2.5 px-3">Service & Error</th>
              <th className="py-2.5 px-3">Severity</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3 text-right">Occurrences</th>
              <th className="py-2.5 px-3">Hosts</th>
              <th className="py-2.5 px-3">Last Seen</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredIncidents.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500 font-mono">
                  No incidents matching your filter criteria.
                </td>
              </tr>
            ) : (
              filteredIncidents.map((inc) => {
                const isExpanded = expandedId === inc.id;
                return (
                  <React.Fragment key={inc.id}>
                    <tr
                      onClick={() => onSelectIncident(inc)}
                      className={`hover:bg-surface-hover/80 transition-colors cursor-pointer group ${
                        inc.status === 'firing' ? 'bg-critical/5' : ''
                      }`}
                    >
                      {/* Expand Toggle */}
                      <td className="py-3 px-3 text-slate-500">
                        <button
                          onClick={(e) => toggleExpand(inc.id, e)}
                          className="p-1 rounded hover:bg-border text-slate-400"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Service & Error Info */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200 group-hover:text-primary transition-colors font-mono">
                              {inc.service}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              / {inc.errorType}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 truncate max-w-md mt-0.5 font-sans">
                            {inc.normalizedMessage}
                          </span>
                        </div>
                      </td>

                      {/* Severity */}
                      <td className="py-3 px-3">{getSeverityBadge(inc.severity)}</td>

                      {/* Status */}
                      <td className="py-3 px-3">{getStatusBadge(inc.status)}</td>

                      {/* Occurrences Count */}
                      <td className="py-3 px-3 text-right">
                        <span className="font-mono font-bold text-sm text-slate-200">
                          {inc.occurrenceCount.toLocaleString()}
                        </span>
                        <div className="text-[10px] font-mono text-slate-500">1 alert sent</div>
                      </td>

                      {/* Affected Instances */}
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                        <div className="flex items-center gap-1">
                          <Server className="w-3 h-3 text-slate-500" />
                          <span>{inc.affectedInstances.length} hosts</span>
                        </div>
                      </td>

                      {/* Last Seen */}
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {formatTimeAgo(inc.lastSeen)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onSilence(inc)}
                            className="p-1.5 rounded hover:bg-border text-slate-400 hover:text-warning transition-colors"
                            title="Silence 1h"
                          >
                            <VolumeX className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onResolve(inc)}
                            className="p-1.5 rounded hover:bg-border text-slate-400 hover:text-success transition-colors"
                            title="Mark Resolved"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onSelectIncident(inc)}
                            className="p-1.5 rounded hover:bg-border text-slate-400 hover:text-primary transition-colors"
                            title="View occurrences"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Inline Fingerprint & Sample Stack Details */}
                    {isExpanded && (
                      <tr className="bg-background/80 border-b border-border">
                        <td colSpan={8} className="p-4 space-y-3 font-mono text-xs">
                          <div className="flex items-center justify-between bg-surface p-2.5 rounded border border-border">
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-slate-500">SHA-256 Fingerprint:</span>
                              <code className="text-primary font-bold">{inc.fingerprint}</code>
                            </div>
                            <button
                              onClick={(e) => copyFingerprint(inc.fingerprint, e)}
                              className="px-2 py-1 rounded bg-border hover:bg-border-bright text-slate-300 text-[11px] flex items-center gap-1 transition-colors"
                            >
                              {copiedFp === inc.fingerprint ? (
                                <>
                                  <Check className="w-3 h-3 text-success" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>

                          {inc.sampleStackTrace && (
                            <div className="bg-surface p-3 rounded border border-border">
                              <span className="text-slate-400 text-[11px] block mb-1">
                                Normalized Top Frames:
                              </span>
                              <pre className="text-[11px] text-slate-300 overflow-x-auto whitespace-pre leading-relaxed p-2 bg-background rounded border border-border/60">
                                {inc.sampleStackTrace}
                              </pre>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
