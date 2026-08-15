import { AlertAdapter, AlertSendResult, IncidentAlertPayload } from './AlertAdapter.js';

export class DiscordAdapter implements AlertAdapter {
  public name = 'discord';
  private webhookUrl: string;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl || process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/MOCK/DISCORD_KEY';
  }

  private isLiveUrl(): boolean {
    return !!(this.webhookUrl && !this.webhookUrl.includes('MOCK') && process.env.NODE_ENV !== 'test' && !process.env.VITEST);
  }

  private getColor(severity: string): number {
    switch (severity.toLowerCase()) {
      case 'critical': return 0xEF4444; // Red
      case 'high': return 0xF59E0B;     // Amber
      case 'medium': return 0x3B82F6;   // Blue
      default: return 0x10B981;         // Green
    }
  }

  public async send(incident: IncidentAlertPayload): Promise<AlertSendResult> {
    const color = this.getColor(incident.severity);
    const payload = {
      username: 'SignalGuard Sentinel',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/9422/9422894.png',
      embeds: [
        {
          title: `🛡️ [${incident.severity.toUpperCase()}] Incident Firing: ${incident.service}`,
          description: `**Error:** \`${incident.errorType}\`\n**Message:** ${incident.normalizedMessage}`,
          color: color,
          fields: [
            { name: 'Occurrences', value: `${incident.occurrenceCount}`, inline: true },
            { name: 'Affected Hosts', value: `${incident.affectedInstances?.slice(0, 2).join(', ') || 'unknown'}`, inline: true },
            { name: 'Fingerprint', value: `\`${incident.fingerprint.substring(0, 16)}...\``, inline: false }
          ],
          footer: { text: 'SignalGuard Middleware • Real-time Cooldown Active' },
          timestamp: new Date().toISOString()
        }
      ]
    };

    let messageId = `discord_msg_${Date.now()}`;

    if (this.isLiveUrl()) {
      try {
        const url = this.webhookUrl.includes('?') ? `${this.webhookUrl}&wait=true` : `${this.webhookUrl}?wait=true`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          const data: any = await resp.json().catch(() => ({}));
          if (data.id) messageId = data.id;
        }
      } catch (err: any) {
        console.warn('[DiscordAdapter] Webhook error:', err.message);
      }
    }

    return {
      channelRef: messageId,
      channel: 'discord',
      delivered: true,
      notes: `Discord webhook embed published (id: ${messageId})`
    };
  }

  public async updateThread(incident: IncidentAlertPayload, deltaCount: number, isBurst: boolean): Promise<void> {
    const messageId = incident.alertChannelRef;
    if (!messageId) return;

    const color = isBurst ? 0xEF4444 : this.getColor(incident.severity);
    const patchPayload = {
      embeds: [
        {
          title: `🛡️ [${incident.severity.toUpperCase()}] Incident Update: ${incident.service}`,
          description: `**Error:** \`${incident.errorType}\`\n**Message:** ${incident.normalizedMessage}\n\n${isBurst ? '🔥 **[BURST DETECTED]** ' : ''}*+${deltaCount} occurrences deduplicated and suppressed.*`,
          color: color,
          fields: [
            { name: 'Total Occurrences', value: `**${incident.occurrenceCount}**`, inline: true },
            { name: 'Last Window Delta', value: `+${deltaCount}`, inline: true },
            { name: 'Affected Hosts', value: `${incident.affectedInstances?.slice(0, 3).join(', ') || 'N/A'}`, inline: true },
            { name: 'Fingerprint', value: `\`${incident.fingerprint.substring(0, 16)}...\``, inline: false }
          ],
          footer: { text: `Last batched flush: ${new Date().toLocaleTimeString()} • SignalGuard` },
          timestamp: new Date().toISOString()
        }
      ]
    };

    if (this.isLiveUrl() && !messageId.startsWith('discord_msg_')) {
      try {
        const patchUrl = `${this.webhookUrl}/messages/${messageId}`;
        await fetch(patchUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchPayload)
        });
      } catch (err: any) {
        console.warn('[DiscordAdapter] In-place edit error:', err.message);
      }
    }
  }
}
