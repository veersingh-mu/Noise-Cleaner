import { AlertAdapter, IncidentData } from './AlertAdapter';

export class PagerDutyAdapter implements AlertAdapter {
  private routingKey?: string;

  constructor(target?: string, routingKey?: string) {
    this.routingKey = routingKey || target || process.env.PAGERDUTY_ROUTING_KEY;
  }

  async send(incident: IncidentData): Promise<{ channelRef: string }> {
    const pdSeverity = {
      critical: 'critical',
      high: 'error',
      medium: 'warning',
      low: 'info',
    }[incident.severity] || 'warning';

    const payload = {
      routing_key: this.routingKey,
      event_action: 'trigger',
      dedup_key: incident.fingerprint,
      payload: {
        summary: `[${incident.severity.toUpperCase()}] ${incident.service}: ${incident.errorType} - ${incident.normalizedMessage.slice(0, 100)}`,
        source: incident.service,
        severity: pdSeverity,
        component: incident.service,
        custom_details: {
          incidentId: incident.id,
          errorType: incident.errorType,
          normalizedMessage: incident.normalizedMessage,
          occurrenceCount: incident.occurrenceCount,
          affectedInstances: incident.affectedInstances,
          sampleStackTrace: incident.sampleStackTrace?.slice(0, 500),
        },
      },
    };

    if (!this.routingKey) {
      console.log('[PagerDutyAdapter:STUB] Simulated v2/enqueue trigger:', JSON.stringify(payload, null, 2));
      return { channelRef: incident.fingerprint };
    }

    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as { status: string; message: string; dedup_key?: string };
    if (!response.ok) {
      throw new Error(`PagerDuty API error: ${data.message || response.statusText}`);
    }

    return { channelRef: data.dedup_key || incident.fingerprint };
  }

  async updateThread(incident: IncidentData, deltaCount: number, isBurst: boolean): Promise<void> {
    const summary = isBurst
      ? `🔴 [BURST STORM] ${incident.service}: ${deltaCount} new occurrences in 60s (Total: ${incident.occurrenceCount})`
      : `📈 ${incident.service}: +${deltaCount} occurrences batched (Total: ${incident.occurrenceCount})`;

    const payload = {
      routing_key: this.routingKey,
      event_action: 'trigger',
      dedup_key: incident.fingerprint,
      payload: {
        summary,
        source: incident.service,
        severity: isBurst ? 'critical' : 'warning',
        custom_details: {
          incidentId: incident.id,
          deltaCount,
          isBurst,
          totalOccurrences: incident.occurrenceCount,
          affectedInstances: incident.affectedInstances,
        },
      },
    };

    if (!this.routingKey) {
      console.log('[PagerDutyAdapter:STUB] Simulated v2/enqueue dedup update:', JSON.stringify(payload, null, 2));
      return;
    }

    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = (await response.json()) as { message?: string };
      throw new Error(`PagerDuty thread update error: ${data.message || response.statusText}`);
    }
  }
}
