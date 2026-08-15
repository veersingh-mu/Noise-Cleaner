export interface Incident {
  id: string;
  fingerprint: string;
  service: string;
  errorType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'firing' | 'cooling_down' | 'resolved';
  normalizedMessage: string;
  sampleStackTrace: string;
  occurrenceCount: number;
  affectedInstances: string[];
  firstSeen: string;
  lastSeen: string;
  alertChannelRef?: string | null;
  createdAt: string;
}

export interface Occurrence {
  id: string;
  incidentId: string;
  instanceId: string;
  rawMessage: string;
  timestamp: string;
  suppressed: boolean;
}

export interface CurrentMetrics {
  rawEventsReceived: number;
  notificationsSent: number;
  suppressedEvents: number;
  noiseReductionRatio: number; // 0 to 1.0
  openIncidentsCount: number;
  criticalFiringCount: number;
  coolingDownCount: number;
  eventsPerSecond: number;
  timestamp: string;
}

export interface MetricsSnapshot {
  id: string;
  timestamp: string;
  rawEventsReceived: number;
  notificationsSent: number;
  noiseReductionRatio: number;
}

export interface LiveEvent {
  id: string;
  incidentId: string;
  fingerprint: string;
  service: string;
  errorType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  rawMessage: string;
  normalizedMessage: string;
  instanceId: string;
  timestamp: string;
  suppressed: boolean;
  isBurst?: boolean;
  burstCount?: number;
}

export interface CooldownConfig {
  default: Record<string, number>;
  burstThreshold: Record<string, number>;
  overrides?: Record<string, Record<string, number>>;
}

export interface ChannelConfig {
  default: string[];
  services: Record<string, string[]>;
  endpoints: {
    slack?: { enabled: boolean; channel?: string; webhookUrl?: string };
    pagerduty?: { enabled: boolean; routingKey?: string; endpoint?: string };
    discord?: { enabled: boolean; webhookUrl?: string };
  };
}
