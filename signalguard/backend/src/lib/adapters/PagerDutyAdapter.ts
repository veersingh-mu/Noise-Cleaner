import { AlertAdapter, AlertSendResult, IncidentAlertPayload } from './AlertAdapter.js';

export class PagerDutyAdapter implements AlertAdapter {
  public name = 'pagerduty';
  private routingKey: string;
  private endpoint: string;

  constructor(routingKey?: string, endpoint?: string) {
    this.routingKey = routingKey || process.env.PAGERDUTY_ROUTING_KEY || 'MOCK_PAGERDUTY_KEY';
    this.endpoint = endpoint || process.env.PAGERDUTY_ENDPOINT || 'https://events.pagerduty.com/v2/enqueue';
  }

  private isLiveUrl(): boolean {
    return !!(this.routingKey && !this.routingKey.includes('MOCK') && process.env.NODE_ENV !== 'test' && !process.env.VITEST);
  }

  public async send(incident: IncidentAlertPayload): Promise<AlertSendResult> {
    const dedupKey = incident.fingerprint;
    const severityMap: Record<string, string> = {
      critical: 'critical',
      high: 'error',
      medium: 'warning',
      low: 'info'
    };

    const payload = {
      routing_key: this.routingKey,
      event_action: 'trigger',
      dedup_key: dedupKey,
      payload: {
        summary: `[${incident.severity.toUpperCase()}] ${incident.service}: ${incident.errorType} - ${incident.normalizedMessage}`,
        severity: severityMap[incident.severity] || 'warning',
        source: incident.service,
        component: incident.errorType,
        custom_details: {
          incidentId: incident.id,
          fingerprint: incident.fingerprint,
          occurrenceCount: incident.occurrenceCount,
          affectedInstances: incident.affectedInstances,
          sampleStackTrace: incident.sampleStackTrace
        }
      },
      client: 'SignalGuard Middleware',
      client_url: 'http://localhost:5173'
    };

    if (this.isLiveUrl()) {
      try {
        await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err: any) {
        console.warn('[PagerDutyAdapter] API call warning:', err.message);
      }
    }

    return {
      channelRef: dedupKey,
      channel: 'pagerduty',
      delivered: true,
      notes: `PagerDuty alert triggered (dedup_key: ${dedupKey.substring(0, 16)}...)`
    };
  }

  public async updateThread(incident: IncidentAlertPayload, deltaCount: number, isBurst: boolean): Promise<void> {
    const dedupKey = incident.alertChannelRef || incident.fingerprint;
    const payload = {
      routing_key: this.routingKey,
      event_action: 'trigger',
      dedup_key: dedupKey,
      payload: {
        summary: `[UPDATE] ${incident.service}: +${deltaCount} occurrences (Total: ${incident.occurrenceCount}) [Burst: ${isBurst}]`,
        severity: isBurst ? 'critical' : 'warning',
        source: incident.service,
        custom_details: {
          deltaCount,
          totalOccurrences: incident.occurrenceCount,
          isBurst,
          lastSeen: incident.lastSeen
        }
      }
    };

    if (this.isLiveUrl()) {
      try {
        await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err: any) {
        console.warn('[PagerDutyAdapter] Update call warning:', err.message);
      }
    }
  }
}
