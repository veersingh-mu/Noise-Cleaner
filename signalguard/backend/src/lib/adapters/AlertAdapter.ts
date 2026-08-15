export interface IncidentAlertPayload {
  id: string;
  fingerprint: string;
  service: string;
  errorType: string;
  severity: string;
  status: string;
  normalizedMessage: string;
  sampleStackTrace: string;
  occurrenceCount: number;
  affectedInstances: string[];
  firstSeen: Date | string;
  lastSeen: Date | string;
  alertChannelRef?: string | null;
}

export interface AlertSendResult {
  channelRef: string;
  channel: string;
  delivered: boolean;
  notes?: string;
}

export interface AlertAdapter {
  name: string;
  send(incident: IncidentAlertPayload): Promise<AlertSendResult>;
  updateThread(incident: IncidentAlertPayload, deltaCount: number, isBurst: boolean): Promise<void>;
}
