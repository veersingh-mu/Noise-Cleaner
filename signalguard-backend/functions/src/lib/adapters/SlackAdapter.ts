import { AlertAdapter, IncidentData } from './AlertAdapter';

export class SlackAdapter implements AlertAdapter {
  private botToken?: string;
  private defaultChannel?: string;

  constructor(target?: string, botToken?: string) {
    this.botToken = botToken || process.env.SLACK_BOT_TOKEN;
    this.defaultChannel = target || process.env.SLACK_DEFAULT_CHANNEL || '#alerts-general';
  }

  async send(incident: IncidentData): Promise<{ channelRef: string }> {
    const channel = this.defaultChannel;
    const severityEmoji = {
      critical: '🚨 [CRITICAL]',
      high: '⚠️ [HIGH]',
      medium: '⚡ [MEDIUM]',
      low: 'ℹ️ [LOW]',
    }[incident.severity];

    const payload = {
      channel,
      text: `${severityEmoji} ${incident.service}: ${incident.errorType}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${severityEmoji} ${incident.service}: ${incident.errorType}`,
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Service:*\n\`${incident.service}\`` },
            { type: 'mrkdwn', text: `*Severity:*\n\`${incident.severity.toUpperCase()}\`` },
            { type: 'mrkdwn', text: `*Status:*\n\`${incident.status.toUpperCase()}\`` },
            { type: 'mrkdwn', text: `*Fingerprint:*\n\`${incident.fingerprint.slice(0, 12)}...\`` },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Normalized Message:*\n>${incident.normalizedMessage}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `🎯 Initial occurrence detected • Affected instances: \`${incident.affectedInstances.join(', ') || 'unknown'}\``,
            },
          ],
        },
      ],
    };

    if (!this.botToken) {
      console.log('[SlackAdapter:STUB] Simulated chat.postMessage:', JSON.stringify(payload, null, 2));
      const simulatedTs = `${Date.now() / 1000}`;
      return { channelRef: simulatedTs };
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.botToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as { ok: boolean; ts?: string; error?: string };
    if (!data.ok || !data.ts) {
      throw new Error(`Slack API error: ${data.error || 'Unknown error'}`);
    }

    return { channelRef: data.ts };
  }

  async updateThread(incident: IncidentData, deltaCount: number, isBurst: boolean): Promise<void> {
    if (!incident.alertChannelRef) {
      console.warn('[SlackAdapter] Cannot update thread without alertChannelRef');
      return;
    }

    let messageText = '';
    const instanceCount = incident.affectedInstances.length;

    if (isBurst) {
      messageText = `🔴 *[BURST STORM DETECTED]* ${deltaCount} new occurrences across ${instanceCount} instances in the last 60s (Total count: ${incident.occurrenceCount})`;
    } else {
      messageText = `📈 *Incident Update:* +${deltaCount} suppressed occurrences batched across ${instanceCount} instances. (Total: ${incident.occurrenceCount})`;
    }

    const payload = {
      channel: this.defaultChannel,
      thread_ts: incident.alertChannelRef,
      text: messageText,
    };

    if (!this.botToken) {
      console.log('[SlackAdapter:STUB] Simulated thread update:', JSON.stringify(payload, null, 2));
      return;
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.botToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      throw new Error(`Slack thread update error: ${data.error || 'Unknown error'}`);
    }
  }
}
