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
  Filter
} from 'lucide-react';
import { Incident } from '../lib/types.js';

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
  onResolve
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedFp, setCopiedFp] = useState<string | null>(null);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedId(prev => (prev === id ? null : id));
  };

  const copyFingerprint = (fp: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fp);
    setCopiedFp(fp);
    setTimeout(() => setCopiedFp(null), 1500);
  };

  // Filter and search logic
  const filteredIncidents = incidents.filter(inc => {
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
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-critical/15 text-critical border border-critical/30 flex items-center gap-1 w-fit">
            <Flame className="w-3 h-3" /> CRITICAL
          </span>
        );
      case 'high':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-warning/15 text-warning border border-warning/30 flex items-center gap-1 w-fit">
            <AlertTriangle className="w-3 h-3" /> HIGH
          </span>
        );
      case 'medium':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-primary/15 text-primary border border-primary/30 w-fit">
            MEDIUM
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700 w-fit">
            LOW
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'firing':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-critical/20 text-critical border border-critical/40 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-critical animate-ping" />
            FIRING
          </span>
        );
      case 'cooling_down':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-warning/20 text-warning border border-warning/40">
            COOLING DOWN
          </span>
        );
      case 'resolved':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-success/20 text-success border border-success/40 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> RESOLVED
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-surface rounded-card border border-border overflow-hidden shadow-lg flex flex-col">
      {/* Table Header Controls */}
      <div className="p-4 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-muted/50">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-200">
            Deduplicated Incident Clusters
          </h2>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-border text-slate-400">
            {filteredIncidents.length} active
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Search bar */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search service, error, trace..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary font-sans"
            />
          </div>

          {/* Status filter tabs */}
          <div className="flex rounded border border-border bg-background p-0.5 text-xs font-mono">
            {['all', 'firing', 'cooling_down', 'resolved'].map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded transition-colors uppercase text-[10px] ${
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

      {/* Table Rows */}
      <div className="overflow-x-auto">
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
              filteredIncidents.map(inc => {
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
                          onClick={e => toggleExpand(inc.id, e)}
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
                            <span className="font-semibold text-slate-200 group-hover:text-primary transition-colors">
                              {inc.service}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              / {inc.errorType}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 truncate max-w-md mt-0.5">
                            {inc.normalizedMessage}
                          </span>
                        </div>
                      </td>

                      {/* Severity */}
                      <td className="py-3 px-3">
                        {getSeverityBadge(inc.severity)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        {getStatusBadge(inc.status)}
                      </td>

                      {/* Occurrences Count */}
                      <td className="py-3 px-3 text-right">
                        <span className="font-mono font-bold text-sm text-slate-200">
                          {inc.occurrenceCount.toLocaleString()}
                        </span>
                        <div className="text-[10px] font-mono text-slate-500">
                          1 alert sent
                        </div>
                      </td>

                      {/* Affected Instances */}
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                        <div className="flex items-center gap-1">
                          <Server className="w-3 h-3 text-slate-500" />
                          <span>{inc.affectedInstances?.length || 1} hosts</span>
                        </div>
                      </td>

                      {/* Last Seen */}
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                        {new Date(inc.lastSeen).toLocaleTimeString()}
                      </td>

                      {/* Quick Action Buttons */}
                      <td className="py-3 px-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            title="Copy Fingerprint"
                            onClick={e => copyFingerprint(inc.fingerprint, e)}
                            className="p-1.5 rounded hover:bg-border text-slate-400 hover:text-slate-200 transition-colors"
                          >
                            {copiedFp === inc.fingerprint ? (
                              <Check className="w-3.5 h-3.5 text-success" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {inc.status !== 'resolved' && (
                            <>
                              <button
                                title="Silence Cooldown (1 Hour)"
                                onClick={() => onSilence(inc)}
                                className="px-2 py-1 rounded bg-border hover:bg-border-bright text-slate-300 text-[11px] font-mono flex items-center gap-1 transition-colors"
                              >
                                <VolumeX className="w-3 h-3" /> Silence
                              </button>
                              <button
                                title="Resolve Incident"
                                onClick={() => onResolve(inc)}
                                className="px-2 py-1 rounded bg-success/20 hover:bg-success/30 text-success border border-success/30 text-[11px] font-mono flex items-center gap-1 transition-colors"
                              >
                                <Check className="w-3 h-3" /> Resolve
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Inline Accordion Detail View */}
                    {isExpanded && (
                      <tr className="bg-background/80 border-b border-border/80">
                        <td colSpan={8} className="p-4 pl-12 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Left: Metadata & Affected instances */}
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-slate-500 uppercase">Fingerprint:</span>
                                <code className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                  {inc.fingerprint}
                                </code>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-slate-500 uppercase">Channel Thread Ref:</span>
                                <span className="text-xs font-mono text-slate-300">
                                  {inc.alertChannelRef || 'None'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-slate-500 uppercase">Active Hosts:</span>
                                <div className="flex flex-wrap gap-1">
                                  {inc.affectedInstances?.map((inst: string) => (
                                    <span key={inst} className="text-[10px] font-mono bg-border px-1.5 py-0.5 rounded text-slate-300">
                                      {inst}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Right: Normalized Sample Stack Trace */}
                            <div>
                              <span className="text-[11px] font-mono text-slate-500 uppercase block mb-1">
                                Sample Normalized Stack Trace:
                              </span>
                              <pre className="p-2.5 bg-background rounded border border-border text-[11px] font-mono text-slate-300 overflow-x-auto max-h-28">
                                {inc.sampleStackTrace || 'No stack trace captured'}
                              </pre>
                            </div>
                          </div>

                          <div className="pt-2 flex justify-end">
                            <button
                              onClick={() => onSelectIncident(inc)}
                              className="text-xs font-mono text-primary hover:text-primary-hover flex items-center gap-1 font-medium"
                            >
                              Open Full Incident Forensic View <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
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
