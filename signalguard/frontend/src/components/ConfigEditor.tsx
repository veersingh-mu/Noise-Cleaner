import React, { useState, useEffect } from 'react';
import { Sliders, Save, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { ChannelConfig, CooldownConfig } from '../lib/types';

interface ConfigEditorProps {
  onSaved?: () => void;
}

export const ConfigEditor: React.FC<ConfigEditorProps> = ({ onSaved }) => {
  const [cooldownConfig, setCooldownConfig] = useState<CooldownConfig | null>(null);
  const [channelConfig, setChannelConfig] = useState<ChannelConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const [cd, ch] = await Promise.all([
        api.getCooldownConfig(),
        api.getChannelConfig()
      ]);
      setCooldownConfig(cd);
      setChannelConfig(ch);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleDefaultDurationChange = (sev: string, val: string) => {
    if (!cooldownConfig) return;
    const num = parseInt(val, 10) || 0;
    setCooldownConfig({
      ...cooldownConfig,
      default: {
        ...cooldownConfig.default,
        [sev]: num
      }
    });
  };

  const handleBurstThresholdChange = (sev: string, val: string) => {
    if (!cooldownConfig) return;
    const num = parseInt(val, 10) || 0;
    setCooldownConfig({
      ...cooldownConfig,
      burstThreshold: {
        ...cooldownConfig.burstThreshold,
        [sev]: num
      }
    });
  };

  const handleChannelToggle = (service: string, channel: string) => {
    if (!channelConfig) return;
    const currentChannels = channelConfig.services[service] || [...channelConfig.default];
    const exists = currentChannels.includes(channel);
    const updated = exists
      ? currentChannels.filter((c: string) => c !== channel)
      : [...currentChannels, channel];

    setChannelConfig({
      ...channelConfig,
      services: {
        ...channelConfig.services,
        [service]: updated
      }
    });
  };

  const handleSave = async () => {
    if (!cooldownConfig || !channelConfig) return;
    setIsSaving(true);
    setErrorMsg(null);

    try {
      await Promise.all([
        api.updateCooldownConfig(cooldownConfig),
        api.updateChannelConfig(channelConfig)
      ]);
      setSaveSuccess(true);
      onSaved?.();
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!cooldownConfig || !channelConfig) {
    return (
      <div className="p-8 text-center font-mono text-slate-500 bg-surface rounded-card border border-border">
        Loading configuration matrix...
      </div>
    );
  }

  const severities = ['critical', 'high', 'medium', 'low'];
  const allServices = ['payments-service', 'checkout-service', 'auth-service', 'notification-worker'];
  const channels = ['slack', 'pagerduty', 'discord'];

  return (
    <div className="bg-surface rounded-card border border-border p-4 sm:p-6 shadow-xl space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 border-b border-border pb-4 sm:pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary shrink-0" />
            <h2 className="text-sm sm:text-base font-bold text-slate-100">
              Sentinel Suppression & Channel Routing Matrix
            </h2>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
            Configure deduplication cooldown windows, rolling 60-second burst thresholds, and alert dispatch channels.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full sm:w-auto px-4 py-2 min-h-[40px] rounded bg-primary hover:bg-primary-hover text-white text-xs font-mono font-semibold flex items-center justify-center gap-2 shadow-md transition-colors disabled:opacity-50"
        >
          {isSaving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : saveSuccess ? (
            <Check className="w-4 h-4 text-white" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span>{saveSuccess ? 'Saved & Hot-Reloaded' : 'Save Configuration'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded bg-critical/10 border border-critical/30 text-critical text-xs font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 1. Global Cooldown Durations */}
      <div className="space-y-2.5 sm:space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-200">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <h3 className="font-semibold uppercase tracking-wider text-slate-300">
            1. Default Cooldown Durations (Seconds)
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {severities.map((sev) => (
            <div key={sev} className="p-3 sm:p-3.5 bg-background rounded border border-border space-y-1.5">
              <label className="text-[10px] sm:text-[11px] font-mono uppercase text-slate-400 font-bold block">
                {sev}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={cooldownConfig.default[sev] ?? 30}
                  onChange={(e) => handleDefaultDurationChange(sev, e.target.value)}
                  className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-primary min-h-[36px]"
                />
                <span className="text-xs font-mono text-slate-500">sec</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Burst Rate Trigger Thresholds */}
      <div className="space-y-2.5 sm:space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-200">
          <span className="w-2 h-2 rounded-full bg-warning" />
          <h3 className="font-semibold uppercase tracking-wider text-slate-300">
            2. Burst Rate Trigger Thresholds (Events / 60s)
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {severities.map((sev) => (
            <div key={sev} className="p-3 sm:p-3.5 bg-background rounded border border-border space-y-1.5">
              <label className="text-[10px] sm:text-[11px] font-mono uppercase text-slate-400 font-bold block">
                {sev} Threshold
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={cooldownConfig.burstThreshold[sev] ?? 20}
                  onChange={(e) => handleBurstThresholdChange(sev, e.target.value)}
                  className="w-full bg-surface border border-border rounded px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-warning min-h-[36px]"
                />
                <span className="text-xs font-mono text-slate-500">/min</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Multi-Channel Alert Routing Matrix */}
      <div className="space-y-2.5 sm:space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-200">
          <span className="w-2 h-2 rounded-full bg-success" />
          <h3 className="font-semibold uppercase tracking-wider text-slate-300">
            3. Service Alert Channel Routing
          </h3>
        </div>
        <div className="border border-border rounded-lg overflow-x-auto bg-background">
          <table className="w-full text-xs text-left border-collapse min-w-[340px]">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-slate-400 font-mono text-[11px]">
                <th className="py-2.5 px-3 sm:px-4">Service Name</th>
                {channels.map((ch) => (
                  <th key={ch} className="py-2.5 px-3 sm:px-4 uppercase text-center font-mono">
                    {ch}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {allServices.map((svc) => {
                const activeForService = channelConfig.services[svc] || channelConfig.default;
                return (
                  <tr key={svc} className="hover:bg-surface/60 transition-colors">
                    <td className="py-3 px-3 sm:px-4 font-mono font-medium text-slate-200 text-[11px] sm:text-xs">
                      {svc}
                    </td>
                    {channels.map((ch) => {
                      const isEnabled = activeForService.includes(ch);
                      return (
                        <td key={ch} className="py-3 px-2 sm:px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleChannelToggle(svc, ch)}
                            className={`px-2.5 sm:px-3 py-1.5 rounded text-[10px] sm:text-[11px] font-mono min-h-[36px] transition-all ${
                              isEnabled
                                ? 'bg-primary/20 text-primary border border-primary/40 font-bold shadow-sm'
                                : 'bg-surface border border-border text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            {isEnabled ? 'ACTIVE' : 'OFF'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
