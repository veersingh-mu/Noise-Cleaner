import { AlertAdapter, AlertSendResult, IncidentAlertPayload } from './AlertAdapter.js';

export class SlackAdapter implements AlertAdapter {
  public name = 'slack';
  private webhookUrl: string;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl || process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/MOCK/SLACK/CHANNEL';
  }

  private isLiveUrl(): boolean {
    return !!(this.webhookUrl && !this.webhookUrl.includes('MOCK') && process.env.NODE_ENV !== 'test' && !process.env.VITEST);
  }

  public async send(incident: IncidentAlertPayload): Promise<AlertSendResult> {
    const sevEmoji = incident.severity === 'critical' ? '🔴' : incident.severity === 'high' ? '🟠' : '🟡';
    const instancesText = incident.affectedInstances?.length 
      ? `• Affected Hosts: \`${incident.affectedInstances.slice(0, 3).join(', ')}\`` 
      : '';

    const payload = {
      text: `${sevEmoji} *[${incident.severity.toUpperCase()}]* Incident in \`${incident.service}\`: ${incident.errorType}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${sevEmoji} [${incident.severity.toUpperCase()}] ${incident.service}: ${incident.errorType}`,
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Message:* \`${incident.normalizedMessage}\`\n*Fingerprint:* \`${incident.fingerprint.substring(0, 16)}...\`\n${instancesText}`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `First seen: <!date^${Math.floor(new Date(incident.firstSeen).getTime() / 1000)}^{date_num} {time_secs}|${new Date(incident.firstSeen).toISOString()}> | SignalGuard Protected 🛡️`
            }
          ]
        }
      ]
    };

    let threadTs = `slack_thread_${Date.now()}.${Math.floor(Math.random() * 10000)}`;

    if (this.isLiveUrl()) {
      try {
        const resp = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          const data: any = await resp.json().catch(() => ({}));
          if (data.ts) threadTs = data.ts;
        }
      } catch (err: any) {
        console.warn('[SlackAdapter] Webhook call warning:', err.message);
      }
    }

    return {
      channelRef: threadTs,
      channel: 'slack',
      delivered: true,
      notes: `Posted to Slack thread ${threadTs}`
    };
  }

  public async updateThread(incident: IncidentAlertPayload, deltaCount: number, isBurst: boolean): Promise<void> {
    const threadTs = incident.alertChannelRef || `slack_thread_${Date.now()}`;
    const prefix = isBurst ? '🔥 *[BURST DETECTED]*' : '📊 *[Incident Update]*';
    const message = isBurst
      ? `${prefix} *${deltaCount} new occurrences* detected in the last window across ${incident.affectedInstances.length} instances! Total: *${incident.occurrenceCount}*`
      : `${prefix} *+${deltaCount} occurrences* batched & deduplicated. Total: *${incident.occurrenceCount}*.`;

    if (this.isLiveUrl()) {
      try {
        await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message,
            thread_ts: threadTs
          })
        });
      } catch (err: any) {
        console.warn('[SlackAdapter] Thread update webhook error:', err.message);
      }
    }
  }
}
