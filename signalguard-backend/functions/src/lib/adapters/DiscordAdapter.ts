import { AlertAdapter, IncidentData } from './AlertAdapter';

export class DiscordAdapter implements AlertAdapter {
  private webhookUrl?: string;

  constructor(target?: string, webhookUrl?: string) {
    this.webhookUrl = webhookUrl || target || process.env.DISCORD_WEBHOOK_URL;
  }

  private getSeverityColor(severity: string): number {
    switch (severity) {
      case 'critical':
        return 0xe74c3c; // Red
      case 'high':
        return 0xe67e22; // Orange
      case 'medium':
        return 0xf1c40f; // Yellow
      case 'low':
      default:
        return 0x3498db; // Blue
    }
  }

  private buildEmbed(incident: IncidentData, deltaCount?: number, isBurst?: boolean) {
    const color = this.getSeverityColor(incident.severity);
    const title = isBurst
      ? `🔴 [BURST STORM] ${incident.service}: ${incident.errorType}`
      : `🛡️ [${incident.severity.toUpperCase()}] ${incident.service}: ${incident.errorType}`;

    const description = `**Normalized Message:**\n\`\`\`\n${incident.normalizedMessage.slice(0, 300)}\n\`\`\``;

    const fields = [
      { name: 'Service', value: `\`${incident.service}\``, inline: true },
      { name: 'Severity', value: `\`${incident.severity.toUpperCase()}\``, inline: true },
      { name: 'Status', value: `\`${incident.status.toUpperCase()}\``, inline: true },
      { name: 'Total Occurrences', value: `${incident.occurrenceCount}`, inline: true },
      { name: 'Affected Instances', value: `${incident.affectedInstances.length}`, inline: true },
      { name: 'Fingerprint', value: `\`${incident.fingerprint.slice(0, 12)}...\``, inline: true },
    ];

    if (deltaCount !== undefined) {
      fields.push({
        name: 'Batch Update',
        value: `+${deltaCount} suppressed events batched in this window`,
        inline: false,
      });
    }

    return {
      title,
      description,
      color,
      fields,
      footer: { text: `SignalGuard Alert • Incident ID: ${incident.id}` },
      timestamp: new Date().toISOString(),
    };
  }

  async send(incident: IncidentData): Promise<{ channelRef: string }> {
    const payload = {
      username: 'SignalGuard Alert Gateway',
      embeds: [this.buildEmbed(incident)],
    };

    if (!this.webhookUrl) {
      console.log('[DiscordAdapter:STUB] Simulated webhook POST:', JSON.stringify(payload, null, 2));
      const simulatedMsgId = `discord_msg_${Date.now()}`;
      return { channelRef: simulatedMsgId };
    }

    const url = this.webhookUrl.includes('?') ? `${this.webhookUrl}&wait=true` : `${this.webhookUrl}?wait=true`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as { id?: string; message?: string };
    if (!response.ok || !data.id) {
      throw new Error(`Discord API error: ${data.message || response.statusText}`);
    }

    return { channelRef: data.id };
  }

  async updateThread(incident: IncidentData, deltaCount: number, isBurst: boolean): Promise<void> {
    if (!incident.alertChannelRef) {
      console.warn('[DiscordAdapter] Cannot update message without alertChannelRef');
      return;
    }

    const payload = {
      embeds: [this.buildEmbed(incident, deltaCount, isBurst)],
    };

    if (!this.webhookUrl) {
      console.log('[DiscordAdapter:STUB] Simulated PATCH edit:', JSON.stringify(payload, null, 2));
      return;
    }

    // In-place edit of original message via PATCH /messages/{messageId}
    const editUrl = `${this.webhookUrl}/messages/${incident.alertChannelRef}`;
    const response = await fetch(editUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = (await response.json()) as { message?: string };
      throw new Error(`Discord message edit error: ${data.message || response.statusText}`);
    }
  }
}
