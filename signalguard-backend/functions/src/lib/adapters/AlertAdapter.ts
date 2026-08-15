export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'firing' | 'cooling_down' | 'resolved';

export interface IncidentData {
  id: string;
  fingerprint: string;
  service: string;
  errorType: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  normalizedMessage: string;
  sampleStackTrace?: string | null;
  occurrenceCount: number;
  affectedInstances: string[];
  alertChannelRef?: string | null;
  isBurst?: boolean;
}

export interface AlertAdapter {
  send(incident: IncidentData): Promise<{ channelRef: string }>;
  updateThread(incident: IncidentData, deltaCount: number, isBurst: boolean): Promise<void>;
}
