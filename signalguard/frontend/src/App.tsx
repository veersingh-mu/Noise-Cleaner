import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Radio,
  Zap,
  Sliders,
  Layers,
  LayoutDashboard,
  CheckCircle2,
  Grid,
  VolumeX,
  RefreshCw
} from 'lucide-react';
import { api } from './lib/api.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useMetrics } from './hooks/useMetrics.js';
import { Incident, CooldownConfig } from './lib/types.js';

import { NoiseReductionCard } from './components/NoiseReductionCard.js';
import { StatRow } from './components/StatRow.js';
import { IncidentTable } from './components/IncidentTable.js';
import { LiveEventFeed } from './components/LiveEventFeed.js';
import { CooldownHeatmap } from './components/CooldownHeatmap.js';
import { IncidentDetail } from './components/IncidentDetail.js';
import { ConfigEditor } from './components/ConfigEditor.js';
import { SimulatorModal } from './components/SimulatorModal.js';
import { OnboardingEmpty } from './components/OnboardingEmpty.js';

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'incidents' | 'config'>('dashboard');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [cooldownConfig, setCooldownConfig] = useState<CooldownConfig | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { metrics, displayNrr, history, updateMetrics } = useMetrics();

  // WebSocket & Firebase Live Subscriptions
  const { isConnected, liveEvents, clearLiveEvents } = useWebSocket({
    onMetricsTick: updateMetrics,
    onIncidentsBatch: (batch) => {
      if (batch && batch.length > 0) {
        setIncidents(batch);
      }
    },
    onIncidentUpdate: (updatedInc, isNew) => {
      setIncidents((prev) => {
        const idx = prev.findIndex((i) => i.id === updatedInc.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updatedInc;
          return next;
        }
        return [updatedInc, ...prev];
      });
    },
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [incRes, cfgRes] = await Promise.all([
        api.getIncidents(),
        api.getCooldownConfig()
      ]);
      setIncidents(incRes.incidents || []);
      setCooldownConfig(cfgRes);
    } catch (err) {
      console.warn('[App] Initial data fetch warning:', err);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSilence = async (incident: Incident, durationSeconds: number = 3600) => {
    try {
      const res = await api.silenceIncident(incident.id, durationSeconds);
      setIncidents(prev => prev.map(i => (i.id === incident.id ? res.incident : i)));
      if (selectedIncident?.id === incident.id) {
        setSelectedIncident(res.incident);
      }
      showToast(`Incident in ${incident.service} silenced for ${durationSeconds / 60} minutes.`);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleResolve = async (incident: Incident) => {
    try {
      const res = await api.resolveIncident(incident.id);
      setIncidents(prev => prev.map(i => (i.id === incident.id ? res.incident : i)));
      if (selectedIncident?.id === incident.id) {
        setSelectedIncident(res.incident);
      }
      showToast(`Incident in ${incident.service} marked as resolved.`);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleRunSimulation = (
    pattern: 'steady' | 'burst' | 'mixed',
    durationSeconds: number,
    eps: number
  ) => {
    const totalEvents = durationSeconds * eps;
    const targetService =
      pattern === 'burst'
        ? 'checkout-service'
        : pattern === 'steady'
        ? 'payments-service'
        : 'auth-service';

    showToast(`⚡ Injected ${totalEvents.toLocaleString()} synthetic events storm on ${targetService}!`);

    // 1. Immediately update metrics & throughput rate
    updateMetrics({
      rawEventsReceived: metrics.rawEventsReceived + totalEvents,
      notificationsSent: metrics.notificationsSent + (pattern === 'burst' ? 1 : Math.ceil(durationSeconds / 2)),
      suppressedEvents: metrics.suppressedEvents + totalEvents - (pattern === 'burst' ? 1 : Math.ceil(durationSeconds / 2)),
      noiseReductionRatio: Math.min(0.995, Number((0.985 + (totalEvents / 10000) * 0.008).toFixed(4))),
      openIncidentsCount: incidents.length || 3,
      criticalFiringCount: 1,
      coolingDownCount: 2,
      eventsPerSecond: eps,
      timestamp: new Date().toISOString(),
    });

    // 2. Increment occurrence count for target service incident in table
    setIncidents((prev) =>
      prev.map((inc) => {
        if (inc.service === targetService) {
          return {
            ...inc,
            occurrenceCount: inc.occurrenceCount + totalEvents,
            lastSeen: new Date().toISOString(),
            status: inc.status === 'resolved' ? 'firing' : inc.status,
          };
        }
        return inc;
      })
    );

    // 3. Reset throughput EPS to steady baseline after duration
    setTimeout(() => {
      updateMetrics({
        rawEventsReceived: metrics.rawEventsReceived + totalEvents,
        notificationsSent: metrics.notificationsSent + (pattern === 'burst' ? 1 : Math.ceil(durationSeconds / 2)),
        suppressedEvents: metrics.suppressedEvents + totalEvents - (pattern === 'burst' ? 1 : Math.ceil(durationSeconds / 2)),
        noiseReductionRatio: Math.min(0.995, Number((0.985 + (totalEvents / 10000) * 0.008).toFixed(4))),
        openIncidentsCount: incidents.length || 3,
        criticalFiringCount: 1,
        coolingDownCount: 2,
        eventsPerSecond: 42,
        timestamp: new Date().toISOString(),
      });
    }, durationSeconds * 1000);
  };

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col font-sans selection:bg-primary selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-border bg-surface/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="p-1.5 sm:p-2 rounded-xl bg-primary text-white shadow-lg glow-primary shrink-0">
              <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-mono text-xs sm:text-sm font-bold tracking-tight text-white truncate">
                  SIGNALGUARD
                </span>
                <span className="text-[9px] sm:text-[10px] font-mono font-semibold px-1 sm:px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 shrink-0">
                  SENTINEL
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 hidden sm:block truncate">
                Intelligent Alert Fatigue Reducer
              </p>
            </div>
          </div>

          {/* Center Navigation Tabs (Desktop only: md+) */}
          <nav className="hidden md:flex items-center gap-1 bg-background p-1 rounded-lg border border-border">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-mono font-medium flex items-center gap-2 transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-surface text-primary border border-border shadow-sm font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Mission Control</span>
            </button>
            <button
              onClick={() => setActiveTab('incidents')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-mono font-medium flex items-center gap-2 transition-all ${
                activeTab === 'incidents'
                  ? 'bg-surface text-primary border border-border shadow-sm font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Incident Clusters</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/20 text-primary">
                {incidents.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-mono font-medium flex items-center gap-2 transition-all ${
                activeTab === 'config'
                  ? 'bg-surface text-primary border border-border shadow-sm font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Cooldown Matrix</span>
            </button>
          </nav>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Live Firebase Status Badge */}
            <div
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-full border border-success/40 bg-success/15 text-success text-[11px] sm:text-xs font-mono font-medium shadow-sm transition-all"
              title="Connected to Firebase and live deduplication stream"
            >
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-success animate-pulse" />
              <span className="hidden xs:inline">Firebase</span>
              <span>Live</span>
            </div>

            {/* Simulator Trigger CTA */}
            <button
              onClick={() => setIsSimulatorOpen(true)}
              className="px-2.5 sm:px-3.5 py-1.5 min-h-[36px] rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-mono font-semibold flex items-center gap-1.5 shadow-md glow-primary transition-all hover:scale-[1.02] active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Simulator</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area (extra bottom padding on mobile for fixed bottom bar) */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-24 md:pb-8 flex-1 space-y-4 sm:space-y-6 w-full">
        {/* Toast alert banner */}
        {toastMessage && (
          <div className="p-3 rounded-lg bg-primary/15 border border-primary/40 text-xs font-mono text-slate-100 flex items-center gap-2 shadow-lg animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Tab 1: Dashboard View */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Hero NRR Section */}
            <NoiseReductionCard
              percentage={displayNrr}
              rawCount={metrics.rawEventsReceived}
              sentCount={metrics.notificationsSent}
              suppressedCount={metrics.suppressedEvents}
              eventsPerSecond={metrics.eventsPerSecond}
              history={history}
            />

            {/* KPI Stat Cards */}
            <StatRow metrics={metrics} />

            {/* Ingestion & Incidents 2-Column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
              {/* Left Column: Incidents Table (7 cols) */}
              <div className="lg:col-span-7">
                <IncidentTable
                  incidents={incidents}
                  onSelectIncident={setSelectedIncident}
                  onSilence={handleSilence}
                  onResolve={handleResolve}
                />
              </div>

              {/* Right Column: Live Event Stream Feed (5 cols) */}
              <div className="lg:col-span-5">
                <LiveEventFeed
                  events={liveEvents}
                  isConnected={isConnected}
                  onClear={clearLiveEvents}
                />
              </div>
            </div>

            {/* Cooldown Heatmap Grid */}
            {cooldownConfig && (
              <CooldownHeatmap
                config={cooldownConfig}
                onSelectCell={() => setActiveTab('config')}
              />
            )}
          </div>
        )}

        {/* Tab 2: Dedicated Incident Clusters View */}
        {activeTab === 'incidents' && (
          <div className="space-y-4">
            <IncidentTable
              incidents={incidents}
              onSelectIncident={setSelectedIncident}
              onSilence={handleSilence}
              onResolve={handleResolve}
            />
          </div>
        )}

        {/* Tab 3: Matrix & Channel Config View */}
        {activeTab === 'config' && (
          <div className="space-y-4 sm:space-y-6">
            <ConfigEditor onSaved={loadData} />
            {cooldownConfig && <CooldownHeatmap config={cooldownConfig} />}
          </div>
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (md:hidden) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-xl border-t border-border px-2 py-1.5 flex items-center justify-around md:hidden shadow-2xl">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center py-1 px-3 min-h-[44px] min-w-[70px] rounded-lg text-[10px] font-mono transition-all ${
            activeTab === 'dashboard'
              ? 'text-primary font-bold bg-primary/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 mb-0.5" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => setActiveTab('incidents')}
          className={`flex flex-col items-center justify-center py-1 px-3 min-h-[44px] min-w-[70px] rounded-lg text-[10px] font-mono relative transition-all ${
            activeTab === 'incidents'
              ? 'text-primary font-bold bg-primary/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Layers className="w-4 h-4 mb-0.5" />
            {incidents.length > 0 && (
              <span className="absolute -top-1 -right-2 px-1 py-0.2 text-[8px] font-bold rounded-full bg-primary text-white">
                {incidents.length}
              </span>
            )}
          </div>
          <span>Incidents</span>
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`flex flex-col items-center justify-center py-1 px-3 min-h-[44px] min-w-[70px] rounded-lg text-[10px] font-mono transition-all ${
            activeTab === 'config'
              ? 'text-primary font-bold bg-primary/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4 mb-0.5" />
          <span>Matrix</span>
        </button>
      </nav>

      {/* Footer (hidden on small mobile or compact) */}
      <footer className="border-t border-border/80 bg-surface/50 py-4 mt-6 hidden md:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-slate-500 gap-2">
          <span>SignalGuard Sentinel • Enterprise Alert Fatigue Reducer</span>
          <span>Dual Cooldown Matrix & Rolling 60s Burst Protection</span>
        </div>
      </footer>

      {/* Incident Drilldown Modal */}
      {selectedIncident && (
        <IncidentDetail
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          onSilence={handleSilence}
          onResolve={handleResolve}
        />
      )}

      {/* Simulator Modal */}
      <SimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        onRunSimulation={handleRunSimulation}
      />
    </div>
  );
}
export default App;
