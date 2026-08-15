import { ChannelConfig, CooldownConfig, CurrentMetrics, Incident, MetricsSnapshot, Occurrence } from './types.js';

const API_BASE = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    ...options
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `Request failed with status ${resp.status}`);
  }

  return resp.json();
}

export const api = {
  getMetrics: () => request<CurrentMetrics>('/metrics/current'),
  getMetricsHistory: (limit = 30) => request<{ count: number; history: MetricsSnapshot[] }>(`/metrics/history?limit=${limit}`),
  
  getIncidents: (status = 'all', search = '') =>
    request<{ count: number; incidents: Incident[] }>(`/incidents?status=${status}&search=${encodeURIComponent(search)}`),
    
  getIncidentDetails: (id: string) =>
    request<{ incident: Incident; occurrences: Occurrence[] }>(`/incidents/${id}`),
    
  silenceIncident: (id: string, durationSeconds = 3600) =>
    request<{ message: string; incident: Incident }>(`/incidents/${id}/silence`, {
      method: 'POST',
      body: JSON.stringify({ durationSeconds })
    }),
    
  resolveIncident: (id: string) =>
    request<{ message: string; incident: Incident }>(`/incidents/${id}/resolve`, {
      method: 'POST'
    }),
    
  getCooldownConfig: () => request<CooldownConfig>('/config/cooldown-matrix'),
  updateCooldownConfig: (data: CooldownConfig) =>
    request<{ message: string; config: CooldownConfig }>('/config/cooldown-matrix', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    
  getChannelConfig: () => request<ChannelConfig>('/config/channels'),
  updateChannelConfig: (data: ChannelConfig) =>
    request<{ message: string; config: ChannelConfig }>('/config/channels', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    
  simulateTraffic: (pattern: 'steady' | 'burst' | 'mixed', durationSeconds: number, eventsPerSecond: number) =>
    request<{ message: string; estimatedTotalEvents: number }>('/ingest/simulate', {
      method: 'POST',
      body: JSON.stringify({ pattern, durationSeconds, eventsPerSecond })
    }),

  ingestEvent: (payload: any) =>
    request<{ status: string; result: any }>('/ingest', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
};
