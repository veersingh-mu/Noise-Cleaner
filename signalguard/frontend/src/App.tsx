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

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col font-sans selection:bg-primary selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-border bg-surface/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary text-white shadow-lg glow-primary">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold tracking-tight text-white">
                  SIGNALGUARD
                </span>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                  SENTINEL
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Intelligent Alert Fatigue Reducer
              </p>
            </div>
          </div>

          {/* Center Navigation Tabs */}
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
          <div className="flex items-center gap-3">
            {/* Live Socket / Firebase Status */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono transition-all ${
                isConnected
                  ? 'bg-success/10 border-success/30 text-success'
                  : 'bg-primary/10 border-primary/30 text-primary'
              }`}
              title={isConnected ? 'Connected to live Firebase & stream' : 'Syncing telemetry...'}
            >
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-primary animate-ping'}`} />
              <span className="hidden sm:inline">{isConnected ? 'Firebase Live' : 'Syncing'}</span>
            </div>

            {/* Simulator Trigger CTA */}
            <button
              onClick={() => setIsSimulatorOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-mono font-semibold flex items-center gap-1.5 shadow-md glow-primary transition-all hover:scale-[1.02]"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Simulator</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 space-y-6 w-full">
        {/* Toast alert banner */}
        {toastMessage && (
          <div className="p-3 rounded-lg bg-primary/15 border border-primary/40 text-xs font-mono text-slate-100 flex items-center gap-2 shadow-lg animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Tab 1: Dashboard View */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
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
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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
          <div className="space-y-6">
            <ConfigEditor onSaved={loadData} />
            {cooldownConfig && <CooldownHeatmap config={cooldownConfig} />}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/80 bg-surface/50 py-4 mt-12">
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
      />
    </div>
  );
}
export default App;
